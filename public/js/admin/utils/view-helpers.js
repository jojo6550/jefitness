/**
 * Shared admin view helpers — HTML escape, subscription status rendering, avatar utilities.
 */
window.AdminViewHelpers = (() => {
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
    const colors = ['#6366f1', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b', '#3b82f6'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  function initials(client) {
    return ((client?.firstName?.[0] || '') + (client?.lastName?.[0] || '')).toUpperCase() || '?';
  }

  return { escapeHtml, daysLeft, statusPill, avatarColor, initials };
})();
