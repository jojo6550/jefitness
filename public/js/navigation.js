/**
 * Navigation Component
 * Manages app navigation with role-based menu items
 */

class Navigation {
  constructor() {
    this.menuItems = [
      { label: 'Home', route: '/', icon: 'house', roleRequired: null },
      { label: 'Dashboard', route: '/dashboard', icon: 'speedometer2', roleRequired: 'user' },
      { label: 'Trainer Dashboard', route: '/trainer', icon: 'speedometer2', roleRequired: 'trainer' },
      { label: 'My Profile', route: '/profile', icon: 'person-circle', roleRequired: null },
      { label: 'Schedule', route: '/schedule', icon: 'calendar-event', roleRequired: 'user' },
      { label: 'Services', route: '/services', icon: 'briefcase', roleRequired: null },
      { label: 'My Orders', route: '/orders', icon: 'bag-check', roleRequired: 'user' },
      { label: 'Reports', route: '/reports', icon: 'bar-chart', roleRequired: 'user' },
      { label: 'Questionnaire', route: '/questionnaire', icon: 'clipboard-check', roleRequired: null },
      { label: 'Timer', route: '/timer', icon: 'stopwatch', roleRequired: 'user' },
      { label: 'Clients', route: '/clients', icon: 'people', roleRequired: 'trainer' },
      { label: 'Appointments', route: '/appointments', icon: 'calendar-check', roleRequired: 'trainer' },
      { label: 'Admin', route: '/admin', icon: 'gear', roleRequired: 'admin' }
    ];
    
    this.currentUser = this.getCurrentUser();
    this.isMenuOpen = false;
  }

  getCurrentUser() {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
      return null;
    }
  }

  getVisibleMenuItems() {
    return this.menuItems.filter(item => {
      // If item requires a role, check if user has it
      if (item.roleRequired) {
        return this.currentUser?.role === item.roleRequired;
      }
      // Show to logged in users only
      return this.currentUser !== null;
    });
  }

  isActive(route) {
    return window.router?.currentPage === route;
  }

  render() {
    const items = this.getVisibleMenuItems();
    const userName = this.currentUser?.name || 'Guest';
    const userRole = this.currentUser?.role || 'user';

    return `
      <nav class="navbar navbar-expand-lg navbar-dark bg-dark sticky-top">
        <div class="container-fluid">
          <a class="navbar-brand fw-bold" href="/" data-route>
            <i class="bi bi-lightning-fill"></i> JE Fitness
          </a>
          
          <button 
            class="navbar-toggler" 
            type="button" 
            data-bs-toggle="collapse" 
            data-bs-target="#navbarNav"
            aria-controls="navbarNav" 
            aria-expanded="false" 
            aria-label="Toggle navigation"
          >
            <span class="navbar-toggler-icon"></span>
          </button>
          
          <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="navbar-nav ms-auto">
              ${items.map(item => `
                <li class="nav-item">
                  <a 
                    class="nav-link ${this.isActive(item.route) ? 'active' : ''}" 
                    href="${item.route}" 
                    data-route
                    aria-current="${this.isActive(item.route) ? 'page' : 'false'}"
                  >
                    <i class="bi bi-${item.icon}"></i> ${item.label}
                  </a>
                </li>
              `).join('')}
              
              <li class="nav-item dropdown">
                <a 
                  class="nav-link dropdown-toggle" 
                  href="#" 
                  id="userDropdown" 
                  role="button" 
                  data-bs-toggle="dropdown" 
                  aria-expanded="false"
                >
                  <i class="bi bi-person"></i> ${userName}
                </a>
                <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userDropdown">
                  <li><span class="dropdown-item-text">Role: <strong>${userRole}</strong></span></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><a class="dropdown-item" href="/profile" data-route><i class="bi bi-gear"></i> Settings</a></li>
                  <li><hr class="dropdown-divider"></li>
                  <li><a class="dropdown-item" id="logout-btn" href="#"><i class="bi bi-box-arrow-right"></i> Logout</a></li>
                </ul>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    `;
  }

  mount(selector = 'body') {
    const container = document.querySelector(selector);
    if (!container) {
      console.error(`Container selector not found: ${selector}`);
      return;
    }

    const navbar = this.render();
    container.insertAdjacentHTML('afterbegin', navbar);

    // Add logout handler
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });
    }
  }

  async logout() {
    try {
      await API.auth.logout();
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally {
      // Clear local storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Navigate to home
      if (window.router) {
        window.router.navigate('/');
      } else {
        window.location.href = '/';
      }
    }
  }

  update(user) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    } else {
      localStorage.removeItem('user');
    }
    // Re-render navbar
    const navbar = document.querySelector('nav.navbar');
    if (navbar) {
      navbar.remove();
      this.mount();
    }
  }

  static init() {
    const nav = new Navigation();
    nav.mount();
    window.navigation = nav;
  }
}

// Initialize navigation when resources are loaded and DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (window.ResourceLoader?.isResourcesLoaded?.()) {
      Navigation.init();
    } else {
      window.addEventListener('resources-loaded', Navigation.init);
    }
  });
} else {
  Navigation.init();
}

// Make globally available
window.Navigation = Navigation;