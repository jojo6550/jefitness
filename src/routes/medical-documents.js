/**
 * @swagger
 * tags:
 *   name: Medical Documents
 *   description: Upload, manage, and view user medical documents
 *
 * @swagger
 * components:
 *   schemas:
 *     MedicalDocument:
 *       type: object
 *       properties:
 *         filename:
 *           type: string
 *         originalName:
 *           type: string
 *         size:
 *           type: integer
 *         mimeType:
 *           type: string
 */

const express = require('express');

const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const jwt = require('jsonwebtoken');
const multer = require('multer');

const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { logger } = require('../services/logger');
// Note: Auth middleware is applied at the router level in server.js
// Remove redundant auth imports and route-level auth

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/medical-documents');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

/**
 * Resolve a filename to an absolute path strictly inside uploadsDir.
 * Returns null if the resolved path escapes the uploads directory (path traversal attempt).
 */
function safeUploadPath(filename) {
  if (!filename || typeof filename !== 'string') return null;
  // Reject filenames containing path separators or null bytes
  if (/[/\\]/.test(filename) || filename.includes('\0')) return null;
  const resolved = path.resolve(uploadsDir, path.basename(filename));
  if (!resolved.startsWith(uploadsDir + path.sep) && resolved !== uploadsDir) return null;
  return resolved;
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${req.user.id}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const allowedMimes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
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
  fileFilter,
});

/**
 * @swagger
 * /medical-documents/upload:
 *   post:
 *     summary: Upload a medical document (PDF, DOC, DOCX, JPG, PNG — max 5MB)
 *     tags: [Medical Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                 filename:
 *                   type: string
 *       400:
 *         description: No file uploaded or invalid file type
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// ================= Upload a document =================
// Auth is applied at router level in server.js
router.post('/upload', upload.single('file'), async (req, res) => {
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
      mimeType: req.file.mimetype,
    });

    await user.save();
    res.json({ msg: 'File uploaded successfully', filename: req.file.filename });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error('Upload error', { error: err.message, stack: err.stack });
    res.status(500).json({ msg: 'Error uploading file', error: err.message });
  }
});

/**
 * @swagger
 * /medical-documents/delete:
 *   post:
 *     summary: Delete a medical document by filename
 *     tags: [Medical Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - filename
 *             properties:
 *               filename:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       400:
 *         description: Filename is required or invalid user ID
 *       404:
 *         description: User or document not found
 *       500:
 *         description: Server error
 */
// ================= Delete a document =================
// Auth is applied at router level in server.js
router.post('/delete', async (req, res) => {
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

    const filePath = safeUploadPath(filename);
    if (!filePath) return res.status(400).json({ msg: 'Invalid filename' });
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err) {
      logger.error('Failed to delete file from disk', { error: err.message });
    }

    user.medicalDocuments.splice(docIndex, 1);
    await user.save();

    res.json({ msg: 'Document deleted successfully' });
  } catch (err) {
    logger.error('Delete error', { error: err.message, stack: err.stack });
    res.status(500).json({ msg: 'Error deleting document', error: err.message });
  }
});

/**
 * @swagger
 * /medical-documents/get:
 *   get:
 *     summary: Get the current user's medical documents and health info
 *     tags: [Medical Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Medical documents and health info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hasMedical:
 *                   type: boolean
 *                 medicalConditions:
 *                   type: string
 *                   nullable: true
 *                 documents:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/MedicalDocument'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// ================= Get user's medical documents =================
// Auth is applied at router level in server.js
router.get('/get', async (req, res) => {
  try {
    if (!req.user || !req.user.id) return res.status(401).json({ msg: 'Unauthorized' });

    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ msg: 'Invalid user ID' });
    }

    const user = await User.findById(req.user.id).select(
      'hasMedical medicalConditions medicalDocuments'
    );

    if (!user) return res.status(404).json({ msg: 'User not found' });

    const documents = Array.isArray(user.medicalDocuments) ? user.medicalDocuments : [];

    res.json({
      hasMedical: !!user.hasMedical,
      medicalConditions: user.medicalConditions || null,
      documents,
    });
  } catch (err) {
    logger.error('Get documents error', { error: err.message, stack: err.stack });
    res.status(500).json({ msg: 'Error retrieving documents', error: err.message });
  }
});

/**
 * @swagger
 * /medical-documents/save-info:
 *   post:
 *     summary: Save the user's medical condition info (hasMedical flag and conditions text)
 *     tags: [Medical Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               hasMedical:
 *                 type: boolean
 *               medicalConditions:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Medical info saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 msg:
 *                   type: string
 *                 hasMedical:
 *                   type: boolean
 *                 medicalConditions:
 *                   type: string
 *                   nullable: true
 *       400:
 *         description: Invalid user ID
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
// ================= Save medical info =================
// Auth is applied at router level in server.js
router.post('/save-info', async (req, res) => {
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

    res.json({
      msg: 'Medical info saved',
      hasMedical: user.hasMedical,
      medicalConditions: user.medicalConditions,
    });
  } catch (err) {
    logger.error('Save info error', { error: err.message, stack: err.stack });
    res.status(500).json({ msg: 'Error saving medical info', error: err.message });
  }
});

/**
 * @swagger
 * /medical-documents/view/{filename}:
 *   get:
 *     summary: View a medical document inline in the browser
 *     description: Requires a valid JWT either in the Authorization header or as a `token` query param. Trainers may access documents belonging to their clients.
 *     tags: [Medical Documents]
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         description: JWT token (alternative to Authorization header)
 *     responses:
 *       200:
 *         description: File content streamed inline
 *         content:
 *           application/pdf: {}
 *           image/jpeg: {}
 *           image/png: {}
 *       401:
 *         description: No or invalid token
 *       403:
 *         description: Access denied
 *       404:
 *         description: File not found
 *       500:
 *         description: Server error
 */
// ================= View a document in browser =================
// This route has its own token verification - no auth middleware needed
router.get('/view/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    let token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (!token) return res.status(401).json({ msg: 'No token provided' });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ msg: 'Invalid or expired token' });
    }

    if (!mongoose.Types.ObjectId.isValid(decoded.id)) {
      return res.status(400).json({ msg: 'Invalid user ID' });
    }

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) return res.status(404).json({ msg: 'User not found' });

    const filePath = safeUploadPath(filename);
    if (!filePath) return res.status(400).json({ msg: 'Invalid filename' });
    try {
      if (!fs.existsSync(filePath))
        return res.status(404).json({ msg: 'File not found' });
    } catch (err) {
      return res.status(500).json({ msg: 'Error checking file', error: err.message });
    }

    const isOwner = currentUser.medicalDocuments.some(doc => doc.filename === filename);
    if (!isOwner && currentUser.role !== 'admin') {
      if (currentUser.role === 'trainer') {
        // Trainers may view documents belonging to their clients
        const fileOwner = await User.findOne({ 'medicalDocuments.filename': filename }).select('_id').lean();
        if (!fileOwner) return res.status(404).json({ msg: 'File not found' });
        const hasRelationship = await Appointment.exists({ trainerId: currentUser._id, clientId: fileOwner._id });
        if (!hasRelationship) return res.status(403).json({ msg: 'Access denied' });
      } else {
        return res.status(403).json({ msg: 'Access denied' });
      }
    }

    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    // Use path.basename to strip any remaining path components and encode for header safety
    const safeBasename = encodeURIComponent(path.basename(filename));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${safeBasename}`);
    res.sendFile(filePath);
  } catch (err) {
    logger.error('View error', { error: err.message, stack: err.stack });
    res.status(500).json({ msg: 'Error viewing file', error: err.message });
  }
});

/**
 * @swagger
 * /medical-documents/download/{filename}:
 *   get:
 *     summary: Download a medical document as an attachment
 *     tags: [Medical Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File download
 *         content:
 *           application/octet-stream: {}
 *       400:
 *         description: Invalid user ID
 *       403:
 *         description: Access denied
 *       404:
 *         description: File not found
 *       500:
 *         description: Server error
 */
// ================= Download a document =================
// Auth is applied at router level in server.js
router.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;

    if (!mongoose.Types.ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ msg: 'Invalid user ID' });
    }

    const currentUser = await User.findById(req.user.id);
    if (!currentUser) return res.status(404).json({ msg: 'User not found' });

    const filePath = safeUploadPath(filename);
    if (!filePath) return res.status(400).json({ msg: 'Invalid filename' });
    try {
      if (!fs.existsSync(filePath))
        return res.status(404).json({ msg: 'File not found' });
    } catch (err) {
      return res.status(500).json({ msg: 'Error checking file', error: err.message });
    }

    const isOwner = currentUser.medicalDocuments.some(doc => doc.filename === filename);
    if (!isOwner && currentUser.role !== 'admin') {
      if (currentUser.role === 'trainer') {
        const fileOwner = await User.findOne({ 'medicalDocuments.filename': filename }).select('_id').lean();
        if (!fileOwner) return res.status(404).json({ msg: 'File not found' });
        const hasRelationship = await Appointment.exists({ trainerId: currentUser._id, clientId: fileOwner._id });
        if (!hasRelationship) return res.status(403).json({ msg: 'Access denied' });
      } else {
        return res.status(403).json({ msg: 'Access denied' });
      }
    }

    res.download(filePath);
  } catch (err) {
    logger.error('Download error', { error: err.message, stack: err.stack });
    res.status(500).json({ msg: 'Error downloading file', error: err.message });
  }
});

module.exports = router;
