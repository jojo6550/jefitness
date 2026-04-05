/**
 * AppointmentService.js
 * Centralized API calls for appointment operations.
 */

const AppointmentService = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/api/v1/appointments/user`, {
      credentials: 'include',
    });
    return handleApiResponse(res);
  },

  getById: async (id) => {
    const res = await fetch(`${API_BASE}/api/v1/appointments/${id}`, {
      credentials: 'include',
    });
    return handleApiResponse(res);
  },

  create: async ({ trainerId, date, time, notes }) => {
    const res = await fetch(`${API_BASE}/api/v1/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ trainerId, date, time, notes }),
    });
    return handleApiResponse(res);
  },

  update: async (id, fields) => {
    const res = await fetch(`${API_BASE}/api/v1/appointments/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(fields),
    });
    return handleApiResponse(res);
  },

  remove: async (id) => {
    const res = await fetch(`${API_BASE}/api/v1/appointments/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return handleApiResponse(res);
  },
};

window.AppointmentService = AppointmentService;
