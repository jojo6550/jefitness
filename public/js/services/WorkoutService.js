/**
 * WorkoutService.js
 * Centralized API calls for workout logging and progress.
 */

const WorkoutService = {
  log: async (userToken, workoutData) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify(workoutData),
    });
    return handleApiResponse(res);
  },

  getAll: async (userToken, { limit = 20, page = 1 } = {}) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts?limit=${limit}&page=${page}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },

  getProgress: async (userToken, exerciseName) => {
    const res = await fetch(
      `${API_BASE}/api/v1/workouts/progress/${encodeURIComponent(exerciseName)}`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );
    return handleApiResponse(res);
  },

  getSummary: async (userToken) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/stats/summary`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },

  remove: async (userToken, id) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },

  // Goals
  getGoals: async (userToken) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/goals`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },

  addGoal: async (userToken, { exercise, targetWeight, targetDate }) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/goals`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ exercise, targetWeight, targetDate }),
    });
    return handleApiResponse(res);
  },

  achieveGoal: async (userToken, goalId) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/goals/${goalId}/achieve`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },

  deleteGoal: async (userToken, goalId) => {
    const res = await fetch(`${API_BASE}/api/v1/workouts/goals/${goalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },
};

window.WorkoutService = WorkoutService;
