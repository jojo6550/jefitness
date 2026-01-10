const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../src/server');
const User = require('../../src/models/User');
const ChatMessage = require('../../src/models/Chat');

let mongoServer;
let userToken;
let adminToken;
let userId;
let adminId;

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);

  // Create test users
  const user = new User({
    name: 'Test User',
    email: 'user@test.com',
    password: 'password123',
    role: 'user',
    isEmailVerified: true
  });
  await user.save();
  userId = user._id;

  const admin = new User({
    name: 'Test Admin',
    email: 'admin@test.com',
    password: 'password123',
    role: 'admin',
    isEmailVerified: true
  });
  await admin.save();
  adminId = admin._id;

  // Generate tokens (simplified for testing)
  const jwt = require('jsonwebtoken');
  userToken = jwt.sign({ user: { id: userId, role: 'user' } }, process.env.JWT_SECRET || 'testsecret');
  adminToken = jwt.sign({ user: { id: adminId, role: 'admin' } }, process.env.JWT_SECRET || 'testsecret');
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('Chat Routes', () => {
  beforeEach(async () => {
    // Clear chat messages before each test
    await ChatMessage.deleteMany({});
  });

  describe('GET /api/v1/chat/history/:userId', () => {
    it('should get chat history between users', async () => {
      // Create test messages
      const message1 = new ChatMessage({
        senderId: userId,
        receiverId: adminId,
        message: 'Hello admin',
        messageType: 'user_to_admin'
      });
      await message1.save();

      const message2 = new ChatMessage({
        senderId: adminId,
        receiverId: userId,
        message: 'Hello user',
        messageType: 'admin_to_user'
      });
      await message2.save();

      const response = await request(app)
        .get(`/api/v1/chat/history/${adminId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.messages).toHaveLength(2);
      expect(response.body.messages[0].message).toBe('Hello admin');
      expect(response.body.messages[1].message).toBe('Hello user');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get(`/api/v1/chat/history/${adminId}`)
        .expect(401);

      expect(response.body.msg).toBe('No token, authorization denied');
    });
  });

  describe('GET /api/v1/chat/conversations', () => {
    it('should get user conversations', async () => {
      // Create test messages
      const message = new ChatMessage({
        senderId: adminId,
        receiverId: userId,
        message: 'Test message',
        messageType: 'admin_to_user'
      });
      await message.save();

      const response = await request(app)
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0].partnerId).toBe(adminId.toString());
    });
  });

  describe('POST /api/v1/chat/mark-read/:userId', () => {
    it('should mark messages as read', async () => {
      // Create unread message
      const message = new ChatMessage({
        senderId: adminId,
        receiverId: userId,
        message: 'Unread message',
        messageType: 'admin_to_user',
        isRead: false
      });
      await message.save();

      const response = await request(app)
        .post(`/api/v1/chat/mark-read/${adminId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.markedAsRead).toBe(1);

      // Verify message is marked as read
      const updatedMessage = await ChatMessage.findById(message._id);
      expect(updatedMessage.isRead).toBe(true);
    });
  });

  describe('GET /api/v1/chat/unread-count', () => {
    it('should get unread message count', async () => {
      // Create unread messages
      const message1 = new ChatMessage({
        senderId: adminId,
        receiverId: userId,
        message: 'Unread 1',
        messageType: 'admin_to_user',
        isRead: false
      });
      await message1.save();

      const message2 = new ChatMessage({
        senderId: adminId,
        receiverId: userId,
        message: 'Unread 2',
        messageType: 'admin_to_user',
        isRead: false
      });
      await message2.save();

      const response = await request(app)
        .get('/api/v1/chat/unread-count')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.unreadCount).toBe(2);
    });
  });
});
