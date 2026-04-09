/**
 * Admin dashboard entry point.
 * Handles: auth check, sidebar navigation, view routing, topbar state.
 */

const API = window.ApiConfig.getAPI_BASE();

// ── Auth guard ────────────────────────────────────────────
async function checkAdminAuth() {
  try {
    const res = await fetch(`${API}/api/v1/auth/me`, { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/login';
      return null;
    }
    if (!res.ok) throw new Error('Auth check failed');
    const data = await res.json();
    if (data.data?.role !== 'admin') {
      window.location.href = '/dashboard';
      return null;
    }
    return data.data;
  } catch {
    window.location.href = '/login';
    return null;
  }
}

// ── Topbar ────────────────────────────────────────────────
function setTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (el) {
    el.textContent = new Date().toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    });
  }
}

function setTopbarTitle(title) {
  const el = document.getElementById('topbar-title');
  if (el) el.textContent = title;
}

// ── View router ───────────────────────────────────────────
const VIEWS = {
  overview: { title: 'Overview', render: () => window.AdminOverview.render() },
  clients:  { title: 'Clients',  render: () => window.AdminClients.render() },
  logs:     { title: 'Logs',     render: () => window.AdminLogs.render() },
};

let currentView = null;

function navigateTo(viewKey) {
  if (!VIEWS[viewKey]) return;
  if (currentView === viewKey) return;

  // Cleanup previous view (stop live polls etc.)
  if (currentView && window[`Admin${capitalize(currentView)}`]?.destroy) {
    window[`Admin${capitalize(currentView)}`].destroy();
  }

  currentView = viewKey;

  // Update sidebar active state
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewKey);
  });

  setTopbarTitle(VIEWS[viewKey].title);
  document.getElementById('view-container').innerHTML = '';
  VIEWS[viewKey].render();
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  const user = await checkAdminAuth();
  if (!user) return;

  // Set admin initials in sidebar
  const initials = document.getElementById('admin-initials');
  if (initials && user.firstName) {
    initials.textContent = (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
  }

  setTopbarDate();

  // Wire sidebar buttons
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Default view
  navigateTo('overview');
}

document.addEventListener('DOMContentLoaded', init);
