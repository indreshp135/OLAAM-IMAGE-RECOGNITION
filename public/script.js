const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const extractButton = document.getElementById('extract-button');
const output = document.getElementById('output');
const fileUploadLabel = document.querySelector('.file-upload-label');
const chillerCapacityInput = document.getElementById('chiller-capacity');
const chillerFullLoadInput = document.getElementById('chiller-full-load');

const displayMap = {
    chiller_capacity_tons: { displayName: 'Current Tons', unit: 'Tons' },
    chiller_full_load_kw: { displayName: 'Chiller Full Load', unit: 'kW' },
    full_load_amps_percent: { displayName: '% of Full Load Amps', unit: '%' },
    input_kw: { displayName: 'Input Power (panel)', unit: 'kW' },
    chilled_water_flow_gpm: { displayName: 'Chilled Water Flow', unit: 'GPM' },
    chilled_liquid_leaving_temp_f: { displayName: 'Chilled Liquid Leaving Temp', unit: '°F' },
    chilled_liquid_entering_temp_f: { displayName: 'Chilled Liquid Entering Temp', unit: '°F' },
    condenser_liquid_leaving_temp_f: { displayName: 'Condenser Liquid Leaving Temp', unit: '°F' },
    condenser_liquid_entering_temp_f: { displayName: 'Condenser Liquid Entering Temp', unit: '°F' },
    discharge_superheat_f: { displayName: 'Discharge Superheat', unit: '°F' },
    deltaT: { displayName: 'Chiller Delta T', unit: '°F' },
    flowGPM: { displayName: 'Flow Used', unit: 'GPM' },
    tons: { displayName: 'Tons', unit: 'Tons' },
    condenserDeltaT: { displayName: 'Condenser Delta T', unit: '°F' },
    inputPower: { displayName: 'Input Power Used', unit: 'kW' },
    actualKWTon: { displayName: 'Actual kW/Ton', unit: '' },
    percentCapacity: { displayName: '% Capacity', unit: '%' },
    kwTonNeeded: { displayName: 'kW/Ton per AHRI', unit: '' },
    inefficiency: { displayName: 'Savings %', unit: '%' },
    kwSaved: { displayName: 'Savings in kW', unit: 'kW' },
};

imageInput.addEventListener('change', (event) => {
    const files = event.target.files;
    if (files.length > 0) {
        imagePreview.innerHTML = ''; // Clear existing previews
        for (const file of files) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = document.createElement('img');
                img.src = e.target.result;
                img.alt = file.name;
                imagePreview.appendChild(img);
            };
            reader.readAsDataURL(file);
        }
        imagePreview.classList.add('has-image');
        fileUploadLabel.querySelector('span').textContent = `${files.length} image(s) uploaded`;
        extractButton.disabled = false;
    }
});

chillerCapacityInput.addEventListener('change', () => {
    const capacity = parseFloat(chillerCapacityInput.value);
    if (!isNaN(capacity)) {
        if (!chillerFullLoadInput.value) {
            chillerFullLoadInput.value = (0.6 * capacity).toFixed(2);
        }
        extractButton.style.display = 'block';
    } else {
        extractButton.style.display = 'none';
    }
});

extractButton.addEventListener('click', async () => {
    const files = imageInput.files;
    if (files.length === 0) {
        alert('Please select at least one image.');
        return;
    }

    const chillerCapacity = chillerCapacityInput.value;
    if (!chillerCapacity) {
        alert('Please enter the Chiller Capacity.');
        return;
    }

    output.innerHTML = '<div class="loader"></div>';
    extractButton.disabled = true;

    try {
        const extractedData = await callBackend(files, chillerCapacity, chillerFullLoadInput.value);
        displayData(extractedData);
    } catch (error) {
        console.error(error);
        // Show what actually went wrong; "an error occurred" gave the operator
        // nothing to act on.
        output.innerHTML = '';
        const message = document.createElement('p');
        message.classList.add('error');
        message.textContent = `Could not analyse the images: ${error.message}`;
        output.appendChild(message);
    } finally {
        extractButton.disabled = false;
    }
});

function generateSuggestions(condenserDeltaT, dischargeSuperheat) {
    const suggestions = [];
    if (condenserDeltaT < 8 || condenserDeltaT > 12) {
        suggestions.push("Condenser water flow is not per design. Bring that to design flow.");
    }
    if (dischargeSuperheat > 10) {
        suggestions.push("Reduce the superheat by increasing the refrigerant charge.");
    }
    return suggestions;
}

function addRow(tbody, key, value, decimals) {
    const row = document.createElement('tr');
    const fieldCell = document.createElement('td');
    const mapEntry = displayMap[key];
    fieldCell.textContent = mapEntry
        ? mapEntry.displayName
        : key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const valueCell = document.createElement('td');
    const unit = mapEntry ? mapEntry.unit : '';
    const shown = typeof value === 'number' && decimals !== undefined ? value.toFixed(decimals) : value;
    valueCell.textContent = `${shown} ${unit}`;

    row.appendChild(fieldCell);
    row.appendChild(valueCell);
    tbody.appendChild(row);
    return row;
}

function addNote(title, body, className) {
    const note = document.createElement('div');
    note.classList.add(className);
    const noteTitle = document.createElement('h3');
    noteTitle.textContent = title;
    note.appendChild(noteTitle);
    if (typeof body === 'string') {
        const paragraph = document.createElement('p');
        paragraph.textContent = body;
        note.appendChild(paragraph);
    } else {
        const list = document.createElement('ul');
        for (const item of body) {
            const listItem = document.createElement('li');
            listItem.textContent = item;
            list.appendChild(listItem);
        }
        note.appendChild(list);
    }
    output.appendChild(note);
    return note;
}

function displayData(data) {
    output.innerHTML = ''; // Clear loader

    const combinedData = combineAssets(data);
    combinedData.chiller_capacity_tons = chillerCapacityInput.value;
    combinedData.chiller_full_load_kw = chillerFullLoadInput.value;

    const table = document.createElement('table');
    const tbody = document.createElement('tbody');

    // Only render readings that actually carry a value; an absent one used to
    // surface as "undefined °F".
    const sortedKeys = Object.keys(combinedData)
        .filter(key => combinedData[key] !== undefined && combinedData[key] !== null && combinedData[key] !== '')
        .sort();

    for (const key of sortedKeys) {
        addRow(tbody, key, combinedData[key]);
    }

    table.appendChild(tbody);
    output.appendChild(table);

    const diagnosis = computeDiagnosis(
        combinedData,
        chillerCapacityInput.value,
        chillerFullLoadInput.value
    );

    if (diagnosis.missing.length > 0) {
        addNote(
            'Diagnosis unavailable',
            ['These readings could not be found on the image or in the inventory inputs:']
                .concat(diagnosis.missing),
            'suggestions'
        );
        return;
    }

    if (diagnosis.error) {
        addNote('Diagnosis unavailable', diagnosis.error, 'suggestions');
        return;
    }

    const topic = document.createElement('h2');
    topic.textContent = 'Diagnosis';
    output.appendChild(topic);

    const calculationsTable = document.createElement('table');
    const calculationsTbody = document.createElement('tbody');

    const calculations = {
        deltaT: diagnosis.deltaT,
        flowGPM: diagnosis.flowGPM,
        tons: diagnosis.tons,
        inputPower: diagnosis.inputPower,
        actualKWTon: diagnosis.actualKWTon,
        percentCapacity: diagnosis.percentCapacity,
        kwTonNeeded: diagnosis.kwTonNeeded,
        inefficiency: diagnosis.inefficiency,
        kwSaved: diagnosis.kwSaved,
    };

    for (const key of Object.keys(calculations)) {
        addRow(calculationsTbody, key, calculations[key], 2);
    }

    calculationsTable.appendChild(calculationsTbody);
    output.appendChild(calculationsTable);

    if (diagnosis.beatsBaseline) {
        addNote(
            'Performing better than AHRI baseline',
            `This chiller is running at ${diagnosis.actualKWTon.toFixed(2)} kW/ton against an AHRI target of ${diagnosis.kwTonNeeded.toFixed(2)} kW/ton, so there are no savings to recover at this operating point.`,
            'suggestions'
        );
    }

    // Say plainly which figures were read off the panel and which were assumed,
    // because an estimated input power and an assumed design flow move the
    // result far more than any other input.
    const assumptions = [];
    if (diagnosis.inputPowerSource === 'estimated') {
        assumptions.push('Input power was estimated from % full load amps, as the panel did not show kW. Amps percentage does not scale linearly with power, so this overstates the draw at part load.');
    }
    if (diagnosis.flowSource === 'design') {
        assumptions.push('Chilled water flow was assumed at design (2.4 GPM per ton), as the panel did not show a flow reading. This overstates tons, and so understates kW/ton, on a part-loaded chiller.');
    }
    if (assumptions.length > 0) {
        addNote('Assumptions used', assumptions, 'suggestions');
    }
}

async function callBackend(imageFiles, chillerCapacity, chillerFullLoad) {
    const formData = new FormData();
    for (const file of imageFiles) {
        formData.append('images', file);
    }
    formData.append('chillerCapacity', chillerCapacity);
    formData.append('chillerFullLoad', chillerFullLoad);

    // Relative, so the page works against whichever server delivered it -
    // production or a local dev server - without an edit.
    const response = await fetch('/extract', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail && detail.error ? detail.error : `HTTP error! status: ${response.status}`);
    }

    return await response.json();
}
