/**
 * WorkoutService.js
 * Centralized API calls for workout logging and progress.
 */

const WorkoutService = {
  log: async (workoutData) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(workoutData),
    });
    return handleApiResponse(res);
  },

  getAll: async ({ limit = 20, page = 1 } = {}) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts?limit=${limit}&page=${page}`, {
      credentials: 'include',
    });
    return handleApiResponse(res);
  },

  getProgress: async (exerciseName) => {
    const res = await fetch(
      `${API_BASE}/api/v1/workouts/progress/${encodeURIComponent(exerciseName)}`,
      { credentials: 'include' }
    );
    return handleApiResponse(res);
  },

  getSummary: async () => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/stats/summary`, {
      credentials: 'include',
    });
    return handleApiResponse(res);
  },

  remove: async (id) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleApiResponse(res);
  },

  // Goals
  getGoals: async () => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/goals`, {
      credentials: 'include',
    });
    return handleApiResponse(res);
  },

  addGoal: async ({ exercise, targetWeight, targetDate }) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ exercise, targetWeight, targetDate }),
    });
    return handleApiResponse(res);
  },

  achieveGoal: async (goalId) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/goals/${goalId}/achieve`, {
      method: 'PUT',
      credentials: 'include',
    });
    return handleApiResponse(res);
  },

  deleteGoal: async (goalId) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/goals/${goalId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleApiResponse(res);
  },
};

window.WorkoutService = WorkoutService;
