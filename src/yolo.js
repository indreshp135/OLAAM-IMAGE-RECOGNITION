const fs = require('fs');

const API_KEY = process.env.YOLO_API_KEY;
const BASE_URL = process.env.YOLO_BASE_URL || 'https://yolo-auto.com/v1';
const MODEL = process.env.YOLO_MODEL || 'qwen3.8-27b';

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

    const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
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
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Yolo-Auto request failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const result = await response.json();
    const toolCalls = result.choices?.[0]?.message?.tool_calls;

    if (toolCalls && toolCalls.length > 0) {
        const toolCall = toolCalls[0];
        if (toolCall.function?.name === 'get_asset_information') {
            return JSON.parse(toolCall.function.arguments);
        }
    }

    throw new Error('Could not extract information from the image.');
}

// Temperatures and percentages describe an operating point rather than a
// quantity, so they are averaged across assets; summing them yields readings
// that cannot occur on a real panel.
const AVERAGED_FIELDS = new Set([
    'full_load_amps_percent',
    'chilled_liquid_leaving_temp_f',
    'chilled_liquid_entering_temp_f',
    'condenser_liquid_leaving_temp_f',
    'condenser_liquid_entering_temp_f',
    'discharge_superheat_f'
]);

function combineAssets(assets) {
    const combined = {};
    const counts = {};

    for (const asset of assets) {
        for (const key in asset) {
            if (typeof asset[key] === 'number') {
                combined[key] = (combined[key] || 0) + asset[key];
                counts[key] = (counts[key] || 0) + 1;
            }
        }
    }

    for (const key of Object.keys(combined)) {
        if (AVERAGED_FIELDS.has(key) && counts[key] > 1) {
            combined[key] /= counts[key];
        }
    }

    return combined;
}

module.exports = { extractInformation, combineAssets };
