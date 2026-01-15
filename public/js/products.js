// Cart and Products Page

let cart = [];
let productPrices = {};

// Update prices in DOM
function updateProductPrices() {
  Object.entries(productPrices || {}).forEach(([key, price]) => {
    const productCard = document.querySelector(`[data-product-id="${key}"]`);
    if (!productCard) return;

    const priceEl = productCard.querySelector('.product-price');
    const addToCartBtn = productCard.querySelector('.add-to-cart-btn');

    if (priceEl) priceEl.textContent = `$${price.toFixed(2)}`;
    if (addToCartBtn) addToCartBtn.setAttribute('data-price', price.toFixed(2));
  });
}

// Load product prices from backend
async function loadPrices() {
  try {
    const res = await fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/products`);
    const data = await res.json();

    if (!data.success || !data.products) {
      console.warn('No products returned from API, using fallback prices');
      productPrices = {
        'seamoss-small': 100.1,
        'seamoss-large': 100.1,
        'coconut-water': 100.1,
        'coconut-jelly': 100.1
      };
    } else {
      Object.entries(data.products).forEach(([key, p]) => {
        productPrices[key] = p.price || 100.1;
      });
    }

    updateProductPrices();

  } catch (err) {
    console.error('Failed to load product prices:', err);
    productPrices = {
      'seamoss-small': 100.1,
      'seamoss-large': 100.1,
      'coconut-water': 100.1,
      'coconut-jelly': 100.1
    };
    updateProductPrices();
  }
}

// Cart management
function loadCart() {
  const saved = localStorage.getItem('jefitness_cart');
  if (saved) {
    try { cart = JSON.parse(saved); } catch { cart = []; }
  }
}

function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
}

function addToCart(productKey, quantity = 1) {
  const existing = cart.find(i => i.productKey === productKey);
  if (existing) existing.quantity += quantity;
  else cart.push({ productKey, quantity, price: productPrices[productKey] || 100.1 });
  saveCart();
}

function clearCart() {
  cart = [];
  localStorage.removeItem('jefitness_cart');
}

// Create checkout session
async function handleCheckout() {
  if (!cart.length) return alert('Cart empty');

  const token = localStorage.getItem('token');
  if (!token) return window.location.href = 'login.html';

  try {
    const response = await fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/products/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ items: cart.map(i => ({ productKey: i.productKey, quantity: i.quantity })) })
    });

    const data = await response.json();
    if (response.ok && data.success) window.location.href = data.checkoutUrl;
    else throw new Error(data.error || 'Failed to checkout');
  } catch (err) {
    console.error(err);
    alert(err.message);
  }
}

// Initialize page
async function initializePage() {
  await loadPrices();
  loadCart();

  document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-product-id');
      const qtyInput = btn.closest('.product-card')?.querySelector('.quantity-input');
      const qty = parseInt(qtyInput?.value) || 1;
      addToCart(key, qty);
    });
  });

  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) checkoutBtn.addEventListener('click', handleCheckout);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePage);
} else {
  initializePage();
}
