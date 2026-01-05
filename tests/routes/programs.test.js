const request = require('supertest');
const express = require('express');
const programsRouter = require('../../src/routes/programs');
const User = require('../../src/models/User');
const Program = require('../../src/models/Program');
const jwt = require('jsonwebtoken');

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

app.use('/api/programs', programsRouter);

describe('Programs Routes', () => {
  let user;
  let adminUser;
  let program;
  let userToken;
  let adminToken;

  beforeEach(async () => {
    user = await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      password: 'Test123!@#',
      role: 'user',
      isEmailVerified: true
    });

    adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'Test123!@#',
      role: 'admin',
      isEmailVerified: true
    });

    program = await Program.create({
      title: 'Test Program',
      description: 'Test description',
      preview: 'Test preview',
      price: 49.99,
      duration: '4 weeks',
      level: 'Beginner',
      frequency: '3 days per week',
      sessionLength: '45 minutes',
      slug: 'test-program',
      isPublished: true,
      isActive: true,
      days: [
        {
          dayName: 'Day 1 - Chest',
          exercises: [
            {
              name: 'Bench Press',
              sets: 3,
              reps: '8-10',
              notes: 'Focus on form'
            }
          ]
        }
      ]
    });

    userToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET);
  });

  describe('GET /api/programs/marketplace', () => {
    test('should return published programs without authentication', async () => {
      const response = await request(app)
        .get('/api/programs/marketplace')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Test Program');
      expect(response.body[0].days).toBeUndefined(); // Should not include days
    });

    test('should not return unpublished programs', async () => {
      await Program.create({
        title: 'Unpublished Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 59.99,
        duration: '6 weeks',
        level: 'Intermediate',
        frequency: '4 days per week',
        sessionLength: '50 minutes',
        slug: 'unpublished-program',
        isPublished: false,
        isActive: true
      });

      const response = await request(app)
        .get('/api/programs/marketplace')
        .expect(200);

      expect(response.body).toHaveLength(1); // Only published program
    });

    test('should not return inactive programs', async () => {
      await Program.create({
        title: 'Inactive Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 59.99,
        duration: '6 weeks',
        level: 'Intermediate',
        frequency: '4 days per week',
        sessionLength: '50 minutes',
        slug: 'inactive-program',
        isPublished: true,
        isActive: false
      });

      const response = await request(app)
        .get('/api/programs/marketplace')
        .expect(200);

      expect(response.body).toHaveLength(1); // Only active program
    });
  });

  describe('GET /api/programs/marketplace/:id', () => {
    test('should return program details without exercises', async () => {
      const response = await request(app)
        .get(`/api/programs/marketplace/${program._id}`)
        .expect(200);

      expect(response.body.title).toBe('Test Program');
      expect(response.body.days).toHaveLength(1);
      expect(response.body.days[0].dayName).toBe('Day 1 - Chest');
      expect(response.body.days[0].exercises).toBeUndefined();
    });

    test('should return 404 for non-existent program', async () => {
      const fakeId = '507f1f77bcf86cd799439011';

      await request(app)
        .get(`/api/programs/marketplace/${fakeId}`)
        .expect(404);
    });

    test('should return 404 for unpublished program', async () => {
      const unpublished = await Program.create({
        title: 'Unpublished Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 59.99,
        duration: '6 weeks',
        level: 'Intermediate',
        frequency: '4 days per week',
        sessionLength: '50 minutes',
        slug: 'unpublished-program',
        isPublished: false,
        isActive: true
      });

      await request(app)
        .get(`/api/programs/marketplace/${unpublished._id}`)
        .expect(404);
    });
  });

  describe('GET /api/programs/my', () => {
    test('should return empty array when user has no assigned programs', async () => {
      const response = await request(app)
        .get('/api/programs/my')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('should return assigned programs', async () => {
      user.assignedPrograms.push({
        programId: program._id,
        assignedAt: new Date()
      });
      await user.save();

      const response = await request(app)
        .get('/api/programs/my')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]._id.toString()).toBe(program._id.toString());
    });

    test('should require authentication', async () => {
      await request(app).get('/api/programs/my').expect(401);
    });
  });

  describe('GET /api/programs/:id', () => {
    test('should return full program details for assigned user', async () => {
      user.assignedPrograms.push({
        programId: program._id,
        assignedAt: new Date()
      });
      await user.save();

      const response = await request(app)
        .get(`/api/programs/${program._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.title).toBe('Test Program');
      expect(response.body.days).toHaveLength(1);
      expect(response.body.days[0].exercises).toHaveLength(1);
      expect(response.body.days[0].exercises[0].name).toBe('Bench Press');
    });

    test('should deny access for unassigned user', async () => {
      const response = await request(app)
        .get(`/api/programs/${program._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.msg).toContain('not assigned');
    });

    test('should allow admin to access any program', async () => {
      const response = await request(app)
        .get(`/api/programs/${program._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.title).toBe('Test Program');
    });

    test('should require authentication', async () => {
      await request(app).get(`/api/programs/${program._id}`).expect(401);
    });
  });

  describe('POST /api/programs', () => {
    test('should allow admin to create program', async () => {
      const newProgram = {
        title: 'New Program',
        description: 'New description',
        preview: 'New preview',
        price: 69.99,
        duration: '6 weeks',
        level: 'Advanced',
        frequency: '5 days per week',
        sessionLength: '60 minutes',
        slug: 'new-program'
      };

      const response = await request(app)
        .post('/api/programs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newProgram)
        .expect(200);

      expect(response.body.title).toBe('New Program');
      expect(response.body.price).toBe(69.99);
    });

    test('should deny non-admin users', async () => {
      const newProgram = {
        title: 'New Program',
        description: 'New description',
        preview: 'New preview',
        price: 69.99,
        duration: '6 weeks',
        level: 'Advanced',
        frequency: '5 days per week',
        sessionLength: '60 minutes',
        slug: 'new-program'
      };

      const response = await request(app)
        .post('/api/programs')
        .set('Authorization', `Bearer ${userToken}`)
        .send(newProgram)
        .expect(403);

      expect(response.body.msg).toBe('Access denied');
    });

    test('should require authentication', async () => {
      await request(app)
        .post('/api/programs')
        .send({})
        .expect(401);
    });
  });

  describe('Edge Cases', () => {
    test('should handle programs with no days', async () => {
      const noDaysProgram = await Program.create({
        title: 'No Days Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 39.99,
        duration: '2 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '30 minutes',
        slug: 'no-days-program',
        isPublished: true,
        isActive: true,
        days: []
      });

      const response = await request(app)
        .get(`/api/programs/marketplace/${noDaysProgram._id}`)
        .expect(200);

      expect(response.body.days).toEqual([]);
    });

    test('should handle multiple assigned programs', async () => {
      const program2 = await Program.create({
        title: 'Test Program 2',
        description: 'Test description 2',
        preview: 'Test preview 2',
        price: 79.99,
        duration: '8 weeks',
        level: 'Intermediate',
        frequency: '4 days per week',
        sessionLength: '60 minutes',
        slug: 'test-program-2'
      });

      user.assignedPrograms.push(
        { programId: program._id, assignedAt: new Date() },
        { programId: program2._id, assignedAt: new Date() }
      );
      await user.save();

      const response = await request(app)
        .get('/api/programs/my')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
    });
  });
});