/**
 * Simplified API Configuration
 * Only supports jefitnessja.com (prod) and localhost:10000 (dev)
 * Removed all Capacitor/mobile/emulator/health check complexity
 */

const API_BASE = (window.location.hostname === 'jefitnessja.com' || window.location.hostname.includes('onrender.com'))
  ? 'https://jefitnessja.com' 
  : 'http://localhost:10000';

window.API_BASE = API_BASE;

window.API = {
  request: async (endpoint, options = {}) => {
    const url = `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    
    const token = localStorage.getItem('token') || '';
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        let errorData = {};
        try {
          errorData = await response.json();
        } catch {}
        
        const error = new Error(errorData.message || errorData.error?.message || response.statusText);
        error.status = response.status;
        error.response = errorData;
        throw error;
      }

      return response.json();
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        throw new Error(`Backend unavailable at ${API_BASE}. Check if server is running.`);
      }
      throw error;
    }
  },

  // Simple auth helpers
  auth: {
    login: (email, password) => window.API.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
    
    signup: (data) => window.API.request('/api/v1/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    
    logout: () => window.API.request('/api/v1/auth/logout', { method: 'POST' })
  },

  getToken: () => localStorage.getItem('token'),
  setToken: (token) => localStorage.setItem('token', token),
  clearToken: () => localStorage.removeItem('token')
};

console.log(`API configured: ${API_BASE} (${window.location.hostname})`);
