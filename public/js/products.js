/**
 * Products Page
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

const DEFAULT_PRODUCTS = [
    { id: 'seamoss-small', name: 'Seamoss - Small', price: 9.99, image: '/images/hero.jpg' },
    { id: 'seamoss-large', name: 'Seamoss - Large', price: 19.99, image: '/images/hero.jpg' },
    { id: 'coconut-water', name: 'Coconut Water', price: 4.99, image: '/images/hero.jpg' },
    { id: 'coconut-jelly', name: 'Coconut Jelly', price: 6.99, image: '/images/hero.jpg' }
];

/**
 * Initialize products page
 */
async function initProductsPage() {
    try {
        await loadProducts();
    } catch (err) {
        logger.error('Products page init failed', { error: err?.message });
        renderProducts(DEFAULT_PRODUCTS);
    }
}

/**
 * Load products from API
 */
async function loadProducts() {
    const response = await fetch(`${window.API_BASE}/api/v1/products`);

    if (!response.ok) {
        throw new Error('Failed to load products');
    }

    const data = await response.json();
    renderProducts(data.data || DEFAULT_PRODUCTS);
}

/**
 * Render products grid
 */
function renderProducts(products) {
    const container = document.getElementById('productsGrid');
    if (!container) return;

    container.innerHTML = products.map(product => `
        <div class="col-md-4 mb-4">
            <div class="card h-100">
                <img src="${product.image || '/images/hero.jpg'}" class="card-img-top" alt="${product.name}">
                <div class="card-body">
                    <h5 class="card-title">${product.name}</h5>
                    <p class="card-text">${product.description || ''}</p>
                    <h6 class="text-primary">$${(product.price / 100).toFixed(2)}</h6>
                    <button class="btn btn-primary mt-2" onclick="addToCart('${product.id}', 1)">
                        <i class="bi bi-cart-plus"></i> Add to Cart
                    </button>
                </div>
        </div>
    `).join('');
}

/**
 * Add product to cart
 */
async function addToCart(productId, quantity = 1) {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'pages/login.html';
        return;
    }

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/cart/add`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ productId, quantity })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to add to cart');
        }

        showToast('Added to cart!', 'success');
        updateCartCount();
    } catch (err) {
        logger.error('Add to cart failed', { error: err?.message });
        alert(err.message);
    }
}

/**
 * Update cart count
 */
async function updateCartCount() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/cart`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (response.ok) {
            const cart = await response.json();
            const count = cart.items?.length || 0;
            
            const badge = document.querySelector('.cart-badge');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'inline-block' : 'none';
            }
        }
    } catch (err) {
        // Silent fail
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.innerHTML = `<div class="toast-body">${message}</div>`;
    container.appendChild(toast);
    new bootstrap.Toast(toast).show();
    setTimeout(() => toast.remove(), 3000);
}

// Export globally
window.addToCart = addToCart;

// Initialize
document.addEventListener('DOMContentLoaded', initProductsPage);
