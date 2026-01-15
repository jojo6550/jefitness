let cart = [];
let productPrices = {};

function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
}

function addToCart(productKey, quantity) {
  const existing = cart.find(i => i.productKey === productKey);
  if (existing) existing.quantity += quantity;
  else cart.push({ productKey, quantity });

  saveCart();
}

async function loadPrices() {
  const res = await fetch(`${ApiConfig.getAPI_BASE()}/api/v1/products`);
  const data = await res.json();

  Object.entries(data.products).forEach(([key, p]) => {
    productPrices[key] = p.price;
    document.querySelector(`[data-price-for="${key}"]`).textContent =
      `$${(p.price / 100).toFixed(2)}`;
  });
}

async function checkout() {
  const token = localStorage.getItem('token');
  if (!token) return location.href = 'login.html';

  const res = await fetch(`${ApiConfig.getAPI_BASE()}/api/v1/products/checkout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items: cart })
  });

  const data = await res.json();
  if (data.success) location.href = data.checkoutUrl;
}

document.addEventListener('DOMContentLoaded', loadPrices);
