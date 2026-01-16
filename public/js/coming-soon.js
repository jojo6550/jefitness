/**
 * Coming Soon Page
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Replace product links with "Coming Soon" alerts
    const productLinks = document.querySelectorAll('a[href*="product"]');
    productLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            alert('This product is coming soon!');
        });
    });

    // Replace cart links
    const cartLinks = document.querySelectorAll('a[href*="cart"]');
    cartLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = 'pages/login.html';
            } else {
                alert('Cart feature is coming soon!');
            }
        });
    });

    logger.debug('Coming soon page initialized');
});
