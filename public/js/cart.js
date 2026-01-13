document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = './login.html';
        return;
    }

    
const API_BASE = window.ApiConfig.getAPI_BASE();
    const loadingSpinner = document.getElementById('loading-spinner');
    const emptyCart = document.getElementById('empty-cart');
    const cartContent = document.getElementById('cart-content');
    const cartItemsList = document.getElementById('cart-items-list');
    const cartCount = document.getElementById('cart-count');
    const subtotalEl = document.getElementById('subtotal');
    const taxEl = document.getElementById('tax');
    const totalEl = document.getElementById('total');

    // Load cart
    async function loadCart() {
        try {
            loadingSpinner.style.display = 'block';
            emptyCart.style.display = 'none';
            cartContent.style.display = 'none';

            const res = await fetch(`${API_BASE}/api/cart`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error('Failed to load cart');
            }

            const cart = await res.json();

            loadingSpinner.style.display = 'none';

            if (!cart.items || cart.items.length === 0) {
                emptyCart.style.display = 'block';
                updateCartBadge(0);
                return;
            }

            displayCart(cart);
            updateCartBadge(cart.items.length);
        } catch (err) {
            console.error(err);
            loadingSpinner.style.display = 'none';
            showMessage('Error loading cart', 'danger');
        }
    }

    // Display cart items
function displayCart(cart) {
    cartContent.style.display = 'flex';
    cartItemsList.innerHTML = '';

    let subtotal = 0;

    cart.items.forEach(item => {
        // Use optional chaining (?.) to prevent crashes if item.program is missing
        const title = item.program?.title ?? 'Program Unavailable';
        const description = item.program?.description ?? 'This program may have been removed.';
        const level = item.program?.level ?? 'N/A';
        const frequency = item.program?.frequency ?? 'N/A';
        const sessionLength = item.program?.sessionLength ?? 'N/A';

        const itemTotal = item.price || 0;
        subtotal += itemTotal;

        const cartItemHtml = `
            <div class="list-group-item p-4" data-item-id="${item._id}">
                <div class="row align-items-center">
                    <div class="col-md-6">
                        <h5 class="mb-2 fw-bold">${title}</h5>
                        <p class="text-muted mb-2 small">${description}</p>
                        <div class="d-flex gap-2 flex-wrap">
                            <span class="badge bg-${getLevelColor(level)}">${level}</span>
                            <span class="badge bg-secondary">${frequency}</span>
                            <span class="badge bg-info">${sessionLength}</span>
                        </div>
                    </div>
                    <div class="col-md-3 text-center mt-3 mt-md-0">
                        <label class="form-label small text-muted">Price</label>
                        <p class="mb-0 fw-bold">$${(item.price || 0).toFixed(2)}</p>
                    </div>
                    <div class="col-md-3 text-end mt-3 mt-md-0">
                        <button class="btn btn-sm btn-outline-danger remove-item" data-item-id="${item._id}">
                            <i class="bi bi-trash"></i> Remove
                        </button>
                    </div>
                </div>
            </div>
        `;

        cartItemsList.insertAdjacentHTML('beforeend', cartItemHtml);
    });

    const tax = subtotal * 0.08;
    const total = subtotal + tax;

    cartCount.textContent = cart.items.length;
    subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
    taxEl.textContent = `$${tax.toFixed(2)}`;
    totalEl.textContent = `$${total.toFixed(2)}`;
}

    // Update quantity
    window.updateQuantity = async function(itemId, newQuantity) {
        if (newQuantity < 1) {
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/cart/update/${itemId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ quantity: newQuantity })
            });

            if (!res.ok) {
                throw new Error('Failed to update quantity');
            }

            const cart = await res.json();
            displayCart(cart);
            updateCartBadge(cart.items.length);
            showMessage('Quantity updated', 'success');
        } catch (err) {
            console.error(err);
            showMessage('Error updating quantity', 'danger');
        }
    };

    // Remove item
    window.removeItem = async function(itemId) {
        if (!confirm('Are you sure you want to remove this item?')) {
            return;
        }

        // Find the button and add loading state
        const button = document.querySelector(`[data-item-id="${itemId}"] .remove-item`);
        if (button) {
            button.classList.add('btn-loading');
            button.disabled = true;
        }

        try {
            const res = await fetch(`${API_BASE}/api/cart/remove/${itemId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error('Failed to remove item');
            }

            const cart = await res.json();

            if (cart.items.length === 0) {
                emptyCart.style.display = 'block';
                cartContent.style.display = 'none';
                updateCartBadge(0);
            } else {
                displayCart(cart);
                updateCartBadge(cart.items.length);
            }

            showMessage('Item removed from cart', 'success');
        } catch (err) {
            console.error(err);
            showMessage('Error removing item', 'danger');
        } finally {
            // Remove loading state
            if (button) {
                button.classList.remove('btn-loading');
                button.disabled = false;
            }
        }
    };

    // Helper functions
    function getLevelColor(level) {
        switch(level) {
            case 'Beginner': return 'success';
            case 'Intermediate': return 'warning';
            case 'Advanced': return 'danger';
            default: return 'secondary';
        }
    }

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

    function updateCartBadge(count) {
        const badge = document.querySelector('.cart-badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }

    // Event delegation for cart actions
    cartItemsList.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        if (target.classList.contains('remove-item')) {
            const itemId = target.dataset.itemId;
            removeItem(itemId);
        }
    });

    // Initialize
    loadCart();
});