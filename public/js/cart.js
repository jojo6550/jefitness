/**
 * Cart functionality
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Add item to cart
 */
async function addToCart(itemId, quantity = 1) {
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
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ programId: itemId, quantity })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Added to cart!', 'success');
            updateCartCount();
        } else {
            showToast(data.error?.message || 'Failed to add to cart', 'error');
        }
    } catch (err) {
        logger.error('Add to cart failed', { error: err?.message });
        showToast('Failed to add to cart. Please try again.', 'error');
    }
}

/**
 * Update cart item quantity
 */
async function updateCartItem(itemId, quantity) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/cart/update/${itemId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ quantity })
        });

        if (response.ok) {
            loadCart();
        } else {
            const data = await response.json();
            showToast(data.error?.message || 'Failed to update cart', 'error');
        }
    } catch (err) {
        logger.error('Update cart failed', { error: err?.message });
        showToast('Failed to update cart', 'error');
    }
}

/**
 * Remove item from cart
 */
async function removeFromCart(itemId) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/cart/remove/${itemId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            loadCart();
        } else {
            showToast('Failed to remove item', 'error');
        }
    } catch (err) {
        logger.error('Remove from cart failed', { error: err?.message });
        showToast('Failed to remove item', 'error');
    }
}

/**
 * Clear entire cart
 */
async function clearCart() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/cart/clear`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            loadCart();
            showToast('Cart cleared', 'success');
        }
    } catch (err) {
        logger.error('Clear cart failed', { error: err?.message });
    }
}

/**
 * Load and display cart
 */
async function loadCart() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/cart`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            renderCart(data);
        } else {
            showToast('Failed to load cart', 'error');
        }
    } catch (err) {
        logger.error('Load cart failed', { error: err?.message });
    }
}

/**
 * Render cart items
 */
function renderCart(cart) {
    const container = document.getElementById('cartItems');
    const emptyMessage = document.getElementById('cartEmptyMessage');
    const totalElement = document.getElementById('cartTotal');

    if (!cart.items || cart.items.length === 0) {
        if (container) container.innerHTML = '';
        if (emptyMessage) emptyMessage.style.display = 'block';
        if (totalElement) totalElement.textContent = '$0.00';
        return;
    }

    if (emptyMessage) emptyMessage.style.display = 'none';

    if (container) {
        container.innerHTML = cart.items.map(item => `
            <div class="cart-item d-flex justify-content-between align-items-center p-3 border-bottom">
                <div>
                    <h6>${item.programName || 'Program'}</h6>
                    <small class="text-muted">$${(item.price / 100).toFixed(2)} each</small>
                </div>
                <div class="d-flex align-items-center">
                    <input type="number" class="form-control form-control-sm" 
                           style="width: 60px;" value="${item.quantity}" 
                           min="1" max="10"
                           onchange="updateCartItem('${item.programId}', this.value)">
                    <span class="mx-3">$${((item.price * item.quantity) / 100).toFixed(2)}</span>
                    <button class="btn btn-sm btn-outline-danger" onclick="removeFromCart('${item.programId}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
        `).join('');
    }

    const total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0) / 100;
    if (totalElement) totalElement.textContent = `$${total.toFixed(2)}`;
}

/**
 * Proceed to checkout
 */
async function checkout() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/cart/checkout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
        } else {
            showToast('Failed to initiate checkout', 'error');
        }
    } catch (err) {
        logger.error('Checkout failed', { error: err?.message });
        showToast('Checkout failed. Please try again.', 'error');
    }
}

/**
 * Update cart count in navbar
 */
async function updateCartCount() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/cart`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
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
        // Silent fail for cart count
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
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    container.appendChild(toast);

    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();

    toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

// Export functions globally
window.addToCart = addToCart;
window.updateCartItem = updateCartItem;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.loadCart = loadCart;
window.checkout = checkout;
window.updateCartCount = updateCartCount;
