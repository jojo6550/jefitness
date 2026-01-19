/**
 * Integration Tests for Medical Document Management
 * Tests secure upload, authorization, file validation, and soft deletion
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const app = require('../../server');
const User = require('../../models/User');

describe('Medical Document Management', () => {
  let testUser, otherUser, adminUser;
  let userToken, otherToken, adminToken;
  const uploadsDir = path.join(__dirname, '../../uploads/medical-documents');

  beforeAll(() => {
    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  });

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);

    testUser = await User.create({
      firstName: 'Test',
      lastName: 'User',
      email: 'medical@example.com',
      password: hashedPassword,
      role: 'user',
      isEmailVerified: true,
      medicalDocuments: [],
      dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
      healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
    });

    otherUser = await User.create({
      firstName: 'Other',
      lastName: 'User',
      email: 'other@example.com',
      password: hashedPassword,
      role: 'user',
      isEmailVerified: true,
      medicalDocuments: [],
      dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
      healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
    });

    adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin',
      isEmailVerified: true,
      dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
      healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
    });

    userToken = jwt.sign(
      { id: testUser._id, userId: testUser._id, tokenVersion: 0 },
      process.env.JWT_SECRET
    );

    otherToken = jwt.sign(
      { id: otherUser._id, userId: otherUser._id, tokenVersion: 0 },
      process.env.JWT_SECRET
    );

    adminToken = jwt.sign(
      { id: adminUser._id, userId: adminUser._id, role: 'admin', tokenVersion: 0 },
      process.env.JWT_SECRET
    );
  });

  afterEach(() => {
    // Clean up uploaded test files
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(file => {
        const filePath = path.join(uploadsDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
    }
  });

  describe('POST /api/medical-documents/upload', () => {
    test('should upload valid PDF document', async () => {
      // Create a test PDF file
      const testPdfPath = path.join(__dirname, 'test.pdf');
      fs.writeFileSync(testPdfPath, 'Test PDF content');

      const response = await request(app)
        .post('/api/medical-documents/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', testPdfPath)
        .expect(200);

      expect(response.body.msg).toContain('uploaded successfully');
      expect(response.body.filename).toBeDefined();

      // Verify document was added to user
      const user = await User.findById(testUser._id);
      expect(user.medicalDocuments).toHaveLength(1);
      expect(user.medicalDocuments[0].mimeType).toBe('application/pdf');

      // Clean up test file
      fs.unlinkSync(testPdfPath);
    });

    test('should upload valid image document (JPG)', async () => {
      const testJpgPath = path.join(__dirname, 'test.jpg');
      fs.writeFileSync(testJpgPath, 'Test JPG content');

      const response = await request(app)
        .post('/api/medical-documents/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', testJpgPath)
        .expect(200);

      expect(response.body.msg).toContain('uploaded successfully');

      const user = await User.findById(testUser._id);
      expect(user.medicalDocuments).toHaveLength(1);

      fs.unlinkSync(testJpgPath);
    });

    test('should reject file exceeding 5MB limit', async () => {
      const largePath = path.join(__dirname, 'large.pdf');
      // Create a file larger than 5MB
      const largeContent = Buffer.alloc(6 * 1024 * 1024);
      fs.writeFileSync(largePath, largeContent);

      const response = await request(app)
        .post('/api/medical-documents/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', largePath)
        .expect(400);

      expect(response.body.error).toBeDefined();

      fs.unlinkSync(largePath);
    });

    test('should reject invalid file types', async () => {
      const testExePath = path.join(__dirname, 'test.exe');
      fs.writeFileSync(testExePath, 'Executable content');

      const response = await request(app)
        .post('/api/medical-documents/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', testExePath)
        .expect(400);

      expect(response.body.error).toContain('Invalid file type');

      fs.unlinkSync(testExePath);
    });

    test('should reject upload without file', async () => {
      const response = await request(app)
        .post('/api/medical-documents/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(400);

      expect(response.body.msg).toContain('No file');
    });

    test('should require authentication', async () => {
      const testPdfPath = path.join(__dirname, 'test.pdf');
      fs.writeFileSync(testPdfPath, 'Test PDF content');

      await request(app)
        .post('/api/medical-documents/upload')
        .attach('file', testPdfPath)
        .expect(401);

      fs.unlinkSync(testPdfPath);
    });

    test('should store file with user-specific naming', async () => {
      const testPdfPath = path.join(__dirname, 'test.pdf');
      fs.writeFileSync(testPdfPath, 'Test PDF content');

      const response = await request(app)
        .post('/api/medical-documents/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', testPdfPath)
        .expect(200);

      // Verify filename includes user ID
      expect(response.body.filename).toContain(testUser._id.toString());

      fs.unlinkSync(testPdfPath);
    });
  });

  describe('GET /api/medical-documents/get', () => {
    beforeEach(async () => {
      // Add medical documents to user
      testUser.medicalDocuments = [
        {
          filename: `${testUser._id}-123-test.pdf`,
          originalName: 'test.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          uploadedAt: new Date()
        }
      ];
      await testUser.save();
    });

    test('should get user medical documents', async () => {
      const response = await request(app)
        .get('/api/medical-documents/get')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.documents).toHaveLength(1);
      expect(response.body.documents[0].originalName).toBe('test.pdf');
    });

    test('should return empty array for users without documents', async () => {
      const response = await request(app)
        .get('/api/medical-documents/get')
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(200);

      expect(response.body.documents).toHaveLength(0);
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/medical-documents/get')
        .expect(401);
    });
  });

  describe('POST /api/medical-documents/delete', () => {
    let filename;

    beforeEach(async () => {
      filename = `${testUser._id}-123-test.pdf`;

      // Create test file
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, 'Test content');

      // Add to user's documents
      testUser.medicalDocuments = [
        {
          filename,
          originalName: 'test.pdf',
          size: 1024,
          mimeType: 'application/pdf',
          uploadedAt: new Date()
        }
      ];
      await testUser.save();
    });

    test('should delete medical document', async () => {
      const response = await request(app)
        .post('/api/medical-documents/delete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ filename })
        .expect(200);

      expect(response.body.msg).toContain('deleted successfully');

      // Verify document was removed from user
      const user = await User.findById(testUser._id);
      expect(user.medicalDocuments).toHaveLength(0);

      // Verify file was deleted
      const filePath = path.join(uploadsDir, filename);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    test('should reject delete without filename', async () => {
      const response = await request(app)
        .post('/api/medical-documents/delete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({})
        .expect(400);

      expect(response.body.msg).toContain('Filename is required');
    });

    test('should prevent deleting non-existent document', async () => {
      const response = await request(app)
        .post('/api/medical-documents/delete')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ filename: 'non-existent.pdf' })
        .expect(404);

      expect(response.body.msg).toContain('not found');
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/medical-documents/delete')
        .send({ filename })
        .expect(401);
    });
  });

  describe('GET /api/medical-documents/view/:filename', () => {
    let filename;

    beforeEach(async () => {
      filename = `${testUser._id}-123-test.pdf`;

      // Create test file
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, 'Test PDF content');

      // Add to user's documents
      testUser.medicalDocuments = [
        {
          filename,
          originalName: 'test.pdf',
          size: 1024,
          mimeType: 'application/pdf'
        }
      ];
      await testUser.save();
    });

    test('should allow user to view own document', async () => {
      const response = await request(app)
        .get(`/api/medical-documents/view/${filename}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.header['content-type']).toBe('application/pdf');
    });

    test('should allow admin to view any document', async () => {
      const response = await request(app)
        .get(`/api/medical-documents/view/${filename}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.header['content-type']).toBe('application/pdf');
    });

    test('should prevent cross-user access', async () => {
      const response = await request(app)
        .get(`/api/medical-documents/view/${filename}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.msg).toContain('Access denied');
    });

    test('should reject viewing non-existent file', async () => {
      const response = await request(app)
        .get('/api/medical-documents/view/non-existent.pdf')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      expect(response.body.msg).toContain('not found');
    });

    test('should require authentication', async () => {
      await request(app)
        .get(`/api/medical-documents/view/${filename}`)
        .expect(401);
    });
  });

  describe('GET /api/medical-documents/download/:filename', () => {
    let filename;

    beforeEach(async () => {
      filename = `${testUser._id}-123-test.pdf`;

      // Create test file
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, 'Test PDF content');

      // Add to user's documents
      testUser.medicalDocuments = [
        {
          filename,
          originalName: 'test.pdf',
          size: 1024,
          mimeType: 'application/pdf'
        }
      ];
      await testUser.save();
    });

    test('should allow user to download own document', async () => {
      const response = await request(app)
        .get(`/api/medical-documents/download/${filename}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.header['content-disposition']).toContain('attachment');
    });

    test('should prevent cross-user downloads', async () => {
      const response = await request(app)
        .get(`/api/medical-documents/download/${filename}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.msg).toContain('Access denied');
    });

    test('should require authentication', async () => {
      await request(app)
        .get(`/api/medical-documents/download/${filename}`)
        .expect(401);
    });
  });

  describe('POST /api/medical-documents/save-info', () => {
    test('should save medical information', async () => {
      const response = await request(app)
        .post('/api/medical-documents/save-info')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          hasMedical: true,
          medicalConditions: 'High blood pressure'
        })
        .expect(200);

      expect(response.body.msg).toContain('saved');
      expect(response.body.hasMedical).toBe(true);

      // Verify it was saved
      const user = await User.findById(testUser._id);
      expect(user.hasMedical).toBe(true);
      expect(user.medicalConditions).toBe('High blood pressure');
    });

    test('should allow clearing medical information', async () => {
      await request(app)
        .post('/api/medical-documents/save-info')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          hasMedical: false,
          medicalConditions: null
        })
        .expect(200);

      const user = await User.findById(testUser._id);
      expect(user.hasMedical).toBe(false);
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/medical-documents/save-info')
        .send({ hasMedical: true })
        .expect(401);
    });
  });
});
