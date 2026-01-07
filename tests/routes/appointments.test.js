const request = require('supertest');
const express = require('express');
const appointmentsRouter = require('../../src/routes/appointments');
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

app.use('/api/appointments', appointmentsRouter);

describe('Appointments Routes', () => {
  let adminUser;
  let clientUser;
  let trainerUser;
  let adminToken;
  let clientToken;
  let trainerToken;
  let appointment;

  beforeEach(async () => {
    // Create admin user (trainer)
    adminUser = await User.create({
      firstName: 'Admin',
      lastName: 'Trainer',
      email: 'admin@example.com',
      password: 'Test123!@#',
      role: 'admin',
      isEmailVerified: true
    });

    // Create client user
    clientUser = await User.create({
      firstName: 'John',
      lastName: 'Client',
      email: 'client@example.com',
      password: 'Test123!@#',
      role: 'user',
      isEmailVerified: true
    });

    // Create another trainer
    trainerUser = await User.create({
      firstName: 'Jane',
      lastName: 'Trainer',
      email: 'trainer@example.com',
      password: 'Test123!@#',
      role: 'admin',
      isEmailVerified: true
    });

    adminToken = jwt.sign({ id: adminUser._id, role: adminUser.role }, process.env.JWT_SECRET);
    clientToken = jwt.sign({ id: clientUser._id, role: clientUser.role }, process.env.JWT_SECRET);
    trainerToken = jwt.sign({ id: trainerUser._id, role: trainerUser.role }, process.env.JWT_SECRET);

    // Create a sample appointment
    appointment = await Appointment.create({
      clientId: clientUser._id,
      trainerId: adminUser._id,
      date: '2024-12-01',
      time: '10:00',
      status: 'scheduled',
      notes: 'Test appointment'
    });
  });

  describe('GET /api/appointments', () => {
    test('should get all appointments with pagination for admin', async () => {
      const response = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.appointments).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    test('should reject access for non-admin', async () => {
      await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });

    test('should support search filtering', async () => {
      const response = await request(app)
        .get('/api/appointments?search=John')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.appointments.length).toBeGreaterThanOrEqual(0);
    });

    test('should support status filtering', async () => {
      const response = await request(app)
        .get('/api/appointments?status=scheduled')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.appointments.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('GET /api/appointments/user', () => {
    test('should get user appointments for client', async () => {
      const response = await request(app)
        .get('/api/appointments/user')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should get user appointments for trainer', async () => {
      const response = await request(app)
        .get('/api/appointments/user')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('GET /api/appointments/:id', () => {
    test('should get specific appointment for authorized user', async () => {
      const response = await request(app)
        .get(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(response.body._id).toBe(appointment._id.toString());
    });

    test('should reject access for unauthorized user', async () => {
      await request(app)
        .get(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(403);
    });

    test('should return 404 for non-existent appointment', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      await request(app)
        .get(`/api/appointments/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('POST /api/appointments', () => {
    test('should create new appointment successfully', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const dateStr = futureDate.toISOString().split('T')[0];

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: adminUser._id.toString(),
          date: dateStr,
          time: '11:00',
          notes: 'New appointment'
        })
        .expect(201);

      expect(response.body.clientId).toBe(clientUser._id.toString());
      expect(response.body.trainerId).toBe(adminUser._id.toString());
    });

    test('should reject booking without required fields', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ trainerId: adminUser._id.toString() })
        .expect(400);

      expect(response.body.msg).toContain('Please provide all required fields');
    });

    test('should reject booking with invalid trainer', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const dateStr = futureDate.toISOString().split('T')[0];

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: clientUser._id.toString(), // Not admin
          date: dateStr,
          time: '11:00'
        })
        .expect(400);

      expect(response.body.msg).toBe('Invalid trainer');
    });

    test('should reject booking less than 1 hour in advance', async () => {
      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: adminUser._id.toString(),
          date: new Date().toISOString().split('T')[0],
          time: '23:00'
        })
        .expect(400);

      expect(response.body.msg).toContain('must be booked at least 1 hour in advance');
    });

    test('should reject booking outside allowed hours', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const dateStr = futureDate.toISOString().split('T')[0];

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: adminUser._id.toString(),
          date: dateStr,
          time: '04:00' // Before 5 AM
        })
        .expect(400);

      expect(response.body.msg).toContain('Appointments are only available from 5:00 AM to 1:00 PM');
    });

    test('should reject booking at non-hour times', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const dateStr = futureDate.toISOString().split('T')[0];

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: adminUser._id.toString(),
          date: dateStr,
          time: '10:30' // Not on the hour
        })
        .expect(400);

      expect(response.body.msg).toContain('can only be booked on the hour');
    });

    test('should reject booking when time slot is full', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const dateStr = futureDate.toISOString().split('T')[0];

      // Create 6 appointments for the same slot
      for (let i = 0; i < 6; i++) {
        const tempUser = await User.create({
          firstName: `Temp${i}`,
          lastName: 'User',
          email: `temp${i}@example.com`,
          password: 'Test123!@#',
          role: 'user',
          isEmailVerified: true
        });

        await Appointment.create({
          clientId: tempUser._id,
          trainerId: adminUser._id,
          date: dateStr,
          time: '10:00',
          status: 'scheduled'
        });
      }

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: adminUser._id.toString(),
          date: dateStr,
          time: '10:00'
        })
        .expect(400);

      expect(response.body.msg).toContain('Time slot is fully booked');
    });

    test('should reject double booking for same client in same slot', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const dateStr = futureDate.toISOString().split('T')[0];

      // Client already has appointment at 10:00
      await Appointment.create({
        clientId: clientUser._id,
        trainerId: trainerUser._id,
        date: dateStr,
        time: '10:00',
        status: 'scheduled'
      });

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: adminUser._id.toString(),
          date: dateStr,
          time: '10:00'
        })
        .expect(400);

      expect(response.body.msg).toContain('You already have an appointment in this time slot');
    });
  });

  describe('PUT /api/appointments/:id', () => {
    test('should update appointment status', async () => {
      const response = await request(app)
        .put(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'completed' })
        .expect(200);

      expect(response.body.status).toBe('completed');
    });

    test('should reject update for unauthorized user', async () => {
      await request(app)
        .put(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ status: 'completed' })
        .expect(403);
    });

    test('should update appointment notes', async () => {
      const response = await request(app)
        .put(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ notes: 'Updated notes' })
        .expect(200);

      expect(response.body.notes).toBe('Updated notes');
    });
  });

  describe('DELETE /api/appointments/:id', () => {
    test('should delete appointment for authorized user', async () => {
      await request(app)
        .delete(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      // Verify appointment is deleted
      const deletedAppointment = await Appointment.findById(appointment._id);
      expect(deletedAppointment).toBeNull();
    });

    test('should reject delete for unauthorized user', async () => {
      await request(app)
        .delete(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(403);
    });
  });
});
