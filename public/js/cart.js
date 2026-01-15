// 🔒 Lock scroll while loading (ADDED)
document.body.style.overflow = 'hidden';

// Reusable helper to hide the page loading overlay (UPDATED)
function hidePageLoader() {
  const loading = document.getElementById('page-loading');
  if (!loading) return;

  loading.style.opacity = '0';
  loading.style.pointerEvents = 'none';

  setTimeout(() => {
    loading.remove();
  }, 300);

  // Restore scroll
  document.body.style.overflow = '';
}

let cart = JSON.parse(localStorage.getItem('jefitness_cart') || '[]');

function saveCart() {
  localStorage.setItem('jefitness_cart', JSON.stringify(cart));
  render();
}

function render() {
  const container = document.getElementById('cart-items-list');
  const emptyCart = document.getElementById('empty-cart');
  const cartItemsContainer = document.getElementById('cart-items-container');

  // Defensive checks
  if (!container || !emptyCart || !cartItemsContainer) return;

  if (cart.length === 0) {
    emptyCart.style.display = 'block';
    cartItemsContainer.style.display = 'none';

    const itemCountEl = document.getElementById('summary-item-count');
    const subtotalEl = document.getElementById('summary-subtotal');
    const totalEl = document.getElementById('summary-total');

    if (itemCountEl) itemCountEl.textContent = '0';
    if (subtotalEl) subtotalEl.textContent = '$0.00';
    if (totalEl) totalEl.textContent = '$0.00';
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
      </div>
    `;
  });

  const itemCountEl = document.getElementById('summary-item-count');
  const subtotalEl = document.getElementById('summary-subtotal');
  const totalEl = document.getElementById('summary-total');

  if (itemCountEl) itemCountEl.textContent = itemCount;
  if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
  if (totalEl) totalEl.textContent = `$${subtotal.toFixed(2)}`;
}

function removeItem(key) {
  cart = cart.filter(i => i.productKey !== key);
  saveCart();
}

function clearCart() {
  cart = [];
  saveCart();
}

async function checkout() {
  const token = localStorage.getItem('token');
  if (!token) return location.href = 'login.html';

  try {
    const res = await fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/products/checkout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ items: cart })
    });

    const data = await res.json();
    if (data.success) location.href = data.checkoutUrl;
    else throw new Error(data.error || 'Checkout failed');

  } catch (err) {
    console.error('Checkout failed:', err);
    alert(err.message);
  }
}

// Check for successful purchase and clear cart
function checkCheckoutStatus() {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('success') === 'true') {
    clearCart();
    render();
    showToast('Purchase successful! Your cart has been cleared.');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// Load and display order history
async function loadOrderHistory() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/products/purchases`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (data.success) {
      renderOrderHistory(data.purchases);
    } else {
      renderOrderHistory([]);
    }
  } catch (err) {
    console.error('Failed to load order history:', err);
    renderOrderHistory([]);
  }
}

// Render order history
function renderOrderHistory(purchases) {
  const container = document.getElementById('order-history-container');
  if (!container) return;

  if (!purchases || purchases.length === 0) {
    container.innerHTML = '<p class="text-muted text-center">No order history found.</p>';
    return;
  }

  container.innerHTML = purchases.map(purchase => {
    const date = new Date(purchase.createdAt).toLocaleDateString();
    const itemsHtml = purchase.items.map(item => `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        ${item.name} × ${item.quantity}
        <span class="badge bg-primary rounded-pill">$${(item.totalPrice / 100).toFixed(2)}</span>
      </li>
    `).join('');

    return `
      <div class="card mb-3">
        <div class="card-header d-flex justify-content-between align-items-center">
          <span><i class="bi bi-receipt me-2"></i>Order #${purchase._id.toString().slice(-8)}</span>
          <span class="badge bg-success">${purchase.status}</span>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-8">
              <h6 class="card-title">Items Purchased</h6>
              <ul class="list-group list-group-flush">
                ${itemsHtml}
              </ul>
            </div>
            <div class="col-md-4 text-end">
              <p class="mb-1"><strong>Total: $${(purchase.totalAmount / 100).toFixed(2)}</strong></p>
              <p class="text-muted small">Date: ${date}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Toast notification
function showToast(message) {
  const toast = document.getElementById('cartToast');
  const toastMessage = document.getElementById('toastMessage');
  if (!toast || !toastMessage) return;

  toastMessage.textContent = message;
  new bootstrap.Toast(toast).show();
}

// Init (UPDATED: loader always clears)
async function initCartPage() {
  try {
    render();
    checkCheckoutStatus();
    await loadOrderHistory();

    const clearBtn = document.getElementById('clear-cart-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the cart?')) {
          clearCart();
        }
      });
    }

    const checkoutBtn = document.getElementById('checkout-btn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', checkout);

  } catch (err) {
    console.error('Cart page init failed:', err);
  } finally {
    hidePageLoader(); // ✅ guaranteed cleanup
  }
}

document.addEventListener('DOMContentLoaded', initCartPage);
