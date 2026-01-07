// logout.js

// Function to handle the logout process
function logoutUser() {
    // Remove the JWT token from localStorage
    localStorage.removeItem('token');
    console.log('Logout: Token removed from localStorage.');

    // Redirect the user to the login page
    // Adjust the path if your login page is located elsewhere
    window.location.href = '../index.html';
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

// Make attachLogoutListener globally available
window.attachLogoutListener = attachLogoutListener;

// You might also want to call logoutUser() if a certain API call returns 401/403
// For example, in your fetchClients or profile fetch functions, if a 401 status
// is received, you could programmatically call logoutUser().
