const mongoose = require('mongoose');

const sanitizeHtml = require('sanitize-html');

const User = require('../models/User');
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
} = require('../middleware/errorHandler');
const { logUserAction } = require('../services/logger');

const workoutController = {
  /**
   * Create a new workout log
   */
  logWorkout: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { workoutName, date, programId, exercises, duration, notes } = req.body;

    // Validation
    if (
      !workoutName ||
      !exercises ||
      !Array.isArray(exercises) ||
      exercises.length === 0
    ) {
      throw new ValidationError('Workout name and at least one exercise are required');
    }

    // Sanitize and structure
    const workoutLog = {
      workoutName: sanitizeHtml(workoutName, {
        allowedTags: [],
        allowedAttributes: {},
      }).substring(0, 100),
      date: date ? new Date(date) : new Date(),
      programId: programId || undefined,
      exercises: exercises.map(exercise => ({
        exerciseName: sanitizeHtml(exercise.exerciseName, {
          allowedTags: [],
          allowedAttributes: {},
        }).substring(0, 100),
        sets: exercise.sets.map(set => ({
          setNumber: set.setNumber,
          reps: set.reps,
          weight: set.weight,
          rpe: set.rpe,
          completed: set.completed !== undefined ? set.completed : true,
        })),
      })),
      duration,
      notes: notes
        ? sanitizeHtml(notes, { allowedTags: [], allowedAttributes: {} }).substring(
            0,
            500
          )
        : undefined,
    };

    const user = await User.findById(userId).select(
      'workoutLogs firstName lastName email'
    );
    if (!user) {
      throw new NotFoundError('User');
    }

    user.workoutLogs.push(workoutLog);
    await user.save();

    const createdLog = user.workoutLogs[user.workoutLogs.length - 1];
    logUserAction('workout_logged', userId, {
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      workoutName: workoutLog.workoutName,
    });

    res.status(201).json({ success: true, workout: createdLog });
  }),

  /**
   * Get workout logs with pagination
   */
  getWorkouts: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    const user = await User.findById(userId).select('workoutLogs');
    if (!user) {
      throw new NotFoundError('User');
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
        hasPrevPage: page > 1,
      },
    });
  }),

  /**
   * Get single workout log
   */
  getWorkoutById: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const workoutId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(workoutId)) {
      throw new ValidationError('Invalid workout ID');
    }

    const user = await User.findById(userId).select('workoutLogs');
    if (!user) {
      throw new NotFoundError('User');
    }

    const workout = user.workoutLogs.id(workoutId);
    if (!workout || workout.deletedAt) {
      throw new NotFoundError('Workout');
    }

    res.json({ success: true, workout });
  }),

  /**
   * Delete workout log (soft delete)
   */
  deleteWorkout: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const workoutId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(workoutId)) {
      throw new ValidationError('Invalid workout ID');
    }

    const user = await User.findById(userId).select(
      'workoutLogs firstName lastName email'
    );
    if (!user) {
      throw new NotFoundError('User');
    }

    const workout = user.workoutLogs.id(workoutId);
    if (!workout || workout.deletedAt) {
      throw new NotFoundError('Workout');
    }

    workout.deletedAt = new Date();
    await user.save();

    logUserAction('workout_deleted', userId, {
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      workoutId,
    });
    res.json({ success: true, message: 'Workout deleted successfully' });
  }),

  /**
   * Get progress for specific exercise
   */
  getExerciseProgress: asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const exerciseName = decodeURIComponent(req.params.exerciseName);
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);

    const user = await User.findById(userId).select('workoutLogs');
    if (!user) {
      throw new NotFoundError('User');
    }

    const workoutsWithExercise = user.workoutLogs
      .filter(log => !log.deletedAt)
      .filter(log =>
        log.exercises.some(
          ex => ex.exerciseName.toLowerCase() === exerciseName.toLowerCase()
        )
      )
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
          frequency: 0,
        },
      });
    }

    const sessions = workoutsWithExercise.map(workout => {
      const exercise = workout.exercises.find(
        ex => ex.exerciseName.toLowerCase() === exerciseName.toLowerCase()
      );
      const maxWeight = Math.max(...exercise.sets.map(s => s.weight));
      const totalVolume = exercise.sets.reduce(
        (sum, set) => sum + set.reps * set.weight,
        0
      );
      const totalReps = exercise.sets.reduce((sum, set) => sum + set.reps, 0);

      return {
        date: workout.date,
        workoutName: workout.workoutName,
        maxWeight,
        totalVolume,
        sets: exercise.sets.length,
        totalReps,
      };
    });

    const maxWeight = Math.max(...sessions.map(s => s.maxWeight));
    const totalSets = sessions.reduce((sum, s) => sum + s.sets, 0);
    const totalReps = sessions.reduce((sum, s) => sum + s.totalReps, 0);
    const averageVolume =
      sessions.reduce((sum, s) => sum + s.totalVolume, 0) / sessions.length;

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
        frequency: frequency.toFixed(2),
      },
    });
  }),

  /**
   * Get workout stats summary
   */
  getStatsSummary: asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const user = await User.findById(userId).select('workoutLogs');
    if (!user) {
      throw new NotFoundError('User');
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
          totalVolume: 0,
        },
      });
    }

    const sortedWorkouts = [...activeWorkouts].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
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

    const mostTrainedExercise =
      Object.keys(exerciseCount).length > 0
        ? Object.entries(exerciseCount).sort((a, b) => b[1] - a[1])[0][0]
        : null;

    const totalVolume = activeWorkouts.reduce(
      (sum, log) => sum + (log.totalVolume || 0),
      0
    );

    res.json({
      success: true,
      stats: {
        totalWorkouts: activeWorkouts.length,
        lastWorkout: {
          workoutName: lastWorkout.workoutName,
          date: lastWorkout.date,
          duration: lastWorkout.duration,
          totalVolume: lastWorkout.totalVolume,
        },
        mostTrainedExercise,
        weeklyVolume: Math.round(weeklyVolume),
        totalVolume: Math.round(totalVolume),
      },
    });
  }),
};

module.exports = workoutController;
