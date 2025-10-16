// Load the uniform navbar into the placeholder
document.addEventListener('DOMContentLoaded', function() {
    const navbarPlaceholder = document.getElementById('navbar-placeholder');
    if (navbarPlaceholder) {
        fetch('../../pages/partials/navbar.html')
            .then(response => response.text())
            .then(html => {
                navbarPlaceholder.innerHTML = html;
                // After loading, set the active link
                setActiveNavLink();
                // Attach the logout listener after navbar is loaded
                if (window.attachLogoutListener) {
                    window.attachLogoutListener();
                }
                // Initialize dashboard if function exists
                if (window.initDashboard) {
                    window.initDashboard();
                }
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
