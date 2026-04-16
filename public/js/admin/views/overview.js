/**
 * Overview view — stats cards, recent clients table, live log preview.
 */
window.AdminOverview = (() => {
  const API = window.ApiConfig.getAPI_BASE();
  let logPollInterval = null;

  // ── Helpers ─────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatJMD(cents) {
    return 'JMD $' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 });
  }

  function daysLeft(isoDate) {
    if (!isoDate) return null;
    const diff = new Date(isoDate) - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  }

  function statusPill(subscription) {
    if (!subscription) return '<span class="pill pill-gray">No Plan</span>';
    const days = daysLeft(subscription.currentPeriodEnd);
    if (subscription.status === 'cancelled') return '<span class="pill pill-red">Cancelled</span>';
    if (['active', 'trialing'].includes(subscription.status)) {
      if (days !== null && days <= 14) return '<span class="pill pill-yellow">Expiring</span>';
      return '<span class="pill pill-green">Active</span>';
    }
    return `<span class="pill pill-gray">${escapeHtml(subscription?.status)}</span>`;
  }

  function avatarColor(name) {
    const colors = ['#6366f1','#8b5cf6','#10b981','#ef4444','#f59e0b','#3b82f6'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  function initials(client) {
    return ((client.firstName?.[0] || '') + (client.lastName?.[0] || '')).toUpperCase() || '?';
  }

  // ── Fetch helpers ────────────────────────────────────────
  async function fetchStats() {
    const [statsRes, revenueRes, logStatsRes] = await Promise.all([
      fetch(`${API}/api/v1/clients/statistics`, { credentials: 'include' }),
      fetch(`${API}/api/v1/admin/revenue`, { credentials: 'include' }),
      fetch(`${API}/api/v1/logs/stats`, { credentials: 'include' }),
    ]);
    const stats = statsRes.ok ? await statsRes.json() : {};
    const revenue = revenueRes.ok ? await revenueRes.json() : { revenue: 0 };
    const logStats = logStatsRes.ok ? await logStatsRes.json() : { byLevel: {} };
    return { stats, revenue, logStats };
  }

  async function fetchRecentClients() {
    const res = await fetch(`${API}/api/v1/clients?limit=10&sortBy=createdAt&sortOrder=desc`, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.clients || [];
  }

  async function fetchRecentLogs() {
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await fetch(`${API}/api/v1/logs?limit=10&from=${from}`, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.logs || [];
  }

  // ── Renderers ────────────────────────────────────────────
  function renderStats(stats, revenue, logStats) {
    const errorCount = logStats.byLevel?.error || 0;
    const errorBadge = document.getElementById('error-badge');
    if (errorBadge) {
      if (errorCount > 0) {
        errorBadge.textContent = `${errorCount} Error${errorCount > 1 ? 's' : ''}`;
        errorBadge.style.display = '';
      } else {
        errorBadge.style.display = 'none';
      }
    }

    return `
      <div class="stats-grid">
        <div class="card stat-card">
          <div class="stat-label">Total Clients</div>
          <div class="stat-value">${stats.totalClients ?? '—'}</div>
          <div class="stat-sub">All registered users</div>
        </div>
        <div class="card stat-card stat-green">
          <div class="stat-label">Active Subscriptions</div>
          <div class="stat-value">${stats.activeClients ?? '—'}</div>
          <div class="stat-sub">${stats.totalClients ? Math.round((stats.activeClients / stats.totalClients) * 100) : 0}% of clients</div>
        </div>
        <div class="card stat-card stat-blue">
          <div class="stat-label">Revenue (Month)</div>
          <div class="stat-value" style="font-size:18px">${formatJMD(revenue.revenue || 0)}</div>
          <div class="stat-sub">${revenue.month || ''}</div>
        </div>
        <div class="card stat-card stat-red">
          <div class="stat-label">Log Errors (1h)</div>
          <div class="stat-value">${errorCount}</div>
          <div class="stat-sub">Last hour</div>
        </div>
      </div>`;
  }

  function renderRecentClients(clients) {
    const rows = clients.map((c) => {
      const sub = c.subscription;
      const days = sub ? daysLeft(sub.currentPeriodEnd) : null;
      const color = avatarColor(c.firstName);
      return `
        <tr>
          <td><span class="avatar" style="background:${color}">${initials(c)}</span>${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</td>
          <td style="color:#64748b">${escapeHtml(c.email)}</td>
          <td>${sub?.plan ?? '—'}</td>
          <td>${statusPill(sub)}</td>
          <td style="color:${days !== null && days <= 14 ? '#fbbf24' : '#4ade80'}">${days !== null ? days : '—'}</td>
          <td>
            <button class="btn-sm btn-sm-green overview-add-sub" data-id="${c._id}" data-name="${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}" data-email="${escapeHtml(c.email)}">+ Sub</button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card-header">
          <span class="card-title">Recent Clients</span>
          <button class="btn btn-ghost" style="font-size:10px" id="view-all-clients">View All →</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Client</th><th>Email</th><th>Plan</th><th>Status</th><th>Days Left</th><th>Actions</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#475569;padding:20px">No clients found</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function logLevelClass(level) {
    return { error: 'log-error', warn: 'log-warn', info: 'log-info', debug: 'log-debug', http: 'log-http' }[level] || 'log-info';
  }

  function renderLogEntry(log) {
    const t = new Date(log.timestamp);
    const time = t.toLocaleTimeString('en-US', { hour12: false });
    return `
      <div class="log-entry">
        <span class="log-time">${time}</span>
        <span class="log-level ${logLevelClass(log.level)}">${log.level.toUpperCase()}</span>
        <span class="log-msg">${escapeHtml(log.message)}</span>
      </div>`;
  }

  function renderLogs(logs) {
    return `
      <div class="log-panel">
        <div class="card-header" style="background:#0f172a;border-bottom:1px solid #334155">
          <div class="live-dot"></div>
          <span style="color:#4ade80;font-weight:600;font-size:11px">LIVE</span>
          <span style="color:#64748b;font-size:11px;flex:1">Last hour</span>
          <button class="btn btn-ghost" style="font-size:10px" id="view-all-logs">View All Logs →</button>
        </div>
        <div id="overview-log-list">
          ${logs.length ? logs.map(renderLogEntry).join('') : '<div style="padding:16px;text-align:center;color:#475569">No logs in the last hour</div>'}
        </div>
      </div>`;
  }

  // ── Render ───────────────────────────────────────────────
  async function render() {
    const container = document.getElementById('view-container');
    container.innerHTML = '<div style="padding:40px;text-align:center;color:#475569">Loading...</div>';

    try {
      const [{ stats, revenue, logStats }, clients, logs] = await Promise.all([
        fetchStats(),
        fetchRecentClients(),
        fetchRecentLogs(),
      ]);

      container.innerHTML =
        renderStats(stats, revenue, logStats) +
        renderRecentClients(clients) +
        renderLogs(logs);

      // Wire "View All" buttons
      document.getElementById('view-all-clients')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-view="clients"]').click();
      });
      document.getElementById('view-all-logs')?.addEventListener('click', () => {
        document.querySelector('.nav-item[data-view="logs"]').click();
      });

      // Wire "+ Sub" buttons
      container.querySelectorAll('.overview-add-sub').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.AdminSubModal.open({
            userId: btn.dataset.id,
            name: btn.dataset.name,
            email: btn.dataset.email,
          });
        });
      });

      // Live log poll every 15s
      logPollInterval = setInterval(async () => {
        const newLogs = await fetchRecentLogs();
        const list = document.getElementById('overview-log-list');
        if (list && newLogs.length) {
          list.innerHTML = newLogs.map(renderLogEntry).join('');
        }
      }, 15000);
    } catch (err) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:#f87171">Failed to load overview: ${err.message}</div>`;
    }
  }

  function destroy() {
    clearInterval(logPollInterval);
    logPollInterval = null;
  }

  return { render, destroy };
})();
