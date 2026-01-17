// role-guard.js - Frontend role-based access control
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');
  const currentPage = window.location.pathname.split('/').pop();
  
  // Define protected routes and their required roles
  const protectedRoutes = {
    'dashboard.html': 'user' // Both admin and user can access user dashboard
  };

  // Check if current page is protected
  if (protectedRoutes[currentPage]) {
    const requiredRole = protectedRoutes[currentPage];

    // If no token, redirect to login
    if (!token) {
      window.location.href = '../pages/login.html';
      return;
    }

    // Optional: Verify token validity with backend
    verifyToken(token);
  }
  
  async function verifyToken(token) {
    try {
      const API_BASE = window.ApiConfig.getAPI_BASE();      
      const response = await fetch(`${window.API_BASE}
/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        // Token is invalid or expired
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        window.location.href = '../pages/login.html';
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('userRole');
      window.location.href = '../pages/login.html';
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
  window.location.href = '../pages/login.html';
}
