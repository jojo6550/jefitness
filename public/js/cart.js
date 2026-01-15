// Cart Page - Comprehensive Cart Management and Checkout
// Handles cart display, quantity updates, and Stripe checkout

// Product catalog with pricing
const PRODUCT_CATALOG = {
  'seamoss-small': {
    name: 'Seamoss - Small Size',
    price: 15.99,
    description: 'Rich in minerals and vitamins',
    icon: 'bi-droplet-fill',
    iconColor: 'text-primary'
  },
  'seamoss-large': {
    name: 'Seamoss - Large Size',
    price: 25.99,
    description: 'Larger quantity for extended use',
    icon: 'bi-droplet-fill',
    iconColor: 'text-primary'
  },
  'coconut-water': {
    name: 'Coconut Water',
    price: 8.99,
    description: 'Naturally rich in electrolytes',
    icon: 'bi-cup-straw',
    iconColor: 'text-success'
  },
  'coconut-jelly': {
    name: 'Coconut Jelly',
    price: 12.99,
    description: 'Delicious and nutritious snack',
    icon: 'bi-egg-fried',
    iconColor: 'text-warning'
  }
};

// Cart state
let cart = [];
let orderHistory = [];

// Load cart from localStorage
function loadCart() {
  const savedCart = localStorage.getItem('jefitness_cart');
  if (savedCart) {
    try {
      cart = JSON.parse(savedCart);
      console.log('Cart loaded:', cart);
    } catch (e) {
      console.error('Failed to load cart:', e);
      cart = [];
    }
  }
}

// Save cart to localStorage
function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
  updateCartDisplay();
  updateCartBadge();
}

// Clear entire cart
function clearCart() {
  if (cart.length === 0) {
    showToast('Cart is already empty', 'info');
    return;
  }

  if (confirm('Are you sure you want to clear your cart?')) {
    cart = [];
    localStorage.removeItem('jefitness_cart');
    updateCartDisplay();
    updateCartBadge();
    showToast('Cart cleared', 'success');
  }
}

// Remove item from cart
function removeFromCart(productKey) {
  const itemIndex = cart.findIndex(item => item.productKey === productKey);
  if (itemIndex !== -1) {
    const productInfo = PRODUCT_CATALOG[productKey];
    cart.splice(itemIndex, 1);
    saveCart();
    showToast(`${productInfo?.name || 'Item'} removed from cart`, 'info');
  }
}

// Update item quantity
function updateQuantity(productKey, newQuantity) {
  const item = cart.find(item => item.productKey === productKey);
  if (item) {
    const quantity = Math.max(1, Math.min(99, parseInt(newQuantity) || 1));
    item.quantity = quantity;
    saveCart();
  }
}

// Calculate cart totals
function calculateTotals() {
  let itemCount = 0;
  let subtotal = 0;

  cart.forEach(item => {
    const productInfo = PRODUCT_CATALOG[item.productKey];
    if (productInfo) {
      itemCount += item.quantity;
      subtotal += productInfo.price * item.quantity;
    }
  });

  return {
    itemCount,
    subtotal,
    total: subtotal // Can add shipping/tax here later
  };
}

// Update cart badge in navbar
function updateCartBadge() {
  const cartBadge = document.getElementById('cart-badge');
  const totals = calculateTotals();
  
  if (cartBadge) {
    if (totals.itemCount > 0) {
      cartBadge.textContent = totals.itemCount;
      cartBadge.style.display = 'inline-block';
    } else {
      cartBadge.style.display = 'none';
    }
  }
}

// Render cart items
function renderCartItems() {
  const cartItemsList = document.getElementById('cart-items-list');
  const emptyCart = document.getElementById('empty-cart');
  const cartItemsContainer = document.getElementById('cart-items-container');
  const orderSummary = document.getElementById('order-summary');

  if (!cartItemsList) return;

  // Clear existing items
  cartItemsList.innerHTML = '';

  if (cart.length === 0) {
    // Show empty state
    if (emptyCart) emptyCart.style.display = 'block';
    if (cartItemsContainer) cartItemsContainer.style.display = 'none';
    if (orderSummary) orderSummary.style.display = 'none';
    return;
  }

  // Hide empty state, show cart
  if (emptyCart) emptyCart.style.display = 'none';
  if (cartItemsContainer) cartItemsContainer.style.display = 'block';
  if (orderSummary) orderSummary.style.display = 'block';

  // Render each cart item
  cart.forEach(item => {
    const productInfo = PRODUCT_CATALOG[item.productKey];
    if (!productInfo) return;

    const itemTotal = productInfo.price * item.quantity;

    const cartItemHtml = `
      <div class="card mb-3 shadow-sm cart-item" data-product-key="${item.productKey}">
        <div class="card-body">
          <div class="row align-items-center">
            <div class="col-md-2 text-center mb-3 mb-md-0">
              <i class="bi ${productInfo.icon} ${productInfo.iconColor} display-4"></i>
            </div>
            <div class="col-md-4 mb-3 mb-md-0">
              <h5 class="mb-1">${productInfo.name}</h5>
              <p class="text-muted small mb-0">${productInfo.description}</p>
              <p class="text-primary fw-bold mb-0">$${productInfo.price.toFixed(2)} each</p>
            </div>
            <div class="col-md-3 mb-3 mb-md-0">
              <label class="form-label small text-muted mb-1">Quantity</label>
              <div class="input-group" style="max-width: 150px;">
                <button class="btn btn-outline-secondary btn-sm quantity-decrease" type="button">
                  <i class="bi bi-dash"></i>
                </button>
                <input type="number" class="form-control form-control-sm text-center quantity-input" 
                       value="${item.quantity}" min="1" max="99" data-product-key="${item.productKey}">
                <button class="btn btn-outline-secondary btn-sm quantity-increase" type="button">
                  <i class="bi bi-plus"></i>
                </button>
              </div>
            </div>
            <div class="col-md-2 text-center mb-3 mb-md-0">
              <p class="text-muted small mb-1">Item Total</p>
              <p class="h5 text-primary fw-bold mb-0">$${itemTotal.toFixed(2)}</p>
            </div>
            <div class="col-md-1 text-center">
              <button class="btn btn-outline-danger btn-sm remove-item" data-product-key="${item.productKey}">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    cartItemsList.insertAdjacentHTML('beforeend', cartItemHtml);
  });

  // Attach event listeners to newly created elements
  attachCartItemListeners();
}

// Attach event listeners to cart items
function attachCartItemListeners() {
  // Remove item buttons
  document.querySelectorAll('.remove-item').forEach(btn => {
    btn.addEventListener('click', function() {
      const productKey = this.getAttribute('data-product-key');
      removeFromCart(productKey);
    });
  });

  // Quantity inputs
  document.querySelectorAll('.quantity-input').forEach(input => {
    input.addEventListener('change', function() {
      const productKey = this.getAttribute('data-product-key');
      const newQuantity = parseInt(this.value) || 1;
      updateQuantity(productKey, newQuantity);
    });
  });

  // Quantity decrease buttons
  document.querySelectorAll('.quantity-decrease').forEach(btn => {
    btn.addEventListener('click', function() {
      const cartItem = this.closest('.cart-item');
      const input = cartItem.querySelector('.quantity-input');
      const productKey = input.getAttribute('data-product-key');
      const currentValue = parseInt(input.value) || 1;
      const newValue = Math.max(1, currentValue - 1);
      input.value = newValue;
      updateQuantity(productKey, newValue);
    });
  });

  // Quantity increase buttons
  document.querySelectorAll('.quantity-increase').forEach(btn => {
    btn.addEventListener('click', function() {
      const cartItem = this.closest('.cart-item');
      const input = cartItem.querySelector('.quantity-input');
      const productKey = input.getAttribute('data-product-key');
      const currentValue = parseInt(input.value) || 1;
      const newValue = Math.min(99, currentValue + 1);
      input.value = newValue;
      updateQuantity(productKey, newValue);
    });
  });
}

// Update order summary
function updateOrderSummary() {
  const totals = calculateTotals();

  const itemCountEl = document.getElementById('summary-item-count');
  const subtotalEl = document.getElementById('summary-subtotal');
  const totalEl = document.getElementById('summary-total');

  if (itemCountEl) itemCountEl.textContent = totals.itemCount;
  if (subtotalEl) subtotalEl.textContent = `$${totals.subtotal.toFixed(2)}`;
  if (totalEl) totalEl.textContent = `$${totals.total.toFixed(2)}`;
}

// Update entire cart display
function updateCartDisplay() {
  renderCartItems();
  updateOrderSummary();
}

// Show toast notification
function showToast(message, type = 'primary') {
  const toastElement = document.getElementById('cartToast');
  const toastMessage = document.getElementById('toastMessage');
  
  if (toastElement && toastMessage) {
    toastMessage.textContent = message;
    
    // Update toast color
    toastElement.className = `toast align-items-center text-bg-${type} border-0`;
    
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
  }
}

// Create checkout session and redirect to Stripe
async function handleCheckout() {
  try {
    if (cart.length === 0) {
      showToast('Your cart is empty', 'warning');
      return;
    }

    // Disable checkout button and show loading
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
    }

    // Get auth token
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = 'login.html';
      return;
    }

    // Prepare items for checkout (only seamoss products are configured)
    const checkoutItems = cart.filter(item => 
      item.productKey === 'seamoss-small' || item.productKey === 'seamoss-large'
    );

    if (checkoutItems.length === 0) {
      showToast('Only Seamoss products are available for purchase at this time', 'warning');
      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.innerHTML = '<i class="bi bi-credit-card me-2"></i>Proceed to Checkout';
      }
      return;
    }

    if (checkoutItems.length < cart.length) {
      showToast('Note: Only Seamoss products will be included in checkout', 'info');
    }

    // Make API call to create checkout session
    const response = await fetch(`${API_BASE_URL}/products/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ items: checkoutItems })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Redirect to Stripe Checkout
      console.log('Redirecting to checkout:', data.checkoutUrl);
      window.location.href = data.checkoutUrl;
    } else {
      throw new Error(data.error || 'Failed to create checkout session');
    }

  } catch (error) {
    console.error('Checkout error:', error);
    showToast(error.message || 'Failed to process checkout. Please try again.', 'danger');
    
    // Reset button state
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.innerHTML = '<i class="bi bi-credit-card me-2"></i>Proceed to Checkout';
    }
  }
}

// Load order history
async function loadOrderHistory() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;

    const response = await fetch(`${API_BASE_URL}/products/orders`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      if (data.success && data.purchases) {
        orderHistory = data.purchases;
        renderOrderHistory();
      }
    }
  } catch (error) {
    console.error('Failed to load order history:', error);
  }
}

// Render order history
function renderOrderHistory() {
  const container = document.getElementById('order-history-container');
  if (!container) return;

  if (orderHistory.length === 0) {
    container.innerHTML = `
      <div class="alert alert-info">
        <i class="bi bi-info-circle me-2"></i>No previous orders found.
      </div>
    `;
    return;
  }

  let html = '<div class="table-responsive"><table class="table table-hover">';
  html += '<thead><tr><th>Order Date</th><th>Items</th><th>Total</th><th>Status</th></tr></thead><tbody>';

  orderHistory.forEach(order => {
    const orderDate = new Date(order.createdAt).toLocaleDateString();
    const itemCount = order.items?.length || 0;
    const total = order.totalAmount ? `$${(order.totalAmount / 100).toFixed(2)}` : 'N/A';
    const statusBadge = order.status === 'completed' 
      ? '<span class="badge bg-success">Completed</span>'
      : order.status === 'pending'
      ? '<span class="badge bg-warning">Pending</span>'
      : '<span class="badge bg-danger">Failed</span>';

    html += `
      <tr>
        <td>${orderDate}</td>
        <td>${itemCount} item(s)</td>
        <td>${total}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  });

  html += '</tbody></table></div>';
  container.innerHTML = html;
}

// Check authentication
async function checkAuth() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    const authModal = new bootstrap.Modal(document.getElementById('authRequiredModal'));
    authModal.show();
    
    const loadingEl = document.getElementById('page-loading');
    if (loadingEl) loadingEl.style.display = 'none';
    
    return false;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Token invalid');
    }
    
    return true;
  } catch (error) {
    console.error('Auth check failed:', error);
    localStorage.removeItem('token');
    
    const authModal = new bootstrap.Modal(document.getElementById('authRequiredModal'));
    authModal.show();
    
    return false;
  }
}

// Check for success or canceled query parameters
function checkCheckoutStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  
  if (urlParams.get('success') === 'true') {
    // Clear cart on successful purchase
    cart = [];
    localStorage.removeItem('jefitness_cart');
    showToast('Purchase successful! Thank you for your order.', 'success');
    
    // Reload order history
    setTimeout(() => loadOrderHistory(), 1000);
    
    // Remove query parameters from URL
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('canceled') === 'true') {
    showToast('Checkout was canceled. Your cart is still saved.', 'warning');
    
    // Remove query parameters from URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Initialize page
async function initializePage() {
  const loadingEl = document.getElementById('page-loading');
  const mainContent = document.getElementById('main-content');
  
  try {
    // Check authentication
    const isAuthenticated = await checkAuth();
    
    if (!isAuthenticated) {
      return;
    }
    
    // Load cart from localStorage
    loadCart();
    
    // Check checkout status (success/canceled)
    checkCheckoutStatus();
    
    // Update cart display
    updateCartDisplay();
    updateCartBadge();
    
    // Load order history
    await loadOrderHistory();
    
    // Attach event listeners
    const clearCartBtn = document.getElementById('clear-cart-btn');
    if (clearCartBtn) {
      clearCartBtn.addEventListener('click', clearCart);
    }
    
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', handleCheckout);
    }
    
    // Show main content
    if (mainContent) mainContent.style.display = 'block';
    
  } catch (error) {
    console.error('Page initialization error:', error);
    showToast('Failed to initialize page', 'danger');
  } finally {
    // Hide loading spinner
    if (loadingEl) loadingEl.style.display = 'none';
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}

// Export functions for debugging
if (typeof window !== 'undefined') {
  window.cartDebug = {
    cart,
    loadCart,
    saveCart,
    clearCart,
    calculateTotals,
    orderHistory
  };
}