require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { extractInformation } = require('./gemini');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Logger
const logger = (req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
};
app.use(logger);

app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: 'public' });
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

app.post('/extract', upload.array('images'), async (req, res) => {
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No image files provided.' });
    }

    const { chillerCapacity, chillerFullLoad } = req.body;

    try {
        const promises = req.files.map(file => extractInformation(file.path, file.mimetype, chillerCapacity, chillerFullLoad));
        const extractedData = await Promise.all(promises);

        // Handle the case where we have multiple assets in one image
        const processedData = extractedData.map(data => {
            if (data.assets && Array.isArray(data.assets)) {
                // Sum up the values for each property
                return data.assets.reduce((acc, asset) => {
                    for (const key in asset) {
                        if (typeof asset[key] === 'number') {
                            acc[key] = (acc[key] || 0) + asset[key];
                        }
                    }
                    return acc;
                }, {});
            } else {
                return data;
            }
        });

        res.json(processedData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});