document.addEventListener('DOMContentLoaded', async function() {
    const welcomeHeading = document.getElementById('welcomeUserName');

    // Function to get the JWT from localStorage
    function getAuthToken() {
        return localStorage.getItem('token');
    }

    // Function to fetch user data and update the heading
    async function updateWelcomeHeading() {
        const token = getAuthToken();

        if (!token) {
            console.warn('No authentication token found. Cannot fetch user data for dashboard.');
            // Optionally, redirect to login or show a generic welcome message
            if (welcomeHeading) {
                welcomeHeading.textContent = 'Welcome Back!';
            }
            return;
        }

        try {
            // Fetch user data from your profile endpoint
            // This assumes your /api/profile/me endpoint returns user details including firstName
            const response = await fetch('/api/profile/me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const userData = await response.json();

            if (response.ok && userData && userData.firstName) {
                if (welcomeHeading) {
                    welcomeHeading.textContent = `Welcome Back, ${userData.firstName}!`;
                }
            } else {
                console.error('Failed to fetch user data:', userData.msg || 'Unknown error');
                if (welcomeHeading) {
                    welcomeHeading.textContent = 'Welcome Back!'; // Fallback to generic
                }
            }
        } catch (error) {
            console.error('Network error while fetching user data for dashboard:', error);
            if (welcomeHeading) {
                welcomeHeading.textContent = 'Welcome Back!'; // Fallback to generic
            }
        }
    }

    // Call the function to update the heading when the DOM is loaded
    updateWelcomeHeading();

    // You can add other dashboard-specific JavaScript logic here later if needed
});
