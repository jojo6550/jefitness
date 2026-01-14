const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/medical-documents');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png'
];
const allowedExts = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) cb(null, true);
    else cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG are allowed.'));
};

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter
});

// ================= Upload a document =================
router.post('/upload', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ msg: 'No file uploaded' });

        const user = await User.findById(req.user.id);
        if (!user) {
            fs.unlink(req.file.path, () => {});
            return res.status(404).json({ msg: 'User not found' });
        }

        user.medicalDocuments = user.medicalDocuments || [];
        user.medicalDocuments.push({
            filename: req.file.filename,
            originalName: req.file.originalname,
            size: req.file.size,
            mimeType: req.file.mimetype
        });

        await user.save();
        res.json({ msg: 'File uploaded successfully', filename: req.file.filename });
    } catch (err) {
        if (req.file) fs.unlink(req.file.path, () => {});
        console.error('Upload error:', err.stack);
        res.status(500).json({ msg: 'Error uploading file', error: err.message });
    }
});

// ================= Delete a document =================
router.post('/delete', auth, async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) return res.status(400).json({ msg: 'Filename is required' });

        if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
            return res.status(400).json({ msg: 'Invalid user ID' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        user.medicalDocuments = user.medicalDocuments || [];
        const docIndex = user.medicalDocuments.findIndex(doc => doc.filename === filename);
        if (docIndex === -1) return res.status(404).json({ msg: 'Document not found' });

        const filePath = path.join(uploadsDir, filename);
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch(err) { console.error(err); }

        user.medicalDocuments.splice(docIndex, 1);
        await user.save();

        res.json({ msg: 'Document deleted successfully' });
    } catch (err) {
        console.error('Delete error:', err.stack);
        res.status(500).json({ msg: 'Error deleting document', error: err.message });
    }
});

// ================= Get user's medical documents =================
router.get('/get', auth, async (req, res) => {
    try {
        if (!req.user || !req.user.id) return res.status(401).json({ msg: 'Unauthorized' });

        if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
            return res.status(400).json({ msg: 'Invalid user ID' });
        }

        const user = await User.findById(req.user.id)
            .select('hasMedical medicalConditions medicalDocuments');

        if (!user) return res.status(404).json({ msg: 'User not found' });

        const documents = Array.isArray(user.medicalDocuments) ? user.medicalDocuments : [];

        res.json({
            hasMedical: !!user.hasMedical,
            medicalConditions: user.medicalConditions || null,
            documents
        });
    } catch (err) {
        console.error('Get documents error:', err.stack);
        res.status(500).json({ msg: 'Error retrieving documents', error: err.message });
    }
});

// ================= Save medical info =================
router.post('/save-info', auth, async (req, res) => {
    try {
        const { hasMedical, medicalConditions } = req.body;

        if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
            return res.status(400).json({ msg: 'Invalid user ID' });
        }

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { hasMedical: !!hasMedical, medicalConditions: medicalConditions || null },
            { new: true }
        ).select('hasMedical medicalConditions');

        if (!user) return res.status(404).json({ msg: 'User not found' });

        res.json({ msg: 'Medical info saved', hasMedical: user.hasMedical, medicalConditions: user.medicalConditions });
    } catch (err) {
        console.error('Save info error:', err.stack);
        res.status(500).json({ msg: 'Error saving medical info', error: err.message });
    }
});

// ================= View a document in browser =================
router.get('/view/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        let token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
        if (!token) return res.status(401).json({ msg: 'No token provided' });

        let decoded;
        try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
        catch { return res.status(401).json({ msg: 'Invalid or expired token' }); }

        if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
            return res.status(400).json({ msg: 'Invalid user ID' });
        }

        const currentUser = await User.findById(decoded.id);
        if (!currentUser) return res.status(404).json({ msg: 'User not found' });

        const filePath = path.join(uploadsDir, filename);
        try { if (!fs.existsSync(filePath)) return res.status(404).json({ msg: 'File not found' }); } 
        catch(err) { return res.status(500).json({ msg: 'Error checking file', error: err.message }); }

        if (currentUser.role !== 'admin' && !currentUser.medicalDocuments.some(doc => doc.filename === filename)) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        };
        res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
        res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
        res.sendFile(filePath);
    } catch (err) {
        console.error('View error:', err.stack);
        res.status(500).json({ msg: 'Error viewing file', error: err.message });
    }
});

// ================= Download a document =================
router.get('/download/:filename', auth, async (req, res) => {
    try {
        const { filename } = req.params;

        if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
            return res.status(400).json({ msg: 'Invalid user ID' });
        }

        const currentUser = await User.findById(req.user.id);
        if (!currentUser) return res.status(404).json({ msg: 'User not found' });

        const filePath = path.join(uploadsDir, filename);
        try { if (!fs.existsSync(filePath)) return res.status(404).json({ msg: 'File not found' }); }
        catch(err) { return res.status(500).json({ msg: 'Error checking file', error: err.message }); }

        if (currentUser.role !== 'admin' && !currentUser.medicalDocuments.some(doc => doc.filename === filename)) {
            return res.status(403).json({ msg: 'Access denied' });
        }

        res.download(filePath);
    } catch (err) {
        console.error('Download error:', err.stack);
        res.status(500).json({ msg: 'Error downloading file', error: err.message });
    }
});

module.exports = router;
