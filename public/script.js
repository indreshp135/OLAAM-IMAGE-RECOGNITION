const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const extractButton = document.getElementById('extract-button');
const output = document.getElementById('output');
const fileUploadLabel = document.querySelector('.file-upload-label');
const chillerCapacityInput = document.getElementById('chiller-capacity');
const chillerFullLoadInput = document.getElementById('chiller-full-load');

const displayMap = {
    chiller_capacity_tons: { displayName: 'Current Tons', unit: 'Tons' },
    full_load_amps_percent: { displayName: '% of Full Load Amps', unit: '%' },
    input_kw: { displayName: 'Input Power', unit: 'kW' },
    chilled_liquid_leaving_temp_f: { displayName: 'Chilled Liquid Leaving Temp', unit: '°F' },
    chilled_liquid_entering_temp_f: { displayName: 'Chilled Liquid Entering Temp', unit: '°F' },
    condenser_liquid_leaving_temp_f: { displayName: 'Condenser Liquid Leaving Temp', unit: '°F' },
    condenser_liquid_entering_temp_f: { displayName: 'Condenser Liquid Entering Temp', unit: '°F' },
    discharge_superheat_f: { displayName: 'Discharge Superheat', unit: '°F' },
    deltaT: { displayName: 'Chiller Delta T', unit: '°F' },
    flowGPM: { displayName: 'Flow', unit: 'GPM' },
    tons: { displayName: 'Tons', unit: 'Tons' },
    condenserDeltaT: { displayName: 'Condenser Delta T', unit: '°F' },
    inputPower: { displayName: 'Input Power', unit: 'kW' },
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
        output.innerHTML = '<p class="error">An error occurred while extracting information. Please try again.</p>';
    } finally {
        extractButton.disabled = false;
    }
});

function getAriTable(chillerCapacity) {
    const tons = parseFloat(chillerCapacity);

    // ARI tables for different tonnage ranges
    const table_small = { // < 500 tons
        85: { 100: 0.62, 90: 0.61, 80: 0.60, 70: 0.61, 60: 0.63, 50: 0.61 },
        75: { 100: 0.53, 90: 0.50, 80: 0.48, 70: 0.46, 60: 0.48, 50: 0.46 },
        65: { 100: 0.45, 90: 0.41, 80: 0.38, 70: 0.35, 60: 0.33, 50: 0.31 }
    };
    const table_medium = { // 500 - 1500 tons
        85: { 100: 0.60, 90: 0.59, 80: 0.58, 70: 0.59, 60: 0.61, 50: 0.59 },
        75: { 100: 0.51, 90: 0.48, 80: 0.46, 70: 0.44, 60: 0.46, 50: 0.44 },
        65: { 100: 0.43, 90: 0.39, 80: 0.36, 70: 0.33, 60: 0.31, 50: 0.29 }
    };
    const table_large = { // > 1500 tons
        85: { 100: 0.59, 90: 0.58, 80: 0.57, 70: 0.58, 60: 0.60, 50: 0.58 },
        75: { 100: 0.50, 90: 0.47, 80: 0.45, 70: 0.43, 60: 0.45, 50: 0.43 },
        65: { 100: 0.42, 90: 0.38, 80: 0.35, 70: 0.32, 60: 0.30, 50: 0.28 }
    };

    if (tons < 500) {
        return table_small;
    } else if (tons >= 500 && tons <= 1500) {
        return table_medium;
    } else {
        return table_large;
    }
}

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

function findClosest(value, array) {
    return array.reduce((prev, curr) => Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev);
}

function displayData(data) {
    output.innerHTML = ''; // Clear loader

    const combinedData = data.reduce((acc, current) => {
        for (const key in current) {
            if (typeof current[key] === 'number') {
                acc[key] = (acc[key] || 0) + current[key];
            } else {
                acc[key] = current[key];
            }
        }
        return acc;
    }, {});
    combinedData.chiller_capacity_tons = chillerCapacityInput.value;
    combinedData.chiller_full_load_amps = chillerFullLoadInput.value;

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    // const headerRow = document.createElement('tr');
    // const fieldHeader = document.createElement('th');
    // fieldHeader.textContent = ``;
    // const valueHeader = document.createElement('th');
    // valueHeader.textContent = 'Value';
    // headerRow.appendChild(fieldHeader);
    // headerRow.appendChild(valueHeader);
    // thead.appendChild(headerRow);

    // sort
    const sortedKeys = Object.keys(combinedData).sort();


    for (const key of sortedKeys) {
        const row = document.createElement('tr');
        const fieldCell = document.createElement('td');
        const mapEntry = displayMap[key];
        fieldCell.textContent = mapEntry ? mapEntry.displayName : key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const valueCell = document.createElement('td');
        const unit = mapEntry ? mapEntry.unit : '';
        valueCell.textContent = `${combinedData[key]} ${unit}`;
        row.appendChild(fieldCell);
        row.appendChild(valueCell);
        tbody.appendChild(row);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    output.appendChild(table);

    const topic =  document.createElement('h2');
    topic.textContent = 'Diagnosis';
    output.appendChild(topic);

    const calculationsTable = document.createElement('table');
    // const calculationsThead = document.createElement('thead');
    const calculationsTbody = document.createElement('tbody');

    // const calculationsHeaderRow = document.createElement('tr');
    // calculationsHeaderRow.innerHTML = '<th>Results</th><th>Value</th>';
    // calculationsThead.appendChild(calculationsHeaderRow);

    const deltaT = combinedData.chilled_liquid_entering_temp_f - combinedData.chilled_liquid_leaving_temp_f;
    const flowGPM = 2.4 * parseFloat(chillerCapacityInput.value);
    const tons = (deltaT * flowGPM) / 24;

    const condenserDeltaT = combinedData.condenser_liquid_leaving_temp_f - combinedData.condenser_liquid_entering_temp_f;

    const inputPower = (parseFloat(combinedData.full_load_amps_percent) / 100) * parseFloat(combinedData.chiller_full_load_amps);
    const actualKWTon = inputPower / tons;

    const percentCapacity = (parseFloat(combinedData.chiller_full_load_amps) / parseFloat(combinedData.chiller_capacity_tons)) * 100;

    const cwet = parseFloat(combinedData.condenser_liquid_entering_temp_f);
    const ariTable = getAriTable(combinedData.chiller_capacity_tons);
    const cwetTemps = Object.keys(ariTable).map(Number);
    const closestCwet = findClosest(cwet, cwetTemps);

    const percentCaps = Object.keys(ariTable[closestCwet]).map(Number);
    const closestPercentCap = findClosest(percentCapacity, percentCaps);

    const kwTonNeeded = ariTable[closestCwet][closestPercentCap];

    const inefficiencyAbsolute = actualKWTon - kwTonNeeded;
    const inefficiency = (inefficiencyAbsolute / kwTonNeeded) * 100;
    const kwSaved = inefficiencyAbsolute * tons;

    const calculations = {
        // deltaT,
        // flowGPM,
        // tons,
        // condenserDeltaT,
        // inputPower,
        // actualKWTon,
        // percentCapacity,
        // kwTonNeeded,
        inefficiency,
        kwSaved
    };

    for (const key in calculations) {
        const row = document.createElement('tr');
        const fieldCell = document.createElement('td');
        const mapEntry = displayMap[key];
        fieldCell.textContent = mapEntry ? mapEntry.displayName : key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const valueCell = document.createElement('td');
        const unit = mapEntry ? mapEntry.unit : '';
        valueCell.textContent = `${calculations[key].toFixed(2)} ${unit}`;
        row.appendChild(fieldCell);
        row.appendChild(valueCell);
        calculationsTbody.appendChild(row);
    }

    // calculationsTable.appendChild(calculationsThead);
    calculationsTable.appendChild(calculationsTbody);
    output.appendChild(calculationsTable);

    // const suggestions = generateSuggestions(condenserDeltaT, combinedData.discharge_superheat_f);

    // if (suggestions.length > 0) {
    //     const suggestionsDiv = document.createElement('div');
    //     suggestionsDiv.classList.add('suggestions');
    //     const suggestionsTitle = document.createElement('h3');
    //     suggestionsTitle.textContent = 'Recommendations and Analysis';
    //     suggestionsDiv.appendChild(suggestionsTitle);
    //     const suggestionsList = document.createElement('ul');
    //     suggestions.forEach(suggestion => {
    //         const listItem = document.createElement('li');
    //         listItem.textContent = suggestion;
    //         suggestionsList.appendChild(listItem);
    //     });
    //     suggestionsDiv.appendChild(suggestionsList);
    //     output.appendChild(suggestionsDiv);
    // }
}

async function callBackend(imageFiles, chillerCapacity, chillerFullLoad) {
    const formData = new FormData();
    for (const file of imageFiles) {
        formData.append('images', file);
    }
    formData.append('chillerCapacity', chillerCapacity);
    formData.append('chillerFullLoad', chillerFullLoad);

    const response = await fetch('https://image-recognition.deltaenergyplus.com/extract', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}
