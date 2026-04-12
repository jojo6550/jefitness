/**
 * Admin Tickets view — Support ticket management.
 */
window.AdminTickets = (() => {
  const API = window.ApiConfig.getAPI_BASE();

  let state = {
    page: 1,
    statusFilter: '',
    categoryFilter: '',
  };

  let currentTicketId = null;

  const CATEGORY_LABELS = {
    'bug-report': 'Bug Report',
    'feature-request': 'Feature Request',
    'billing-issue': 'Billing Issue',
    'account-issue': 'Account Issue',
    'general-inquiry': 'General Inquiry',
  };

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = String(str ?? '');
    return d.innerHTML;
  }

  function pillHtml(status) {
    const map = { draft: 'pill-gray', submitted: 'pill-red', seen: 'pill-yellow', resolved: 'pill-green' };
    const labels = { draft: 'Draft', submitted: 'Submitted', seen: 'Seen', resolved: 'Resolved' };
    return `<span class="pill ${map[status] || 'pill-gray'}">${labels[status] || status}</span>`;
  }

  function catBadge(category) {
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:#1e293b;color:#a5b4fc;border:1px solid #3730a3">${escapeHtml(CATEGORY_LABELS[category] || category)}</span>`;
  }

  function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function avatarHtml(name) {
    const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const colors = ['#7c3aed','#0891b2','#059669','#d97706','#dc2626'];
    const color = colors[initials.charCodeAt(0) % colors.length];
    return `<span class="avatar" style="background:${color}">${escapeHtml(initials)}</span>`;
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(`${API}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || `Error ${res.status}`);
    return data;
  }

  function buildParams() {
    const p = new URLSearchParams({ page: state.page, limit: 20 });
    if (state.statusFilter) p.set('status', state.statusFilter);
    if (state.categoryFilter) p.set('category', state.categoryFilter);
    return p;
  }

  async function fetchTickets() {
    return apiFetch(`/api/v1/tickets/admin?${buildParams()}`);
  }

  function renderFilters() {
    const statuses = ['', 'submitted', 'seen', 'resolved', 'draft'];
    const statusLabels = { '': 'All', submitted: 'Submitted', seen: 'Seen', resolved: 'Resolved', draft: 'Draft' };
    const filterPills = statuses.map(s =>
      `<button class="filter-pill ${state.statusFilter === s ? 'active' : ''}"
        onclick="window.AdminTickets._setStatus('${s}')">${statusLabels[s]}</button>`
    ).join('');

    const catOptions = Object.entries(CATEGORY_LABELS).map(([v, l]) =>
      `<option value="${v}" ${state.categoryFilter === v ? 'selected' : ''}>${escapeHtml(l)}</option>`
    ).join('');

    return `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${filterPills}
        <select id="cat-filter" onchange="window.AdminTickets._setCat(this.value)"
          style="margin-left:auto;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:4px 10px;color:#e2e8f0;font-size:11px;outline:none">
          <option value="">All Categories</option>
          ${catOptions}
        </select>
      </div>`;
  }

  function renderTable(tickets) {
    if (!tickets || tickets.length === 0) {
      return `<div style="text-align:center;padding:40px;color:#475569">
        <i class="bi bi-ticket" style="font-size:32px;display:block;margin-bottom:10px;color:#334155"></i>
        <p style="margin:0;font-size:13px">No tickets found.</p>
      </div>`;
    }

    const rows = tickets.map(t => {
      const user = t.userId || {};
      const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';
      const email = user.email || '—';
      const subject = t.subject.length > 60 ? t.subject.slice(0, 60) + '…' : t.subject;

      return `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            ${avatarHtml(name)}
            <div>
              <div style="font-weight:600;color:#e2e8f0;font-size:12px">${escapeHtml(name)}</div>
              <div style="font-size:10px;color:#64748b">${escapeHtml(email)}</div>
            </div>
          </div>
        </td>
        <td>${catBadge(t.category)}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(subject)}</td>
        <td>${pillHtml(t.status)}</td>
        <td style="white-space:nowrap">${fmtDate(t.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-sm-blue" onclick="window.AdminTickets._openModal('${t._id}')">
            View
          </button>
        </td>
      </tr>`;
    }).join('');

    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Category</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderPagination(pagination) {
    if (!pagination || pagination.pages <= 1) return '';
    const { page, pages } = pagination;
    let html = `<div class="pagination">`;
    html += `<button class="page-btn" onclick="window.AdminTickets._page(${page - 1})" ${page === 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>`;
    for (let i = 1; i <= pages; i++) {
      html += `<button class="page-btn ${i === page ? 'current' : ''}" onclick="window.AdminTickets._page(${i})">${i}</button>`;
    }
    html += `<button class="page-btn" onclick="window.AdminTickets._page(${page + 1})" ${page === pages ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>`;
    html += `<span class="page-info">${pagination.total} ticket${pagination.total !== 1 ? 's' : ''}</span>`;
    html += `</div>`;
    return html;
  }

  async function loadView() {
    const container = document.getElementById('view-container');
    if (!container) return;

    try {
      const data = await fetchTickets();
      const { tickets, pagination, unreadCount } = data.data;

      // Update sidebar badge
      const badge = document.getElementById('tickets-unread-badge');
      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }
      }

      container.innerHTML = `
        <div class="card" style="margin-bottom:0">
          <div class="card-header">
            <span class="card-title">Support Tickets</span>
            ${unreadCount > 0 ? `<span class="badge badge-red">${unreadCount} unread</span>` : ''}
          </div>
          <div style="padding:14px 16px 0">
            ${renderFilters()}
          </div>
          <div id="tickets-table-wrap">
            ${renderTable(tickets)}
          </div>
          ${renderPagination(pagination)}
        </div>

        <!-- Ticket detail modal -->
        <div class="modal-backdrop" id="ticket-modal" style="display:none;align-items:center;justify-content:center">
          <div class="modal-box" style="width:520px;max-width:95vw" id="ticket-modal-content"></div>
        </div>`;

    } catch (err) {
      container.innerHTML = `<div style="padding:20px;color:#f87171;font-size:13px">Failed to load tickets: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function openModal(ticketId) {
    currentTicketId = ticketId;
    const modal = document.getElementById('ticket-modal');
    const content = document.getElementById('ticket-modal-content');
    if (!modal || !content) return;

    content.innerHTML = `<div style="text-align:center;padding:30px;color:#64748b">
      <div class="spinner-border spinner-border-sm" role="status"></div>
    </div>`;
    modal.style.display = 'flex';

    try {
      const data = await apiFetch(`/api/v1/tickets/admin/${ticketId}`);
      const t = data.data.ticket;
      const user = t.userId || {};
      const name = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown';

      const isResolved = t.status === 'resolved';
      const canResolve = ['submitted', 'seen'].includes(t.status);

      content.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div class="modal-title" style="margin-bottom:0">Ticket Detail</div>
          <button onclick="window.AdminTickets._closeModal()" style="background:none;border:none;color:#64748b;font-size:20px;cursor:pointer;line-height:1">&times;</button>
        </div>

        <!-- User info -->
        <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:12px 14px;margin-bottom:16px;display:flex;align-items:center;gap:10px">
          ${avatarHtml(name)}
          <div>
            <div style="font-weight:600;color:#e2e8f0;font-size:13px">${escapeHtml(name)}</div>
            <div style="font-size:11px;color:#64748b">${escapeHtml(user.email || '—')}</div>
          </div>
          <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
            ${catBadge(t.category)}
            ${pillHtml(t.status)}
          </div>
        </div>

        <!-- Subject & date -->
        <div style="margin-bottom:4px">
          <span style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Subject</span>
        </div>
        <div style="font-size:14px;font-weight:600;color:#f1f5f9;margin-bottom:4px">${escapeHtml(t.subject)}</div>
        <div style="font-size:11px;color:#475569;margin-bottom:16px">Submitted ${fmtDate(t.createdAt)}</div>

        <!-- Description -->
        <div style="margin-bottom:6px">
          <span style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Description</span>
        </div>
        <div style="background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;font-size:13px;color:#94a3b8;white-space:pre-wrap;max-height:200px;overflow-y:auto;margin-bottom:16px;line-height:1.6">${escapeHtml(t.description)}</div>

        ${isResolved ? `
          <!-- Resolved info -->
          <div style="background:#052e16;border:1px solid #166534;border-radius:8px;padding:12px 14px;margin-bottom:16px">
            <div style="font-size:11px;font-weight:600;color:#4ade80;margin-bottom:6px">Resolved on ${fmtDate(t.resolvedAt)}</div>
            ${t.adminNote ? `<div style="font-size:13px;color:#86efac;white-space:pre-wrap">${escapeHtml(t.adminNote)}</div>` : '<div style="font-size:12px;color:#166534">No admin note.</div>'}
          </div>` : ''}

        ${canResolve ? `
          <!-- Admin note -->
          <div style="margin-bottom:6px">
            <span style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em">Admin Note (optional)</span>
          </div>
          <textarea id="modal-admin-note" rows="3" maxlength="1000" placeholder="Add a note for the user…"
            style="width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px 14px;color:#e2e8f0;font-size:13px;font-family:inherit;resize:vertical;outline:none;margin-bottom:16px"></textarea>
          <div style="display:flex;justify-content:flex-end;gap:8px">
            <button class="btn btn-ghost" onclick="window.AdminTickets._closeModal()">Close</button>
            <button class="btn btn-sm-green" style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:#052e16;color:#4ade80"
              id="btn-resolve" onclick="window.AdminTickets._resolve()">
              <i class="bi bi-check-circle me-1"></i> Mark as Resolved
            </button>
          </div>` : `
          <div style="display:flex;justify-content:flex-end">
            <button class="btn btn-ghost" onclick="window.AdminTickets._closeModal()">Close</button>
          </div>`}`;

      // Refresh table silently to reflect new "seen" status
      await refreshTable();

    } catch (err) {
      content.innerHTML = `<div style="padding:20px;color:#f87171;font-size:13px">Failed to load ticket: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function refreshTable() {
    try {
      const data = await fetchTickets();
      const { tickets, pagination, unreadCount } = data.data;
      const tableWrap = document.getElementById('tickets-table-wrap');
      if (tableWrap) tableWrap.innerHTML = renderTable(tickets);

      const badge = document.getElementById('tickets-unread-badge');
      if (badge) {
        if (unreadCount > 0) {
          badge.textContent = unreadCount;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }
      }
    } catch (_) { /* silent */ }
  }

  async function resolve() {
    if (!currentTicketId) return;
    const note = document.getElementById('modal-admin-note');
    const adminNote = note ? note.value.trim() : '';
    const btn = document.getElementById('btn-resolve');
    if (btn) { btn.disabled = true; btn.textContent = 'Resolving…'; }

    try {
      await apiFetch(`/api/v1/tickets/admin/${currentTicketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'resolved', adminNote }),
      });
      closeModal();
      await loadView();
    } catch (err) {
      alert(`Failed to resolve ticket: ${err.message}`);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle me-1"></i> Mark as Resolved'; }
    }
  }

  function closeModal() {
    const modal = document.getElementById('ticket-modal');
    if (modal) modal.style.display = 'none';
    currentTicketId = null;
  }

  // Close modal on backdrop click
  document.addEventListener('click', (e) => {
    const modal = document.getElementById('ticket-modal');
    if (modal && e.target === modal) closeModal();
  });

  function render() {
    loadView();
  }

  function destroy() {
    closeModal();
  }

  // Public API for inline event handlers
  return {
    render,
    destroy,
    _openModal: openModal,
    _closeModal: closeModal,
    _resolve: resolve,
    _setStatus(s) { state.statusFilter = s; state.page = 1; loadView(); },
    _setCat(c) { state.categoryFilter = c; state.page = 1; loadView(); },
    _page(p) { state.page = p; loadView(); },
  };
})();
