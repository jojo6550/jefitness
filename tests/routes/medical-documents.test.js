const request = require('supertest');
const express = require('express');
const medicalDocumentsRouter = require('../../src/routes/medical-documents');
const User = require('../../src/models/User');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Mock multer
jest.mock('multer', () => {
  const multer = () => ({
    single: jest.fn((fieldName) => (req, res, next) => {
      // For the test that expects no file, don't set req.file
      if (req.headers['x-no-file']) {
        next();
      } else {
        req.file = {
          filename: 'test-file.pdf',
          originalname: 'test.pdf',
          size: 1024,
          mimetype: 'application/pdf',
          path: '/tmp/test-file.pdf'
        };
        next();
      }
    })
  });
  multer.diskStorage = jest.fn();
  return multer;
});

// Mock express response methods
const mockSendFile = jest.fn();
const mockDownload = jest.fn();

jest.mock('express', () => {
  const express = jest.requireActual('express');
  const mockResponse = {
    ...express.response,
    sendFile: mockSendFile,
    download: mockDownload,
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    send: jest.fn()
  };
  express.response = mockResponse;
  return express;
});

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  unlinkSync: jest.fn(),
  unlink: jest.fn((path, callback) => callback()),
  mkdirSync: jest.fn(),
  createReadStream: jest.fn().mockReturnValue({
    pipe: jest.fn()
  })
}));

// Mock response methods for file operations
app.use((req, res, next) => {
  res.sendFile = jest.fn(() => res.status(200).send('file content'));
  res.download = jest.fn(() => res.status(200).send('file content'));
  next();
});

const app = express();
app.use(express.json());

// Mock auth middleware
app.use((req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
    } catch (err) {
      return res.status(401).json({ msg: 'Unauthorized' });
    }
  }
  next();
});

app.use('/api/medical-documents', medicalDocumentsRouter);

describe('Medical Documents Routes', () => {
  let user;
  let adminUser;
  let userToken;
  let adminToken;

  beforeEach(async () => {
    user = await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      password: 'Test123!@#',
      role: 'user',
      isEmailVerified: true,
      medicalDocuments: [
        {
          filename: 'doc1.pdf',
          originalName: 'document1.pdf',
          size: 2048,
          mimeType: 'application/pdf'
        }
      ]
    });

    adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'Test123!@#',
      role: 'admin',
      isEmailVerified: true
    });

    userToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET);
  });

  describe('POST /api/medical-documents/upload', () => {
    test('should upload medical document successfully', async () => {
      const response = await request(app)
        .post('/api/medical-documents/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', Buffer.from('test file content'), 'test.pdf')
        .expect(200);

      expect(response.body.msg).toBe('File uploaded successfully');
      expect(response.body.filename).toBe('test-file.pdf');
    });

    test('should reject upload without file', async () => {
      const response = await request(app)
        .post('/api/medical-documents/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .set('x-no-file', 'true')
        .expect(400);

      expect(response.body.msg).toBe('No file uploaded');
    });

    test('should reject upload for non-existent user', async () => {
      const fakeToken = jwt.sign({ id: '507f1f77bcf86cd799439011', role: 'user' }, process.env.JWT_SECRET);

      const response = await request(app)
        .post('/api/medical-documents/upload')
        .set('Authorization', `Bearer ${fakeToken}`)
        .attach('file', Buffer.from('test file content'), 'test.pdf')
        .expect(404);

      expect(response.body.msg).toBe('User not found');
    });
  });

  describe('POST /api/medical-documents/delete', () => {
    test('should delete medical document successfully', async () => {
      const response = await request(app)
        .post('/api/medical-documents/delete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ filename: 'doc1.pdf' })
        .expect(200);

      expect(response.body.msg).toBe('Document deleted successfully');
    });

    test('should reject delete without filename', async () => {
      const response = await request(app)
        .post('/api/medical-documents/delete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(400);

      expect(response.body.msg).toBe('Filename is required');
    });

    test('should reject delete for non-existent document', async () => {
      const response = await request(app)
        .post('/api/medical-documents/delete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ filename: 'nonexistent.pdf' })
        .expect(404);

      expect(response.body.msg).toBe('Document not found');
    });
  });

  describe('GET /api/medical-documents/get', () => {
    test('should get user medical documents and info', async () => {
      const response = await request(app)
        .get('/api/medical-documents/get')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.hasMedical).toBeDefined();
      expect(response.body.medicalConditions).toBeDefined();
      expect(Array.isArray(response.body.documents)).toBe(true);
    });

    test('should return empty documents array for new user', async () => {
      const newUser = await User.create({
        firstName: 'New',
        lastName: 'User',
        email: 'new@example.com',
        password: 'Test123!@#',
        role: 'user',
        isEmailVerified: true
      });

      const newToken = jwt.sign({ id: newUser._id, role: newUser.role }, process.env.JWT_SECRET);

      const response = await request(app)
        .get('/api/medical-documents/get')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(response.body.documents).toEqual([]);
    });
  });

  describe('POST /api/medical-documents/save-info', () => {
    test('should save medical info successfully', async () => {
      const response = await request(app)
        .post('/api/medical-documents/save-info')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          hasMedical: true,
          medicalConditions: 'Asthma, Diabetes'
        })
        .expect(200);

      expect(response.body.msg).toBe('Medical information saved successfully');
      expect(response.body.hasMedical).toBe(true);
      expect(response.body.medicalConditions).toBe('Asthma, Diabetes');
    });

    test('should save medical info with false hasMedical', async () => {
      const response = await request(app)
        .post('/api/medical-documents/save-info')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          hasMedical: false,
          medicalConditions: null
        })
        .expect(200);

      expect(response.body.hasMedical).toBe(false);
      expect(response.body.medicalConditions).toBe(null);
    });
  });

  describe('GET /api/medical-documents/view/:filename', () => {
    test('should view document for owner', async () => {
      const response = await request(app)
        .get('/api/medical-documents/view/doc1.pdf')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      // Response should be a file stream
      expect(response.status).toBe(200);
    });

    test('should view document for admin', async () => {
      const response = await request(app)
        .get('/api/medical-documents/view/doc1.pdf')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.status).toBe(200);
    });

    test('should reject view for unauthorized user', async () => {
      const otherUser = await User.create({
        firstName: 'Other',
        lastName: 'User',
        email: 'other@example.com',
        password: 'Test123!@#',
        role: 'user',
        isEmailVerified: true
      });

      const otherToken = jwt.sign({ id: otherUser._id, role: otherUser.role }, process.env.JWT_SECRET);

      await request(app)
        .get('/api/medical-documents/view/doc1.pdf')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    test('should reject view without token', async () => {
      await request(app)
        .get('/api/medical-documents/view/doc1.pdf')
        .expect(401);
    });

    test('should handle invalid token', async () => {
      await request(app)
        .get('/api/medical-documents/view/doc1.pdf')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    test('should return 404 for non-existent file', async () => {
      fs.existsSync.mockReturnValueOnce(false);

      await request(app)
        .get('/api/medical-documents/view/nonexistent.pdf')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });

  describe('GET /api/medical-documents/download/:filename', () => {
    test('should download document for owner', async () => {
      const response = await request(app)
        .get('/api/medical-documents/download/doc1.pdf')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.status).toBe(200);
    });

    test('should download document for admin', async () => {
      const response = await request(app)
        .get('/api/medical-documents/download/doc1.pdf')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.status).toBe(200);
    });

    test('should reject download for unauthorized user', async () => {
      const otherUser = await User.create({
        firstName: 'Other',
        lastName: 'User',
        email: 'other@example.com',
        password: 'Test123!@#',
        role: 'user',
        isEmailVerified: true
      });

      const otherToken = jwt.sign({ id: otherUser._id, role: otherUser.role }, process.env.JWT_SECRET);

      await request(app)
        .get('/api/medical-documents/download/doc1.pdf')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    test('should return 404 for non-existent file', async () => {
      fs.existsSync.mockReturnValueOnce(false);

      await request(app)
        .get('/api/medical-documents/download/nonexistent.pdf')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });
});
