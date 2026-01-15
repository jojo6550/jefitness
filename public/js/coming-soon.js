/**
 * Reusable function to replace product and cart links with "Coming Soon"
 * @param {boolean} enable - Whether to enable the "coming soon" replacement
 * @returns {boolean} - True if the replacement was successful
 */
function replaceProductCartLinks(enable) {
    if (!enable) {
        return false;
    }

    try {
        // Find all links to products.html and cart.html
        const productLinks = document.querySelectorAll('a[href*="products.html"]');
        const cartLinks = document.querySelectorAll('a[href*="cart.html"]');

        // Replace product links
        productLinks.forEach(link => {
            const parent = link.parentElement;
            if (parent && parent.classList.contains('nav-item')) {
                // Navbar links - replace with disabled span
                const comingSoonSpan = document.createElement('span');
                comingSoonSpan.className = 'nav-link text-muted';
                comingSoonSpan.innerHTML = '<i class="bi bi-clock me-2"></i>Products - Coming Soon';
                comingSoonSpan.style.cursor = 'not-allowed';
                parent.replaceChild(comingSoonSpan, link);
            } else if (parent && parent.classList.contains('card-body')) {
                // Dashboard card links - replace with disabled button
                const comingSoonBtn = document.createElement('button');
                comingSoonBtn.className = 'btn btn-outline-secondary mt-auto disabled';
                comingSoonBtn.innerHTML = '<i class="bi bi-clock me-2"></i>Coming Soon';
                comingSoonBtn.disabled = true;
                parent.replaceChild(comingSoonBtn, link);
            }
        });

        // Replace cart links
        cartLinks.forEach(link => {
            const parent = link.parentElement;
            if (parent && parent.classList.contains('nav-item')) {
                // Navbar links - replace with disabled span
                const comingSoonSpan = document.createElement('span');
                comingSoonSpan.className = 'nav-link text-muted';
                comingSoonSpan.innerHTML = '<i class="bi bi-clock me-2"></i>Cart - Coming Soon';
                comingSoonSpan.style.cursor = 'not-allowed';
                parent.replaceChild(comingSoonSpan, link);
            } else if (parent && parent.classList.contains('card-body')) {
                // Dashboard card links - replace with disabled button
                const comingSoonBtn = document.createElement('button');
                comingSoonBtn.className = 'btn btn-outline-secondary mt-auto disabled';
                comingSoonBtn.innerHTML = '<i class="bi bi-clock me-2"></i>Coming Soon';
                comingSoonBtn.disabled = true;
                parent.replaceChild(comingSoonBtn, link);
            }
        });

        return true;
    } catch (error) {
        console.error('Error replacing product/cart links:', error);
        return false;
    }
}

// Auto-execute on page load if this script is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Check if there's a global flag to enable coming soon mode
    if (window.enableComingSoonMode) {
        replaceProductCartLinks(true);
    }
});
