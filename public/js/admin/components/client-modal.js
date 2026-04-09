/**
 * Client quick-view modal.
 * Usage: window.AdminClientModal.open(clientId)
 */
window.AdminClientModal = (() => {
  const API = window.ApiConfig.getAPI_BASE();

  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function avatarColor(name) {
    const colors = ['#6366f1','#8b5cf6','#10b981','#ef4444','#f59e0b','#3b82f6','#ec4899'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function daysLeft(iso) {
    if (!iso) return null;
    return Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86400000));
  }

  function subStatusHtml(sub) {
    if (!sub) return '<span class="cm-pill cm-pill-gray">No Plan</span>';
    const days = daysLeft(sub.currentPeriodEnd);
    if (sub.status === 'canceled') return '<span class="cm-pill cm-pill-red">Canceled</span>';
    if (['active','trialing'].includes(sub.status)) {
      if (days !== null && days <= 14) return '<span class="cm-pill cm-pill-yellow">Expiring Soon</span>';
      return '<span class="cm-pill cm-pill-green">Active</span>';
    }
    return `<span class="cm-pill cm-pill-gray">${esc(sub.status)}</span>`;
  }

  function activityHtml(status) {
    const map = {
      active:    'cm-pill-green',
      inactive:  'cm-pill-red',
      'on-break':'cm-pill-yellow',
    };
    return `<span class="cm-pill ${map[status] || 'cm-pill-gray'}">${esc(status || '—')}</span>`;
  }

  function renderContent(client) {
    const sub = client.subscription;
    const days = sub ? daysLeft(sub.currentPeriodEnd) : null;
    const color = avatarColor(client.firstName);
    const initials = ((client.firstName?.[0] || '') + (client.lastName?.[0] || '')).toUpperCase() || '?';
    const daysColor = days !== null && days <= 14 ? '#fbbf24' : '#4ade80';

    return `
      <div class="cm-header">
        <div class="cm-avatar" style="background:${color}">${initials}</div>
        <div class="cm-header-info">
          <div class="cm-name">${esc(client.firstName)} ${esc(client.lastName)}</div>
          <div class="cm-email">${esc(client.email)}</div>
        </div>
        <button class="cm-close" id="cm-close-btn" aria-label="Close">✕</button>
      </div>

      <div class="cm-grid">
        <div class="cm-field">
          <div class="cm-field-label">Status</div>
          <div>${activityHtml(client.activityStatus)}</div>
        </div>
        <div class="cm-field">
          <div class="cm-field-label">Role</div>
          <div><span class="cm-pill cm-pill-indigo">${esc(client.role)}</span></div>
        </div>
        <div class="cm-field">
          <div class="cm-field-label">Joined</div>
          <div class="cm-field-val">${fmtDate(client.createdAt)}</div>
        </div>
        <div class="cm-field">
          <div class="cm-field-label">Verified</div>
          <div class="cm-field-val">${client.isEmailVerified ? '✓ Yes' : '✗ No'}</div>
        </div>
        <div class="cm-field">
          <div class="cm-field-label">Subscription</div>
          <div>${subStatusHtml(sub)}</div>
        </div>
        <div class="cm-field">
          <div class="cm-field-label">Plan</div>
          <div class="cm-field-val">${sub?.plan ?? '—'}</div>
        </div>
        ${days !== null ? `
        <div class="cm-field cm-field-full">
          <div class="cm-field-label">Days Remaining</div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="cm-days-bar-wrap">
              <div class="cm-days-bar" style="width:${Math.min(100, (days / 365) * 100)}%;background:${daysColor}"></div>
            </div>
            <span style="font-size:13px;font-weight:700;color:${daysColor}">${days}d</span>
          </div>
        </div>` : ''}
      </div>

      <div class="cm-footer">
        <button class="cm-btn cm-btn-ghost" id="cm-cancel-btn">Close</button>
        <button class="cm-btn cm-btn-primary" id="cm-profile-btn">
          View Full Profile <span style="opacity:.6">→</span>
        </button>
      </div>
    `;
  }

  // Detect role once, cache it
  let _role = null;
  async function getRole() {
    if (_role) return _role;
    try {
      const res = await fetch(`${API}/api/v1/auth/me`, { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      _role = data.data?.role || null;
    } catch { _role = null; }
    return _role;
  }

  async function open(clientId) {
    const backdrop = document.getElementById('client-modal-backdrop');
    const box = document.getElementById('client-modal-box');
    if (!backdrop || !box) return;

    box.innerHTML = `<div class="cm-loading"><div class="cm-spinner"></div><span>Loading…</span></div>`;
    backdrop.classList.add('visible');

    const role = await getRole();
    const endpoint = role === 'trainer'
      ? `${API}/api/v1/trainer/client/${clientId}`
      : `${API}/api/v1/admin/clients/${clientId}`;

    fetch(endpoint, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((data) => {
        // Admin returns { client }, trainer returns { client, appointmentHistory, ... }
        box.innerHTML = renderContent(data.client);

        document.getElementById('cm-close-btn')?.addEventListener('click', close);
        document.getElementById('cm-cancel-btn')?.addEventListener('click', close);
        document.getElementById('cm-profile-btn')?.addEventListener('click', () => {
          window.location.href = `/clients/${clientId}`;
        });
      })
      .catch(() => {
        box.innerHTML = `<div class="cm-loading" style="color:#f87171">Failed to load client.<br><button class="cm-btn cm-btn-ghost" style="margin-top:12px" onclick="window.AdminClientModal.close()">Close</button></div>`;
      });
  }

  function close() {
    document.getElementById('client-modal-backdrop')?.classList.remove('visible');
  }

  // Close on backdrop click
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('client-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'client-modal-backdrop') close();
    });
  });

  return { open, close };
})();
