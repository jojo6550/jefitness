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
    // fallback
    const fallbackKeys = ['seamoss-small', 'seamoss-large', 'coconut-water', 'coconut-jelly'];
    fallbackKeys.forEach(key => {
      productPrices[key] = 100.1;
      productsData[key] = { name: key, price: 100.1, currency: 'usd' };
    });
    updateProductCards();
  }
}

function updateProductCards() {
  Object.entries(productsData).forEach(([key, product]) => {
    const card = document.querySelector(`[data-product-id="${key}"]`);
    if (!card) return;
    card.querySelector('.product-price').textContent = `$${product.price.toFixed(2)}`;
    const btn = card.querySelector('.add-to-cart-btn');
    if (btn) btn.setAttribute('data-price', product.price);
  });
}

// Cart functions
function loadCart() {
  const saved = localStorage.getItem('jefitness_cart');
  if (saved) cart = JSON.parse(saved);
}

function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
}

function addToCart(key, qty = 1) {
  const item = cart.find(i => i.productKey === key);
  if (item) item.quantity += qty;
  else cart.push({ productKey: key, quantity: qty, price: productPrices[key] });
  saveCart();
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

// Init
function initProductsPage() {
  loadPrices();
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

document.addEventListener('DOMContentLoaded', initProductsPage);
