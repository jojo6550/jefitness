const request = require('supertest');
const express = require('express');
const trainerRouter = require('../../src/routes/trainer');
const User = require('../../src/models/User');
const Appointment = require('../../src/models/Appointment');
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

app.use('/api/trainer', trainerRouter);

describe('Trainer Routes', () => {
  let trainerUser;
  let clientUser;
  let anotherTrainer;
  let trainerToken;
  let clientToken;
  let anotherTrainerToken;
  let appointment1;
  let appointment2;

  beforeEach(async () => {
    // Create trainer user
    trainerUser = await User.create({
      firstName: 'Jane',
      lastName: 'Trainer',
      email: 'trainer@example.com',
      password: 'Test123!@#',
      role: 'trainer',
      isEmailVerified: true
    });

    // Create another trainer
    anotherTrainer = await User.create({
      firstName: 'John',
      lastName: 'Trainer',
      email: 'anothertrainer@example.com',
      password: 'Test123!@#',
      role: 'trainer',
      isEmailVerified: true
    });

    // Create client user
    clientUser = await User.create({
      firstName: 'Bob',
      lastName: 'Client',
      email: 'client@example.com',
      password: 'Test123!@#',
      role: 'user',
      isEmailVerified: true
    });

    trainerToken = jwt.sign({ id: trainerUser._id, role: trainerUser.role }, process.env.JWT_SECRET);
    anotherTrainerToken = jwt.sign({ id: anotherTrainer._id, role: anotherTrainer.role }, process.env.JWT_SECRET);
    clientToken = jwt.sign({ id: clientUser._id, role: clientUser.role }, process.env.JWT_SECRET);

    // Create sample appointments for trainerUser
    appointment1 = await Appointment.create({
      clientId: clientUser._id,
      trainerId: trainerUser._id,
      date: '2024-12-01',
      time: '10:00',
      status: 'scheduled',
      notes: 'First appointment'
    });

    appointment2 = await Appointment.create({
      clientId: clientUser._id,
      trainerId: trainerUser._id,
      date: '2024-12-02',
      time: '11:00',
      status: 'completed',
      notes: 'Second appointment'
    });

    // Create appointment for another trainer (should not be visible to trainerUser)
    await Appointment.create({
      clientId: clientUser._id,
      trainerId: anotherTrainer._id,
      date: '2024-12-03',
      time: '12:00',
      status: 'scheduled',
      notes: 'Another trainer appointment'
    });
  });

  describe('GET /api/trainer/appointments', () => {
    test('should get all appointments for the authenticated trainer', async () => {
      const response = await request(app)
        .get('/api/trainer/appointments')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.appointments).toBeDefined();
      expect(Array.isArray(response.body.appointments)).toBe(true);
      expect(response.body.appointments.length).toBe(2); // Only trainerUser's appointments
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.totalAppointments).toBe(2);
    });

    test('should reject access for non-trainer users', async () => {
      await request(app)
        .get('/api/trainer/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });

    test('should support status filtering', async () => {
      const response = await request(app)
        .get('/api/trainer/appointments?status=scheduled')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.appointments.length).toBe(1);
      expect(response.body.appointments[0].status).toBe('scheduled');
    });

    test('should support search filtering by client name', async () => {
      const response = await request(app)
        .get('/api/trainer/appointments?search=Bob')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.appointments.length).toBe(2); // Both appointments are with Bob
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/trainer/appointments?page=1&limit=1')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.appointments.length).toBe(1);
      expect(response.body.pagination.currentPage).toBe(1);
      expect(response.body.pagination.totalPages).toBe(2);
      expect(response.body.pagination.hasNext).toBe(true);
    });

    test('should populate client details', async () => {
      const response = await request(app)
        .get('/api/trainer/appointments')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.appointments[0].clientId).toBeDefined();
      expect(response.body.appointments[0].clientId.firstName).toBe('Bob');
      expect(response.body.appointments[0].clientId.lastName).toBe('Client');
    });
  });

  describe('GET /api/trainer/appointments/:id', () => {
    test('should get specific appointment for the trainer who owns it', async () => {
      const response = await request(app)
        .get(`/api/trainer/appointments/${appointment1._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body._id).toBe(appointment1._id.toString());
      expect(response.body.notes).toBe('First appointment');
    });

    test('should reject access for trainer who does not own the appointment', async () => {
      await request(app)
        .get(`/api/trainer/appointments/${appointment1._id}`)
        .set('Authorization', `Bearer ${anotherTrainerToken}`)
        .expect(403);
    });

    test('should reject access for non-trainer users', async () => {
      await request(app)
        .get(`/api/trainer/appointments/${appointment1._id}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });

    test('should return 404 for non-existent appointment', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      await request(app)
        .get(`/api/trainer/appointments/${fakeId}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(404);
    });
  });

  describe('PUT /api/trainer/appointments/:id', () => {
    test('should update appointment status for the trainer who owns it', async () => {
      const response = await request(app)
        .put(`/api/trainer/appointments/${appointment1._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ status: 'completed' })
        .expect(200);

      expect(response.body.status).toBe('completed');
    });

    test('should update appointment notes for the trainer who owns it', async () => {
      const response = await request(app)
        .put(`/api/trainer/appointments/${appointment1._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ notes: 'Updated notes' })
        .expect(200);

      expect(response.body.notes).toBe('Updated notes');
    });

    test('should reject update for trainer who does not own the appointment', async () => {
      await request(app)
        .put(`/api/trainer/appointments/${appointment1._id}`)
        .set('Authorization', `Bearer ${anotherTrainerToken}`)
        .send({ status: 'completed' })
        .expect(403);
    });

    test('should reject update for non-trainer users', async () => {
      await request(app)
        .put(`/api/trainer/appointments/${appointment1._id}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ status: 'completed' })
        .expect(403);
    });

    test('should return 404 for non-existent appointment', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      await request(app)
        .put(`/api/trainer/appointments/${fakeId}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ status: 'completed' })
        .expect(404);
    });
  });

  describe('GET /api/trainer/dashboard', () => {
    test('should get dashboard overview for trainer', async () => {
      const response = await request(app)
        .get('/api/trainer/dashboard')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.overview).toBeDefined();
      expect(response.body.upcomingAppointments).toBeDefined();
      expect(response.body.clients).toBeDefined();
    });

    test('should reject access for non-trainer users', async () => {
      await request(app)
        .get('/api/trainer/dashboard')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });
  });

  describe('GET /api/trainer/clients', () => {
    test('should get clients for trainer', async () => {
      const response = await request(app)
        .get('/api/trainer/clients')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.clients).toBeDefined();
      expect(Array.isArray(response.body.clients)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    test('should reject access for non-trainer users', async () => {
      await request(app)
        .get('/api/trainer/clients')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });
  });
});
