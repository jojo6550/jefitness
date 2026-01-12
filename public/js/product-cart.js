document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = './login.html';
        return;
    }

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const baseUrl = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

    // DOM Elements
    const loadingSpinner = document.getElementById('loading-spinner');
    const emptyCart = document.getElementById('empty-cart');
    const cartContent = document.getElementById('cart-content');
    const cartItemsList = document.getElementById('cart-items-list');
    const cartCount = document.getElementById('cart-count');
    const subtotalEl = document.getElementById('subtotal');
    const taxEl = document.getElementById('tax');
    const totalEl = document.getElementById('total');
    const checkoutBtn = document.getElementById('checkout-btn');
    const continueShoppingBtn = document.getElementById('continue-shopping-btn');

    // Local cart state
    let localCart = JSON.parse(localStorage.getItem('productCart') || '{"items": []}');

    // Initialize
    async function init() {
        try {
            // Try to sync with server cart first
            await syncCart();
            
            // Display cart
            if (localCart.items && localCart.items.length > 0) {
                displayCart();
            } else {
                showEmptyCart();
            }

            setupEventListeners();
        } catch (err) {
            console.error('Error initializing cart:', err);
            // Fallback to local cart
            if (localCart.items && localCart.items.length > 0) {
                displayCart();
            } else {
                showEmptyCart();
            }
        }
    }

    // Sync local cart with server
    async function syncCart() {
        try {
            const res = await fetch(`${baseUrl}/api/v1/cart`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                // Merge server cart with local cart
                if (data.data && data.data.cart && data.data.cart.items && data.data.cart.items.length > 0) {
                    // Use server cart as source of truth for item data
                    localCart = {
                        items: data.data.cart.items,
                        createdAt: data.data.cart.createdAt,
                        updatedAt: data.data.cart.updatedAt
                    };
                    localStorage.setItem('productCart', JSON.stringify(localCart));
                }
            }
        } catch (err) {
            console.warn('Could not sync with server, using local cart');
        }
    }

    // Display cart items
    function displayCart() {
        loadingSpinner.style.display = 'none';
        emptyCart.style.display = 'none';
        cartContent.style.display = 'flex';
        cartItemsList.innerHTML = '';

        let subtotal = 0;
        let totalItems = 0;

        localCart.items.forEach(item => {
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;
            totalItems += item.quantity;

            const itemHtml = `
                <div class="cart-item list-group-item p-4" data-product-id="${item.productId}">
                    <div class="row align-items-center">
                        <div class="col-md-5">
                            <div class="d-flex align-items-center">
                                <div class="product-icon bg-${getProductColor(item.productId)} bg-opacity-10 rounded p-3 me-3">
                                    <i class="bi bi-box-seam fs-3 text-${getProductColor(item.productId)}"></i>
                                </div>
                                <div>
                                    <h6 class="mb-1 fw-bold">${item.name}</h6>
                                    <small class="text-muted">Product ID: ${item.productId}</small>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-3">
                            <div class="d-flex align-items-center justify-content-md-center">
                                <button class="btn btn-outline-secondary btn-sm quantity-decrease" data-product-id="${item.productId}">-</button>
                                <input type="number" class="form-control form-control-sm text-center mx-2 quantity-input" 
                                    value="${item.quantity}" min="1" max="99" style="width: 60px;" 
                                    data-product-id="${item.productId}">
                                <button class="btn btn-outline-secondary btn-sm quantity-increase" data-product-id="${item.productId}">+</button>
                            </div>
                        </div>
                        <div class="col-md-2 text-center mt-3 mt-md-0">
                            <small class="text-muted d-md-none">Unit Price</small>
                            <p class="mb-0 fw-semibold">$${(item.price / 100).toFixed(2)}</p>
                        </div>
                        <div class="col-md-2 text-end mt-3 mt-md-0">
                            <small class="text-muted d-md-none">Total</small>
                            <p class="mb-0 fw-bold text-primary">$${(itemTotal / 100).toFixed(2)}</p>
                            <button class="btn btn-sm btn-outline-danger mt-2 remove-item" data-product-id="${item.productId}">
                                <i class="bi bi-trash"></i> Remove
                            </button>
                        </div>
                    </div>
                </div>
            `;

            cartItemsList.insertAdjacentHTML('beforeend', itemHtml);
        });

        const tax = Math.round(subtotal * 0.08);
        const total = subtotal + tax;

        cartCount.textContent = totalItems;
        subtotalEl.textContent = `$${(subtotal / 100).toFixed(2)}`;
        taxEl.textContent = `$${(tax / 100).toFixed(2)}`;
        totalEl.textContent = `$${(total / 100).toFixed(2)}`;

        // Update navbar badge
        updateNavbarBadge(totalItems);
    }

    // Show empty cart state
    function showEmptyCart() {
        loadingSpinner.style.display = 'none';
        cartContent.style.display = 'none';
        emptyCart.style.display = 'block';
        updateNavbarBadge(0);
    }

    // Get product color based on ID
    function getProductColor(productId) {
        if (productId.includes('seamoss')) return 'primary';
        if (productId.includes('coconut-water')) return 'success';
        if (productId.includes('coconut-jelly')) return 'warning';
        return 'info';
    }

    // Update navbar cart badge
    function updateNavbarBadge(count) {
        const badge = document.getElementById('cart-badge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // Update quantity
    async function updateQuantity(productId, newQuantity) {
        if (newQuantity < 1) {
            return;
        }

        // Update local cart
        const item = localCart.items.find(i => i.productId === productId);
        if (item) {
            item.quantity = newQuantity;
            localStorage.setItem('productCart', JSON.stringify(localCart));
            
            // Update server cart
            try {
                await fetch(`${baseUrl}/api/v1/cart/products/${productId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ quantity: newQuantity })
                });
            } catch (err) {
                console.warn('Could not update server cart');
            }

            displayCart();
        }
    }

    // Remove item
    async function removeItem(productId) {
        if (!confirm('Are you sure you want to remove this item from your cart?')) {
            return;
        }

        // Update local cart
        localCart.items = localCart.items.filter(i => i.productId !== productId);
        localStorage.setItem('productCart', JSON.stringify(localCart));

        // Update server cart
        try {
            await fetch(`${baseUrl}/api/v1/cart/products/${productId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (err) {
            console.warn('Could not update server cart');
        }

        if (localCart.items.length === 0) {
            showEmptyCart();
        } else {
            displayCart();
        }

        showMessage('Item removed from cart', 'success');
    }

    // Proceed to checkout
    async function proceedToCheckout() {
        if (!localCart.items || localCart.items.length === 0) {
            showMessage('Your cart is empty', 'warning');
            return;
        }

        try {
            // Disable checkout button
            checkoutBtn.disabled = true;
            checkoutBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';

            // Get current URL for success/cancel pages
            const currentUrl = window.location.origin;
            const successUrl = `${currentUrl}/pages/checkout-success.html?session_id={CHECKOUT_SESSION_ID}`;
            const cancelUrl = `${currentUrl}/pages/cart.html`;

            // Create checkout session
            const res = await fetch(`${baseUrl}/api/v1/checkout/create-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    successUrl,
                    cancelUrl
                })
            });

            const data = await res.json();

            if (data.success && data.data.url) {
                // Clear local cart immediately
                localCart = { items: [], createdAt: new Date(), updatedAt: new Date() };
                localStorage.setItem('productCart', JSON.stringify(localCart));
                
                // Redirect to Stripe Checkout
                window.location.href = data.data.url;
            } else {
                throw new Error(data.error?.message || 'Failed to create checkout session');
            }

        } catch (err) {
            console.error('Checkout error:', err);
            showMessage(err.message || 'Error initiating checkout', 'danger');
            checkoutBtn.disabled = false;
            checkoutBtn.innerHTML = '<i class="bi bi-credit-card me-2"></i>Proceed to Checkout';
        }
    }

    // Show message
    function showMessage(message, type) {
        const messageDiv = document.getElementById('cart-message');
        const messageText = document.getElementById('cart-message-text');
        
        messageText.textContent = message;
        messageDiv.className = `alert alert-${type} alert-dismissible fade show`;
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 3000);
    }

    // Setup event listeners
    function setupEventListeners() {
        // Quantity decrease buttons
        document.querySelectorAll('.quantity-decrease').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.dataset.productId;
                const input = document.querySelector(`.quantity-input[data-product-id="${productId}"]`);
                const newQuantity = Math.max(1, parseInt(input.value) - 1);
                updateQuantity(productId, newQuantity);
            });
        });

        // Quantity increase buttons
        document.querySelectorAll('.quantity-increase').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.dataset.productId;
                const input = document.querySelector(`.quantity-input[data-product-id="${productId}"]`);
                const newQuantity = Math.min(99, parseInt(input.value) + 1);
                updateQuantity(productId, newQuantity);
            });
        });

        // Quantity input changes
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const productId = e.target.dataset.productId;
                let newQuantity = parseInt(e.target.value) || 1;
                newQuantity = Math.max(1, Math.min(99, newQuantity));
                e.target.value = newQuantity;
                updateQuantity(productId, newQuantity);
            });
        });

        // Remove item buttons
        document.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const productId = e.target.closest('.remove-item').dataset.productId;
                removeItem(productId);
            });
        });

        // Checkout button
        checkoutBtn?.addEventListener('click', proceedToCheckout);

        // Continue shopping button
        continueShoppingBtn?.addEventListener('click', () => {
            window.location.href = './products.html';
        });
    }

    // Initialize
    init();
});

