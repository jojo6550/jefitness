// Reusable helper to hide the page loading overlay
function hidePageLoader() {
  const loading = document.getElementById('page-loading');
  if (loading) {
    loading.style.display = 'none';
  }
}

// Product data and prices
let cart = [];
let productPrices = {};
let productsData = {}; // full product info from backend

async function loadPrices() {
  try {
    const res = await fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/products`);
    const data = await res.json();

    if (!data.success || !data.products) throw new Error('Products not found');

    productsData = data.products;
    productPrices = Object.fromEntries(Object.entries(productsData).map(([k, v]) => [k, v.price]));

    updateProductCards();

  } catch (err) {
    console.error('Failed to load products, using defaults:', err);
    // fallback to static data if API fails or returns empty
    const fallbackKeys = ['seamoss-small', 'seamoss-large', 'coconut-water', 'coconut-jelly'];
    fallbackKeys.forEach(key => {
      productPrices[key] = 100.1;
      productsData[key] = { name: key, price: 100.1, currency: 'jmd' };
    });
    updateProductCards();
  }
}

function updateProductCards() {
  // Defensive check: ensure productsData is not empty before updating
  if (!productsData || Object.keys(productsData).length === 0) return;

  Object.entries(productsData).forEach(([key, product]) => {
    const card = document.querySelector(`[data-product-id="${key}"]`);
    if (!card) return; // skip if card not found
    const priceSpan = card.querySelector('.product-price');
    if (priceSpan) priceSpan.textContent = `$${product.price.toFixed(2)}`;
    const btn = card.querySelector('.add-to-cart-btn');
    if (btn) btn.setAttribute('data-price', product.price);
  });
}

// Cart functions
function loadCart() {
  const saved = localStorage.getItem('jefitness_cart');
  if (saved) cart = JSON.parse(saved);
  updateCartBadge();
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (badge) {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (totalItems > 0) {
      badge.textContent = totalItems;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
}

function addToCart(key, qty = 1) {
  const item = cart.find(i => i.productKey === key);
  if (item) item.quantity += qty;
  else cart.push({ productKey: key, quantity: qty, price: productPrices[key], name: productsData[key]?.name || key });
  saveCart();
  updateCartBadge();
}

function clearCart() {
  cart = [];
  localStorage.removeItem('jefitness_cart');
}

// Checkout
async function handleCheckout() {
  if (!cart.length) return alert('Cart empty');
  const token = localStorage.getItem('token');
  if (!token) return window.location.href = 'login.html';

  try {
    const res = await fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/products/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ items: cart.map(i => ({ productKey: i.productKey, quantity: i.quantity })) })
    });
    const data = await res.json();
    if (res.ok && data.success) window.location.href = data.checkoutUrl;
    else throw new Error(data.error || 'Checkout failed');
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

// Toast notification
function showToast(message) {
  const toast = document.getElementById('cartToast');
  const toastMessage = document.getElementById('toastMessage');
  if (toast && toastMessage) {
    toastMessage.textContent = message;
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
  }
}

// Quantity stepper functionality
function initQuantitySteppers() {
  document.querySelectorAll('.quantity-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const action = btn.getAttribute('data-action');
      const input = btn.closest('.quantity-selector').querySelector('.quantity-input');
      let value = parseInt(input.value) || 1;

      if (action === 'increase' && value < 99) {
        value++;
      } else if (action === 'decrease' && value > 1) {
        value--;
      }

      input.value = value;
    });
  });
}

// Check for successful purchase and clear cart
function checkCheckoutStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('success') === 'true') {
    clearCart();
    updateCartBadge();
    showToast('Purchase successful! Your cart has been cleared.');
    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Init
async function initProductsPage() {
  // Load data asynchronously
  await loadPrices(); // awaits API or fallback
  loadCart(); // sync
  initQuantitySteppers(); // sync
  checkCheckoutStatus(); // sync

  // Hide loading overlay after data is loaded
  hidePageLoader();

  // Fallback timeout to ensure loader hides even if async hangs (though unlikely)
  setTimeout(hidePageLoader, 5000);

  // Show main content (already in HTML, but ensure)
  const mainContent = document.getElementById('products');
  if (mainContent) mainContent.style.display = 'block';

  // Attach event listeners
  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-product-id');
      const qtyInput = btn.closest('.product-card')?.querySelector('.quantity-input');
      const qty = parseInt(qtyInput?.value) || 1;
      addToCart(key, qty);
      showToast('Item added to cart!');
    });
  });

  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);
}

document.addEventListener('DOMContentLoaded', initProductsPage);
