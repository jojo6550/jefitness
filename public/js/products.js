// API configuration
window.API_BASE = window.ApiConfig.getAPI_BASE();

// Product icons and colors mapping based on Stripe product metadata
const PRODUCT_STYLES = {
    'bi-droplet-fill': { color: 'primary', icon: 'bi-droplet-fill' },
    'bi-cup-straw': { color: 'success', icon: 'bi-cup-straw' },
    'bi-egg-fried': { color: 'warning', icon: 'bi-egg-fried' },
    'bi-heart-pulse': { color: 'danger', icon: 'bi-heart-pulse' },
    'bi-gem': { color: 'info', icon: 'bi-gem' },
    'bi-tree': { color: 'success', icon: 'bi-tree' },
    'bi-cup-hot': { color: 'warning', icon: 'bi-cup-hot' },
    'bi-basket': { color: 'primary', icon: 'bi-basket' },
    'bi-box-seam': { color: 'secondary', icon: 'bi-box-seam' },
    'bi-leaf': { color: 'success', icon: 'bi-leaf' }
};

// Default style for products without specific metadata
const DEFAULT_STYLE = { color: 'primary', icon: 'bi-box-seam' };

// Cart state (loaded from localStorage)
let cart = JSON.parse(localStorage.getItem('productCart') || '{"items": []}');

// Products loaded from Stripe
let productsFromStripe = [];

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        // Show auth required modal
        const authModal = new bootstrap.Modal(document.getElementById('authRequiredModal'));
        authModal.show();
        document.getElementById('page-loading').style.display = 'none';
        return;
    }

    // Hide loading spinner temporarily
    document.getElementById('page-loading').style.display = 'flex';

    try {
        // Fetch products from Stripe
        await loadProductsFromStripe();

        // Sync with server cart
        await syncCartWithServer();

        // Setup event listeners
        setupQuantityControls();
        setupLogout();

        // Load cart count
        updateCartBadge();

        // Hide loading spinner
        document.getElementById('page-loading').style.display = 'none';
    } catch (error) {
        console.error('Failed to load products:', error);
        document.getElementById('page-loading').innerHTML = `
            <div class="text-center">
                <div class="alert alert-danger" role="alert">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Failed to load products. Please try again later.
                </div>
                <button class="btn btn-primary mt-3" onclick="location.reload()">
                    <i class="bi bi-arrow-clockwise me-2"></i>Retry
                </button>
            </div>
        `;
    }
});

// Load products from Stripe API
async function loadProductsFromStripe() {
    const token = localStorage.getItem('token');
    const res = await fetch(`${window.API_BASE}/api/v1/products`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    if (!res.ok) {
        throw new Error('Failed to fetch products from Stripe');
    }

    const data = await res.json();

    if (data.success && data.data && data.data.products) {
        productsFromStripe = data.data.products;
        renderProducts(productsFromStripe);
    } else {
        throw new Error('Invalid response from products API');
    }
}

// Render products dynamically based on Stripe data
function renderProducts(products) {
    const container = document.getElementById('products-container');

    // Clear existing products (keep the "Coming Soon" card)
    const comingSoonCard = container.querySelector('.opacity-75');
    container.innerHTML = '';

    if (products.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5">
                <i class="bi bi-info-circle display-1 text-muted mb-3"></i>
                <h4 class="text-muted">No products available at this time.</h4>
                <p class="text-muted">Please check back later.</p>
            </div>
        `;
        return;
    }

    // Add product cards
    products.forEach(product => {
        const style = PRODUCT_STYLES[product.metadata?.icon] ||
                      PRODUCT_STYLES[product.images?.[0]] ||
                      DEFAULT_STYLE;

        const price = product.price ? (product.price / 100).toFixed(2) : 'N/A';
        const priceId = product.priceId || '';
        const productId = product.id;
        const productName = product.name;
        const description = product.description || '';

        const cardHtml = `
            <div class="col-md-6 col-lg-4">
                <div class="product-card card h-100 shadow-sm text-center" data-product-id="${productId}">
                    <div class="card-body p-4">
                        <i class="bi ${style.icon} display-4 text-${style.color} mb-3"></i>
                        <h5 class="card-title fw-bold mb-2">${productName}</h5>
                        <p class="card-text text-muted">${description || 'No description available.'}</p>
                        <p class="fw-bold text-${style.color} h4">$<span class="product-price">${price}</span></p>

                        <!-- Quantity Selector -->
                        <div class="quantity-selector mb-3">
                            <label class="form-label small text-muted">Quantity</label>
                            <div class="d-flex align-items-center justify-content-center gap-2">
                                <button class="btn btn-outline-secondary quantity-btn" data-action="decrease">-</button>
                                <input type="number" class="form-control text-center quantity-input" value="1" min="1" max="99" style="width: 70px;" data-product="${productId}">
                                <button class="btn btn-outline-secondary quantity-btn" data-action="increase">+</button>
                            </div>
                        </div>

                        <div class="d-flex gap-2 justify-content-center">
                            <button class="btn btn-primary add-to-cart-btn"
                                data-product-id="${productId}"
                                data-product-name="${productName}"
                                data-price="${product.price || 0}"
                                data-price-id="${priceId}">
                                <i class="bi bi-cart-plus me-2"></i>Add to Cart
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', cardHtml);
    });

    // Add "Coming Soon" card if there are fewer than 3 products
    if (products.length < 3) {
        const comingSoonHtml = `
            <div class="col-md-6 col-lg-4">
                <div class="product-card card h-100 shadow-sm text-center opacity-75">
                    <div class="card-body p-4">
                        <i class="bi bi-plus-circle-fill display-4 text-info mb-3"></i>
                        <h5 class="card-title fw-bold mb-2">Other Products</h5>
                        <p class="card-text text-muted">Explore our full range of natural health products.</p>
                        <p class="fw-bold text-muted h4">Coming Soon</p>
                        <button class="btn btn-outline-secondary" disabled>
                            <i class="bi bi-clock me-2"></i>Coming Soon
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', comingSoonHtml);
    }

    // Setup Add to Cart buttons after rendering
    setupAddToCartButtons();
}

// Sync local cart with server
async function syncCartWithServer() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${window.API_BASE}/api/v1/cart`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (res.ok) {
            const data = await res.json();
            if (data.data && data.data.cart && data.data.cart.items && data.data.cart.items.length > 0) {
                // Use server cart as source of truth for item data
                cart = {
                    items: data.data.cart.items,
                    createdAt: data.data.cart.createdAt,
                    updatedAt: data.data.cart.updatedAt
                };
                localStorage.setItem('productCart', JSON.stringify(cart));
            }
        }
    } catch (err) {
        console.warn('Could not sync with server cart, using local cart');
    }
}

// Setup quantity increment/decrement controls
function setupQuantityControls() {
    document.querySelectorAll('.quantity-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            const input = e.target.parentElement.querySelector('.quantity-input');
            let value = parseInt(input.value) || 1;

            if (action === 'increase') {
                value = Math.min(value + 1, 99);
            } else if (action === 'decrease') {
                value = Math.max(value - 1, 1);
            }

            input.value = value;
        });
    });

    // Handle manual input changes
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('change', (e) => {
            let value = parseInt(e.target.value) || 1;
            value = Math.max(1, Math.min(value, 99));
            e.target.value = value;
        });
    });
}

// Setup Add to Cart buttons
function setupAddToCartButtons() {
    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const button = e.currentTarget;
            const productId = button.dataset.productId;
            const productName = button.dataset.productName;
            const price = parseFloat(button.dataset.price) / 100; // Convert from cents to dollars
            const priceId = button.dataset.priceId;
            const quantity = parseInt(document.querySelector(`.quantity-input[data-product="${productId}"]`).value) || 1;

            addToCart(productId, productName, price, priceId, quantity);
        });
    });
}

// Add item to cart
async function addToCart(productId, productName, price, priceId, quantity) {
    // Find the Stripe product to get latest price
    const stripeProduct = productsFromStripe.find(p => p.id === productId);
    const currentPrice = stripeProduct?.price || Math.round(price * 100);
    const currentPriceId = stripeProduct?.priceId || priceId;

    // Check if item already in cart
    const existingItem = cart.items.find(item => item.productId === productId);

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.items.push({
            productId,
            name: productName,
            price: currentPrice, // Store in cents
            priceId: currentPriceId,
            quantity
        });
    }

    // Save to localStorage
    saveCart();

    // Sync with server (fire and forget)
    syncToServer(productId, quantity);

    // Update badge
    updateCartBadge();

    // Show toast
    showToast(`${quantity}x ${productName} added to cart!`);
}

// Sync cart changes to server
async function syncToServer(productId, quantity) {
    try {
        const token = localStorage.getItem('token');
        const item = cart.items.find(i => i.productId === productId);
        if (!item) return;

        await fetch(`${window.API_BASE}/api/v1/cart/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                productId,
                name: item.name,
                price: item.price, // Already in cents
                quantity
            })
        });
    } catch (err) {
        console.warn('Could not sync cart to server');
    }
}

// Save cart to localStorage
function saveCart() {
    localStorage.setItem('productCart', JSON.stringify(cart));
}

// Update cart badge
function updateCartBadge() {
    const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const badge = document.getElementById('cart-badge');

    if (totalItems > 0) {
        badge.textContent = totalItems;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('cartToast');
    document.getElementById('toastMessage').textContent = message;
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Setup logout button
function setupLogout() {
    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('productCart');
        window.location.href = 'login.html';
    });
}
