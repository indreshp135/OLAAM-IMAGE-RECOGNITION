const fs = require('fs');

const API_KEY = process.env.YOLO_API_KEY;
const BASE_URL = process.env.YOLO_BASE_URL || 'https://yolo-auto.com/v1';
const MODEL = process.env.YOLO_MODEL || 'qwen3.8-27b';
const TIMEOUT_MS = Number(process.env.YOLO_TIMEOUT_MS) || 120000;
const MAX_ATTEMPTS = Number(process.env.YOLO_MAX_ATTEMPTS) || 3;

const NUMBER = { type: 'number' };

const assetInformationTool = {
    type: 'function',
    function: {
        name: 'get_asset_information',
        description: 'Extracts asset information from an image. Can handle multiple assets in a single image.',
        parameters: {
            type: 'object',
            properties: {
                assets: {
                    type: 'array',
                    description: 'An array of assets found in the image.',
                    items: {
                        type: 'object',
                        properties: {
                            chiller_capacity_tons: { ...NUMBER, description: 'Chiller capacity in tons' },
                            full_load_amps_percent: { ...NUMBER, description: 'Full load amps percentage' },
                            input_kw: { ...NUMBER, description: 'Input power in kilowatts' },
                            chilled_liquid_leaving_temp_f: { ...NUMBER, description: 'Chilled liquid leaving temperature in Fahrenheit' },
                            chilled_liquid_entering_temp_f: { ...NUMBER, description: 'Chilled liquid entering temperature in Fahrenheit' },
                            condenser_liquid_leaving_temp_f: { ...NUMBER, description: 'Condenser liquid leaving temperature in Fahrenheit' },
                            condenser_liquid_entering_temp_f: { ...NUMBER, description: 'Condenser liquid entering temperature in Fahrenheit' },
                            discharge_superheat_f: { ...NUMBER, description: 'Discharge superheat in Fahrenheit' },
                            chilled_water_flow_gpm: { ...NUMBER, description: 'Chilled water flow in gallons per minute' }
                        }
                    }
                }
            },
            required: ['assets']
        }
    }
};

async function extractInformation(imagePath, mimeType, chillerCapacity, chillerFullLoad) {
    if (!API_KEY) {
        throw new Error('YOLO_API_KEY is not set.');
    }

    const imageBase64 = fs.readFileSync(imagePath).toString('base64');

    // Clean up the uploaded file
    fs.unlinkSync(imagePath);

    const prompt = `Extract all visible asset information for each chiller from this image. If there are multiple chillers, extract the information for each one individually. Call the get_asset_information function with the data you find. Ensure that all extracted values are returned as numbers. For context, the chiller capacity is ${chillerCapacity} tons and the chiller full load is ${chillerFullLoad} kW; these two values are context only, so do not report them back as extracted values. Only include fields you can actually read on the panel, and omit any field that is not visible.`;

    const body = JSON.stringify({
        model: MODEL,
        messages: [{
            role: 'user',
            content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
            ]
        }],
        tools: [assetInformationTool],
        tool_choice: { type: 'function', function: { name: 'get_asset_information' } }
    });

    return retry(async () => {
        const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json'
            },
            body,
            // Without this a stalled connection hangs the upload indefinitely.
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            const error = new Error(`Yolo-Auto request failed (${response.status}): ${text.slice(0, 500)}`);
            // Rate limits and server faults are worth another attempt; a bad
            // request or a rejected key will fail identically every time.
            error.retryable = response.status === 429 || response.status >= 500;
            throw error;
        }

        const result = await response.json();
        const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

        if (toolCall?.function?.name === 'get_asset_information') {
            return JSON.parse(toolCall.function.arguments);
        }

        // The model occasionally answers in prose despite tool_choice, which a
        // second attempt usually settles.
        const error = new Error('Could not extract information from the image.');
        error.retryable = true;
        throw error;
    });
}

// Retries transient failures with exponential backoff and a little jitter.
async function retry(fn) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // AbortError from the timeout above has no `retryable` flag but is
            // exactly the kind of failure worth repeating.
            const retryable = error.retryable ?? (error.name === 'TimeoutError' || error.name === 'AbortError');
            if (!retryable || attempt === MAX_ATTEMPTS) break;

            const delay = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
            console.warn(`Yolo-Auto attempt ${attempt} failed (${error.message}). Retrying in ${delay}ms.`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

module.exports = { extractInformation };
