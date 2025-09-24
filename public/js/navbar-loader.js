// Load the uniform navbar into the placeholder
document.addEventListener('DOMContentLoaded', function() {
    const navbarPlaceholder = document.getElementById('navbar-placeholder');
    if (navbarPlaceholder) {
        fetch('../pages/partials/navbar.html')
            .then(response => response.text())
            .then(html => {
                navbarPlaceholder.innerHTML = html;
                // After loading, set the active link
                setActiveNavLink();
                // Re-attach logout event listener after navbar is loaded
                attachLogoutListener();
            })
            .catch(error => console.error('Error loading navbar:', error));
    }
});

// Function to set the active class on the current page's nav link
function setActiveNavLink() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('#navbarNav .nav-link');

    navLinks.forEach(link => {
        link.classList.remove('active');
        const href = link.getAttribute('href');
        if (href && (currentPath.endsWith(href) || (href === 'dashboard.html' && currentPath.endsWith('/dashboard.html')))) {
            link.classList.add('active');
        }
    });
}

// Function to attach logout event listener to dynamically loaded navbar
function attachLogoutListener() {
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        // Remove any existing event listeners to prevent duplicates
        logoutButton.removeEventListener('click', handleLogout);
        // Add the event listener
        logoutButton.addEventListener('click', handleLogout);
    }
}

// Logout handler function
function handleLogout(event) {
    event.preventDefault(); // Prevent default link behavior

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
