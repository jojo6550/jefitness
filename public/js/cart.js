let cart = JSON.parse(localStorage.getItem('jefitness_cart') || '[]');

function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
  render();
}

function render() {
  const container = document.getElementById('cart-items-list');
  const emptyCart = document.getElementById('empty-cart');
  const cartItemsContainer = document.getElementById('cart-items-container');

  if (!container || !emptyCart || !cartItemsContainer) return;

  if (cart.length === 0) {
    emptyCart.style.display = 'block';
    cartItemsContainer.style.display = 'none';
    document.getElementById('summary-item-count').textContent = '0';
    document.getElementById('summary-subtotal').textContent = '$0.00';
    document.getElementById('summary-total').textContent = '$0.00';
    return;
  }

  emptyCart.style.display = 'none';
  cartItemsContainer.style.display = 'block';
  container.innerHTML = '';

  let itemCount = 0;
  let subtotal = 0;

  cart.forEach(item => {
    itemCount += item.quantity;
    subtotal += item.quantity * item.price;
    container.innerHTML += `
      <div class="d-flex justify-content-between align-items-center border-bottom py-2">
        <div>
          <strong>${item.name}</strong> × ${item.quantity}
          <small class="text-muted">$${item.price.toFixed(2)} each</small>
        </div>
        <button class="btn btn-sm btn-outline-danger" onclick="removeItem('${item.productKey}')">
          <i class="bi bi-trash"></i>
        </button>
      </div>`;
  });

  document.getElementById('summary-item-count').textContent = itemCount;
  document.getElementById('summary-subtotal').textContent = `$${subtotal.toFixed(2)}`;
  document.getElementById('summary-total').textContent = `$${subtotal.toFixed(2)}`;
}

function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
}

function removeItem(key) {
  cart = cart.filter(i => i.productKey !== key);
  saveCart();
  render();
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

function initCartPage() {
  render();
  
  // Hide loading, show main content
  const loading = document.getElementById('page-loading');
  const mainContent = document.getElementById('main-content');
  if (loading) loading.style.display = 'none';
  if (mainContent) mainContent.style.display = 'block';
  
  // Clear cart button
  const clearBtn = document.getElementById('clear-cart-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear the cart?')) {
        clearCart();
        render();
      }
    });
  }
  
  // Checkout button
  const checkoutBtn = document.getElementById('checkout-btn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', checkout);
  }
}

document.addEventListener('DOMContentLoaded', initCartPage);
