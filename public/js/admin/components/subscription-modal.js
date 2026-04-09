/**
 * Subscription modal component.
 * Usage:
 *   window.AdminSubModal.open({ userId, name, email, onSuccess? })
 *   window.AdminSubModal.openBulk(userIds, onSuccess)
 */
window.AdminSubModal = (() => {
  const API = window.ApiConfig.getAPI_BASE();

  const PLANS = [
    { key: '1-month',  label: '1 Month',   days: 30,  price: 'JMD $2,500',  badge: null },
    { key: '3-month',  label: '3 Months',  days: 90,  price: 'JMD $6,500',  badge: 'POPULAR' },
    { key: '6-month',  label: '6 Months',  days: 180, price: 'JMD $11,000', badge: null },
    { key: '12-month', label: '12 Months', days: 365, price: 'JMD $18,000', badge: 'BEST VALUE' },
  ];

  let selectedPlan = PLANS[1];
  let context = null;
  let isBulk = false;

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(daysFromNow) {
    const d = new Date(Date.now() + daysFromNow * 86400000);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getEffectiveDays() {
    const toggle = document.getElementById('override-toggle');
    if (toggle && toggle.checked) {
      const val = parseInt(document.getElementById('days-input').value, 10);
      return isNaN(val) || val < 1 ? selectedPlan.days : val;
    }
    return selectedPlan.days;
  }

  function renderPlanGrid() {
    return PLANS.map((p) => `
      <div class="plan-tile ${p.key === selectedPlan.key ? 'selected' : ''}" data-plan="${p.key}">
        <div class="plan-tile-name">${p.label}</div>
        <div class="plan-tile-price">${p.price}</div>
        ${p.badge ? `<span class="plan-tile-badge">${p.badge}</span>` : ''}
      </div>`).join('');
  }

  function renderSummary() {
    const days = getEffectiveDays();
    const expiry = formatDate(days);
    return `
      <div class="summary-row"><span>Plan</span><span class="summary-val">${selectedPlan.label}</span></div>
      <div class="summary-row"><span>Starts</span><span class="summary-val">Today, ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
      <div class="summary-row"><span>Expires</span><span class="summary-val">${expiry} (${days} days)</span></div>
      <div class="summary-row"><span>Via Stripe</span><span class="summary-val">✓ Creates real subscription</span></div>
      <div class="summary-row"><span>Status</span><span style="color:#4ade80;font-weight:600">Active immediately</span></div>`;
  }

  function updateSummary() {
    const days = getEffectiveDays();
    document.getElementById('sub-summary').innerHTML = renderSummary();
    document.getElementById('days-expiry').textContent = formatDate(days);
  }

  function open({ userId, name, email, onSuccess }) {
    isBulk = false;
    context = { userId, name, email, onSuccess };
    selectedPlan = PLANS[1];
    _show(`Client: <strong style="color:#a5b4fc">${escapeHtml(name)}</strong> · ${escapeHtml(email)}`);
  }

  function openBulk(userIds, onSuccess) {
    isBulk = true;
    context = { userIds, onSuccess };
    selectedPlan = PLANS[1];
    _show(`Bulk: <strong style="color:#a5b4fc">${userIds.length} client(s)</strong> — same plan applied to all`);
  }

  function _show(subtitle) {
    const modal = document.getElementById('sub-modal');
    if (!modal) return;
    document.getElementById('sub-modal-client').innerHTML = subtitle;
    document.getElementById('plan-grid').innerHTML = renderPlanGrid();
    document.getElementById('override-toggle').checked = false;
    document.getElementById('days-row').style.display = 'none';
    document.getElementById('days-input').value = selectedPlan.days;
    document.getElementById('sub-summary').innerHTML = renderSummary();
    modal.classList.add('visible');
    _wireEvents();
  }

  function close() {
    document.getElementById('sub-modal')?.classList.remove('visible');
  }

  function _wireEvents() {
    document.querySelectorAll('.plan-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        selectedPlan = PLANS.find((p) => p.key === tile.dataset.plan);
        document.querySelectorAll('.plan-tile').forEach((t) => t.classList.remove('selected'));
        tile.classList.add('selected');
        document.getElementById('days-input').value = selectedPlan.days;
        updateSummary();
      });
    });
  }

  async function submit() {
    const btn = document.getElementById('sub-confirm');
    btn.disabled = true;
    btn.textContent = 'Creating...';

    const days = getEffectiveDays();
    const overrideDays = document.getElementById('override-toggle').checked ? days : undefined;

    try {
      if (isBulk) {
        let failed = 0;
        for (const userId of context.userIds) {
          const res = await fetch(`${API}/api/v1/admin/subscriptions`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, planKey: selectedPlan.key, overrideDays }),
          });
          if (!res.ok) failed++;
        }
        if (failed) alert(`${failed} subscription(s) failed. Check logs for details.`);
        close();
        if (context.onSuccess) context.onSuccess();
      } else {
        const res = await fetch(`${API}/api/v1/admin/subscriptions`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: context.userId, planKey: selectedPlan.key, overrideDays }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.msg || 'Failed to create subscription'); }
        else {
          close();
          if (context.onSuccess) context.onSuccess();
        }
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '⚡ Create via Stripe';
    }
  }

  function init() {
    document.getElementById('sub-cancel')?.addEventListener('click', close);
    document.getElementById('sub-confirm')?.addEventListener('click', submit);
    document.getElementById('sub-modal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close();
    });
    document.getElementById('override-toggle')?.addEventListener('change', (e) => {
      document.getElementById('days-row').style.display = e.target.checked ? 'flex' : 'none';
      updateSummary();
    });
    document.getElementById('days-input')?.addEventListener('input', updateSummary);
  }

  document.addEventListener('DOMContentLoaded', init);

  return { open, openBulk, close };
})();
