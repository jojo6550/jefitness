const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const Program = require('../src/models/Program');
const app = require('./testApp');

describe('Programs Routes', () => {
  let adminUser, regularUser, adminToken, userToken, testProgram, assignedProgram;

  beforeEach(async () => {
    // Create test users
    adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
      password: 'AdminPass123!',
      role: 'admin',
      isEmailVerified: true
    });

    regularUser = new User({
      firstName: 'Regular',
      lastName: 'User',
      email: 'user@test.com',
      password: 'UserPass123!',
      role: 'user',
      isEmailVerified: true
    });

    await adminUser.save();
    await regularUser.save();

    // Generate tokens
    adminToken = jwt.sign({ id: adminUser._id, role: 'admin' }, process.env.JWT_SECRET || 'testsecret');
    userToken = jwt.sign({ id: regularUser._id, role: 'user' }, process.env.JWT_SECRET || 'testsecret');

    // Create test programs
    testProgram = new Program({
      title: 'Test Program',
      description: 'A test fitness program',
      preview: 'This is a preview of the program',
      price: 99.99,
      duration: '4 weeks',
      level: 'Beginner',
      frequency: '3x per week',
      sessionLength: '45 minutes',
      slug: 'test-program',
      features: ['Feature 1', 'Feature 2'],
      days: [
        {
          dayName: 'Monday',
          exercises: [
            {
              name: 'Push-ups',
              sets: 3,
              reps: '10-12',
              notes: 'Keep core tight'
            }
          ]
        }
      ],
      isActive: true,
      isPublished: true
    });

    assignedProgram = new Program({
      title: 'Assigned Program',
      description: 'A program assigned to user',
      preview: 'Preview of assigned program',
      price: 149.99,
      duration: '8 weeks',
      level: 'Intermediate',
      frequency: '4x per week',
      sessionLength: '60 minutes',
      slug: 'assigned-program',
      features: ['Advanced features'],
      days: [
        {
          dayName: 'Tuesday',
          exercises: [
            {
              name: 'Squats',
              sets: 4,
              reps: '8-10',
              notes: 'Full range of motion'
            }
          ]
        }
      ],
      isActive: true,
      isPublished: true
    });

    await testProgram.save();
    await assignedProgram.save();

    // Assign program to user
    regularUser.assignedPrograms.push({
      programId: assignedProgram._id,
      assignedAt: new Date()
    });
    await regularUser.save();
  });

  describe('GET /api/programs/marketplace', () => {
    it('should return published programs with preview fields only', async () => {
      const response = await request(app)
        .get('/api/programs/marketplace');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);

      const program = response.body[0];
      expect(program.title).toBeDefined();
      expect(program.description).toBeDefined();
      expect(program.preview).toBeDefined();
      expect(program.price).toBeDefined();
      expect(program.level).toBeDefined();
      expect(program.slug).toBeDefined();
      // Should not include full workout content
      expect(program.days).toBeUndefined();
      expect(program.exercises).toBeUndefined();
    });

    it('should not return unpublished programs', async () => {
      // Create unpublished program
      const unpublishedProgram = new Program({
        title: 'Unpublished Program',
        description: 'Not published',
        preview: 'Preview',
        price: 50,
        duration: '2 weeks',
        level: 'Beginner',
        frequency: '2x per week',
        sessionLength: '30 minutes',
        slug: 'unpublished-program',
        isActive: true,
        isPublished: false
      });
      await unpublishedProgram.save();

      const response = await request(app)
        .get('/api/programs/marketplace');

      const titles = response.body.map(p => p.title);
      expect(titles).not.toContain('Unpublished Program');
    });
  });

  describe('GET /api/programs/marketplace/:id', () => {
    it('should return program detail with day names only', async () => {
      const response = await request(app)
        .get(`/api/programs/marketplace/${testProgram._id}`);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Test Program');
      expect(response.body.days).toBeDefined();
      expect(Array.isArray(response.body.days)).toBe(true);
      expect(response.body.days[0].dayName).toBe('Monday');
      // Should not include exercises
      expect(response.body.days[0].exercises).toBeUndefined();
    });

    it('should return 404 for non-existent program', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/programs/marketplace/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.msg).toBe('Program not found or not available in marketplace');
    });

    it('should return 404 for unpublished program', async () => {
      // Create unpublished program
      const unpublishedProgram = new Program({
        title: 'Unpublished Program',
        description: 'Not published',
        preview: 'Preview',
        price: 50,
        duration: '2 weeks',
        level: 'Beginner',
        frequency: '2x per week',
        sessionLength: '30 minutes',
        slug: 'unpublished-program',
        isActive: true,
        isPublished: false
      });
      await unpublishedProgram.save();

      const response = await request(app)
        .get(`/api/programs/marketplace/${unpublishedProgram._id}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/programs/my', () => {
    it('should return only assigned programs for authenticated user', async () => {
      const response = await request(app)
        .get('/api/programs/my')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].title).toBe('Assigned Program');
    });

    it('should return empty array if no programs assigned', async () => {
      // Create user with no assigned programs
      const noProgramsUser = new User({
        firstName: 'No',
        lastName: 'Programs',
        email: 'noprog@test.com',
        password: 'NoProgPass123!',
        role: 'user',
        isEmailVerified: true
      });
      await noProgramsUser.save();

      const noProgramsToken = jwt.sign({ id: noProgramsUser._id, role: 'user' }, process.env.JWT_SECRET || 'testsecret');

      const response = await request(app)
        .get('/api/programs/my')
        .set('Authorization', `Bearer ${noProgramsToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should reject unauthorized request', async () => {
      const response = await request(app)
        .get('/api/programs/my');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/programs/:id', () => {
    it('should return full program details for assigned user', async () => {
      const response = await request(app)
        .get(`/api/programs/${assignedProgram._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Assigned Program');
      expect(response.body.days).toBeDefined();
      expect(response.body.days[0].exercises).toBeDefined();
      expect(response.body.days[0].exercises[0].name).toBe('Squats');
    });

    it('should allow admin to access any program', async () => {
      const response = await request(app)
        .get(`/api/programs/${testProgram._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('Test Program');
    });

    it('should deny access to unassigned program for regular user', async () => {
      const response = await request(app)
        .get(`/api/programs/${testProgram._id}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.msg).toBe('Access denied: You are not assigned to this program');
    });

    it('should return 404 for non-existent program', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/programs/${fakeId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(404);
      expect(response.body.msg).toBe('Program not found');
    });

    it('should reject unauthorized request', async () => {
      const response = await request(app)
        .get(`/api/programs/${testProgram._id}`);

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/programs', () => {
    it('should allow admin to create program', async () => {
      const newProgramData = {
        title: 'New Program',
        description: 'A new fitness program',
        preview: 'Preview text',
        price: 79.99,
        duration: '6 weeks',
        level: 'Advanced',
        frequency: '5x per week',
        sessionLength: '90 minutes',
        slug: 'new-program',
        features: ['Feature A', 'Feature B'],
        days: [
          {
            dayName: 'Wednesday',
            exercises: [
              {
                name: 'Deadlifts',
                sets: 5,
                reps: '5-8',
                notes: 'Heavy weight'
              }
            ]
          }
        ]
      };

      const response = await request(app)
        .post('/api/programs')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newProgramData);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe('New Program');
      expect(response.body.price).toBe(79.99);
    });

    it('should reject program creation by non-admin', async () => {
      const response = await request(app)
        .post('/api/programs')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Unauthorized Program',
          description: 'Should not be created',
          preview: 'Preview',
          price: 50,
          duration: '4 weeks',
          level: 'Beginner',
          frequency: '3x per week',
          sessionLength: '45 minutes',
          slug: 'unauthorized-program'
        });

      expect(response.status).toBe(403);
      expect(response.body.msg).toBe('Access denied');
    });

    it('should reject unauthorized request', async () => {
      const response = await request(app)
        .post('/api/programs')
        .send({
          title: 'No Auth Program',
          description: 'No auth',
          preview: 'Preview',
          price: 50,
          duration: '4 weeks',
          level: 'Beginner',
          frequency: '3x per week',
          sessionLength: '45 minutes',
          slug: 'no-auth-program'
        });

      expect(response.status).toBe(401);
    });
  });
});
