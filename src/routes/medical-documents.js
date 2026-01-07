const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads/medical-documents');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        // Create a unique filename with timestamp and user ID
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    // Allowed file types
    const allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png'
    ];

    const allowedExtensions = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
    const fileExt = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG are allowed.'));
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: fileFilter
});

// POST /api/medical-documents/upload - Upload a medical document
router.post('/upload', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ msg: 'No file uploaded' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            // Delete the file if user not found
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
            return res.status(404).json({ msg: 'User not found' });
        }

        // Add document to user's medical documents
        user.medicalDocuments.push({
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype
        });

        await user.save();

        res.json({
            msg: 'File uploaded successfully',
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            path: req.file.filename
        });
    } catch (err) {
        // Delete the file on error
        if (req.file) {
            fs.unlink(req.file.path, (unlinkErr) => {
                if (unlinkErr) console.error('Error deleting file:', unlinkErr);
            });
        }
        console.error('Upload error:', err.message);
        res.status(500).json({ msg: 'Error uploading file', error: err.message });
    }
});

// POST /api/medical-documents/delete - Delete a medical document
router.post('/delete', auth, async (req, res) => {
    try {
        const { filename } = req.body;

        if (!filename) {
            return res.status(400).json({ msg: 'Filename is required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Find the document
        const docIndex = user.medicalDocuments.findIndex(doc => doc.filename === filename);
        if (docIndex === -1) {
            return res.status(404).json({ msg: 'Document not found' });
        }

        // Delete file from disk
        const filePath = path.join(uploadsDir, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Remove document from user's medical documents
        user.medicalDocuments.splice(docIndex, 1);
        await user.save();

        res.json({ msg: 'Document deleted successfully' });
    } catch (err) {
        console.error('Delete error:', err.message);
        res.status(500).json({ msg: 'Error deleting file', error: err.message });
    }
});

// GET /api/medical-documents/get - Get user's medical documents and info
router.get('/get', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('hasMedical medicalConditions medicalDocuments');

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json({
            hasMedical: user.hasMedical,
            medicalConditions: user.medicalConditions,
            documents: user.medicalDocuments || []
        });
    } catch (err) {
        console.error('Get documents error:', err.message);
        res.status(500).json({ msg: 'Error retrieving documents' });
    }
});

// POST /api/medical-documents/save-info - Save medical info (conditions, etc.)
router.post('/save-info', auth, async (req, res) => {
    try {
        const { hasMedical, medicalConditions } = req.body;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            {
                hasMedical: hasMedical || false,
                medicalConditions: medicalConditions || null
            },
            { new: true }
        ).select('hasMedical medicalConditions');

        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.json({
            msg: 'Medical information saved successfully',
            hasMedical: user.hasMedical,
            medicalConditions: user.medicalConditions
        });
    } catch (err) {
        console.error('Save info error:', err.message);
        res.status(500).json({ msg: 'Error saving medical information' });
    }
});

// GET /api/medical-documents/download/:filename - Download a medical document
router.get('/download/:filename', auth, async (req, res) => {
    try {
        const { filename } = req.params;

        // Verify user owns this document
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        const docExists = user.medicalDocuments.some(doc => doc.filename === filename);
        if (!docExists) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const filePath = path.join(uploadsDir, filename);

        // Verify file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ msg: 'File not found' });
        }

        res.download(filePath);
    } catch (err) {
        console.error('Download error:', err.message);
        res.status(500).json({ msg: 'Error downloading file' });
    }
});

module.exports = router;
