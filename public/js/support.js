/**
 * support.js
 * User-facing support ticket page logic.
 */

/* --------------------------------------------------
   Config & State
-------------------------------------------------- */
const API_BASE = window.ApiConfig.getAPI_BASE();

let currentPage = 1;
let totalPages = 1;
let pendingDeleteId = null;
let rateLimitUsed = 0;
let rateLimitMax = 5;
let rateLimitResetDate = null;

const CATEGORY_LABELS = {
  'bug-report': 'Bug Report',
  'feature-request': 'Feature Request',
  'billing-issue': 'Billing Issue',
  'account-issue': 'Account Issue',
  'general-inquiry': 'General Inquiry',
};

/* --------------------------------------------------
   DOM helpers
-------------------------------------------------- */
function $(id) { return document.getElementById(id); }

function showAlert(message, type = 'info') {
  const container = $('alertContainer');
  if (!container) return;
  const icons = { success: 'bi-check-circle', error: 'bi-exclamation-circle', info: 'bi-info-circle', warning: 'bi-exclamation-triangle' };
  const div = document.createElement('div');
  div.className = `alert alert-${type === 'error' ? 'danger' : type} d-flex align-items-center gap-2`;
  div.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;
  container.innerHTML = '';
  container.appendChild(div);
  setTimeout(() => { if (div.parentNode) div.remove(); }, 6000);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}

function pillHtml(status) {
  const map = { draft: 'pill-gray', submitted: 'pill-blue', seen: 'pill-yellow', resolved: 'pill-green' };
  const labels = { draft: 'Draft', submitted: 'Submitted', seen: 'Seen', resolved: 'Resolved' };
  return `<span class="pill ${map[status] || 'pill-gray'}">${labels[status] || status}</span>`;
}

function catBadgeHtml(category) {
  return `<span class="cat-badge">${escapeHtml(CATEGORY_LABELS[category] || category)}</span>`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* --------------------------------------------------
   API calls
-------------------------------------------------- */
async function apiRequest(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `Error ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return data;
}

/* --------------------------------------------------
   Rate limit UI
-------------------------------------------------- */
function updateRateLimitUI() {
  const banner = $('rate-limit-banner');
  const submitBtn = $('btn-submit-ticket');
  const text = $('rate-limit-text');

  if (rateLimitUsed >= rateLimitMax) {
    let resetStr = '';
    if (rateLimitResetDate) {
      resetStr = ` Resets on ${new Date(rateLimitResetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`;
    }
    if (banner) banner.classList.remove('d-none');
    if (text) text.textContent = `You've used all ${rateLimitMax} tickets for this week.${resetStr}`;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.title = `Weekly limit reached.${resetStr}`;
    }
  } else {
    if (banner) banner.classList.add('d-none');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.title = '';
    }
  }
}

/* --------------------------------------------------
   Ticket list rendering
-------------------------------------------------- */
function renderTickets(tickets) {
  const list = $('tickets-list');
  if (!list) return;

  if (!tickets || tickets.length === 0) {
    list.innerHTML = `
      <div class="support-empty">
        <i class="bi bi-ticket"></i>
        <p>No tickets yet.</p>
      </div>`;
    return;
  }

  list.innerHTML = tickets.map(t => {
    const isDraft = t.status === 'draft';
    const actions = isDraft ? `
      <button class="btn-ticket-edit" data-id="${t._id}" data-action="edit">
        <i class="bi bi-pencil me-1"></i>Edit
      </button>
      <button class="btn-ticket-delete" data-id="${t._id}" data-action="delete">
        <i class="bi bi-trash3 me-1"></i>Delete
      </button>` : '';

    return `
      <div class="ticket-item" id="ticket-${t._id}">
        <div class="ticket-item-header" data-action="toggle" data-id="${t._id}">
          <div class="ticket-item-meta">
            <div class="ticket-item-subject">${escapeHtml(t.subject)}</div>
            <div class="ticket-item-info">
              ${catBadgeHtml(t.category)}
              ${pillHtml(t.status)}
              <span>${formatDate(t.createdAt)}</span>
            </div>
          </div>
          <i class="bi bi-chevron-down ticket-item-chevron"></i>
        </div>
        <div class="ticket-item-body">
          <div class="ticket-item-desc">${escapeHtml(t.description)}</div>
          ${actions ? `<div class="ticket-item-actions">${actions}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function renderPagination() {
  const wrap = $('tickets-pagination');
  if (!wrap) return;
  if (totalPages <= 1) { wrap.classList.add('d-none'); return; }

  wrap.classList.remove('d-none');
  let html = `<button class="support-page-btn" data-action="page" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>
    <i class="bi bi-chevron-left"></i>
  </button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="support-page-btn ${i === currentPage ? 'active' : ''}" data-action="page" data-page="${i}">${i}</button>`;
  }
  html += `<button class="support-page-btn" data-action="page" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>
    <i class="bi bi-chevron-right"></i>
  </button>`;
  wrap.innerHTML = html;
}

function toggleTicket(id) {
  const el = document.getElementById(`ticket-${id}`);
  if (el) el.classList.toggle('open');
}

/* --------------------------------------------------
   Load tickets
-------------------------------------------------- */
async function loadTickets(page = 1) {
  const loading = $('tickets-loading');
  const wrap = $('my-tickets-wrap');
  const countBadge = $('tickets-count-badge');

  if (loading) loading.classList.remove('d-none');

  try {
    const data = await apiRequest(`/api/v1/tickets?page=${page}&limit=10`);
    const { tickets, pagination, rateLimit } = data.data;

    currentPage = pagination.page;
    totalPages = pagination.pages;
    rateLimitUsed = rateLimit.used;
    rateLimitMax = rateLimit.max;
    rateLimitResetDate = rateLimit.resetDate;

    updateRateLimitUI();

    if (tickets.length > 0 || pagination.total > 0) {
      if (wrap) wrap.classList.remove('d-none');
      if (countBadge) countBadge.textContent = `${pagination.total} ticket${pagination.total !== 1 ? 's' : ''}`;
      renderTickets(tickets);
      renderPagination();

      // Show "New Ticket" button and hide form if user has tickets
      const btnNew = $('btn-new-ticket');
      const formWrap = $('ticket-form-wrap');
      if (btnNew) btnNew.classList.remove('d-none');
      if (formWrap && !$('edit-ticket-id').value) formWrap.classList.add('d-none');
    }
  } catch (err) {
    showAlert(err.message || 'Failed to load tickets.', 'error');
  } finally {
    if (loading) loading.classList.add('d-none');
  }
}

function goToPage(page) {
  if (page < 1 || page > totalPages) return;
  loadTickets(page);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* --------------------------------------------------
   Form helpers
-------------------------------------------------- */
function clearForm() {
  $('edit-ticket-id').value = '';
  $('ticket-category').value = '';
  $('ticket-subject').value = '';
  $('ticket-description').value = '';
  $('subject-count').textContent = '0';
  $('desc-count').textContent = '0';
  $('form-title').textContent = 'New Ticket';
  const cancelBtn = $('btn-cancel-edit');
  if (cancelBtn) cancelBtn.classList.add('d-none');
}

function showForm() {
  const formWrap = $('ticket-form-wrap');
  if (formWrap) {
    formWrap.classList.remove('d-none');
    formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function hideForm() {
  const formWrap = $('ticket-form-wrap');
  if (formWrap) formWrap.classList.add('d-none');
  clearForm();
}

async function editDraft(id) {
  try {
    const data = await apiRequest(`/api/v1/tickets/${id}`);
    const t = data.data.ticket;
    $('edit-ticket-id').value = t._id;
    $('ticket-category').value = t.category;
    $('ticket-subject').value = t.subject;
    $('ticket-description').value = t.description;
    $('subject-count').textContent = t.subject.length;
    $('desc-count').textContent = t.description.length;
    $('form-title').textContent = 'Edit Draft';
    const cancelBtn = $('btn-cancel-edit');
    if (cancelBtn) cancelBtn.classList.remove('d-none');
    showForm();
  } catch (err) {
    showAlert(err.message || 'Failed to load draft.', 'error');
  }
}

function confirmDelete(id) {
  pendingDeleteId = id;
  const modal = new bootstrap.Modal($('delete-modal'));
  modal.show();
}

/* --------------------------------------------------
   Submit handlers
-------------------------------------------------- */
async function saveOrSubmit(submitStatus) {
  const editId = $('edit-ticket-id').value;
  const category = $('ticket-category').value;
  const subject = $('ticket-subject').value.trim();
  const description = $('ticket-description').value.trim();

  if (!category) { showAlert('Please select a category.', 'warning'); return; }
  if (!subject) { showAlert('Please enter a subject.', 'warning'); return; }
  if (!description) { showAlert('Please enter a description.', 'warning'); return; }

  const submitBtn = $('btn-submit-ticket');
  const draftBtn = $('btn-save-draft');
  if (submitBtn) submitBtn.disabled = true;
  if (draftBtn) draftBtn.disabled = true;

  try {
    const body = JSON.stringify({ subject, description, category, status: submitStatus });

    if (editId) {
      await apiRequest(`/api/v1/tickets/${editId}`, { method: 'PATCH', body });
    } else {
      await apiRequest('/api/v1/tickets', { method: 'POST', body });
    }

    clearForm();
    hideForm();
    showAlert(
      submitStatus === 'submitted'
        ? 'Ticket submitted! We\'ll review it shortly.'
        : 'Draft saved.',
      'success'
    );
    await loadTickets(1);
  } catch (err) {
    showAlert(err.message || 'Something went wrong. Please try again.', 'error');
    // Re-enable rate limit UI if 429
    if (err.status === 429) updateRateLimitUI();
  } finally {
    if (draftBtn) draftBtn.disabled = false;
    updateRateLimitUI();
  }
}

/* --------------------------------------------------
   Init
-------------------------------------------------- */
async function init() {
  // Auth guard — role-guard.js handles redirect, but we also wait for user
  try {
    const api = window.ApiConfig?.getAPI_BASE() || '';
    const res = await fetch(`${api}/api/v1/auth/me`, { credentials: 'include' });
    if (!res.ok) throw new Error('Auth failed');
  } catch {
    window.location.href = '/login';
    return;
  }

  // Character counters
  const subjectInput = $('ticket-subject');
  const descInput = $('ticket-description');
  if (subjectInput) {
    subjectInput.addEventListener('input', () => {
      $('subject-count').textContent = subjectInput.value.length;
    });
  }
  if (descInput) {
    descInput.addEventListener('input', () => {
      $('desc-count').textContent = descInput.value.length;
    });
  }

  // Form submit (Submit Ticket button)
  const form = $('ticket-form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      saveOrSubmit('submitted');
    });
  }

  // Save Draft button
  const draftBtn = $('btn-save-draft');
  if (draftBtn) {
    draftBtn.addEventListener('click', () => saveOrSubmit('draft'));
  }

  // New Ticket button
  const btnNew = $('btn-new-ticket');
  if (btnNew) {
    btnNew.addEventListener('click', () => {
      clearForm();
      showForm();
    });
  }

  // Cancel edit button
  const cancelBtn = $('btn-cancel-edit');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      hideForm();
      loadTickets(currentPage);
    });
  }

  // Delete confirmation
  const confirmDeleteBtn = $('btn-confirm-delete');
  if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', async () => {
      if (!pendingDeleteId) return;
      const modal = bootstrap.Modal.getInstance($('delete-modal'));
      if (modal) modal.hide();
      try {
        await apiRequest(`/api/v1/tickets/${pendingDeleteId}`, { method: 'DELETE' });
        showAlert('Draft deleted.', 'success');
        pendingDeleteId = null;
        await loadTickets(1);
      } catch (err) {
        showAlert(err.message || 'Failed to delete draft.', 'error');
      }
    });
  }

  // Event delegation for dynamically rendered ticket list and pagination
  document.addEventListener('click', (e) => {
    // Ticket list actions (toggle, edit, delete)
    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      const id = actionEl.dataset.id;
      if (action === 'toggle' && id) { toggleTicket(id); return; }
      if (action === 'edit' && id) { editDraft(id); return; }
      if (action === 'delete' && id) { confirmDelete(id); return; }
      if (action === 'page') {
        const page = parseInt(actionEl.dataset.page, 10);
        if (!isNaN(page)) { goToPage(page); return; }
      }
    }
  });

  // Load existing tickets
  await loadTickets(1);
}

document.addEventListener('DOMContentLoaded', init);
