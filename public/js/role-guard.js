// role-guard.js - Frontend role-based access control
document.addEventListener('DOMContentLoaded', () => {
  const userRole = localStorage.getItem('userRole');
  const currentPage = window.location.pathname.split('/').pop();

  // Define protected routes and their required roles
  const protectedRoutes = {
    'dashboard.html': 'user' // Both admin and user can access user dashboard
  };

  // Check if current page is protected
  if (protectedRoutes[currentPage]) {
    // Verify session validity with backend (cookie is sent automatically)
    verifySession();
  }

  async function verifySession() {
    try {
      const API_BASE = window.ApiConfig.getAPI_BASE();
      const response = await fetch(`${API_BASE}/api/v1/auth/me`, {
        credentials: 'include'
      });

      if (!response.ok) {
        // Session is invalid or expired
        localStorage.removeItem('userRole');
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Session verification failed:', error);
      localStorage.removeItem('userRole');
      window.location.href = '/login';
    }
  }
});

// Utility function to check if user has required role
function hasRole(requiredRole) {
  const userRole = localStorage.getItem('userRole');
  return userRole === requiredRole;
}

// Utility function to logout
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('userRole');
  window.location.href = '/login';
}
