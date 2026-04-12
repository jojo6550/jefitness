/**
 * Admin dashboard entry point.
 * Handles: auth check, sidebar navigation, view routing, topbar state.
 */

const API = window.ApiConfig.getAPI_BASE();

// ── Auth guard ────────────────────────────────────────────
async function checkAdminAuth() {
  try {
    const data = await window.AuthCache.getMe();
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
  tickets:  { title: 'Support Tickets', render: () => window.AdminTickets.render() },
};

let currentView = null;

function navigateTo(viewKey) {
  console.log('[ADMIN] navigateTo called:', viewKey);
  
  if (!VIEWS[viewKey]) {
    console.error('[ADMIN] No VIEW for:', viewKey, 'Available:', Object.keys(VIEWS));
    return;
  }
  if (currentView === viewKey) {
    console.log('[ADMIN] Already on view:', viewKey);
    return;
  }

  // Cleanup previous view (stop live polls etc.)
  if (currentView && window[`Admin${capitalize(currentView)}`]?.destroy) {
    try {
      window[`Admin${capitalize(currentView)}`].destroy();
    } catch(e) {
      console.error('[ADMIN] Destroy error:', currentView, e);
    }
  }

  currentView = viewKey;

  // Update sidebar active state
  document.querySelectorAll('.nav-item[data-view]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === viewKey);
  });

  setTopbarTitle(VIEWS[viewKey].title);
  
  const container = document.getElementById('view-container');
  if (!container) {
    console.error('[ADMIN] No #view-container');
    return;
  }
  container.innerHTML = '<div style="padding:20px;color:#64748b">Loading...</div>';
  
  try {
    console.log('[ADMIN] Calling render for:', viewKey);
    VIEWS[viewKey].render();
    console.log('[ADMIN] Render complete:', viewKey);
  } catch(e) {
    console.error('[ADMIN] Render ERROR:', viewKey, e);
    container.innerHTML = `<div style="padding:20px;color:#f87171">Error loading ${viewKey}: ${e.message}</div>`;
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  console.log('[ADMIN] init() START');
  
  const user = await checkAdminAuth();
  if (!user) {
    console.log('[ADMIN] init() ABORT: no user');
    return;
  }
  console.log('[ADMIN] User auth OK:', user.role);

  // Set admin initials in sidebar
  const initials = document.getElementById('admin-initials');
  if (initials && user.firstName) {
    initials.textContent = (user.firstName[0] + (user.lastName?.[0] || '')).toUpperCase();
  }

  setTopbarDate();

  // Wire sidebar buttons
  const navBtns = document.querySelectorAll('.nav-item[data-view]');
  console.log('[ADMIN] Found nav buttons:', navBtns.length);
  navBtns.forEach((btn, i) => {
    console.log('[ADMIN] Attaching listener to btn', i, btn.dataset.view);
    btn.addEventListener('click', (e) => {
      console.log('[ADMIN] CLICK on:', btn.dataset.view);
      navigateTo(btn.dataset.view);
    });
  });

  // Check modules
  console.log('[ADMIN] AdminTickets exists?', !!window.AdminTickets);
  console.log('[ADMIN] VIEWS:', Object.keys(VIEWS));

  // Default view
  console.log('[ADMIN] Loading default: overview');
  navigateTo('overview');
  
  console.log('[ADMIN] init() COMPLETE');
}

document.addEventListener('DOMContentLoaded', init);
