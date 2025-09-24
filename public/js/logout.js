// logout.js - Utility functions for logout functionality

// Global logout function that can be called from anywhere
function logoutUser() {
    // Remove the JWT token from localStorage
    localStorage.removeItem('token');
    console.log('Logout: Token removed from localStorage.');

    // Clear browser history to prevent back button access to authenticated pages
    if (window.history && window.history.replaceState) {
        // Replace current history entry to prevent going back
        window.history.replaceState(null, null, window.location.href);
    }

    // Use replace instead of href to prevent caching
    window.location.replace('../index.html');
}

// Function to handle logout on 401/403 responses
function handleAuthError() {
    console.log('Authentication error detected, logging out...');
    logoutUser();
}

// Export functions for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { logoutUser, handleAuthError };
}
