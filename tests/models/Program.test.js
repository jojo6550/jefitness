const Program = require('../../src/models/Program');

describe('Program Model', () => {
  describe('Schema Validation', () => {
    test('should create a valid program with all required fields', async () => {
      const programData = {
        title: 'Beginner Strength Training',
        description: 'A comprehensive program for beginners',
        preview: 'Build strength with this 4-week program',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45-60 minutes',
        slug: 'beginner-strength-training'
      };

      const program = new Program(programData);
      const savedProgram = await program.save();

      expect(savedProgram._id).toBeDefined();
      expect(savedProgram.title).toBe(programData.title);
      expect(savedProgram.price).toBe(programData.price);
      expect(savedProgram.isActive).toBe(true);
      expect(savedProgram.isPublished).toBe(false);
    });

    test('should fail validation when required fields are missing', async () => {
      const program = new Program({});

      let error;
      try {
        await program.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.errors.title).toBeDefined();
      expect(error.errors.description).toBeDefined();
      expect(error.errors.price).toBeDefined();
    });

    test('should validate duration format', async () => {
      const validDurations = ['4 weeks', '1 month', '30 days', '8 WEEKS'];
      const invalidDurations = ['four weeks', '4', 'invalid', '4weeks'];

      for (const duration of validDurations) {
        const program = new Program({
          title: 'Test Program',
          description: 'Test description',
          preview: 'Test preview',
          price: 49.99,
          duration,
          level: 'Beginner',
          frequency: '3 days per week',
          sessionLength: '45 minutes',
          slug: `test-${Math.random()}`
        });

        const savedProgram = await program.save();
        expect(savedProgram.duration).toBe(duration);
      }

      for (const duration of invalidDurations) {
        const program = new Program({
          title: 'Test Program',
          description: 'Test description',
          preview: 'Test preview',
          price: 49.99,
          duration,
          level: 'Beginner',
          frequency: '3 days per week',
          sessionLength: '45 minutes',
          slug: `test-${Math.random()}`
        });

        let error;
        try {
          await program.save();
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.errors.duration).toBeDefined();
      }
    });

    test('should validate level enum values', async () => {
      const validLevels = ['Beginner', 'Intermediate', 'Advanced'];
      const invalidLevels = ['beginner', 'Expert', 'Novice'];

      for (const level of validLevels) {
        const program = new Program({
          title: 'Test Program',
          description: 'Test description',
          preview: 'Test preview',
          price: 49.99,
          duration: '4 weeks',
          level,
          frequency: '3 days per week',
          sessionLength: '45 minutes',
          slug: `test-${Math.random()}`
        });

        const savedProgram = await program.save();
        expect(savedProgram.level).toBe(level);
      }

      for (const level of invalidLevels) {
        const program = new Program({
          title: 'Test Program',
          description: 'Test description',
          preview: 'Test preview',
          price: 49.99,
          duration: '4 weeks',
          level,
          frequency: '3 days per week',
          sessionLength: '45 minutes',
          slug: `test-${Math.random()}`
        });

        let error;
        try {
          await program.save();
        } catch (err) {
          error = err;
        }

        expect(error).toBeDefined();
        expect(error.errors.level).toBeDefined();
      }
    });

    test('should enforce unique slug constraint', async () => {
      const programData = {
        title: 'Test Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'unique-slug'
      };

      await new Program(programData).save();

      const duplicateProgram = new Program(programData);
      let error;
      try {
        await duplicateProgram.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.code).toBe(11000);
    });
  });

  describe('Program Features and Days', () => {
    test('should add features array', async () => {
      const program = new Program({
        title: 'Test Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'test-program',
        features: [
          'Progressive overload',
          'Video demonstrations',
          'Nutrition guide'
        ]
      });

      const savedProgram = await program.save();
      expect(savedProgram.features).toHaveLength(3);
      expect(savedProgram.features[0]).toBe('Progressive overload');
    });

    test('should add workout days with exercises', async () => {
      const program = new Program({
        title: 'Test Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'test-program',
        days: [
          {
            dayName: 'Day 1 - Chest & Triceps',
            exercises: [
              {
                name: 'Bench Press',
                sets: 3,
                reps: '8-10',
                notes: 'Focus on form'
              },
              {
                name: 'Tricep Dips',
                sets: 3,
                reps: '10-12',
                notes: 'Full range of motion'
              }
            ]
          },
          {
            dayName: 'Day 2 - Back & Biceps',
            exercises: [
              {
                name: 'Pull-ups',
                sets: 3,
                reps: '6-8',
                notes: 'Use assistance if needed'
              }
            ]
          }
        ]
      });

      const savedProgram = await program.save();
      expect(savedProgram.days).toHaveLength(2);
      expect(savedProgram.days[0].exercises).toHaveLength(2);
      expect(savedProgram.days[0].exercises[0].name).toBe('Bench Press');
    });

    test('should validate exercise schema', async () => {
      const program = new Program({
        title: 'Test Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'test-program',
        days: [
          {
            dayName: 'Day 1',
            exercises: [
              {
                // Missing required fields
                notes: 'Test notes'
              }
            ]
          }
        ]
      });

      let error;
      try {
        await program.save();
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
    });
  });

  describe('Program Status Flags', () => {
    test('should default isActive to true', async () => {
      const program = new Program({
        title: 'Test Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'test-program'
      });

      const savedProgram = await program.save();
      expect(savedProgram.isActive).toBe(true);
    });

    test('should default isPublished to false', async () => {
      const program = new Program({
        title: 'Test Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'test-program'
      });

      const savedProgram = await program.save();
      expect(savedProgram.isPublished).toBe(false);
    });

    test('should allow setting isActive and isPublished', async () => {
      const program = new Program({
        title: 'Test Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'test-program',
        isActive: false,
        isPublished: true
      });

      const savedProgram = await program.save();
      expect(savedProgram.isActive).toBe(false);
      expect(savedProgram.isPublished).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero price', async () => {
      const program = new Program({
        title: 'Free Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 0,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'free-program'
      });

      const savedProgram = await program.save();
      expect(savedProgram.price).toBe(0);
    });

    test('should handle large price values', async () => {
      const program = new Program({
        title: 'Premium Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 9999.99,
        duration: '4 weeks',
        level: 'Advanced',
        frequency: '6 days per week',
        sessionLength: '90 minutes',
        slug: 'premium-program'
      });

      const savedProgram = await program.save();
      expect(savedProgram.price).toBe(9999.99);
    });

    test('should handle empty features array', async () => {
      const program = new Program({
        title: 'Test Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'test-program',
        features: []
      });

      const savedProgram = await program.save();
      expect(savedProgram.features).toEqual([]);
    });

    test('should handle empty days array', async () => {
      const program = new Program({
        title: 'Test Program',
        description: 'Test description',
        preview: 'Test preview',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'test-program',
        days: []
      });

      const savedProgram = await program.save();
      expect(savedProgram.days).toEqual([]);
    });

    test('should handle long text fields', async () => {
      const longText = 'A'.repeat(5000);
      const program = new Program({
        title: 'Test Program',
        description: longText,
        preview: longText,
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '3 days per week',
        sessionLength: '45 minutes',
        slug: 'test-program'
      });

      const savedProgram = await program.save();
      expect(savedProgram.description).toHaveLength(5000);
    });
  });
});