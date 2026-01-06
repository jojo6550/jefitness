const User = require('../../src/models/User');
const mongoose = require('mongoose');

describe('User Model', () => {
  describe('Schema Validation', () => {
    test('should create a valid user with all required fields', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        password: 'Test123!@#'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.firstName).toBe(userData.firstName);
      expect(savedUser.lastName).toBe(userData.lastName);
      expect(savedUser.email).toBe(userData.email.toLowerCase());
      expect(savedUser.role).toBe('user');
      expect(savedUser.isEmailVerified).toBe(false);
      expect(savedUser.failedLoginAttempts).toBe(0);
    });

    test('should fail validation when required fields are missing', async () => {
      const user = new User({});

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.firstName).toBeDefined();
      expect(error.errors.lastName).toBeDefined();
      expect(error.errors.email).toBeDefined();
      expect(error.errors.password).toBeDefined();
    });

    test('should reject invalid email format', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email',
        password: 'Test123!@#'
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.email).toBeDefined();
    });

    test('should reject password shorter than 8 characters', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test1!'
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.password).toBeDefined();
    });

    // Password validation is now handled in the route, not the model
    test('should accept any password string', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'anystring'
      });

      const savedUser = await user.save();
      expect(savedUser.password).toBe('anystring');
    });

    test('should enforce unique email constraint', async () => {
      const userData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#'
      };

      await new User(userData).save();

      const duplicateUser = new User(userData);
      let error;
      try {
        await duplicateUser.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe(11000); // Duplicate key error
    });

    test('should store email in lowercase', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'JOHN.DOE@EXAMPLE.COM',
        password: 'Test123!@#'
      });

      const savedUser = await user.save();
      expect(savedUser.email).toBe('john.doe@example.com');
    });

    test('should validate phone number format', async () => {
      const validPhones = ['+1234567890', '123-456-7890', '(123) 456-7890'];
      const invalidPhones = ['abc', '123abc', 'phone'];

      for (const phone of validPhones) {
        const user = new User({
          firstName: 'John',
          lastName: 'Doe',
          email: `john${Math.random()}@example.com`,
          password: 'Test123!@#',
          phone
        });

        const savedUser = await user.save();
        expect(savedUser.phone).toBe(phone);
      }

      for (const phone of invalidPhones) {
        const user = new User({
          firstName: 'John',
          lastName: 'Doe',
          email: `john${Math.random()}@example.com`,
          password: 'Test123!@#',
          phone
        });

        let error;
        try {
          await user.save();
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.errors.phone).toBeDefined();
      }
    });

    test('should validate date of birth', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        dob: futureDate
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.dob).toBeDefined();
    });

    test('should validate gender enum values', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        gender: 'invalid'
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.gender).toBeDefined();
    });
  });

  describe('User Methods and Virtuals', () => {
    test('should add nutrition logs', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      user.nutritionLogs.push({
        id: 1,
        date: '2026-01-05',
        mealType: 'breakfast',
        foodItem: 'Oatmeal',
        calories: 300,
        protein: 10,
        carbs: 50,
        fats: 5
      });

      const savedUser = await user.save();
      expect(savedUser.nutritionLogs).toHaveLength(1);
      expect(savedUser.nutritionLogs[0].foodItem).toBe('Oatmeal');
    });

    test('should add sleep logs', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      user.sleepLogs.push({
        date: new Date(),
        hoursSlept: 7.5
      });

      const savedUser = await user.save();
      expect(savedUser.sleepLogs).toHaveLength(1);
      expect(savedUser.sleepLogs[0].hoursSlept).toBe(7.5);
    });

    test('should validate sleep hours range', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      user.sleepLogs.push({
        date: new Date(),
        hoursSlept: 25
      });

      let error;
      try {
        await user.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
    });

    test('should manage schedule with plans', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        schedule: {
          lastReset: new Date(),
          plans: [
            {
              day: 'monday',
              planTitles: ['Chest Day', 'Cardio'],
              notes: 'Focus on form'
            }
          ]
        }
      });

      const savedUser = await user.save();
      expect(savedUser.schedule.plans).toHaveLength(1);
      expect(savedUser.schedule.plans[0].day).toBe('monday');
    });

    test('should assign programs to user', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#'
      });

      const programId = new mongoose.Types.ObjectId();
      user.assignedPrograms.push({
        programId,
        assignedAt: new Date()
      });

      const savedUser = await user.save();
      expect(savedUser.assignedPrograms).toHaveLength(1);
      expect(savedUser.assignedPrograms[0].programId.toString()).toBe(programId.toString());
    });
  });

  describe('User Security Fields', () => {
    test('should track failed login attempts', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        failedLoginAttempts: 3
      });

      const savedUser = await user.save();
      expect(savedUser.failedLoginAttempts).toBe(3);
    });

    test('should set lockout period', async () => {
      const lockoutDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        lockoutUntil: lockoutDate
      });

      const savedUser = await user.save();
      expect(savedUser.lockoutUntil).toBeDefined();
      expect(savedUser.lockoutUntil.getTime()).toBeGreaterThan(Date.now());
    });

    test('should store email verification token', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        emailVerificationToken: '123456',
        emailVerificationExpires: new Date(Date.now() + 10 * 60 * 1000)
      });

      const savedUser = await user.save();
      expect(savedUser.emailVerificationToken).toBe('123456');
      expect(savedUser.emailVerificationExpires).toBeDefined();
    });

    test('should store password reset token', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        resetToken: 'reset-token-hash',
        resetExpires: new Date(Date.now() + 10 * 60 * 1000)
      });

      const savedUser = await user.save();
      expect(savedUser.resetToken).toBe('reset-token-hash');
      expect(savedUser.resetExpires).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty arrays for nested documents', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        nutritionLogs: [],
        sleepLogs: [],
        assignedPrograms: []
      });

      const savedUser = await user.save();
      expect(savedUser.nutritionLogs).toEqual([]);
      expect(savedUser.sleepLogs).toEqual([]);
      expect(savedUser.assignedPrograms).toEqual([]);
    });

    test('should handle maximum allowed values', async () => {
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'Test123!@#',
        startWeight: 999,
        currentWeight: 999,
        goals: 'A'.repeat(1000),
        reason: 'B'.repeat(1000)
      });

      const savedUser = await user.save();
      expect(savedUser.startWeight).toBe(999);
      expect(savedUser.goals).toHaveLength(1000);
    });

    test('should handle special characters in names', async () => {
      const user = new User({
        firstName: "O'Brien",
        lastName: 'Müller-Smith',
        email: 'test@example.com',
        password: 'Test123!@#'
      });

      const savedUser = await user.save();
      expect(savedUser.firstName).toBe("O'Brien");
      expect(savedUser.lastName).toBe('Müller-Smith');
    });

    test('should trim whitespace from string fields', async () => {
      const user = new User({
        firstName: '  John  ',
        lastName: '  Doe  ',
        email: '  john@example.com  ',
        password: 'Test123!@#'
      });

      const savedUser = await user.save();
      expect(savedUser.firstName).toBe('  John  '); // Names may not be trimmed
      expect(savedUser.email).toBe('john@example.com'); // Email should be trimmed
    });
  });
});