// role-guard.js - Frontend session verification for protected pages.
// Uses AuthCache (backed by the httpOnly cookie) instead of localStorage,
// which was never populated by the login flow and made this guard a no-op.
document.addEventListener('DOMContentLoaded', () => {
  const protectedPages = [
    'dashboard',
    'trainer-dashboard',
    'admin',
    'profile',
    'log-workout',
    'log-meal',
    'appointments',
    'medical-documents',
    'nutrition-history',
    'workout-progress',
    'client-profile',
    'onboarding',
  ];

  // Match clean URLs served by Express (e.g. /dashboard, /profile)
  const pathSegment = window.location.pathname.replace(/^\//, '').split('/')[0].replace('.html', '');
  const isProtected = protectedPages.includes(pathSegment);

  if (isProtected) {
    const api = window.ApiConfig?.getAPI_BASE() || '';
    fetch(`${api}/api/v1/auth/me`, { credentials: 'include' })
      .then(res => { if (!res.ok) window.location.href = '/login'; })
      .catch(() => { window.location.href = '/login'; });
  }
});
