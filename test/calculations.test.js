const test = require('node:test');
const assert = require('node:assert');

const {
    combineAssets, getAriTable, interpolate, bracket, lookupKwPerTon, computeDiagnosis,
} = require('../public/calculations');

// A complete reading taken from a real panel image.
const panel = {
    full_load_amps_percent: 72,
    input_kw: 319,
    chilled_liquid_leaving_temp_f: 42.1,
    chilled_liquid_entering_temp_f: 49,
    condenser_liquid_leaving_temp_f: 86.4,
    condenser_liquid_entering_temp_f: 79.5,
};

test('combineAssets averages operating points and sums quantities', () => {
    const combined = combineAssets([
        { chilled_liquid_entering_temp_f: 48, full_load_amps_percent: 60, input_kw: 400 },
        { chilled_liquid_entering_temp_f: 50, full_load_amps_percent: 70, input_kw: 500 },
    ]);
    assert.strictEqual(combined.chilled_liquid_entering_temp_f, 49);
    assert.strictEqual(combined.full_load_amps_percent, 65);
    assert.strictEqual(combined.input_kw, 900);
});

test('combineAssets is idempotent for a repeated identical reading', () => {
    const once = combineAssets([panel]);
    const twice = combineAssets([panel, panel]);
    for (const key of Object.keys(once)) {
        if (key === 'input_kw') continue; // extensive, so it doubles by design
        assert.strictEqual(twice[key], once[key], `${key} changed when the same panel was supplied twice`);
    }
});

test('combineAssets ignores non-finite numbers', () => {
    const combined = combineAssets([{ input_kw: 100 }, { input_kw: NaN }]);
    assert.strictEqual(combined.input_kw, 100);
});

test('getAriTable selects a table by tonnage band', () => {
    assert.strictEqual(getAriTable(499)[85][100], 0.62);
    assert.strictEqual(getAriTable(500)[85][100], 0.60);
    assert.strictEqual(getAriTable(1500)[85][100], 0.60);
    assert.strictEqual(getAriTable(1501)[85][100], 0.59);
});

test('interpolate returns the endpoints and the midpoint', () => {
    assert.strictEqual(interpolate(0, 0, 10, 1, 2), 1);
    assert.strictEqual(interpolate(10, 0, 10, 1, 2), 2);
    assert.strictEqual(interpolate(5, 0, 10, 1, 2), 1.5);
    assert.strictEqual(interpolate(5, 5, 5, 3, 9), 3, 'a zero-width span must not divide by zero');
});

test('bracket clamps to the table range', () => {
    const points = [65, 75, 85];
    assert.deepStrictEqual(bracket(79.5, points), [75, 85, 79.5]);
    assert.deepStrictEqual(bracket(65, points), [65, 75, 65]);
    assert.deepStrictEqual(bracket(40, points), [65, 75, 65], 'below the table clamps to its floor');
    assert.deepStrictEqual(bracket(120, points), [75, 85, 85], 'above the table clamps to its ceiling');
});

test('lookupKwPerTon reproduces the table at its gridpoints', () => {
    const table = getAriTable(1800);
    for (const temp of [65, 75, 85]) {
        for (const cap of [50, 60, 70, 80, 90, 100]) {
            assert.ok(
                Math.abs(lookupKwPerTon(table, temp, cap) - table[temp][cap]) < 1e-9,
                `interpolation disagreed with the table at ${temp} degF / ${cap}%`
            );
        }
    }
});

test('lookupKwPerTon interpolates between gridpoints', () => {
    const table = getAriTable(1800);
    // Midway between the 75 and 85 degF rows at the 100% column.
    assert.ok(Math.abs(lookupKwPerTon(table, 80, 100) - (0.50 + 0.59) / 2) < 1e-9);
});

test('computeDiagnosis prefers the panel kW over the amps estimate', () => {
    const result = computeDiagnosis(panel, 1800, 1080);
    assert.strictEqual(result.inputPowerSource, 'panel');
    assert.strictEqual(result.inputPower, 319);
});

test('computeDiagnosis falls back to the amps estimate without a panel kW', () => {
    const { input_kw, ...withoutKw } = panel;
    const result = computeDiagnosis(withoutKw, 1800, 1080);
    assert.strictEqual(result.inputPowerSource, 'estimated');
    assert.ok(Math.abs(result.inputPower - 777.6) < 1e-9);
});

test('computeDiagnosis prefers measured flow over design flow', () => {
    const design = computeDiagnosis(panel, 1800, 1080);
    assert.strictEqual(design.flowSource, 'design');
    assert.strictEqual(design.flowGPM, 4320);

    const measured = computeDiagnosis({ ...panel, chilled_water_flow_gpm: 2600 }, 1800, 1080);
    assert.strictEqual(measured.flowSource, 'panel');
    assert.strictEqual(measured.flowGPM, 2600);
});

test('computeDiagnosis floors savings instead of reporting negatives', () => {
    const result = computeDiagnosis(panel, 1800, 1080);
    assert.strictEqual(result.beatsBaseline, true);
    assert.strictEqual(result.inefficiency, 0);
    assert.strictEqual(result.kwSaved, 0);
});

test('computeDiagnosis reports positive savings for an inefficient chiller', () => {
    const result = computeDiagnosis({ ...panel, input_kw: 900 }, 1800, 1080);
    assert.strictEqual(result.beatsBaseline, false);
    assert.ok(result.inefficiency > 0);
    assert.ok(result.kwSaved > 0);
});

test('% capacity tracks load rather than the full-load input', () => {
    const measured = { ...panel, chilled_water_flow_gpm: 2600 };
    const result = computeDiagnosis(measured, 1800, 1080);

    assert.ok(
        Math.abs(result.percentCapacity - (result.tons / 1800) * 100) < 1e-9,
        '% capacity should be calculated load over rated capacity'
    );

    // The old formula was full-load kW over capacity, which the UI's
    // 0.6 x capacity default pinned at exactly 60 for every single reading.
    assert.notStrictEqual(result.percentCapacity.toFixed(2), '60.00');

    // A lighter load has to move it.
    const lighter = computeDiagnosis({ ...measured, chilled_liquid_entering_temp_f: 45 }, 1800, 1080);
    assert.ok(lighter.percentCapacity < result.percentCapacity);
});

test('computeDiagnosis names every missing reading rather than yielding NaN', () => {
    const result = computeDiagnosis({ discharge_superheat_f: 26.9 }, 1800, 1080);
    assert.ok(result.missing.length > 0);
    assert.ok(result.missing.some(m => /Chilled liquid entering/.test(m)));
    assert.ok(result.missing.some(m => /Condenser liquid entering/.test(m)));
    assert.strictEqual(result.tons, undefined);
});

test('computeDiagnosis requires a capacity', () => {
    const result = computeDiagnosis(panel, '', 1080);
    assert.ok(result.missing.some(m => /capacity/i.test(m)));
});

test('computeDiagnosis rejects a non-positive delta T', () => {
    const result = computeDiagnosis({ ...panel, chilled_liquid_entering_temp_f: 42.1 }, 1800, 1080);
    assert.strictEqual(result.missing.length, 0);
    assert.match(result.error, /delta T/);
});

test('no diagnosis field is ever NaN or Infinity', () => {
    const cases = [
        [panel, 1800, 1080],
        [{ ...panel, input_kw: 900 }, 1800, 1080],
        [{ ...panel, chilled_water_flow_gpm: 2600 }, 400, 240],
        [{ ...panel, condenser_liquid_entering_temp_f: 120 }, 1800, 1080],
        [{ ...panel, condenser_liquid_entering_temp_f: 40 }, 1800, 1080],
    ];
    for (const [readings, capacity, fullLoad] of cases) {
        const result = computeDiagnosis(readings, capacity, fullLoad);
        for (const [key, value] of Object.entries(result)) {
            if (typeof value === 'number') {
                assert.ok(Number.isFinite(value), `${key} was ${value}`);
            }
        }
    }
});
