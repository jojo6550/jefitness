// logout.js

document.addEventListener('DOMContentLoaded', function() {
    // Function to handle the logout process
    function logoutUser() {
        // Remove the JWT token from localStorage
        localStorage.removeItem('token');
        console.log('Logout: Token removed from localStorage.');

        // Redirect the user to the login page
        // Adjust the path if your login page is located elsewhere
        window.location.href = '../index.html';
    }

    // Attach the logout function to a global event or specific button
    // For simplicity, we'll look for an element with id 'logoutButton'
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', function(event) {
            event.preventDefault(); // Prevent default link behavior
            logoutUser();
        });
    }

    // You might also want to call logoutUser() if a certain API call returns 401/403
    // For example, in your fetchClients or profile fetch functions, if a 401 status
    // is received, you could programmatically call logoutUser().
});
