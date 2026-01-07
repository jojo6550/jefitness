/**
 * Client-Side Router
 * Enables multi-page navigation within a single HTML file for mobile apps
 */

class Router {
  constructor(routes = {}) {
    this.routes = {
      '/': 'index.html',
      '/dashboard': 'pages/dashboard.html',
      '/profile': 'pages/profile.html',
      '/admin': 'pages/admin-dashboard.html',
      '/schedule': 'pages/schedule.html',
      '/services': 'pages/services.html',
      '/marketplace': 'pages/marketplace.html',
      '/orders': 'pages/orders.html',
      '/reports': 'pages/reports.html',
      '/questionnaire': 'pages/questionnaire.html',
      '/timer': 'pages/timer.html',
      '/checkout': 'pages/checkout.html',
      ...routes
    };
    
    this.currentPage = null;
    this.previousPage = null;
    this.cache = {};
    this.init();
  }

  init() {
    // Handle initial route
    const path = window.location.pathname || '/';
    this.navigate(path);

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      this.navigate(e.state?.path || '/', false);
    });

    // Handle link clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-route]');
      if (link) {
        e.preventDefault();
        const route = link.getAttribute('href');
        this.navigate(route);
      }
    });

    // Keyboard navigation (back button on mobile)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Backspace') {
        e.preventDefault();
        this.goBack();
      }
    });
  }

  async navigate(path, pushState = true) {
    if (this.currentPage === path) return;

    // Check if route exists
    if (!this.routes[path]) {
      console.warn(`Route not found: ${path}`);
      path = '/';
    }

    const filePath = this.routes[path];
    
    try {
      // Show loading state
      this.showLoading();

      // Load page content
      const html = await this.loadPage(filePath);
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract body content
      const newContent = doc.body.innerHTML;
      
      // Store previous page
      this.previousPage = this.currentPage;
      
      // Update DOM
      document.body.innerHTML = newContent;
      
      // Update history
      if (pushState) {
        window.history.pushState({ path }, '', path);
      }
      
      this.currentPage = path;
      
      // Reinitialize components and scripts
      this.reinitializeScripts(doc);
      this.reinitializeBootstrap();
      
      // Emit custom event
      window.dispatchEvent(new CustomEvent('routechange', { detail: { path, previous: this.previousPage } }));
      
      // Hide loading state
      this.hideLoading();
      
    } catch (error) {
      console.error('Navigation error:', error);
      this.showError(`Failed to load page: ${error.message}`);
    }
  }

  async loadPage(filePath) {
    // Check cache first
    if (this.cache[filePath]) {
      console.log(`Loaded from cache: ${filePath}`);
      return this.cache[filePath];
    }

    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`Failed to load ${filePath}`);
    
    const html = await response.text();
    this.cache[filePath] = html; // Cache for faster navigation
    return html;
  }

  reinitializeScripts(doc) {
    // Reinitialize Bootstrap components
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(script => {
      if (script.src && (script.src.includes('app.js') || script.src.includes('dashboard.js') || 
                         script.src.includes('profile.js') || script.src.includes('auth.js'))) {
        const newScript = document.createElement('script');
        newScript.src = script.src;
        newScript.async = true;
        newScript.onerror = () => console.warn(`Failed to load script: ${script.src}`);
        document.body.appendChild(newScript);
      }
    });
  }

  reinitializeBootstrap() {
    // Reinitialize Bootstrap components (dropdowns, modals, tooltips, etc.)
    if (window.bootstrap) {
      const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.map(tooltipTriggerEl => new window.bootstrap.Tooltip(tooltipTriggerEl));

      const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
      popoverTriggerList.map(popoverTriggerEl => new window.bootstrap.Popover(popoverTriggerEl));

      const collapseElementList = [].slice.call(document.querySelectorAll('.collapse'));
      collapseElementList.map(collapseEl => new window.bootstrap.Collapse(collapseEl, { toggle: false }));
    }
  }

  goBack() {
    if (this.previousPage) {
      this.navigate(this.previousPage, false);
    } else {
      window.history.back();
    }
  }

  showLoading() {
    let loader = document.getElementById('page-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'page-loader';
      loader.innerHTML = `
        <div class="spinner-border" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
      `;
      loader.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
        background: rgba(255, 255, 255, 0.9);
        padding: 20px;
        border-radius: 8px;
      `;
      document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
    loader.style.justifyContent = 'center';
    loader.style.alignItems = 'center';
  }

  hideLoading() {
    const loader = document.getElementById('page-loader');
    if (loader) {
      loader.style.display = 'none';
    }
  }

  showError(message) {
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-danger alert-dismissible fade show';
    alertDiv.role = 'alert';
    alertDiv.innerHTML = `
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    document.body.insertAdjacentElement('afterbegin', alertDiv);

    setTimeout(() => alertDiv.remove(), 5000);
  }

  clearCache() {
    this.cache = {};
    console.log('Route cache cleared');
  }

  getDebugInfo() {
    return {
      currentPage: this.currentPage,
      previousPage: this.previousPage,
      availableRoutes: Object.keys(this.routes),
      cacheSize: Object.keys(this.cache).length
    };
  }
}

// Initialize router when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.router = new Router();
    console.log('Router initialized');
  });
} else {
  window.router = new Router();
  console.log('Router initialized');
}

// Make router globally available
window.Router = Router;