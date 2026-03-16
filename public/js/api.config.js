/**
 * API Configuration Module
 * Handles API endpoint configuration for different environments
 * (Browser, Android Emulator, iOS Simulator, Physical Devices, Production)
 */

class ApiConfig {
  static getAPI_BASE() {
    const env = this.getEnvironment();
    
    switch(env) {
      case 'ANDROID_EMULATOR':
        return 'http://10.0.2.2:10000';
      case 'IOS_SIMULATOR': 
      case 'BROWSER':
        // Fix for VS Code Live Server HTTPS: force HTTP backend for local dev
        const override = localStorage.getItem('api_force_local');
        if (override === 'http://localhost:10000') {
          console.log('API_BASE overridden to local HTTP:', override);
          return override;
        }
        console.log('API_BASE set to local backend:', 'http://localhost:10000');
        return 'http://localhost:10000';  // Fixed HTTP backend
      case 'MOBILE_DEVICE':
        return this.getMobileDeviceURL();
      case 'PRODUCTION':
        // For custom domain jefitnessja.com, use backend URL
        if (window.location.hostname === 'jefitnessja.com') {
          return 'https://jefitness.onrender.com';
        }
        return window.location.origin;
      default:
        return window.location.origin;
    }
  }

  static getEnvironment() {
    // Check if running in Capacitor
    if (window.Capacitor && window.Capacitor.isNativePlatform?.()) {
      const platform = window.Capacitor.getPlatform?.();
      
      if (platform === 'android') {
        return 'ANDROID_EMULATOR';
      } else if (platform === 'ios') {
        return 'IOS_SIMULATOR';
      }
      
      // Check if on actual device
      if (this.isPhysicalDevice()) {
        return 'MOBILE_DEVICE';
      }
    }
    
    // Check if production
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return 'PRODUCTION';
    }
    
    return 'BROWSER';
  }

  static isPhysicalDevice() {
    // Check if device info indicates physical device
    return navigator.userAgent.includes('Mobile') && !this.isEmulator();
  }

  static isEmulator() {
    return navigator.userAgent.includes('Emulator') || 
           navigator.userAgent.includes('Simulator');
  }

  static getMobileDeviceURL() {
    // Fallback: prompt user or use stored IP
    const savedIP = localStorage.getItem('device_server_ip');
    if (savedIP) {
      return `http://${savedIP}:10000`;
    }
    
    // Try to detect local network IP
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost') {
      return `http://${hostname}:10000`;
    }
    
    return 'http://localhost:10000';
  }

  static setDeviceServerIP(ip) {
    localStorage.setItem('device_server_ip', ip);
    console.log(`Device server IP set to: ${ip}`);
  }

  static getDebugInfo() {
    return {
      environment: this.getEnvironment(),
      browser_origin: window.location.origin,
      API_BASE: this.getAPI_BASE(),
      using_local_override: !!localStorage.getItem('api_force_local'),
      platform: window.Capacitor?.getPlatform?.() || 'web',
      hostname: window.location.hostname,
      isNativePlatform: window.Capacitor?.isNativePlatform?.(),
      userAgent: navigator.userAgent
    };
  }
}

/**
 * API Client
 * Unified API interface for all backend calls
 */
class API {
  static async request(endpoint, options = {}) {
    const API_BASE = ApiConfig.getAPI_BASE();
    const url = `${API_BASE}${endpoint}`;

    const defaultHeaders = {
      'Content-Type': 'application/json'
    };

    const token = this.getToken();
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    // Check backend availability (result is cached for 30s to avoid 2× requests per call)
    if (!await this.isHealthy()) {
      throw new Error('Backend service is currently unavailable. Please try again later.');
    }

    try {
      const response = await fetch(url, {
        headers: {
          ...defaultHeaders,
          ...options.headers
        },
        ...options
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.handleUnauthorized();
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      // Don't spam logs for connection errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.warn(`Backend connection failed [${endpoint}]: Service may be unavailable`);
      } else {
        console.error(`API Error [${endpoint}]:`, error);
      }
      throw error;
    }
  }

  /** Cached health result — avoids a preflight request on every single API call */
  static _healthCache = { ok: null, checkedAt: 0 };
  static async isHealthy() {
    if (Date.now() - this._healthCache.checkedAt < 30000) return this._healthCache.ok;
    const ok = await this.checkBackendHealth();
    this._healthCache = { ok, checkedAt: Date.now() };
    return ok;
  }

  static async checkBackendHealth() {
    try {
      const API_BASE = ApiConfig.getAPI_BASE();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s faster timeout
      const response = await fetch(`${API_BASE}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      console.warn('Backend health check failed:', error.name, error.message);
      return false;
    }
  }

  static getToken() {
    return localStorage.getItem('token') || '';
  }

  static setToken(token) {
    localStorage.setItem('token', token);
  }

  static clearToken() {
    localStorage.removeItem('token');
  }

  static handleUnauthorized() {
    this.clearToken();
    localStorage.removeItem('user');
    // Redirect to login
    if (window.router) {
      window.router.navigate('/');
    } else {
      window.location.href = '/';
    }
  }

  // ===== Auth Endpoints =====
  static auth = {
    login: (email, password) => API.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),

    register: (userData) => API.request('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    }),

    logout: () => API.request('/api/v1/auth/logout', {
      method: 'POST'
    }),

    verifyEmail: (token) => API.request('/api/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token })
    }),

    resendVerification: (email) => API.request('/api/v1/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email })
    }),

    getSchedule: () => API.request('/api/v1/auth/schedule'),

    updateSchedule: (schedule) => API.request('/api/v1/auth/schedule', {
      method: 'PUT',
      body: JSON.stringify({ schedule })
    })
  };

  // ===== Clients Endpoints =====
  static clients = {
    getAll: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/api/clients?${params}`);
    },
    
    getOne: (id) => API.request(`/api/clients/${id}`),
    
    create: (data) => API.request('/api/clients', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    update: (id, data) => API.request(`/api/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

    delete: (id) => API.request(`/api/clients/${id}`, {
      method: 'DELETE'
    })
  };

  // ===== Logs Endpoints =====
  static logs = {
    getAll: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/api/logs?${params}`);
    },
    
    create: (data) => API.request('/api/logs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    update: (id, data) => API.request(`/api/logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

    delete: (id) => API.request(`/api/logs/${id}`, {
      method: 'DELETE'
    })
  };

  // ===== Users Endpoints (merged — see second definition below) =====

  // ===== Programs Endpoints =====
  static programs = {
    getAll: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/api/programs?${params}`);
    },
    
    getOne: (id) => API.request(`/api/programs/${id}`),

    create: (data) => API.request('/api/programs', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    update: (id, data) => API.request(`/api/programs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

    delete: (id) => API.request(`/api/programs/${id}`, {
      method: 'DELETE'
    })
  };

  // ===== Orders Endpoints =====
  static orders = {
    getAll: () => API.request('/api/orders'),
    
    getOne: (id) => API.request(`/api/orders/${id}`),

    create: (data) => API.request('/api/orders', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    update: (id, data) => API.request(`/api/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  };

  // ===== Cart Endpoints =====
  static cart = {
    get: () => API.request('/api/v1/cart'),

    addItem: (itemId, quantity) => API.request('/api/v1/cart/add', {
      method: 'POST',
      body: JSON.stringify({ programId: itemId, quantity })
    }),

    updateItem: (itemId, quantity) => API.request(`/api/v1/cart/update/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ quantity })
    }),

    removeItem: (itemId) => API.request(`/api/v1/cart/remove/${itemId}`, {
      method: 'DELETE'
    }),

    clear: () => API.request('/api/v1/cart/clear', {
      method: 'DELETE'
    })
  };

  // ===== Notifications Endpoints =====
  static notifications = {
    getAll: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/api/notifications?${params}`);
    },

    markAsRead: (id) => API.request(`/api/notifications/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ read: true })
    }),

    delete: (id) => API.request(`/api/notifications/${id}`, {
      method: 'DELETE'
    })
  };

  // ===== Sleep Endpoints =====
  static sleep = {
    getAll: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/api/sleep?${params}`);
    },

    create: (data) => API.request('/api/sleep', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  };

  // ===== Appointments Endpoints =====
  static appointments = {
    getAll: (filters = {}) => {
      const params = new URLSearchParams(filters).toString();
      return API.request(`/api/appointments?${params}`);
    },

    getUserAppointments: () => API.request('/api/appointments/user'),

    getOne: (id) => API.request(`/api/appointments/${id}`),

    create: (data) => API.request('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

    update: (id, data) => API.request(`/api/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

    delete: (id) => API.request(`/api/appointments/${id}`, {
      method: 'DELETE'
    })
  };

 
  // ===== Cache Endpoints =====
  static cache = {
    getVersions: () => API.request('/api/cache-versions')
  };

  // ===== Users Endpoints =====
  static users = {
    getTrainers: () => API.request('/api/v1/users/trainers'),

    getAdmins: () => API.request('/api/v1/users/admins'),

    getProfile: () => API.request('/api/v1/users/profile'),

    updateProfile: (data) => API.request('/api/v1/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

    changePassword: (oldPassword, newPassword) => API.request('/api/v1/users/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword })
    }),

    getAll: () => API.request('/api/v1/users'),

    getOne: (id) => API.request(`/api/v1/users/${id}`),

    delete: (id) => API.request(`/api/v1/users/${id}`, {
      method: 'DELETE'
    })
  };
}

// Make API globally available
window.API = API;
window.ApiConfig = ApiConfig;