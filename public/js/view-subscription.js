/**
 * view-subscription.js
 * Handles viewing and managing user subscriptions
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

let currentSubscription = null;
let userInvoices = [];

/* --------------------------------------------------
   Utilities
-------------------------------------------------- */

async function handleApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    logger.error('Non-JSON response from server', { status: response.status, preview: text.slice(0, 200) });
    throw new Error(`Server returned non-JSON (${response.status})`);
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}`);
  }

  return data;
}

function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('alertContainer');
  if (!alertContainer) {
    alert(message);
    return;
  }

  const icons = {
    success: 'bi-check-circle',
    error: 'bi-exclamation-circle',
    info: 'bi-info-circle',
    warning: 'bi-exclamation-triangle'
  };

  alertContainer.innerHTML = `
    <div class="alert alert-${type} animate__animated animate__fadeIn">
      <i class="bi ${icons[type] || icons.info} me-2"></i>
      ${message}
    </div>
  `;

  setTimeout(() => {
    const alert = alertContainer.firstElementChild;
    if (!alert) return;
    alert.classList.add('animate__fadeOut');
    setTimeout(() => alert.remove(), 500);
  }, 5000);
}

function log(...args) {
  logger.debug('ViewSubscription', { message: args.join(' ') });
}

/* --------------------------------------------------
   Subscription Details
-------------------------------------------------- */

async function loadCurrentSubscription() {
  const userToken = localStorage.getItem('token');
  if (!userToken) {
    logger.warn('No user token found');
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/user/current`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );

    const data = await handleApiResponse(res);
    currentSubscription = data.data;

    log('Subscription loaded');
    renderSubscriptionDetails();
  } catch (err) {
    logger.error('Failed to load subscription', { error: err?.message });
  }
}

function renderSubscriptionDetails() {
  const container = document.getElementById('subscriptionDetails');
  if (!container || !currentSubscription) {
    logger.warn('Cannot render subscription details - missing container or data');
    return;
  }

  const planName = (currentSubscription.plan || '').replace('-', ' ').toUpperCase();
  const statusClass = currentSubscription.status === 'active' ? 'bg-success' :
                     currentSubscription.status === 'past_due' ? 'bg-warning' :
                     currentSubscription.status === 'canceled' ? 'bg-danger' : 'bg-secondary';

  container.innerHTML = `
    <div class="card mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <h5 class="mb-0">${planName} Plan</h5>
        <span class="badge ${statusClass}">${currentSubscription.status?.toUpperCase()}</span>
      </div>
      <div class="card-body">
        <div class="row">
          <div class="col-md-6">
            <p><strong>Monthly Amount:</strong> $${(currentSubscription.amount / 100).toFixed(2)}</p>
            <p><strong>Current Period Start:</strong> ${new Date(currentSubscription.currentPeriodStart).toLocaleDateString()}</p>
            <p><strong>Current Period End:</strong> ${new Date(currentSubscription.currentPeriodEnd).toLocaleDateString()}</p>
          </div>
          <div class="col-md-6">
            <p><strong>Subscription ID:</strong> <code>${currentSubscription.stripeSubscriptionId}</code></p>
            <p><strong>Created:</strong> ${new Date(currentSubscription.createdAt).toLocaleDateString()}</p>
          </div>
      </div>
  `;

  // Show/hide buttons based on status
  const cancelBtn = document.getElementById('cancelSubscriptionBtn');
  const resumeBtn = document.getElementById('resumeSubscriptionBtn');

  if (cancelBtn && resumeBtn) {
    if (currentSubscription.status === 'active' || currentSubscription.status === 'trialing') {
      cancelBtn.style.display = 'inline-block';
      resumeBtn.style.display = 'none';
    } else if (currentSubscription.cancelAtPeriodEnd) {
      cancelBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-block';
    } else {
      cancelBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
    }
  }
}

/* --------------------------------------------------
   Invoices
-------------------------------------------------- */

async function loadInvoices() {
  const userToken = localStorage.getItem('token');
  if (!userToken || !currentSubscription?.stripeSubscriptionId) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/${currentSubscription.stripeSubscriptionId}/invoices`,
      { headers: { Authorization: `Bearer ${userToken}` } }
    );

    const data = await handleApiResponse(res);
    userInvoices = data.data || [];

    log('Invoices loaded', { count: userInvoices.length });
    renderInvoices();
  } catch (err) {
    logger.error('Failed to load invoices', { error: err?.message });
  }
}

function renderInvoices() {
  const container = document.getElementById('invoicesList');
  if (!container) return;

  if (userInvoices.length === 0) {
    container.innerHTML = '<p class="text-muted">No invoices found.</p>';
    return;
  }

  container.innerHTML = userInvoices.map(invoice => `
    <div class="d-flex justify-content-between align-items-center p-3 border-bottom">
      <div>
        <strong>${new Date(invoice.created * 1000).toLocaleDateString()}</strong>
        <span class="badge bg-${invoice.status === 'paid' ? 'success' : 'warning'} ms-2">${invoice.status}</span>
        <div class="text-muted small">$${(invoice.amount_paid / 100).toFixed(2)}</div>
      <a href="${invoice.hosted_invoice_url}" target="_blank" class="btn btn-sm btn-outline-primary">
        <i class="bi bi-download"></i> Download
      </a>
    </div>
  `).join('');
}

/* --------------------------------------------------
   Cancel/Resume Subscription
-------------------------------------------------- */

window.openCancelModal = function(subscriptionId) {
  currentSubscriptionId = subscriptionId;
  new bootstrap.Modal(document.getElementById('cancelModal')).show();
};

window.confirmCancel = async function() {
  const userToken = localStorage.getItem('token');
  if (!userToken || !currentSubscriptionId) return;

  const atPeriodEnd = document.getElementById('atPeriodEndCheck').checked;

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/${currentSubscriptionId}/cancel`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        },
        body: JSON.stringify({ atPeriodEnd })
      }
    );

    await handleApiResponse(res);

    showAlert(atPeriodEnd ? 'Subscription will be canceled at period end' : 'Subscription canceled');
    bootstrap.Modal.getInstance(document.getElementById('cancelModal')).hide();
    await loadCurrentSubscription();
  } catch (err) {
    logger.error('Cancel subscription failed', { error: err?.message });
    showAlert(err.message, 'error');
  }
};

window.openResumeModal = function(subscriptionId) {
  currentSubscriptionId = subscriptionId;
  new bootstrap.Modal(document.getElementById('resumeModal')).show();
};

window.confirmResume = async function() {
  const userToken = localStorage.getItem('token');
  if (!userToken || !currentSubscriptionId) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/subscriptions/${currentSubscriptionId}/resume`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        }
      }
    );

    await handleApiResponse(res);

    showAlert('Subscription resumed successfully');
    bootstrap.Modal.getInstance(document.getElementById('resumeModal')).hide();
    await loadCurrentSubscription();
  } catch (err) {
    logger.error('Resume subscription failed', { error: err?.message });
    showAlert(err.message, 'error');
  }
};

/* --------------------------------------------------
   Download Invoices
-------------------------------------------------- */

window.downloadInvoices = async function(subscriptionId) {
  await loadInvoices();
};

/* --------------------------------------------------
   Init
-------------------------------------------------- */

document.addEventListener('DOMContentLoaded', async () => {
  logger.debug('View subscription page loaded');

  const userToken = localStorage.getItem('token');
  if (!userToken) {
    window.location.href = 'login.html';
    return;
  }

  // Setup event listeners
  document.getElementById('confirmCancelBtn')?.addEventListener('click', confirmCancel);
  document.getElementById('confirmResumeBtn')?.addEventListener('click', confirmResume);

  await loadCurrentSubscription();
  if (currentSubscription) {
    await loadInvoices();
  }
});
