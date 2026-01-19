const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction } = require('../middleware/consent');
const { logger, logUserAction } = require('../services/logger');
const sanitizeHtml = require('sanitize-html');
const mongoose = require('mongoose');

/**
 * @route   POST /api/v1/workouts/log
 * @desc    Create a new workout log for the authenticated user
 * @access  Private
 */
router.post('/log', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, async (req, res) => {
    try {
        const userId = req.user.id;
        const { workoutName, date, programId, exercises, duration, notes } = req.body;

        // SECURITY: Validate required fields
        if (!workoutName || !exercises || !Array.isArray(exercises) || exercises.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Workout name and at least one exercise are required'
            });
        }

        // SECURITY: Validate workout name
        if (typeof workoutName !== 'string' || workoutName.trim().length === 0 || workoutName.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Workout name must be between 1 and 100 characters'
            });
        }

        // SECURITY: Validate exercises
        for (const exercise of exercises) {
            if (!exercise.exerciseName || typeof exercise.exerciseName !== 'string' || exercise.exerciseName.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Each exercise must have a valid name'
                });
            }

            if (!exercise.sets || !Array.isArray(exercise.sets) || exercise.sets.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: `Exercise "${exercise.exerciseName}" must have at least one set`
                });
            }

            // Validate each set
            for (const set of exercise.sets) {
                if (typeof set.setNumber !== 'number' || set.setNumber < 1) {
                    return res.status(400).json({
                        success: false,
                        error: 'Set number must be a positive number'
                    });
                }

                if (typeof set.reps !== 'number' || set.reps < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Reps must be a non-negative number'
                    });
                }

                if (typeof set.weight !== 'number' || set.weight < 0) {
                    return res.status(400).json({
                        success: false,
                        error: 'Weight must be a non-negative number'
                    });
                }

                if (set.rpe !== undefined && (typeof set.rpe !== 'number' || set.rpe < 1 || set.rpe > 10)) {
                    return res.status(400).json({
                        success: false,
                        error: 'RPE must be between 1 and 10'
                    });
                }
            }
        }

        // SECURITY: Validate duration if provided
        if (duration !== undefined && (typeof duration !== 'number' || duration < 0 || duration > 1440)) {
            return res.status(400).json({
                success: false,
                error: 'Duration must be between 0 and 1440 minutes'
            });
        }

        // SECURITY: Validate programId if provided
        if (programId && !mongoose.Types.ObjectId.isValid(programId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid program ID'
            });
        }

        // SECURITY: Sanitize notes
        const sanitizedNotes = notes ? sanitizeHtml(notes, {
            allowedTags: [],
            allowedAttributes: {}
        }).substring(0, 500) : undefined;

        // Create workout log object
        const workoutLog = {
            workoutName: sanitizeHtml(workoutName, { allowedTags: [], allowedAttributes: {} }).substring(0, 100),
            date: date ? new Date(date) : new Date(),
            programId: programId || undefined,
            exercises: exercises.map(exercise => ({
                exerciseName: sanitizeHtml(exercise.exerciseName, { allowedTags: [], allowedAttributes: {} }).substring(0, 100),
                sets: exercise.sets.map(set => ({
                    setNumber: set.setNumber,
                    reps: set.reps,
                    weight: set.weight,
                    rpe: set.rpe,
                    completed: set.completed !== undefined ? set.completed : true
                }))
            })),
            duration,
            notes: sanitizedNotes
        };

        // Calculate total volume
        workoutLog.totalVolume = workoutLog.exercises.reduce((total, exercise) => {
            const exerciseVolume = exercise.sets.reduce((setTotal, set) => {
                return setTotal + (set.reps * set.weight);
            }, 0);
            return total + exerciseVolume;
        }, 0);

        // Find user and add workout log
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        user.workoutLogs.push(workoutLog);
        await user.save();

        const createdLog = user.workoutLogs[user.workoutLogs.length - 1];

        logUserAction(userId, 'workout_logged', { workoutName: workoutLog.workoutName });

        res.status(201).json({
            success: true,
            workout: createdLog
        });

    } catch (err) {
        console.error('Error creating workout log:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to create workout log'
        });
    }
});

/**
 * @route   GET /api/v1/workouts
 * @desc    Get all workout logs for the authenticated user with pagination
 * @access  Private
 */
router.get('/', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const activeWorkouts = user.workoutLogs.filter(log => !log.deletedAt);
        const sortedWorkouts = activeWorkouts.sort((a, b) => {
            return sortOrder * (new Date(b.date) - new Date(a.date));
        });

        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedWorkouts = sortedWorkouts.slice(startIndex, endIndex);

        res.json({
            success: true,
            workouts: paginatedWorkouts,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(sortedWorkouts.length / limit),
                totalWorkouts: sortedWorkouts.length,
                hasNextPage: endIndex < sortedWorkouts.length,
                hasPrevPage: page > 1
            }
        });

    } catch (err) {
        console.error('Error fetching workout logs:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch workout logs'
        });
    }
});

/**
 * @route   GET /api/v1/workouts/:id
 * @desc    Get a single workout log by ID
 * @access  Private
 */
router.get('/:id', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, async (req, res) => {
    try {
        const userId = req.user.id;
        const workoutId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(workoutId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid workout ID'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const workout = user.workoutLogs.id(workoutId);
        if (!workout || workout.deletedAt) {
            return res.status(404).json({
                success: false,
                error: 'Workout not found'
            });
        }

        res.json({
            success: true,
            workout
        });

    } catch (err) {
        console.error('Error fetching workout log:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch workout log'
        });
    }
});

/**
 * @route   DELETE /api/v1/workouts/:id
 * @desc    Soft delete a workout log
 * @access  Private
 */
router.delete('/:id', auth, requireDataProcessingConsent, checkDataRestriction, async (req, res) => {
    try {
        const userId = req.user.id;
        const workoutId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(workoutId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid workout ID'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const workout = user.workoutLogs.id(workoutId);
        if (!workout || workout.deletedAt) {
            return res.status(404).json({
                success: false,
                error: 'Workout not found'
            });
        }

        workout.deletedAt = new Date();
        await user.save();

        logUserAction(userId, 'workout_deleted', { workoutId });

        res.json({
            success: true,
            message: 'Workout deleted successfully'
        });

    } catch (err) {
        console.error('Error deleting workout log:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to delete workout log'
        });
    }
});

/**
 * @route   GET /api/v1/workouts/progress/:exerciseName
 * @desc    Get progress data for a specific exercise
 * @access  Private
 */
router.get('/progress/:exerciseName', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, async (req, res) => {
    try {
        const userId = req.user.id;
        const exerciseName = decodeURIComponent(req.params.exerciseName);
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const workoutsWithExercise = user.workoutLogs
            .filter(log => !log.deletedAt)
            .filter(log => {
                return log.exercises.some(ex => 
                    ex.exerciseName.toLowerCase() === exerciseName.toLowerCase()
                );
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit);

        if (workoutsWithExercise.length === 0) {
            return res.json({
                success: true,
                exerciseName,
                data: {
                    sessions: [],
                    maxWeight: 0,
                    totalSets: 0,
                    totalReps: 0,
                    averageVolume: 0,
                    frequency: 0
                }
            });
        }

        const sessions = workoutsWithExercise.map(workout => {
            const exercise = workout.exercises.find(ex => 
                ex.exerciseName.toLowerCase() === exerciseName.toLowerCase()
            );

            const maxWeight = Math.max(...exercise.sets.map(s => s.weight));
            const totalVolume = exercise.sets.reduce((sum, set) => sum + (set.reps * set.weight), 0);
            const totalReps = exercise.sets.reduce((sum, set) => sum + set.reps, 0);

            return {
                date: workout.date,
                workoutName: workout.workoutName,
                maxWeight,
                totalVolume,
                sets: exercise.sets.length,
                totalReps
            };
        });

        const maxWeight = Math.max(...sessions.map(s => s.maxWeight));
        const totalSets = sessions.reduce((sum, s) => sum + s.sets, 0);
        const totalReps = sessions.reduce((sum, s) => sum + s.totalReps, 0);
        const averageVolume = sessions.reduce((sum, s) => sum + s.totalVolume, 0) / sessions.length;

        const dateRange = new Date() - new Date(sessions[sessions.length - 1].date);
        const weeks = dateRange / (1000 * 60 * 60 * 24 * 7);
        const frequency = weeks > 0 ? sessions.length / weeks : 0;

        res.json({
            success: true,
            exerciseName,
            data: {
                sessions,
                maxWeight,
                totalSets,
                totalReps,
                averageVolume: Math.round(averageVolume),
                frequency: frequency.toFixed(2)
            }
        });

    } catch (err) {
        console.error('Error fetching exercise progress:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch exercise progress'
        });
    }
});

/**
 * @route   GET /api/v1/workouts/stats/summary
 * @desc    Get workout statistics summary for dashboard
 * @access  Private
 */
router.get('/stats/summary', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const activeWorkouts = user.workoutLogs.filter(log => !log.deletedAt);

        if (activeWorkouts.length === 0) {
            return res.json({
                success: true,
                stats: {
                    totalWorkouts: 0,
                    lastWorkout: null,
                    mostTrainedExercise: null,
                    weeklyVolume: 0,
                    totalVolume: 0
                }
            });
        }

        const sortedWorkouts = [...activeWorkouts].sort((a, b) => new Date(b.date) - new Date(a.date));
        const lastWorkout = sortedWorkouts[0];

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const weeklyVolume = activeWorkouts
            .filter(log => new Date(log.date) >= sevenDaysAgo)
            .reduce((sum, log) => sum + (log.totalVolume || 0), 0);

        const exerciseCount = {};
        activeWorkouts.forEach(log => {
            log.exercises.forEach(ex => {
                exerciseCount[ex.exerciseName] = (exerciseCount[ex.exerciseName] || 0) + 1;
            });
        });

        const mostTrainedExercise = Object.keys(exerciseCount).length > 0
            ? Object.entries(exerciseCount).sort((a, b) => b[1] - a[1])[0][0]
            : null;

        const totalVolume = activeWorkouts.reduce((sum, log) => sum + (log.totalVolume || 0), 0);

        res.json({
            success: true,
            stats: {
                totalWorkouts: activeWorkouts.length,
                lastWorkout: {
                    workoutName: lastWorkout.workoutName,
                    date: lastWorkout.date,
                    duration: lastWorkout.duration,
                    totalVolume: lastWorkout.totalVolume
                },
                mostTrainedExercise,
                weeklyVolume: Math.round(weeklyVolume),
                totalVolume: Math.round(totalVolume)
            }
        });

    } catch (err) {
        console.error('Error fetching workout stats:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch workout statistics'
        });
    }
});

module.exports = router;
