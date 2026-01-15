// Products Page - Cart Management and Checkout
// Handles cart operations and Stripe checkout for one-time product purchases

// Cart state management
let cart = [];

// Load cart from localStorage on page load
function loadCart() {
  const savedCart = localStorage.getItem('jefitness_cart');
  if (savedCart) {
    try {
      cart = JSON.parse(savedCart);
      updateCartUI();
    } catch (e) {
      console.error('Failed to load cart:', e);
      cart = [];
    }
  }
}

// Save cart to localStorage
function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
  updateCartUI();
}

// Clear cart
function clearCart() {
  cart = [];
  localStorage.removeItem('jefitness_cart');
  updateCartUI();
}

// Add item to cart with full product information
function addToCart(productKey, quantity = 1) {
  // Get product information from the DOM
  const productCard = document.querySelector(`[data-product-id="${productKey}"]`);
  if (!productCard) {
    console.error('Product card not found for:', productKey);
    showToast('Failed to add item to cart', 'danger');
    return;
  }

  // Extract product information from the card
  const nameEl = productCard.querySelector('.card-title');
  const descEl = productCard.querySelector('.card-text');
  const priceEl = productCard.querySelector('.product-price');
  const iconEl = productCard.querySelector('.bi');

  const productInfo = {
    productKey,
    name: nameEl ? nameEl.textContent.trim() : productKey,
    description: descEl ? descEl.textContent.trim() : '',
    price: priceEl ? parseFloat(priceEl.textContent) : 0,
    icon: iconEl ? iconEl.className : 'bi bi-box',
    iconColor: iconEl ? (iconEl.className.includes('text-') ? iconEl.className.match(/text-\w+/)[0] : 'text-primary') : 'text-primary'
  };

  // Check if item already exists in cart
  const existingItem = cart.find(item => item.productKey === productKey);
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.push({
      ...productInfo,
      quantity
    });
  }
  
  saveCart();
  showToast(`${productInfo.name} added to cart!`, 'success');
}

// Remove item from cart
function removeFromCart(productKey) {
  cart = cart.filter(item => item.productKey !== productKey);
  saveCart();
  showToast('Item removed from cart', 'info');
}

// Update item quantity in cart
function updateCartQuantity(productKey, quantity) {
  const item = cart.find(item => item.productKey === productKey);
  if (item) {
    item.quantity = Math.max(1, quantity);
    saveCart();
  }
}

// Get cart item count
function getCartItemCount() {
  return cart.reduce((total, item) => total + item.quantity, 0);
}

// Update cart badge in navbar
function updateCartUI() {
  const cartBadge = document.getElementById('cart-badge');
  const itemCount = getCartItemCount();
  
  if (cartBadge) {
    if (itemCount > 0) {
      cartBadge.textContent = itemCount;
      cartBadge.style.display = 'inline-block';
    } else {
      cartBadge.style.display = 'none';
    }
  }
}

// Show toast notification
function showToast(message, type = 'primary') {
  const toastElement = document.getElementById('cartToast');
  const toastMessage = document.getElementById('toastMessage');
  
  if (toastElement && toastMessage) {
    toastMessage.textContent = message;
    
    // Update toast color based on type
    toastElement.className = `toast align-items-center text-bg-${type} border-0`;
    
    const toast = new bootstrap.Toast(toastElement);
    toast.show();
  }
}

// Create checkout session
async function createCheckoutSession(cartItems) {
  try {
    if (!cartItems || cartItems.length === 0) {
      showToast('Your cart is empty', 'warning');
      return;
    }

    // Show loading state
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

    // Make API call to create checkout session
    const response = await fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/products/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ items: cartItems })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Redirect to Stripe Checkout
      window.location.href = data.checkoutUrl;
    } else {
      throw new Error(data.error || 'Failed to create checkout session');
    }

  } catch (error) {
    console.error('Checkout error:', error);
    showToast(error.message || 'Failed to process checkout', 'danger');
    
    // Reset button state
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.disabled = false;
      checkoutBtn.innerHTML = '<i class="bi bi-credit-card me-2"></i>Proceed to Checkout';
    }
  }
}

// Handle checkout button click
function handleCheckout() {
  if (cart.length === 0) {
    showToast('Your cart is empty', 'warning');
    return;
  }
  
  createCheckoutSession(cart);
}

// Check for success or canceled query parameters
function checkCheckoutStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  
  if (urlParams.get('success') === 'true') {
    // Clear cart on successful purchase
    clearCart();
    showToast('Purchase successful! Thank you for your order.', 'success');
    
    // Remove query parameters from URL
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('canceled') === 'true') {
    showToast('Checkout was canceled. Your cart is still saved.', 'warning');
    
    // Remove query parameters from URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Initialize quantity controls
function initializeQuantityControls() {
  // Quantity increase/decrease buttons
  document.querySelectorAll('.quantity-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const action = this.getAttribute('data-action');
      const productCard = this.closest('.product-card');
      const input = productCard.querySelector('.quantity-input');
      let value = parseInt(input.value) || 1;
      
      if (action === 'increase') {
        value = Math.min(99, value + 1);
      } else if (action === 'decrease') {
        value = Math.max(1, value - 1);
      }
      
      input.value = value;
    });
  });

  // Quantity input validation
  document.querySelectorAll('.quantity-input').forEach(input => {
    input.addEventListener('change', function() {
      let value = parseInt(this.value) || 1;
      value = Math.max(1, Math.min(99, value));
      this.value = value;
    });
  });
}

// Initialize add to cart buttons
function initializeAddToCartButtons() {
  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const productKey = this.getAttribute('data-product-id');
      const productCard = this.closest('.product-card');
      const quantityInput = productCard.querySelector('.quantity-input');
      const quantity = parseInt(quantityInput.value) || 1;
      
      if (productKey) {
        addToCart(productKey, quantity);
        // Reset quantity to 1 after adding
        quantityInput.value = 1;
      }
    });
  });
}

// Check authentication
async function checkAuth() {
  const token = localStorage.getItem('token');
  
  if (!token) {
    // Show auth required modal
    const authModal = new bootstrap.Modal(document.getElementById('authRequiredModal'));
    authModal.show();
    
    // Hide loading spinner
    const loadingEl = document.getElementById('page-loading');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
    
    return false;
  }
  
  try {
    // Verify token is still valid
    const response = await fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/auth/me`, {
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

// Initialize page
async function initializePage() {
  const loadingEl = document.getElementById('page-loading');
  
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
    
    // Initialize UI controls
    initializeQuantityControls();
    initializeAddToCartButtons();
    
    // Initialize checkout button if exists
    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', handleCheckout);
    }
    
  } catch (error) {
    console.error('Page initialization error:', error);
    showToast('Failed to initialize page', 'danger');
  } finally {
    // Hide loading spinner
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}

// Export functions for use in other scripts if needed
if (typeof window !== 'undefined') {
  window.productsCart = {
    addToCart,
    removeFromCart,
    updateCartQuantity,
    clearCart,
    getCart: () => cart,
    getCartItemCount,
    handleCheckout
  };
}