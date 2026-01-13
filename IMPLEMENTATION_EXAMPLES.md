# JE Fitness Mobile App - Implementation Examples

Real-world examples for updating your existing JavaScript files to work with Capacitor.

---

## Example 1: Update Authentication File

### Current `public/js/auth.js` (Web Version)

```javascript
// OLD: Direct fetch calls
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  
  try {
    const response = await fetch('http://localhost:10000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.location.href = '/dashboard.html';
    } else {
      alert('Login failed: ' + data.message);
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('Network error occurred');
  }
});
```

### Updated `public/js/auth.js` (Mobile Version)

```javascript
// NEW: Using API class for multi-platform support
class AuthModule {
  static init() {
    this.setupLoginForm();
    this.setupRegisterForm();
    this.checkAuthStatus();
  }

  static async setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleLogin();
    });
  }

  static async handleLogin() {
    const email = document.getElementById('email')?.value;
    const password = document.getElementById('password')?.value;

    if (!email || !password) {
      this.showError('Email and password are required');
      return;
    }

    this.showLoading(true);

    try {
      const data = await API.auth.login(email, password);
      
      // Store token and user
      API.setToken(data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      this.showSuccess('Login successful!');
      
      // Navigate using router if available, otherwise redirect
      setTimeout(() => {
        if (window.router) {
          window.router.navigate('/dashboard');
        } else {
          window.location.href = '/dashboard.html';
        }
      }, 1000);
      
    } catch (error) {
      this.showError(`Login failed: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  static async setupRegisterForm() {
    const registerForm = document.getElementById('registerForm');
    if (!registerForm) return;

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleRegister();
    });
  }

  static async handleRegister() {
    const formData = {
      name: document.getElementById('name')?.value,
      email: document.getElementById('email')?.value,
      password: document.getElementById('password')?.value,
      confirmPassword: document.getElementById('confirmPassword')?.value
    };

    if (formData.password !== formData.confirmPassword) {
      this.showError('Passwords do not match');
      return;
    }

    this.showLoading(true);

    try {
      const data = await API.auth.register(formData);
      
      this.showSuccess('Registration successful! Please log in.');
      
      setTimeout(() => {
        if (window.router) {
          window.router.navigate('/');
        } else {
          window.location.href = '/index.html';
        }
      }, 2000);
      
    } catch (error) {
      this.showError(`Registration failed: ${error.message}`);
    } finally {
      this.showLoading(false);
    }
  }

  static checkAuthStatus() {
    const token = API.getToken();
    if (!token) {
      const protectedPages = ['/dashboard', '/profile', '/admin'];
      const currentPath = window.router?.currentPage || window.location.pathname;
      
      if (protectedPages.includes(currentPath)) {
        if (window.router) {
          window.router.navigate('/');
        } else {
          window.location.href = '/index.html';
        }
      }
    }
  }

  static showLoading(show) {
    const btn = document.querySelector('[type="submit"]');
    if (show) {
      btn?.setAttribute('disabled', 'disabled');
      btn?.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
    } else {
      btn?.removeAttribute('disabled');
      btn?.innerHTML = 'Submit';
    }
  }

  static showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.insertAdjacentElement('afterbegin', alert);
    setTimeout(() => alert.remove(), 5000);
  }

  static showSuccess(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-success alert-dismissible fade show';
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.insertAdjacentElement('afterbegin', alert);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => AuthModule.init());
} else {
  AuthModule.init();
}
```

---

## Example 2: Update Dashboard File

### Current `public/js/dashboard.js` (Web Version)

```javascript
// OLD: Direct API calls with hardcoded URLs
async function loadDashboard() {
  try {
    // Get user profile
    const userRes = await fetch('http://localhost:10000/api/users/profile', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const userData = await userRes.json();

    // Get programs
    const programsRes = await fetch('http://localhost:10000/api/programs');
    const programsData = await programsRes.json();

    // Get logs
    const logsRes = await fetch('http://localhost:10000/api/logs', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const logsData = await logsRes.json();

    renderDashboard(userData, programsData, logsData);
  } catch (error) {
    console.error('Failed to load dashboard:', error);
  }
}

loadDashboard();
```

### Updated `public/js/dashboard.js` (Mobile Version)

```javascript
// NEW: Using API class with error handling and loading states
class DashboardModule {
  static async init() {
    // Check authentication
    if (!API.getToken()) {
      if (window.router) {
        window.router.navigate('/');
      } else {
        window.location.href = '/index.html';
      }
      return;
    }

    this.showLoading();
    await this.loadDashboard();
  }

  static async loadDashboard() {
    try {
      // Load all data in parallel
      const [userData, programsData, logsData] = await Promise.all([
        API.users.getProfile(),
        API.programs.getAll(),
        API.logs.getAll()
      ]);

      this.renderDashboard(userData, programsData, logsData);
      this.setupEventListeners();
      
    } catch (error) {
      console.error('Failed to load dashboard:', error);
      this.showError(`Failed to load dashboard: ${error.message}`);
    } finally {
      this.hideLoading();
    }
  }

  static renderDashboard(user, programs, logs) {
    const dashboard = document.getElementById('dashboard-content');
    
    if (!dashboard) {
      console.warn('Dashboard container not found');
      return;
    }

    const programsHTML = programs.slice(0, 3).map(program => `
      <div class="col-md-4 mb-3">
        <div class="card">
          <div class="card-body">
            <h5 class="card-title">${program.name}</h5>
            <p class="card-text">${program.description || 'No description'}</p>
            <button class="btn btn-primary btn-sm" data-program-id="${program._id}">
              View Details
            </button>
          </div>
        </div>
      </div>
    `).join('');

    const logsHTML = logs.slice(0, 5).map(log => `
      <tr>
        <td>${new Date(log.date).toLocaleDateString()}</td>
        <td>${log.exercise}</td>
        <td>${log.duration} min</td>
        <td>${log.intensity || 'N/A'}</td>
      </tr>
    `).join('');

    dashboard.innerHTML = `
      <div class="container mt-4">
        <div class="row mb-4">
          <div class="col-md-12">
            <h1>Welcome, ${user.name || 'User'}!</h1>
            <p class="text-muted">Last login: ${new Date().toLocaleString()}</p>
          </div>
        </div>

        <div class="row mb-4">
          <div class="col-md-12">
            <h3>Recent Programs</h3>
            <div class="row">
              ${programsHTML}
            </div>
          </div>
        </div>

        <div class="row">
          <div class="col-md-12">
            <h3>Recent Logs</h3>
            <div class="table-responsive">
              <table class="table table-striped">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Exercise</th>
                    <th>Duration</th>
                    <th>Intensity</th>
                  </tr>
                </thead>
                <tbody>
                  ${logsHTML}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  static setupEventListeners() {
    document.addEventListener('click', async (e) => {
      if (e.target.hasAttribute('data-program-id')) {
        const programId = e.target.getAttribute('data-program-id');
        await this.viewProgramDetails(programId);
      }
    });
  }

  static async viewProgramDetails(programId) {
    try {
      const program = await API.programs.getOne(programId);
      
      const modal = document.createElement('div');
      modal.className = 'modal fade';
      modal.innerHTML = `
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">${program.name}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <p>${program.description}</p>
              <h6>Duration:</h6>
              <p>${program.duration} days</p>
              <h6>Level:</h6>
              <p>${program.level || 'All levels'}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              <button type="button" class="btn btn-primary">Enroll Now</button>
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      const bsModal = new window.bootstrap.Modal(modal);
      bsModal.show();
      
    } catch (error) {
      console.error('Error loading program:', error);
      this.showError('Failed to load program details');
    }
  }

  static showLoading() {
    const loader = document.createElement('div');
    loader.id = 'dashboard-loader';
    loader.className = 'd-flex justify-content-center align-items-center';
    loader.style.cssText = 'min-height: 400px;';
    loader.innerHTML = '<div class="spinner-border"></div>';
    
    const container = document.getElementById('dashboard-content') || document.body;
    container.innerHTML = '';
    container.appendChild(loader);
  }

  static hideLoading() {
    const loader = document.getElementById('dashboard-loader');
    if (loader) loader.remove();
  }

  static showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.insertAdjacentElement('afterbegin', alert);
    setTimeout(() => alert.remove(), 5000);
  }
}

// Initialize when DOM and resources are ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Wait for resources to load
    if (window.ResourceLoader?.isResourcesLoaded?.()) {
      DashboardModule.init();
    } else {
      window.addEventListener('resources-loaded', () => DashboardModule.init());
    }
  });
} else {
  DashboardModule.init();
}
```

---

## Example 3: Update HTML Navigation Links

### Current HTML (Web Version)

```html
<!-- pages/dashboard.html -->
<nav class="navbar navbar-dark bg-dark">
  <div class="container">
    <a class="navbar-brand" href="index.html">JE Fitness</a>
    <ul class="navbar-nav ms-auto">
      <li class="nav-item">
        <a class="nav-link" href="dashboard.html">Dashboard</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="profile.html">Profile</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="admin-dashboard.html">Admin</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="#" onclick="logout()">Logout</a>
      </li>
    </ul>
  </div>
</nav>
```

### Updated HTML (Mobile Version)

```html
<!-- Keep the same structure but update links -->
<nav class="navbar navbar-dark bg-dark">
  <div class="container">
    <a class="navbar-brand" href="/" data-route>JE Fitness</a>
    <ul class="navbar-nav ms-auto">
      <li class="nav-item">
        <a class="nav-link" href="/dashboard" data-route>Dashboard</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="/profile" data-route>Profile</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="/admin" data-route>Admin</a>
      </li>
      <li class="nav-item">
        <a class="nav-link" href="#" id="logout-btn">Logout</a>
      </li>
    </ul>
  </div>
</nav>

<script>
  document.getElementById('logout-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await API.auth.logout();
      API.clearToken();
      localStorage.removeItem('user');
      if (window.router) {
        window.router.navigate('/');
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      console.log('Logout error:', error);
      // Still logout locally
      API.clearToken();
      localStorage.removeItem('user');
      if (window.router) {
        window.router.navigate('/');
      }
    }
  });
</script>
```

---

## Example 4: Add to `www/index.html` Head Section

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#007bff">
    <meta name="description" content="JE Fitness - Mobile App">
    <title>JE Fitness</title>
    
    <!-- Capacitor Scripts (REQUIRED) -->
    <script src="capacitor/capacitor.js"></script>
    <script src="capacitor/init.js"></script>
    
    <!-- Bootstrap CSS -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css">
    
    <!-- Local Custom CSS -->
    <link rel="stylesheet" href="css/styles.css">
    
    <!-- Resource Loader (loads all external assets with fallbacks) -->
    <script src="js/loader.js"></script>
    
    <!-- API Configuration -->
    <script src="js/api.config.js"></script>
    
    <!-- Router for multi-page navigation -->
    <script src="js/router.js"></script>
    
    <!-- Navigation Component -->
    <script src="js/navigation.js"></script>
</head>
<body>
    <!-- Navigation will be inserted here by navigation.js -->
    
    <!-- Main content area -->
    <div id="app-content" class="container mt-4">
        <!-- Page content will be rendered here -->
    </div>

    <!-- Bootstrap JS -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
    
    <!-- Your app scripts -->
    <script src="js/app.js"></script>
</body>
</html>
```

---

## Example 5: Testing API in Browser Console

```javascript
// After the page loads, you can test in the browser console:

// 1. Check current environment
ApiConfig.getDebugInfo()
// Returns: { environment: "BROWSER", API_BASE: "http://localhost:10000", ... }

// 2. Test login (use test credentials)
await API.auth.login('test@example.com', 'password123')

// 3. Get user profile
await API.users.getProfile()

// 4. Get all programs
await API.programs.getAll()

// 5. Check current routing
window.router.getDebugInfo()

// 6. Navigate to a page
window.router.navigate('/dashboard')

// 7. Check cached pages
window.router.cache

// 8. Check API configuration
ApiConfig.getEnvironment()
```

---

## Example 6: Error Handling Pattern

```javascript
class APIService {
  static async handleRequest(promise, errorMessage = 'An error occurred') {
    try {
      return await promise;
    } catch (error) {
      console.error(errorMessage, error);
      
      // Handle specific error types
      if (error.message.includes('401')) {
        // Unauthorized - redirect to login
        API.clearToken();
        if (window.router) {
          window.router.navigate('/');
        }
      } else if (error.message.includes('500')) {
        // Server error
        this.showError('Server error. Please try again later.');
      } else if (error.message.includes('Failed to fetch')) {
        // Network error
        this.showError('Network error. Please check your connection.');
      } else {
        this.showError(errorMessage);
      }
      
      throw error;
    }
  }

  static showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
      <strong>Error:</strong> ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.insertAdjacentElement('afterbegin', alert);
    setTimeout(() => alert.remove(), 5000);
  }
}

// Usage
async function loadData() {
  const data = await APIService.handleRequest(
    API.programs.getAll(),
    'Failed to load programs'
  );
}
```

---

## Quick Migration Checklist for Each File

- [ ] Replace hardcoded `http://localhost:10000` URLs with `API` class methods
- [ ] Add error handling for network requests
- [ ] Use `window.router.navigate()` instead of `window.location.href`
- [ ] Add loading/spinning indicators
- [ ] Show user-friendly error messages
- [ ] Test in browser console first
- [ ] Test on Android emulator
- [ ] Test on iOS simulator (macOS)
- [ ] Test on physical device

---

These examples show the pattern to follow for updating all your JavaScript files to work seamlessly with both web and mobile environments!
