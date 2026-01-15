let cart = JSON.parse(localStorage.getItem('jefitness_cart') || '[]');

function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
  render();
}

function render() {
  const container = document.getElementById('cart-items-list');
  if (!container) return;
  container.innerHTML = '';

  let total = 0;

  cart.forEach(item => {
    total += item.quantity;
    container.innerHTML += `
      <div>
        ${item.productKey} × ${item.quantity}
        <button onclick="removeItem('${item.productKey}')">X</button>
      </div>`;
  });

  document.getElementById('summary-item-count').textContent = total;
}

function removeItem(key) {
  cart = cart.filter(i => i.productKey !== key);
  saveCart();
}

async function checkout() {
  const token = localStorage.getItem('token');
  if (!token) return location.href = 'login.html';

  const res = await fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/products/checkout`, {
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

document.addEventListener('DOMContentLoaded', render);
