// logout.js

window.API_BASE = window.ApiConfig.getAPI_BASE();

async function logoutUser() {
    try {
        // Server clears the httpOnly cookie and increments token version
        await fetch(`${window.API_BASE}/api/v1/auth/logout`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (err) {
        console.error('Logout: error calling logout API:', err);
    }

    localStorage.removeItem('userRole');
    window.location.replace('/');
}

async function checkSessionAndRedirect() {
    try {
        const response = await fetch(`${window.API_BASE}/api/v1/auth/me`, {
            credentials: 'include',
        });
        if (!response.ok) {
            window.location.replace('/login');
        }
    } catch {
        window.location.replace('/login');
    }
}

function attachLogoutListener() {
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            logoutUser();
        });
    }
}

window.attachLogoutListener = attachLogoutListener;
window.checkSessionAndRedirect = checkSessionAndRedirect;
window.logoutUser = logoutUser;
