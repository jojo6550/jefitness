/**
 * API Configuration with ApiConfig Interface
 * Provides window.ApiConfig.getAPI_BASE() expected by auth.js and other modules
 * Backward compatible with direct window.API_BASE usage
 */

(function() {
  'use strict';

  const hostname = window.location.hostname;
  // Use the current page's origin so any allowed server works without hardcoding
  const API_BASE = window.location.origin;

  // Define the expected ApiConfig interface
  window.ApiConfig = {
    getAPI_BASE: () => API_BASE,

    getDebugInfo: () => ({
      base: API_BASE,
      hostname: hostname,
      isProduction: window.location.protocol === 'https:'
    })
  };

  // Backward compatibility - set globals as before
  window.API_BASE = API_BASE;

  // API request utility
  window.API = {
    request: async (endpoint, options = {}) => {
      const url = `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };

      try {
        const response = await fetch(url, {
          ...options,
          headers,
          credentials: 'include',
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

    // Auth helpers (updated to use ApiConfig interface)
    auth: {
      login: (email, password) => window.API.request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      }),
      
      signup: (data) => window.API.request('/api/v1/auth/signup', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
      
      logout: () => window.API.request('/api/v1/auth/logout', { method: 'POST' }),
      
      register: (data) => window.API.auth.signup(data),
      
    },

    // Token is now stored in an httpOnly cookie — these are kept for
    // backward compat but auth is handled automatically by the browser.
    getToken: () => null,
    setToken: () => {},
    clearToken: () => {}
  };

})();

