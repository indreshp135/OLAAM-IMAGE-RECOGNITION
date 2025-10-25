const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');

const API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

async function extractInformation(imagePath, mimeType, chillerCapacity, chillerFullLoad) {
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        tools: [{
            functionDeclarations: [{
                name: 'get_asset_information',
                description: 'Extracts asset information from an image. Can handle multiple assets in a single image.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        assets: {
                            type: 'ARRAY',
                            description: 'An array of assets found in the image.',
                            items: {
                                type: 'OBJECT',
                                properties: {
                                    chiller_capacity_tons: {
                                        type: 'NUMBER',
                                        description: 'Chiller capacity in tons'
                                    },
                                    full_load_amps_percent: {
                                        type: 'NUMBER',
                                        description: 'Full load amps percentage'
                                    },
                                    input_kw: {
                                        type: 'NUMBER',
                                        description: 'Input power in kilowatts'
                                    },
                                    chilled_liquid_leaving_temp_f: {
                                        type: 'NUMBER',
                                        description: 'Chilled liquid leaving temperature in Fahrenheit'
                                    },
                                    chilled_liquid_entering_temp_f: {
                                        type: 'NUMBER',
                                        description: 'Chilled liquid entering temperature in Fahrenheit'
                                    },
                                    condenser_liquid_leaving_temp_f: {
                                        type: 'NUMBER',
                                        description: 'Condenser liquid leaving temperature in Fahrenheit'
                                    },
                                    condenser_liquid_entering_temp_f: {
                                        type: 'NUMBER',
                                        description: 'Condenser liquid entering temperature in Fahrenheit'
                                    },
                                    discharge_superheat_f: {
                                        type: 'NUMBER',
                                        description: 'Discharge superheat in Fahrenheit'
                                    }
                                }
                            }
                        }
                    }
                }
            }]
        }]
    });

    const imageBuffer = fs.readFileSync(imagePath);
    const imageBase64 = imageBuffer.toString('base64');

    const prompt = `Extract all visible asset information for each chiller from this image. If there are multiple chillers, extract the information for each one individually. Call the get_asset_information function with the data you find. Ensure that all extracted values are returned as numbers. The chiller capacity is ${chillerCapacity} tons and the chiller full load is ${chillerFullLoad} amps.`;

    const imagePart = {
        inlineData: {
            data: imageBase64,
            mimeType: mimeType,
        },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = result.response;

    // Clean up the uploaded file
    fs.unlinkSync(imagePath);

    // Check for function calls
    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
        const functionCall = functionCalls[0];
        if (functionCall.name === 'get_asset_information') {
            return functionCall.args;
        }
    }

    throw new Error('Could not extract information from the image.');
}

module.exports = { extractInformation };