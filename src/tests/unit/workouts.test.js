const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../server');
const User = require('../../models/User');
const jwt = require('jsonwebtoken');

let mongoServer;
let authToken;
let userId;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose.connect(mongoUri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await User.deleteMany({});
    
    // Create a test user
    const testUser = new User({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        password: 'TestPassword123!',
        isEmailVerified: true,
        dataProcessingConsent: {
            given: true,
            givenAt: new Date(),
            version: '1.0'
        },
        healthDataConsent: {
            given: true,
            givenAt: new Date(),
            version: '1.0'
        }
    });
    
    await testUser.save();
    userId = testUser._id.toString();
    
    // Generate auth token
    authToken = jwt.sign(
        { id: userId, userId: userId, tokenVersion: 0 },
        process.env.JWT_SECRET || 'test-secret'
    );
});

describe('POST /api/v1/workouts/log', () => {
    test('should create a new workout log', async () => {
        const workoutData = {
            workoutName: 'Upper Body Strength',
            date: new Date().toISOString(),
            duration: 60,
            exercises: [
                {
                    exerciseName: 'Bench Press',
                    sets: [
                        { setNumber: 1, reps: 10, weight: 135, rpe: 7 },
                        { setNumber: 2, reps: 8, weight: 155, rpe: 8 }
                    ]
                }
            ],
            notes: 'Felt strong today'
        };

        const response = await request(app)
            .post('/api/v1/workouts/log')
            .set('Authorization', `Bearer ${authToken}`)
            .send(workoutData)
            .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.workout).toBeDefined();
        expect(response.body.workout.workoutName).toBe('Upper Body Strength');
        expect(response.body.workout.totalVolume).toBeGreaterThan(0);
    });

    test('should reject workout without exercises', async () => {
        const workoutData = {
            workoutName: 'Empty Workout',
            exercises: []
        };

        const response = await request(app)
            .post('/api/v1/workouts/log')
            .set('Authorization', `Bearer ${authToken}`)
            .send(workoutData)
            .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toContain('at least one exercise');
    });

    test('should validate numeric inputs', async () => {
        const workoutData = {
            workoutName: 'Invalid Workout',
            exercises: [
                {
                    exerciseName: 'Squat',
                    sets: [
                        { setNumber: 1, reps: -5, weight: 135 }
                    ]
                }
            ]
        };

        const response = await request(app)
            .post('/api/v1/workouts/log')
            .set('Authorization', `Bearer ${authToken}`)
            .send(workoutData)
            .expect(400);

        expect(response.body.success).toBe(false);
    });

    test('should require authentication', async () => {
        const workoutData = {
            workoutName: 'Test Workout',
            exercises: [
                {
                    exerciseName: 'Squat',
                    sets: [{ setNumber: 1, reps: 10, weight: 135 }]
                }
            ]
        };

        await request(app)
            .post('/api/v1/workouts/log')
            .send(workoutData)
            .expect(401);
    });
});

describe('GET /api/v1/workouts', () => {
    beforeEach(async () => {
        // Add some test workouts
        const user = await User.findById(userId);
        user.workoutLogs.push({
            workoutName: 'Workout 1',
            date: new Date(),
            exercises: [
                {
                    exerciseName: 'Bench Press',
                    sets: [{ setNumber: 1, reps: 10, weight: 135 }]
                }
            ]
        });
        user.workoutLogs.push({
            workoutName: 'Workout 2',
            date: new Date(Date.now() - 86400000),
            exercises: [
                {
                    exerciseName: 'Squat',
                    sets: [{ setNumber: 1, reps: 10, weight: 225 }]
                }
            ]
        });
        await user.save();
    });

    test('should get all workout logs', async () => {
        const response = await request(app)
            .get('/api/v1/workouts')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.workouts).toHaveLength(2);
        expect(response.body.pagination).toBeDefined();
    });

    test('should support pagination', async () => {
        const response = await request(app)
            .get('/api/v1/workouts?page=1&limit=1')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.workouts).toHaveLength(1);
        expect(response.body.pagination.totalPages).toBe(2);
    });

    test('should require authentication', async () => {
        await request(app)
            .get('/api/v1/workouts')
            .expect(401);
    });
});

describe('GET /api/v1/workouts/progress/:exerciseName', () => {
    beforeEach(async () => {
        const user = await User.findById(userId);
        
        // Add workouts with Bench Press
        for (let i = 0; i < 5; i++) {
            user.workoutLogs.push({
                workoutName: `Workout ${i + 1}`,
                date: new Date(Date.now() - i * 86400000 * 2),
                exercises: [
                    {
                        exerciseName: 'Bench Press',
                        sets: [
                            { setNumber: 1, reps: 10, weight: 135 + i * 10 },
                            { setNumber: 2, reps: 8, weight: 145 + i * 10 }
                        ]
                    }
                ]
            });
        }
        await user.save();
    });

    test('should get progress data for an exercise', async () => {
        const response = await request(app)
            .get('/api/v1/workouts/progress/Bench%20Press')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.exerciseName).toBe('Bench Press');
        expect(response.body.data.sessions).toHaveLength(5);
        expect(response.body.data.maxWeight).toBeGreaterThan(0);
    });

    test('should return empty data for non-existent exercise', async () => {
        const response = await request(app)
            .get('/api/v1/workouts/progress/Deadlift')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.data.sessions).toHaveLength(0);
        expect(response.body.data.maxWeight).toBe(0);
    });
});

describe('DELETE /api/v1/workouts/:id', () => {
    let workoutId;

    beforeEach(async () => {
        const user = await User.findById(userId);
        user.workoutLogs.push({
            workoutName: 'Test Workout',
            date: new Date(),
            exercises: [
                {
                    exerciseName: 'Squat',
                    sets: [{ setNumber: 1, reps: 10, weight: 225 }]
                }
            ]
        });
        await user.save();
        
        const updatedUser = await User.findById(userId);
        workoutId = updatedUser.workoutLogs[0]._id.toString();
    });

    test('should soft delete a workout', async () => {
        const response = await request(app)
            .delete(`/api/v1/workouts/${workoutId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);

        // Verify soft delete
        const user = await User.findById(userId);
        const workout = user.workoutLogs.id(workoutId);
        expect(workout.deletedAt).toBeDefined();
    });

    test('should prevent deleting another user\'s workout', async () => {
        // Create another user
        const otherUser = new User({
            firstName: 'Other',
            lastName: 'User',
            email: 'other@example.com',
            password: 'Password123!',
            isEmailVerified: true,
            dataProcessingConsent: { given: true, givenAt: new Date(), version: '1.0' },
            healthDataConsent: { given: true, givenAt: new Date(), version: '1.0' }
        });
        await otherUser.save();

        const otherToken = jwt.sign(
            { id: otherUser._id.toString(), userId: otherUser._id.toString(), tokenVersion: 0 },
            process.env.JWT_SECRET || 'test-secret'
        );

        // Try to delete first user's workout
        await request(app)
            .delete(`/api/v1/workouts/${workoutId}`)
            .set('Authorization', `Bearer ${otherToken}`)
            .expect(404);
    });
});

describe('GET /api/v1/workouts/stats/summary', () => {
    beforeEach(async () => {
        const user = await User.findById(userId);
        
        // Add recent workouts
        user.workoutLogs.push({
            workoutName: 'Recent Workout',
            date: new Date(),
            exercises: [
                {
                    exerciseName: 'Bench Press',
                    sets: [{ setNumber: 1, reps: 10, weight: 135 }]
                }
            ]
        });
        
        user.workoutLogs.push({
            workoutName: 'Old Workout',
            date: new Date(Date.now() - 30 * 86400000),
            exercises: [
                {
                    exerciseName: 'Bench Press',
                    sets: [{ setNumber: 1, reps: 10, weight: 125 }]
                }
            ]
        });
        
        await user.save();
    });

    test('should get workout statistics summary', async () => {
        const response = await request(app)
            .get('/api/v1/workouts/stats/summary')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.stats.totalWorkouts).toBe(2);
        expect(response.body.stats.lastWorkout).toBeDefined();
        expect(response.body.stats.mostTrainedExercise).toBe('Bench Press');
    });
});
