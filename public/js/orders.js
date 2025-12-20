document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = './login.html';
        return;
    }

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const baseUrl = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

    const loadingSpinner = document.getElementById('loading-spinner');
    const noOrders = document.getElementById('no-orders');
    const ordersList = document.getElementById('orders-list');

    // Load orders
    async function loadOrders() {
        try {
            loadingSpinner.style.display = 'block';
            noOrders.style.display = 'none';
            ordersList.style.display = 'none';

            const res = await fetch(`${baseUrl}/api/orders`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error('Failed to load orders');
            }

            const orders = await res.json();

            loadingSpinner.style.display = 'none';

            if (!orders || orders.length === 0) {
                noOrders.style.display = 'block';
                return;
            }

            displayOrders(orders);
        } catch (err) {
            console.error(err);
            loadingSpinner.style.display = 'none';
            showMessage('Error loading orders', 'danger');
        }
    }

    // Display orders
    function displayOrders(orders) {
        ordersList.style.display = 'block';
        ordersList.innerHTML = '';

        orders.forEach(order => {
            const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            const statusBadge = getStatusBadge(order.status);

            const orderHtml = `
                <div class="card shadow-sm border-0 mb-4">
                    <div class="card-header bg-white py-3">
                        <div class="row align-items-center">
                            <div class="col-md-3">
                                <h6 class="mb-1 fw-bold">Order #${order.orderNumber}</h6>
                                <small class="text-muted">${orderDate}</small>
                            </div>
                            <div class="col-md-3 mt-2 mt-md-0">
                                <small class="text-muted d-block">Total</small>
                                <span class="h5 mb-0 text-primary fw-bold">$${order.total.toFixed(2)}</span>
                            </div>
                            <div class="col-md-3 mt-2 mt-md-0">
                                <small class="text-muted d-block">Status</small>
                                ${statusBadge}
                            </div>
                            <div class="col-md-3 text-md-end mt-3 mt-md-0">
                                <button class="btn btn-outline-primary btn-sm" onclick="viewOrderDetails('${order._id}')">
                                    <i class="bi bi-eye me-1"></i>View Details
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <h6 class="mb-3 fw-semibold">Programs Purchased:</h6>
                        <div class="row g-3">
                            ${order.items.map(item => `
                                <div class="col-md-6">
                                    <div class="d-flex align-items-start">
                                        <i class="bi bi-check-circle-fill text-success me-2 mt-1"></i>
                                        <div>
                                            <h6 class="mb-1">${item.title}</h6>
                                            <small class="text-muted">Quantity: ${item.quantity} × $${item.price.toFixed(2)}</small>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;

            ordersList.insertAdjacentHTML('beforeend', orderHtml);
        });
    }

    // View order details
    window.viewOrderDetails = async function(orderId) {
        try {
            const res = await fetch(`${baseUrl}/api/orders/${orderId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!res.ok) {
                throw new Error('Failed to load order details');
            }

            const order = await res.json();
            displayOrderDetails(order);

            const modal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
            modal.show();
        } catch (err) {
            console.error(err);
            showMessage('Error loading order details', 'danger');
        }
    };

    // Display order details in modal
    function displayOrderDetails(order) {
        const orderDate = new Date(order.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const statusBadge = getStatusBadge(order.status);

        const detailsHtml = `
            <div class="mb-4">
                <div class="row mb-3">
                    <div class="col-6">
                        <h6 class="text-muted mb-1">Order Number</h6>
                        <p class="fw-bold">${order.orderNumber}</p>
                    </div>
                    <div class="col-6">
                        <h6 class="text-muted mb-1">Order Date</h6>
                        <p class="fw-bold">${orderDate}</p>
                    </div>
                </div>
                <div class="row mb-3">
                    <div class="col-6">
                        <h6 class="text-muted mb-1">Status</h6>
                        ${statusBadge}
                    </div>
                    <div class="col-6">
                        <h6 class="text-muted mb-1">Payment Method</h6>
                        <p class="fw-bold text-capitalize">${order.paymentMethod.replace('_', ' ')}</p>
                    </div>
                </div>
            </div>

            <hr>

            <div class="mb-4">
                <h6 class="fw-bold mb-3">Billing Information</h6>
                <p class="mb-1"><strong>Name:</strong> ${order.billingInfo.fullName}</p>
                <p class="mb-1"><strong>Email:</strong> ${order.billingInfo.email}</p>
                ${order.billingInfo.phone ? `<p class="mb-1"><strong>Phone:</strong> ${order.billingInfo.phone}</p>` : ''}
                ${order.billingInfo.address ? `
                    <p class="mb-1"><strong>Address:</strong> ${order.billingInfo.address}</p>
                    <p class="mb-1">${order.billingInfo.city ? order.billingInfo.city + ', ' : ''}${order.billingInfo.state || ''} ${order.billingInfo.zipCode || ''}</p>
                    ${order.billingInfo.country ? `<p class="mb-1">${order.billingInfo.country}</p>` : ''}
                ` : ''}
            </div>

            <hr>

            <div class="mb-4">
                <h6 class="fw-bold mb-3">Order Items</h6>
                ${order.items.map(item => `
                    <div class="d-flex justify-content-between align-items-start mb-3 pb-3 border-bottom">
                        <div>
                            <h6 class="mb-1">${item.title}</h6>
                            <small class="text-muted">Quantity: ${item.quantity}</small>
                        </div>
                        <span class="fw-semibold">$${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>

            <div class="bg-light p-3 rounded">
                <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Subtotal</span>
                    <span class="fw-semibold">$${order.subtotal.toFixed(2)}</span>
                </div>
                <div class="d-flex justify-content-between mb-2">
                    <span class="text-muted">Tax</span>
                    <span class="fw-semibold">$${order.tax.toFixed(2)}</span>
                </div>
                <hr>
                <div class="d-flex justify-content-between">
                    <span class="h5 mb-0">Total</span>
                    <span class="h5 mb-0 text-primary fw-bold">$${order.total.toFixed(2)}</span>
                </div>
            </div>
        `;

        document.getElementById('order-details-content').innerHTML = detailsHtml;
    }

    // Helper functions
    function getStatusBadge(status) {
        const badges = {
            'pending': '<span class="badge bg-warning text-dark">Pending</span>',
            'processing': '<span class="badge bg-info">Processing</span>',
            'completed': '<span class="badge bg-success">Completed</span>',
            'cancelled': '<span class="badge bg-danger">Cancelled</span>'
        };
        return badges[status] || '<span class="badge bg-secondary">Unknown</span>';
    }

    function showMessage(message, type) {
        const messageDiv = document.getElementById('orders-message');
        const messageText = document.getElementById('orders-message-text');
        
        messageText.textContent = message;
        messageDiv.className = `alert alert-${type} alert-dismissible fade show`;
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }

    // Initialize
    loadOrders();
});