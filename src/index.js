require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const { extractInformation } = require('./yolo');
// Shared with the browser so both sides aggregate identically.
const { combineAssets } = require('../public/calculations');

const app = express();
const port = process.env.PORT || 4914;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads. Anything that is not an image is a
// guaranteed waste of an API call, so it is rejected before it gets that far.
const MAX_IMAGE_BYTES = Number(process.env.MAX_IMAGE_BYTES) || 20 * 1024 * 1024;
const MAX_IMAGES = Number(process.env.MAX_IMAGES) || 10;

const upload = multer({
    dest: 'uploads/',
    limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_IMAGES },
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error(`${file.originalname} is not an image (${file.mimetype}).`));
        }
    }
});

function removeUploads(files) {
    for (const file of files || []) {
        try {
            if (fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
            }
        } catch (error) {
            console.warn(`Failed to remove upload ${file.path}:`, error.message);
        }
    }
}

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

// Upload rejections are the caller's fault, so they get a 400 with the reason
// rather than the generic 500 from the error handler below.
const uploadImages = (req, res, next) => {
    upload.array('images')(req, res, (err) => {
        if (!err) return next();

        removeUploads(req.files);
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? `Images must be under ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`
            : err.code === 'LIMIT_FILE_COUNT'
                ? `Upload at most ${MAX_IMAGES} images at a time.`
                : err.message;
        res.status(400).json({ error: message });
    });
};

app.post('/extract', uploadImages, async (req, res) => {
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
                return combineAssets(data.assets);
            } else {
                return data;
            }
        });

        res.json(processedData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    } finally {
        // extractInformation removes each file it reads, but a rejected batch
        // can leave the rest behind.
        removeUploads(req.files);
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