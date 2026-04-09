/**
 * Clients view — searchable/paginated client table with bulk ops and subscription management.
 */
window.AdminClients = (() => {
  const API = window.ApiConfig.getAPI_BASE();
  const PAGE_SIZE = 20;

  let state = { page: 1, search: '', selected: new Set() };
  let debounceTimer = null;

  // ── Helpers ─────────────────────────────────────────────
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function daysLeft(isoDate) {
    if (!isoDate) return null;
    return Math.max(0, Math.ceil((new Date(isoDate) - Date.now()) / 86400000));
  }

  function statusPill(sub) {
    if (!sub) return '<span class="pill pill-gray">No Plan</span>';
    const days = daysLeft(sub.currentPeriodEnd);
    if (sub.status === 'canceled') return '<span class="pill pill-red">Canceled</span>';
    if (['active', 'trialing'].includes(sub.status)) {
      if (days !== null && days <= 14) return '<span class="pill pill-yellow">Expiring</span>';
      return '<span class="pill pill-green">Active</span>';
    }
    return `<span class="pill pill-gray">${escapeHtml(sub?.status)}</span>`;
  }

  function avatarColor(name) {
    const colors = ['#6366f1','#8b5cf6','#10b981','#ef4444','#f59e0b','#3b82f6'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  function initials(c) {
    return ((c.firstName?.[0] || '') + (c.lastName?.[0] || '')).toUpperCase() || '?';
  }

  // ── Data fetching ────────────────────────────────────────
  async function fetchClients() {
    const params = new URLSearchParams({
      page: state.page,
      limit: PAGE_SIZE,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    if (state.search) params.set('search', state.search);
    const res = await fetch(`${API}/api/v1/clients?${params}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch clients');
    return res.json();
  }

  // ── Bulk bar ─────────────────────────────────────────────
  function updateBulkBar() {
    const bar = document.getElementById('bulk-bar');
    const count = document.getElementById('bulk-count');
    if (!bar) return;
    if (state.selected.size > 0) {
      bar.classList.add('visible');
      count.textContent = `${state.selected.size} selected`;
    } else {
      bar.classList.remove('visible');
    }
  }

  function toggleSelect(id) {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    updateBulkBar();
    const cb = document.querySelector(`input[data-id="${id}"]`);
    if (cb) cb.checked = state.selected.has(id);
  }

  function selectAll(checked, ids) {
    if (checked) ids.forEach((id) => state.selected.add(id));
    else ids.forEach((id) => state.selected.delete(id));
    document.querySelectorAll('input[data-id]').forEach((cb) => { cb.checked = checked; });
    updateBulkBar();
  }

  // ── Actions ──────────────────────────────────────────────
  async function deleteClient(id, name) {
    if (!confirm(`Delete ${escapeHtml(name)}? This cannot be undone.`)) return;
    const res = await fetch(`${API}/api/v1/clients/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) {
      alert('Failed to delete client');
      return;
    }
    state.selected.delete(id);
    await loadAndRender();
  }

  async function bulkDelete() {
    const ids = Array.from(state.selected);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} client(s)? This cannot be undone.`)) return;

    const res = await fetch(`${API}/api/v1/admin/clients/bulk`, {
      method: 'DELETE',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds: ids }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.msg || 'Bulk delete failed'); return; }
    state.selected.clear();
    await loadAndRender();
  }

  // ── Table rendering ──────────────────────────────────────
  function renderRow(client) {
    const sub = client.subscription;
    const days = sub ? daysLeft(sub.currentPeriodEnd) : null;
    const color = avatarColor(client.firstName);
    const isSelected = state.selected.has(client._id);
    const daysColor = days !== null && days <= 14 ? '#fbbf24' : '#4ade80';

    return `
      <tr>
        <td><input type="checkbox" class="cb" data-id="${client._id}" ${isSelected ? 'checked' : ''}></td>
        <td style="display:flex;align-items:center">
          <span class="avatar" style="background:${color}">${initials(client)}</span>
          <span>${escapeHtml(client.firstName)} ${escapeHtml(client.lastName)}</span>
        </td>
        <td style="color:#64748b">${escapeHtml(client.email)}</td>
        <td>${sub?.plan ?? '—'}</td>
        <td>${statusPill(sub)}</td>
        <td style="color:${days !== null ? daysColor : '#475569'}">${days !== null ? days : '—'}</td>
        <td>
          <button class="btn-sm btn-sm-blue client-view" data-id="${client._id}">View</button>
          <button class="btn-sm btn-sm-green client-add-sub"
            data-id="${client._id}"
            data-name="${escapeHtml(client.firstName)} ${escapeHtml(client.lastName)}"
            data-email="${escapeHtml(client.email)}">+ Sub</button>
          <button class="btn-sm btn-sm-red client-delete"
            data-id="${client._id}"
            data-name="${escapeHtml(client.firstName)} ${escapeHtml(client.lastName)}">Delete</button>
        </td>
      </tr>`;
  }

  function renderPagination(pagination) {
    const { page, pages, total } = pagination;
    const prevDisabled = page <= 1 ? 'disabled' : '';
    const nextDisabled = page >= pages ? 'disabled' : '';
    return `
      <div class="pagination">
        <button class="page-btn" id="page-prev" ${prevDisabled}>‹ Prev</button>
        <button class="page-btn current">${page}</button>
        <button class="page-btn" id="page-next" ${nextDisabled}>Next ›</button>
        <span class="page-info">${total} client${total !== 1 ? 's' : ''} · Page ${page} of ${pages}</span>
      </div>`;
  }

  // ── Load & render ────────────────────────────────────────
  async function loadAndRender() {
    const container = document.getElementById('clients-table-wrap');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px;text-align:center;color:#475569">Loading...</div>';

    try {
      const { clients, pagination } = await fetchClients();
      const allIds = clients.map((c) => c._id);

      container.innerHTML = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:32px"><input type="checkbox" class="cb" id="select-all"></th>
                <th>Client</th><th>Email</th><th>Plan</th><th>Status</th><th>Days Left</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${clients.length ? clients.map(renderRow).join('') : '<tr><td colspan="7" style="text-align:center;color:#475569;padding:20px">No clients found</td></tr>'}
            </tbody>
          </table>
        </div>
        ${renderPagination(pagination)}`;

      const selectAllCb = document.getElementById('select-all');
      if (selectAllCb) {
        selectAllCb.addEventListener('change', (e) => selectAll(e.target.checked, allIds));
      }

      container.querySelectorAll('input[data-id]').forEach((cb) => {
        cb.addEventListener('change', () => toggleSelect(cb.dataset.id));
      });

      container.querySelectorAll('.client-view').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.open(`/clients/${btn.dataset.id}`, '_blank');
        });
      });

      container.querySelectorAll('.client-add-sub').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.AdminSubModal.open({
            userId: btn.dataset.id,
            name: btn.dataset.name,
            email: btn.dataset.email,
            onSuccess: loadAndRender,
          });
        });
      });

      container.querySelectorAll('.client-delete').forEach((btn) => {
        btn.addEventListener('click', () => deleteClient(btn.dataset.id, btn.dataset.name));
      });

      document.getElementById('page-prev')?.addEventListener('click', () => { state.page--; loadAndRender(); });
      document.getElementById('page-next')?.addEventListener('click', () => { state.page++; loadAndRender(); });
    } catch (err) {
      container.innerHTML = `<div style="padding:20px;text-align:center;color:#f87171">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  // ── Render shell ─────────────────────────────────────────
  function render() {
    state = { page: 1, search: '', selected: new Set() };
    const container = document.getElementById('view-container');
    container.innerHTML = `
      <div id="bulk-bar">
        <span id="bulk-count">0 selected</span>
        <button class="btn btn-danger" id="bulk-delete-btn">🗑 Delete Selected</button>
        <button class="btn btn-ghost" id="bulk-sub-btn">+ Add Subscription</button>
        <span style="margin-left:auto;color:#818cf8;cursor:pointer;font-size:11px" id="bulk-clear">Clear selection</span>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Clients</span>
          <input class="search-input" id="client-search" placeholder="🔍  Search clients...">
        </div>
        <div id="clients-table-wrap"></div>
      </div>`;

    document.getElementById('bulk-delete-btn')?.addEventListener('click', bulkDelete);
    document.getElementById('bulk-clear')?.addEventListener('click', () => {
      state.selected.clear();
      document.querySelectorAll('input[data-id]').forEach((cb) => { cb.checked = false; });
      updateBulkBar();
    });
    document.getElementById('bulk-sub-btn')?.addEventListener('click', () => {
      const ids = Array.from(state.selected);
      if (ids.length === 0) return;
      window.AdminSubModal.openBulk(ids, loadAndRender);
    });

    document.getElementById('client-search')?.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        loadAndRender();
      }, 300);
    });

    loadAndRender();
  }

  function destroy() {
    clearTimeout(debounceTimer);
  }

  return { render, destroy };
})();
