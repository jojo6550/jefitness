const User = require('../../src/models/User');
const Appointment = require('../../src/models/Appointment');
const Program = require('../../src/models/Program');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../testApp');

// Mock bcryptjs to avoid dependency issues in tests
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
}));

const bcrypt = require('bcryptjs');

describe('User Scalability Tests', () => {
  let testUsers = [];
  let trainer;

  beforeAll(async () => {
    // Create test users for activities
    testUsers = [];
    for (let i = 0; i < 50; i++) { // Use 50 users for manageable load
      const user = await new User({
        firstName: `ActiveFirst${i}`,
        lastName: `ActiveLast${i}`,
        email: `activeuser${i}@example.com`,
        password: 'Password123!',
        role: 'user',
      }).save();
      testUsers.push(user);
    }

    // Create a trainer (admin user)
    trainer = await new User({
      firstName: 'Trainer',
      lastName: 'Admin',
      email: 'trainer@example.com',
      password: 'Password123!',
      role: 'admin',
    }).save();
  });

  describe('Creating 100 User Accounts', () => {
    it('should create 100 users without errors and within reasonable time', async () => {
      const startTime = Date.now();
      const users = [];

      // Generate 100 user data
      for (let i = 0; i < 100; i++) {
        users.push({
          firstName: `First${i}`,
          lastName: `Last${i}`,
          email: `user${i}@example.com`,
          password: 'Password123!', // Valid password for validation
          role: 'user',
        });
      }

      // Create users in parallel
      const createPromises = users.map(userData => new User(userData).save());
      const results = await Promise.all(createPromises);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assertions
      expect(results).toHaveLength(100);
      results.forEach(user => {
        expect(user).toBeDefined();
        expect(user.email).toMatch(/user\d+@example\.com/);
      });

      // Performance check: Should take less than 10 seconds (adjust based on environment)
      expect(duration).toBeLessThan(10000);

      console.log(`Created 100 users in ${duration}ms`);
    });

    it('should handle concurrent user creation without conflicts', async () => {
      const userPromises = [];

      for (let i = 100; i < 200; i++) {
        userPromises.push(
          new User({
            firstName: `ConcurrentFirst${i}`,
            lastName: `ConcurrentLast${i}`,
            email: `concurrentuser${i}@example.com`,
            password: 'Password123!', // Valid password for validation
            role: 'user',
          }).save()
        );
      }

      const results = await Promise.all(userPromises);

      expect(results).toHaveLength(100);
      results.forEach(user => {
        expect(user).toBeDefined();
        expect(user.email).toMatch(/concurrentuser\d+@example\.com/);
      });
    });
  });

  describe('Active User Activities Simulation', () => {
    let testUsers = [];
    let trainer;

    beforeEach(async () => {
      // Use the test users created in beforeAll
      // testUsers is already available from the outer scope

      // Find or create trainer
      trainer = await User.findOne({ email: 'trainer@example.com' });
      if (!trainer) {
        trainer = await new User({
          firstName: 'Trainer',
          lastName: 'Admin',
          email: 'trainer@example.com',
          password: 'Password123!',
          role: 'admin',
        }).save();
      }
    });

    it('should simulate profile updates for all users concurrently', async () => {
      const startTime = Date.now();
      const updatePromises = testUsers.map((user, index) => {
        return User.findByIdAndUpdate(user._id, {
          dob: new Date(1990, index % 12, (index % 28) + 1),
          gender: index % 2 === 0 ? 'male' : 'female',
          phone: `+123456789${index.toString().padStart(2, '0')}`,
          goals: `Goal for user ${index}`,
          reason: `Reason for user ${index}`,
          startWeight: 70 + (index % 30),
          currentWeight: 68 + (index % 30),
        }, { new: true });
      });

      const results = await Promise.all(updatePromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(50);
      results.forEach((user, index) => {
        expect(user.dob).toBeDefined();
        expect(user.gender).toBeDefined();
        expect(user.phone).toBeDefined();
        expect(user.goals).toBe(`Goal for user ${index}`);
      });

      console.log(`Profile updates for 50 users completed in ${duration}ms`);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should simulate appointment bookings concurrently', async () => {
      const startTime = Date.now();
      const appointmentPromises = testUsers.map((user, index) => {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + (index % 30) + 1); // Spread over next 30 days
        const dateStr = futureDate.toISOString().split('T')[0];
        const timeStr = `${(5 + (index % 9)).toString().padStart(2, '0')}:00`; // 5:00 to 13:00

        return new Appointment({
          clientId: user._id,
          trainerId: trainer._id,
          date: dateStr,
          time: timeStr,
          notes: `Appointment notes for user ${index}`,
        }).save();
      });

      const results = await Promise.all(appointmentPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(50);
      results.forEach(appointment => {
        expect(appointment.clientId).toBeDefined();
        expect(appointment.trainerId).toBeDefined();
        expect(appointment.status).toBe('scheduled');
      });

      console.log(`Appointment bookings for 50 users completed in ${duration}ms`);
      expect(duration).toBeLessThan(5000);
    });

    it('should simulate program marketplace browsing and assignments', async () => {
      // First, create some test programs
      const programs = [];
      for (let i = 0; i < 10; i++) {
        const program = await new Program({
          title: `Test Program ${i}`,
          description: `Description for program ${i}`,
          preview: `Preview ${i}`,
          price: 50 + i * 10,
          duration: `${4 + i} weeks`,
          level: ['Beginner', 'Intermediate', 'Advanced'][i % 3],
          frequency: '3 days per week',
          sessionLength: '45 minutes',
          slug: `test-program-${i}`,
          isPublished: true,
          isActive: true,
          days: [{ dayName: 'Monday' }, { dayName: 'Wednesday' }, { dayName: 'Friday' }],
        }).save();
        programs.push(program);
      }

      const startTime = Date.now();
      const assignmentPromises = testUsers.map((user, index) => {
        const assignedPrograms = programs.slice(0, (index % 3) + 1).map(prog => ({
          programId: prog._id,
          assignedAt: new Date(),
        }));

        return User.findByIdAndUpdate(user._id, {
          assignedPrograms: assignedPrograms,
        }, { new: true });
      });

      const results = await Promise.all(assignmentPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(50);
      results.forEach(user => {
        expect(user.assignedPrograms.length).toBeGreaterThan(0);
      });

      console.log(`Program assignments for 50 users completed in ${duration}ms`);
      expect(duration).toBeLessThan(5000);
    });

    it('should simulate nutrition and sleep logging concurrently', async () => {
      const startTime = Date.now();
      const loggingPromises = testUsers.map((user, index) => {
        const nutritionLogs = [];
        const sleepLogs = [];

        // Add 7 days of logs
        for (let day = 0; day < 7; day++) {
          const date = new Date();
          date.setDate(date.getDate() - day);

          nutritionLogs.push({
            id: day + 1,
            date: date.toISOString().split('T')[0],
            mealType: 'Breakfast',
            foodItem: `Food item ${day} for user ${index}`,
            calories: 300 + (index % 200),
            protein: 20 + (index % 20),
            carbs: 30 + (index % 30),
            fats: 10 + (index % 10),
          });

          sleepLogs.push({
            date: date,
            hoursSlept: 7 + (index % 3), // 7-9 hours
          });
        }

        return User.findByIdAndUpdate(user._id, {
          nutritionLogs: nutritionLogs,
          sleepLogs: sleepLogs,
        }, { new: true });
      });

      const results = await Promise.all(loggingPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(50);
      results.forEach(user => {
        expect(user).toBeDefined();
        expect(user.nutritionLogs).toBeDefined();
        expect(user.sleepLogs).toBeDefined();
        expect(user.nutritionLogs.length).toBe(7);
        expect(user.sleepLogs.length).toBe(7);
      });

      console.log(`Nutrition and sleep logging for 50 users completed in ${duration}ms`);
      expect(duration).toBeLessThan(10000); // Allow more time for complex updates
    });

    it('should handle mixed concurrent activities (profile updates + appointments + logging)', async () => {
      const startTime = Date.now();
      const mixedPromises = testUsers.map(async (user, index) => {
        // Profile update
        await User.findByIdAndUpdate(user._id, {
          goals: `Updated goal for mixed activity ${index}`,
          currentWeight: 67 + (index % 30),
        });

        // New appointment
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 31 + index); // Next month
        const appointment = await new Appointment({
          clientId: user._id,
          trainerId: trainer._id,
          date: futureDate.toISOString().split('T')[0],
          time: '10:00',
          notes: `Mixed activity appointment ${index}`,
        }).save();

        // Add nutrition log
        const nutritionLog = {
          id: 8,
          date: new Date().toISOString().split('T')[0],
          mealType: 'Lunch',
          foodItem: `Mixed activity food ${index}`,
          calories: 400,
          protein: 25,
          carbs: 40,
          fats: 15,
        };

        await User.findByIdAndUpdate(user._id, {
          $push: { nutritionLogs: nutritionLog },
        });

        return { user: user._id, appointment: appointment._id };
      });

      const results = await Promise.all(mixedPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(50);
      results.forEach(result => {
        expect(result.user).toBeDefined();
        expect(result.appointment).toBeDefined();
      });

      console.log(`Mixed concurrent activities for 50 users completed in ${duration}ms`);
      expect(duration).toBeLessThan(15000); // Allow more time for mixed operations
    });

    it('should handle 50 separate users making concurrent API calls to test responsiveness and reliability', async () => {
      const startTime = Date.now();

      // Create 50 test users with tokens for API calls
      const apiTestUsers = [];
      const tokens = [];

      for (let i = 0; i < 50; i++) {
        const user = await new User({
          firstName: `APITestFirst${i}`,
          lastName: `APITestLast${i}`,
          email: `scalability-apitestuser${i}@example.com`,
          password: 'Password123!',
          role: 'user',
          isEmailVerified: true,
        }).save();
        apiTestUsers.push(user);

        // Generate JWT token for the user (matching the structure used in login)
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'testsecret');
        tokens.push(token);
      }

      // Simulate 50 concurrent API calls (GET /api/v1/auth/me for profile retrieval)
      const apiCallPromises = apiTestUsers.map((user, index) => {
        return request(app)
          .get('/api/auth/me')
          .set('Authorization', `Bearer ${tokens[index]}`)
          .expect(200);
      });

      const results = await Promise.all(apiCallPromises);
      const endTime = Date.now();
      const duration = endTime - startTime;

      // Assertions
      expect(results).toHaveLength(50);
      results.forEach((response, index) => {
        expect(response.status).toBe(200);
        expect(response.body.firstName).toBe(`APITestFirst${index}`);
        expect(response.body.lastName).toBe(`APITestLast${index}`);
        expect(response.body.email).toBe(`scalability-apitestuser${index}@example.com`);
        expect(response.body.role).toBe('user');
      });

      console.log(`50 concurrent API calls completed in ${duration}ms`);
      // Performance check: Should complete within 10 seconds for responsiveness
      expect(duration).toBeLessThan(10000);

      // Reliability check: All calls should succeed
      const successCount = results.filter(res => res.status === 200).length;
      expect(successCount).toBe(50);
    });
  });
});
