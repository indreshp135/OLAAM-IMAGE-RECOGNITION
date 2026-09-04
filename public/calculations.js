// Pure calculation logic, deliberately free of DOM access so that the browser
// and the Express backend share one implementation rather than two that drift.
// Loaded as a plain script in the browser and required by src/index.js in node.

// Temperatures and percentages describe an operating point rather than a
// quantity, so they are averaged across assets. Summing them produced readings
// that cannot occur: two copies of one panel gave 96 degF chilled water and
// 138% full load amps.
const AVERAGED_FIELDS = new Set([
    'full_load_amps_percent',
    'chilled_liquid_leaving_temp_f',
    'chilled_liquid_entering_temp_f',
    'condenser_liquid_leaving_temp_f',
    'condenser_liquid_entering_temp_f',
    'discharge_superheat_f',
]);

function combineAssets(assets) {
    const combined = {};
    const counts = {};

    for (const asset of assets) {
        for (const key in asset) {
            if (typeof asset[key] === 'number' && Number.isFinite(asset[key])) {
                combined[key] = (combined[key] || 0) + asset[key];
                counts[key] = (counts[key] || 0) + 1;
            } else if (typeof asset[key] !== 'number') {
                combined[key] = asset[key];
            }
        }
    }

    for (const key of Object.keys(counts)) {
        if (AVERAGED_FIELDS.has(key) && counts[key] > 1) {
            combined[key] /= counts[key];
        }
    }

    return combined;
}

// ARI part-load tables: condenser water entering temp -> % capacity -> kW/ton.
const ARI_TABLES = {
    small: { // < 500 tons
        85: { 100: 0.62, 90: 0.61, 80: 0.60, 70: 0.61, 60: 0.63, 50: 0.61 },
        75: { 100: 0.53, 90: 0.50, 80: 0.48, 70: 0.46, 60: 0.48, 50: 0.46 },
        65: { 100: 0.45, 90: 0.41, 80: 0.38, 70: 0.35, 60: 0.33, 50: 0.31 },
    },
    medium: { // 500 - 1500 tons
        85: { 100: 0.60, 90: 0.59, 80: 0.58, 70: 0.59, 60: 0.61, 50: 0.59 },
        75: { 100: 0.51, 90: 0.48, 80: 0.46, 70: 0.44, 60: 0.46, 50: 0.44 },
        65: { 100: 0.43, 90: 0.39, 80: 0.36, 70: 0.33, 60: 0.31, 50: 0.29 },
    },
    large: { // > 1500 tons
        85: { 100: 0.59, 90: 0.58, 80: 0.57, 70: 0.58, 60: 0.60, 50: 0.58 },
        75: { 100: 0.50, 90: 0.47, 80: 0.45, 70: 0.43, 60: 0.45, 50: 0.43 },
        65: { 100: 0.42, 90: 0.38, 80: 0.35, 70: 0.32, 60: 0.30, 50: 0.28 },
    },
};

function getAriTable(chillerCapacity) {
    const tons = parseFloat(chillerCapacity);
    if (tons < 500) return ARI_TABLES.small;
    if (tons <= 1500) return ARI_TABLES.medium;
    return ARI_TABLES.large;
}

function interpolate(x, x0, x1, y0, y1) {
    if (x1 === x0) return y0;
    return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

// Returns the two table points either side of `value`, clamped to the table's
// range, along with the clamped value itself.
function bracket(value, points) {
    const lowest = points[0];
    const highest = points[points.length - 1];
    const clamped = Math.min(Math.max(value, lowest), highest);

    for (let i = 0; i < points.length - 1; i++) {
        if (clamped <= points[i + 1]) {
            return [points[i], points[i + 1], clamped];
        }
    }
    return [points[points.length - 2], highest, clamped];
}

// Bilinear interpolation across the table. Snapping to the nearest gridpoint
// discarded most of the reading: 79.5 degF condenser water fell to the 75 degF
// row, a 4.5 degF error on a table whose rows are 10 degF apart.
function lookupKwPerTon(table, condenserEnteringTempF, percentCapacity) {
    const temps = Object.keys(table).map(Number).sort((a, b) => a - b);
    const caps = Object.keys(table[temps[0]]).map(Number).sort((a, b) => a - b);

    const [t0, t1, temp] = bracket(condenserEnteringTempF, temps);
    const [c0, c1, cap] = bracket(percentCapacity, caps);

    const atLowTemp = interpolate(cap, c0, c1, table[t0][c0], table[t0][c1]);
    const atHighTemp = interpolate(cap, c0, c1, table[t1][c0], table[t1][c1]);

    return interpolate(temp, t0, t1, atLowTemp, atHighTemp);
}

const REQUIRED_READINGS = [
    { key: 'chilled_liquid_entering_temp_f', label: 'Chilled liquid entering temperature' },
    { key: 'chilled_liquid_leaving_temp_f', label: 'Chilled liquid leaving temperature' },
    { key: 'condenser_liquid_entering_temp_f', label: 'Condenser liquid entering temperature' },
];

function isPositive(value) {
    return Number.isFinite(value) && value > 0;
}

// Returns either { missing: [...] } / { error } describing why a diagnosis is
// not possible, or the full set of derived figures. Previously any absent
// reading propagated silently as NaN into every row of the results table.
function computeDiagnosis(readings, chillerCapacityTons, chillerFullLoadKw) {
    const missing = REQUIRED_READINGS
        .filter(({ key }) => !Number.isFinite(Number(readings[key])))
        .map(({ label }) => label);

    const capacity = Number(chillerCapacityTons);
    if (!isPositive(capacity)) {
        missing.push('Chiller capacity in tons');
    }

    // A measured kW beats estimating it from % full load amps, which does not
    // scale linearly with power and overstates the draw at part load.
    const measuredInputKw = Number(readings.input_kw);
    const percentFullLoadAmps = Number(readings.full_load_amps_percent);
    const fullLoadKw = Number(chillerFullLoadKw);

    let inputPower = null;
    let inputPowerSource = null;

    if (isPositive(measuredInputKw)) {
        inputPower = measuredInputKw;
        inputPowerSource = 'panel';
    } else if (isPositive(percentFullLoadAmps) && isPositive(fullLoadKw)) {
        // A negative or zero amps percentage is either a misread or a chiller
        // that is not running; either way it cannot yield a real input power.
        inputPower = (percentFullLoadAmps / 100) * fullLoadKw;
        inputPowerSource = 'estimated';
    } else {
        missing.push('Input power, as either panel kW or % full load amps with a full-load kW');
    }

    if (missing.length > 0) {
        return { missing };
    }

    const deltaT = Number(readings.chilled_liquid_entering_temp_f) - Number(readings.chilled_liquid_leaving_temp_f);
    if (!(deltaT > 0)) {
        return {
            missing: [],
            error: `Chilled water delta T reads ${deltaT.toFixed(1)} °F. A positive delta T is required to calculate load.`,
        };
    }

    // Design flow is only an assumption; use the panel's own flow when shown.
    const measuredFlow = Number(readings.chilled_water_flow_gpm);
    const flowSource = isPositive(measuredFlow) ? 'panel' : 'design';
    const flowGPM = flowSource === 'panel' ? measuredFlow : 2.4 * capacity;

    const tons = (deltaT * flowGPM) / 24;
    if (!isPositive(tons)) {
        return { missing: [], error: 'Calculated load came out at zero tons, so kW/ton cannot be derived.' };
    }

    const condenserEnteringTempF = Number(readings.condenser_liquid_entering_temp_f);
    const condenserDeltaT = Number(readings.condenser_liquid_leaving_temp_f) - condenserEnteringTempF;

    const actualKWTon = inputPower / tons;
    const percentCapacity = (tons / capacity) * 100;
    const kwTonNeeded = lookupKwPerTon(getAriTable(capacity), condenserEnteringTempF, percentCapacity);

    // A chiller running below the AHRI baseline has no savings left to take,
    // so the figures are floored rather than reported as negative savings.
    const inefficiencyAbsolute = actualKWTon - kwTonNeeded;
    const beatsBaseline = inefficiencyAbsolute <= 0;

    return {
        missing: [],
        deltaT,
        flowGPM,
        flowSource,
        tons,
        condenserDeltaT: Number.isFinite(condenserDeltaT) ? condenserDeltaT : null,
        inputPower,
        inputPowerSource,
        actualKWTon,
        percentCapacity,
        kwTonNeeded,
        beatsBaseline,
        inefficiency: beatsBaseline ? 0 : (inefficiencyAbsolute / kwTonNeeded) * 100,
        kwSaved: beatsBaseline ? 0 : inefficiencyAbsolute * tons,
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AVERAGED_FIELDS, combineAssets, ARI_TABLES, getAriTable,
        interpolate, bracket, lookupKwPerTon, REQUIRED_READINGS, computeDiagnosis,
    };
}
