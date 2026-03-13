// Ported from view-subscription.js - Subscription Details Functions
// To be integrated into subscriptions.js

async function renderSubscriptionDetails() {
  if (!userSubscriptions.length || !userSubscriptionsSection) return;
  const sub = userSubscriptions[0];
  currentSubscriptionId = sub.stripeSubscriptionId;
  
  // Update DOM elements (requires HTML updates)
  const subscriptionTypeEl = document.getElementById('subscriptionType');
  const statusEl = document.getElementById('subscriptionStatus');
  const amountEl = document.getElementById('subscriptionAmount');
  // ... more DOM updates
  
  const now = new Date();
  const periodEnd = parseDate(sub.currentPeriodEnd, new Date(now.getTime() + 30 * 86400000));
  const daysLeft = Math.ceil((periodEnd - now) / 86400000);
  
  // Status logic
  const isExpired = daysLeft <= 0;
  if (isExpired) {
    statusEl.className = 'badge bg-danger';
    statusEl.textContent = 'EXPIRED';
  } else {
    statusEl.className = 'badge bg-success';
    statusEl.textContent = 'ACTIVE';
  }
  
  log('Rendered subscription details for:', sub.plan);
}

async function loadInvoices(subId) {
  const userToken = localStorage.getItem('token');
  if (!subId || !userToken) {
    log('Skipping invoices - no sub or token');
    return;
  }
  
  try {
    const res = await fetch(`${window.API_BASE}/api/v1/subscriptions/${subId}/invoices`, {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    const data = await handleApiResponse(res);
    renderInvoices(data.data || []);
  } catch (err) {
    log('Invoices load failed:', err);
  }
}

function renderInvoices(invoices) {
  const invoicesList = document.getElementById('invoicesList');
  if (!invoicesList) return;
  
  invoicesList.innerHTML = '';
  if (invoices.length === 0) {
    document.getElementById('noInvoices').style.display = 'block';
    return;
  }
  
  invoices.forEach(invoice => {
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex justify-content-between align-items-center py-3';
    item.innerHTML = `
      <div>Invoice #${invoice.number || invoice.id.slice(-8)} - ${formatCurrency(invoice.amount_paid / 100 || 0)}</div>
      <a href="${invoice.invoice_pdf || ''}" target="_blank" class="btn btn-sm btn-primary">Download</a>
    `;
    invoicesList.appendChild(item);
  });
}
