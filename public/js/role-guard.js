// role-guard.js - Frontend session verification for protected pages.
// Uses AuthCache (backed by the httpOnly cookie) instead of localStorage,
// which was never populated by the login flow and made this guard a no-op.
document.addEventListener('DOMContentLoaded', () => {
  const protectedPages = ['dashboard.html', 'trainer-dashboard.html', 'admin.html'];
  const currentPage = window.location.pathname.split('/').pop();

  // Also guard the root path (/dashboard clean URL served by Express)
  const isProtected =
    protectedPages.includes(currentPage) ||
    protectedPages.some(p => window.location.pathname.endsWith('/' + p.replace('.html', '')));

  if (isProtected) {
    window.AuthCache.getMe().catch(() => {
      window.location.href = '/login';
    });
  }
});
