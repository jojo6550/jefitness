document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = './login.html';
        return;
    }

    
window.API_BASE = window.ApiConfig.getAPI_BASE();
    const checkoutForm = document.getElementById('checkout-form');
    const orderItems = document.getElementById('order-items');
    const summarySubtotal = document.getElementById('summary-subtotal');
    const summaryTax = document.getElementById('summary-tax');
    const summaryTotal = document.getElementById('summary-total');
    const placeOrderBtn = document.getElementById('place-order-btn');
    const cardDetails = document.getElementById('card-details');

    let cartData = null;

    // Load cart summary
    async function loadCartSummary() {
        try {
            const res = await fetch(`${window.API_BASE}
/api/cart`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error('Failed to load cart');
            }

            const cart = await res.json();

            if (!cart.items || cart.items.length === 0) {
                window.location.href = './cart.html';
                return;
            }

            cartData = cart;
            displayOrderSummary(cart);
        } catch (err) {
            console.error(err);
            showMessage('Error loading cart', 'danger');
        }
    }

    // Display order summary
    function displayOrderSummary(cart) {
        orderItems.innerHTML = '';
        let subtotal = 0;

        cart.items.forEach(item => {
            const itemTotal = item.price * item.quantity;
            subtotal += itemTotal;

            const itemHtml = `
                <div class="d-flex justify-content-between align-items-start mb-3 pb-3 border-bottom">
                    <div class="flex-grow-1 me-2">
                        <h6 class="mb-1 fw-semibold">${item.program.title}</h6>
                        <small class="text-muted">Qty: ${item.quantity}</small>
                    </div>
                    <span class="fw-semibold">$${itemTotal.toFixed(2)}</span>
                </div>
            `;

            orderItems.insertAdjacentHTML('beforeend', itemHtml);
        });

        const tax = subtotal * 0.08;
        const total = subtotal + tax;

        summarySubtotal.textContent = `$${subtotal.toFixed(2)}`;
        summaryTax.textContent = `$${tax.toFixed(2)}`;
        summaryTotal.textContent = `$${total.toFixed(2)}`;
    }

    // Handle payment method change
    document.querySelectorAll('input[name="paymentMethod"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'credit_card') {
                cardDetails.style.display = 'block';
            } else {
                cardDetails.style.display = 'none';
            }
        });
    });

    // Format card number
    const cardNumberInput = document.getElementById('cardNumber');
    if (cardNumberInput) {
        cardNumberInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\s/g, '');
            let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
            e.target.value = formattedValue;
        });
    }

    // Format expiry date
    const cardExpiryInput = document.getElementById('cardExpiry');
    if (cardExpiryInput) {
        cardExpiryInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length >= 2) {
                value = value.slice(0, 2) + '/' + value.slice(2, 4);
            }
            e.target.value = value;
        });
    }

    // Handle form submission
    checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

        const billingInfo = {
            fullName: document.getElementById('fullName').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value,
            city: document.getElementById('city').value,
            state: document.getElementById('state').value,
            zipCode: document.getElementById('zipCode').value,
            country: document.getElementById('country').value
        };

        // Validate card details if credit card is selected
        if (paymentMethod === 'credit_card') {
            const cardNumber = document.getElementById('cardNumber').value;
            const cardExpiry = document.getElementById('cardExpiry').value;
            const cardCvv = document.getElementById('cardCvv').value;

            if (!cardNumber || !cardExpiry || !cardCvv) {
                showMessage('Please fill in all card details', 'danger');
                return;
            }
        }

        try {
            placeOrderBtn.disabled = true;
            placeOrderBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';

            const res = await fetch(`${window.API_BASE}
/api/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    paymentMethod,
                    billingInfo
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.msg || 'Failed to place order');
            }

            const order = await res.json();

            // Show success modal
            document.getElementById('order-number').textContent = order.orderNumber;
            const successModal = new bootstrap.Modal(document.getElementById('successModal'));
            successModal.show();

            // Update cart badge
            updateCartBadge(0);

        } catch (err) {
            console.error(err);
            showMessage(err.message || 'Error placing order', 'danger');
            placeOrderBtn.disabled = false;
            placeOrderBtn.innerHTML = '<i class="bi bi-lock-fill me-2"></i>Place Order';
        }
    });

    // Helper functions
    function showMessage(message, type) {
        const messageDiv = document.getElementById('checkout-message');
        const messageText = document.getElementById('checkout-message-text');
        
        messageText.textContent = message;
        messageDiv.className = `alert alert-${type} alert-dismissible fade show`;
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }

    function updateCartBadge(count) {
        const badge = document.querySelector('.cart-badge');
        if (badge) {
            badge.textContent = count;
            badge.style.display = count > 0 ? 'inline-block' : 'none';
        }
    }

    // Initialize
    loadCartSummary();
});