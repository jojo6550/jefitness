/**
 * Integration Tests for Appointment Booking System
 * Tests appointment creation, time-slot conflicts, role restrictions, and cancellations
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../server');
const User = require('../../models/User');
const Appointment = require('../../models/Appointment');

describe('Appointment Booking System', () => {
  let clientUser, trainerUser, adminUser;
  let clientToken, trainerToken, adminToken;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash('TestPassword123!', 10);

    clientUser = await User.create({
      firstName: 'Client',
      lastName: 'User',
      email: 'client@example.com',
      password: hashedPassword,
      role: 'user',
      isEmailVerified: true,
      dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
      healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
    });

    trainerUser = await User.create({
      firstName: 'Trainer',
      lastName: 'User',
      email: 'trainer@example.com',
      password: hashedPassword,
      role: 'trainer',
      isEmailVerified: true,
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

    clientToken = jwt.sign(
      { id: clientUser._id, userId: clientUser._id, role: 'user', tokenVersion: 0 },
      process.env.JWT_SECRET
    );

    trainerToken = jwt.sign(
      { id: trainerUser._id, userId: trainerUser._id, role: 'trainer', tokenVersion: 0 },
      process.env.JWT_SECRET
    );

    adminToken = jwt.sign(
      { id: adminUser._id, userId: adminUser._id, role: 'admin', tokenVersion: 0 },
      process.env.JWT_SECRET
    );
  });

  describe('POST /api/appointments', () => {
    test('should create appointment with valid data', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: trainerUser._id.toString(),
          date: tomorrow.toISOString().split('T')[0],
          time: '10:00',
          notes: 'First training session'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment).toBeDefined();
      expect(response.body.appointment.status).toBe('scheduled');

      // Verify appointment was saved
      const appointment = await Appointment.findById(response.body.appointment._id);
      expect(appointment).toBeTruthy();
      expect(appointment.clientId.toString()).toBe(clientUser._id.toString());
      expect(appointment.trainerId.toString()).toBe(trainerUser._id.toString());
    });

    test('should detect time-slot conflicts', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dateStr = tomorrow.toISOString().split('T')[0];

      // Create first appointment
      await Appointment.create({
        clientId: clientUser._id,
        trainerId: trainerUser._id,
        date: tomorrow,
        time: '10:00',
        status: 'scheduled'
      });

      // Try to book same time slot
      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: trainerUser._id.toString(),
          date: dateStr,
          time: '10:00'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not available');
    });

    test('should reject appointment in the past', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: trainerUser._id.toString(),
          date: yesterday.toISOString().split('T')[0],
          time: '10:00'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('past');
    });

    test('should reject invalid trainer ID', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: 'invalid-id',
          date: tomorrow.toISOString().split('T')[0],
          time: '10:00'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should reject non-existent trainer', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const fakeTrainerId = new mongoose.Types.ObjectId();

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: fakeTrainerId.toString(),
          date: tomorrow.toISOString().split('T')[0],
          time: '10:00'
        })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Trainer not found');
    });

    test('should reject booking with non-trainer user', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const response = await request(app)
        .post('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          trainerId: clientUser._id.toString(), // Try to book with another client
          date: tomorrow.toISOString().split('T')[0],
          time: '10:00'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('valid trainer');
    });

    test('should require authentication', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      await request(app)
        .post('/api/appointments')
        .send({
          trainerId: trainerUser._id.toString(),
          date: tomorrow.toISOString().split('T')[0],
          time: '10:00'
        })
        .expect(401);
    });
  });

  describe('GET /api/appointments/user', () => {
    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Create appointments
      await Appointment.create({
        clientId: clientUser._id,
        trainerId: trainerUser._id,
        date: tomorrow,
        time: '10:00',
        status: 'scheduled'
      });

      await Appointment.create({
        clientId: clientUser._id,
        trainerId: trainerUser._id,
        date: new Date(tomorrow.getTime() + 86400000),
        time: '11:00',
        status: 'scheduled'
      });
    });

    test('should get user appointments as client', async () => {
      const response = await request(app)
        .get('/api/appointments/user')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointments).toHaveLength(2);
      expect(response.body.appointments[0].clientId._id).toBe(clientUser._id.toString());
    });

    test('should get user appointments as trainer', async () => {
      const response = await request(app)
        .get('/api/appointments/user')
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointments).toHaveLength(2);
      expect(response.body.appointments[0].trainerId._id).toBe(trainerUser._id.toString());
    });

    test('should require authentication', async () => {
      await request(app)
        .get('/api/appointments/user')
        .expect(401);
    });
  });

  describe('PATCH /api/appointments/:id', () => {
    let appointment;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      appointment = await Appointment.create({
        clientId: clientUser._id,
        trainerId: trainerUser._id,
        date: tomorrow,
        time: '10:00',
        status: 'scheduled'
      });
    });

    test('should update appointment status', async () => {
      const response = await request(app)
        .patch(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ status: 'completed' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.status).toBe('completed');

      const updated = await Appointment.findById(appointment._id);
      expect(updated.status).toBe('completed');
    });

    test('should allow rescheduling to new time', async () => {
      const newDate = new Date();
      newDate.setDate(newDate.getDate() + 2);

      const response = await request(app)
        .patch(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          date: newDate.toISOString().split('T')[0],
          time: '14:00'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.appointment.time).toBe('14:00');
    });

    test('should prevent rescheduling to conflicting time', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Create conflicting appointment
      await Appointment.create({
        clientId: clientUser._id,
        trainerId: trainerUser._id,
        date: tomorrow,
        time: '15:00',
        status: 'scheduled'
      });

      const response = await request(app)
        .patch(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          time: '15:00'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not available');
    });

    test('should reject invalid status values', async () => {
      const response = await request(app)
        .patch(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    test('should prevent unauthorized updates', async () => {
      // Create another user
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      const otherUser = await User.create({
        firstName: 'Other',
        lastName: 'User',
        email: 'other@example.com',
        password: hashedPassword,
        role: 'user',
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      const otherToken = jwt.sign(
        { id: otherUser._id, userId: otherUser._id, tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      const response = await request(app)
        .patch(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ status: 'completed' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not authorized');
    });
  });

  describe('DELETE /api/appointments/:id', () => {
    let appointment;

    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      appointment = await Appointment.create({
        clientId: clientUser._id,
        trainerId: trainerUser._id,
        date: tomorrow,
        time: '10:00',
        status: 'scheduled'
      });
    });

    test('should cancel appointment as client', async () => {
      const response = await request(app)
        .delete(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated = await Appointment.findById(appointment._id);
      expect(updated.status).toBe('cancelled');
    });

    test('should cancel appointment as trainer', async () => {
      const response = await request(app)
        .delete(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${trainerToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      const updated = await Appointment.findById(appointment._id);
      expect(updated.status).toBe('cancelled');
    });

    test('should prevent unauthorized cancellation', async () => {
      const hashedPassword = await bcrypt.hash('TestPassword123!', 10);
      const otherUser = await User.create({
        firstName: 'Other',
        lastName: 'User',
        email: 'other@example.com',
        password: hashedPassword,
        role: 'user',
        isEmailVerified: true,
        dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
        healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
      });

      const otherToken = jwt.sign(
        { id: otherUser._id, userId: otherUser._id, tokenVersion: 0 },
        process.env.JWT_SECRET
      );

      const response = await request(app)
        .delete(`/api/appointments/${appointment._id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    test('should require authentication', async () => {
      await request(app)
        .delete(`/api/appointments/${appointment._id}`)
        .expect(401);
    });
  });

  describe('GET /api/appointments (Admin)', () => {
    beforeEach(async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Create multiple appointments
      for (let i = 0; i < 5; i++) {
        await Appointment.create({
          clientId: clientUser._id,
          trainerId: trainerUser._id,
          date: new Date(tomorrow.getTime() + i * 86400000),
          time: '10:00',
          status: 'scheduled'
        });
      }
    });

    test('should get all appointments as admin', async () => {
      const response = await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.appointments).toBeDefined();
      expect(response.body.pagination).toBeDefined();
    });

    test('should support pagination', async () => {
      const response = await request(app)
        .get('/api/appointments?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.appointments.length).toBeLessThanOrEqual(2);
      expect(response.body.pagination.totalPages).toBeGreaterThan(1);
    });

    test('should support status filtering', async () => {
      // Mark one appointment as completed
      const appt = await Appointment.findOne({});
      appt.status = 'completed';
      await appt.save();

      const response = await request(app)
        .get('/api/appointments?status=completed')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.appointments.length).toBeGreaterThan(0);
      response.body.appointments.forEach(apt => {
        expect(apt.status).toBe('completed');
      });
    });

    test('should deny access to non-admin users', async () => {
      await request(app)
        .get('/api/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(403);
    });
  });
});
