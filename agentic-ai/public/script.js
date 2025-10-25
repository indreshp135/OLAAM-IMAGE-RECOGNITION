const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const extractButton = document.getElementById('extract-button');
const output = document.getElementById('output');
const fileUploadLabel = document.querySelector('.file-upload-label');
const chillerCapacityInput = document.getElementById('chiller-capacity');
const chillerFullLoadInput = document.getElementById('chiller-full-load');

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

chillerCapacityInput.addEventListener('input', () => {
    if (!chillerFullLoadInput.value) {
        const capacity = parseFloat(chillerCapacityInput.value);
        if (!isNaN(capacity)) {
            chillerFullLoadInput.value = (0.6 * capacity).toFixed(2);
        }
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
        const data = await callBackend(files, chillerCapacity, chillerFullLoadInput.value);
        displayData(data);
    } catch (error) {
        console.error(error);
        output.innerHTML = '<p class="error">An error occurred while extracting information. Please try again.</p>';
    } finally {
        extractButton.disabled = false;
    }
});

function displayData(data) {
    output.innerHTML = ''; // Clear loader

    // Display OCR Data
    const ocrTable = document.createElement('table');
    const ocrThead = document.createElement('thead');
    const ocrTbody = document.createElement('tbody');
    const ocrHeaderRow = document.createElement('tr');
    ocrHeaderRow.innerHTML = '<th>OCR Data</th><th>Value</th>';
    ocrThead.appendChild(ocrHeaderRow);

    for (const key in data.ocrData) {
        const row = document.createElement('tr');
        const fieldCell = document.createElement('td');
        fieldCell.textContent = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const valueCell = document.createElement('td');
        valueCell.textContent = data.ocrData[key];
        row.appendChild(fieldCell);
        row.appendChild(valueCell);
        ocrTbody.appendChild(row);
    }
    ocrTable.appendChild(ocrThead);
    ocrTable.appendChild(ocrTbody);
    output.appendChild(ocrTable);

    // Display Calculations
    const calculationsTable = document.createElement('table');
    const calculationsThead = document.createElement('thead');
    const calculationsTbody = document.createElement('tbody');
    const calculationsHeaderRow = document.createElement('tr');
    calculationsHeaderRow.innerHTML = '<th>Calculation</th><th>Value</th>';
    calculationsThead.appendChild(calculationsHeaderRow);

    for (const key in data.calculations) {
        const row = document.createElement('tr');
        const fieldCell = document.createElement('td');
        fieldCell.textContent = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const valueCell = document.createElement('td');
        valueCell.textContent = data.calculations[key].toFixed(2);
        row.appendChild(fieldCell);
        row.appendChild(valueCell);
        calculationsTbody.appendChild(row);
    }
    calculationsTable.appendChild(calculationsThead);
    calculationsTable.appendChild(calculationsTbody);
    output.appendChild(calculationsTable);

    // Display Suggestions
    if (data.suggestions && data.suggestions.length > 0) {
        const suggestionsDiv = document.createElement('div');
        suggestionsDiv.classList.add('suggestions');
        const suggestionsTitle = document.createElement('h3');
        suggestionsTitle.textContent = 'Suggestions';
        suggestionsDiv.appendChild(suggestionsTitle);
        const suggestionsList = document.createElement('ul');
        data.suggestions.forEach(suggestion => {
            const listItem = document.createElement('li');
            listItem.textContent = suggestion;
            suggestionsList.appendChild(listItem);
        });
        suggestionsDiv.appendChild(suggestionsList);
        output.appendChild(suggestionsDiv);
    }
}

async function callBackend(imageFiles, chillerCapacity, chillerFullLoad) {
    const formData = new FormData();
    for (const file of imageFiles) {
        formData.append('images', file);
    }
    formData.append('chillerCapacity', chillerCapacity);
    formData.append('chillerFullLoad', chillerFullLoad);

    const response = await fetch('http://localhost:3001/api/extract', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}