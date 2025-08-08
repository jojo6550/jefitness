// role-guard.js - Frontend role-based access control
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('token');
  const userRole = localStorage.getItem('userRole');
  const currentPage = window.location.pathname.split('/').pop();
  
  // Define protected routes and their required roles
  const protectedRoutes = {
    'admin-dashboard.html': 'admin',
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
    
    // If accessing admin dashboard without admin role
    if (currentPage === 'admin-dashboard.html' && userRole !== 'admin') {
      alert('Access denied. Admin privileges required.');
      window.location.href = '../pages/dashboard.html';
      return;
    }
    
    // Optional: Verify token validity with backend
    verifyToken(token);
  }
  
  async function verifyToken(token) {
    try {
      const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const baseUrl = isLocalhost ? 'http://localhost:5000' : 'http://localhost:5001';
      
      const response = await fetch(`${baseUrl}/api/auth/me`, {
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
