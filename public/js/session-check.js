// session-check.js - Client-side session validation for protected pages

// Determine the base URL

const API_BASE = window.ApiConfig.getBaseURL();
// Function to check if user session is valid
async function checkSession() {
    const token = localStorage.getItem('token');
    if (!token) {
        // No token, redirect to login
        redirectToLogin();
        return false;
    }

    try {
        // Verify token with server
        const response = await fetch(`${API_BASE}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            // Token invalid, clear local storage and redirect
            localStorage.removeItem('token');
            localStorage.removeItem('userRole');
            redirectToLogin();
            return false;
        }

        // Session valid
        return true;
    } catch (error) {
        console.error('Session check error:', error);
        // On error, assume invalid and redirect
        localStorage.removeItem('token');
        localStorage.removeItem('userRole');
        redirectToLogin();
        return false;
    }
}

// Function to redirect to login page
function redirectToLogin() {
    // Use replace to prevent back button from showing cached page
    window.location.replace('../pages/login.html');
}

// Function to check session and redirect if invalid
async function checkSessionAndRedirect() {
    await checkSession();
}

// Run session check when page loads
document.addEventListener('DOMContentLoaded', function() {
    checkSessionAndRedirect();
});

// Export functions for global use
window.checkSession = checkSession;
window.checkSessionAndRedirect = checkSessionAndRedirect;
