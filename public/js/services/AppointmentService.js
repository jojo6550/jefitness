/**
 * AppointmentService.js
 * Centralized API calls for appointment operations.
 */

const AppointmentService = {
  getAll: async (userToken) => {
    const res = await fetch(`${API_BASE}/api/v1/appointments/user`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },

  getById: async (userToken, id) => {
    const res = await fetch(`${API_BASE}/api/v1/appointments/${id}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },

  create: async (userToken, { trainerId, date, time, notes }) => {
    const res = await fetch(`${API_BASE}/api/v1/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ trainerId, date, time, notes }),
    });
    return handleApiResponse(res);
  },

  update: async (userToken, id, fields) => {
    const res = await fetch(`${API_BASE}/api/v1/appointments/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify(fields),
    });
    return handleApiResponse(res);
  },

  remove: async (userToken, id) => {
    const res = await fetch(`${API_BASE}/api/v1/appointments/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },
};

window.AppointmentService = AppointmentService;
