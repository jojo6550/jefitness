// logout.js

// Determine the base URL
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jefitness.onrender.com';

// Function to handle the logout process
async function logoutUser() {
    const token = localStorage.getItem('token');

    if (token) {
        try {
            // Call the logout API to invalidate the session on the server
            const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                console.log('Logout: Server-side logout successful.');
            } else {
                console.warn('Logout: Server-side logout failed, but proceeding with client-side cleanup.');
            }
        } catch (error) {
            console.error('Logout: Error calling logout API:', error);
            // Continue with client-side logout even if API call fails
        }
    }

    // Remove the JWT token from localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('userRole');
    console.log('Logout: Token and user data removed from localStorage.');

    // Redirect the user to the dashboard page (which will check session and redirect to login if invalid)
    // Use replace to prevent back button from showing cached page
    window.location.replace('../pages/dashboard.html');
}

// Function to attach the logout event listener
function attachLogoutListener() {
    // Attach the logout function to the logout button
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', function(event) {
            event.preventDefault(); // Prevent default link behavior
            logoutUser();
        });
    }
}

// Function to check session validity and redirect if invalid
async function checkSessionAndRedirect() {
    const token = localStorage.getItem('token');
    if (!token) {
        // No token, redirect to login
        window.location.replace('../pages/login.html');
        return;
    }

    try {
        // Try to access a protected endpoint to verify token
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            // Token invalid, logout and redirect
            console.warn('Session check failed, logging out.');
            logoutUser();
        }
    } catch (error) {
        console.error('Session check error:', error);
        // On error, assume invalid and logout
        logoutUser();
    }
}

// Make functions globally available
window.attachLogoutListener = attachLogoutListener;
window.checkSessionAndRedirect = checkSessionAndRedirect;
window.logoutUser = logoutUser;

// You might also want to call logoutUser() if a certain API call returns 401/403
// For example, in your fetchClients or profile fetch functions, if a 401 status
// is received, you could programmatically call logoutUser().
