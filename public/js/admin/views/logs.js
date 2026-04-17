/**
 * Logs view — full log viewer with level/category filters, time range, search, live mode, export.
 */
window.AdminLogs = (() => {
  const API = window.ApiConfig.getAPI_BASE();

  let state = {
    levels: new Set(),
    categories: new Set(),
    search: '',
    from: '',
    to: '',
    page: 1,
    live: false,
    lastTimestamp: null,
  };
  let liveInterval = null;
  let debounceTimer = null;

  const LEVEL_CLASSES = { error: 'log-error', warn: 'log-warn', info: 'log-info', debug: 'log-debug', http: 'log-http' };
  const { escapeHtml } = window.AdminViewHelpers;

  function buildParams(forExport = false) {
    const p = new URLSearchParams();
    if (state.levels.size) p.set('level', Array.from(state.levels).join(','));
    if (state.categories.size) p.set('category', Array.from(state.categories).join(','));
    if (state.search) p.set('search', state.search);
    if (state.from) p.set('from', state.from);
    if (state.to) p.set('to', state.to);
    if (!forExport) {
      p.set('page', state.page);
      p.set('limit', 50);
    }
    return p;
  }

  async function fetchLogs() {
    const res = await fetch(`${API}/api/v1/logs?${buildParams()}`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch logs');
    return res.json();
  }

  async function fetchLiveLogs() {
    if (!state.lastTimestamp) return [];
    const p = new URLSearchParams({ live: 'true', after: state.lastTimestamp, limit: 50 });
    const res = await fetch(`${API}/api/v1/logs?${p}`, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.logs || [];
  }

  async function fetchStats() {
    const p = new URLSearchParams();
    if (state.from) p.set('from', state.from);
    if (state.to) p.set('to', state.to);
    const res = await fetch(`${API}/api/v1/logs/stats?${p}`, { credentials: 'include' });
    if (!res.ok) return null;
    return res.json();
  }

  function renderLogEntry(log) {
    const t = new Date(log.timestamp);
    const time = t.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const cls = LEVEL_CLASSES[log.level] || 'log-info';
    return `
      <div class="log-entry">
        <span class="log-time" style="width:120px">${time}</span>
        <span class="log-level ${cls}">${escapeHtml(log.level).toUpperCase()}</span>
        <span class="log-level" style="color:#64748b;width:60px">${escapeHtml(log.category)}</span>
        <span class="log-msg">${escapeHtml(log.message)}${log.action ? ` <span style="color:#475569">[${escapeHtml(log.action)}]</span>` : ''}</span>
      </div>`;
  }

  function renderStatsBar(stats) {
    if (!stats) return '';
    const levels = ['error', 'warn', 'info', 'debug', 'http'];
    const chips = levels.map((l) => {
      const count = stats.byLevel?.[l] || 0;
      if (!count) return '';
      return `<span class="${LEVEL_CLASSES[l]}" style="font-size:11px;font-weight:600">${l.toUpperCase()}: ${count}</span>`;
    }).filter(Boolean).join('<span style="color:#334155;margin:0 6px">|</span>');
    return `<div style="padding:8px 14px;background:#0f172a;border-bottom:1px solid #334155;display:flex;gap:0;align-items:center;font-family:monospace">${chips || '<span style="color:#475569">No logs in this range</span>'}</div>`;
  }

  async function loadLogs() {
    const logList = document.getElementById('log-list');
    if (!logList) return;
    logList.innerHTML = '<div style="padding:20px;text-align:center;color:#475569">Loading...</div>';

    try {
      const [data, stats] = await Promise.all([fetchLogs(), fetchStats()]);
      const logs = data.logs || [];
      const pagination = data.pagination || {};

      const statsBar = document.getElementById('log-stats-bar');
      if (statsBar) statsBar.innerHTML = renderStatsBar(stats);

      if (logs.length) state.lastTimestamp = logs[0].timestamp;

      logList.innerHTML = logs.length
        ? logs.map(renderLogEntry).join('')
        : '<div style="padding:20px;text-align:center;color:#475569">No logs found</div>';

      const pagDiv = document.getElementById('log-pagination');
      if (pagDiv && pagination.pages > 1) {
        pagDiv.innerHTML = `
          <div class="pagination">
            <button class="page-btn" id="log-prev" ${pagination.page <= 1 ? 'disabled' : ''}>‹ Prev</button>
            <button class="page-btn current">${pagination.page}</button>
            <button class="page-btn" id="log-next" ${pagination.page >= pagination.pages ? 'disabled' : ''}>Next ›</button>
            <span class="page-info">${pagination.total} entries · Page ${pagination.page} of ${pagination.pages}</span>
          </div>`;
        document.getElementById('log-prev')?.addEventListener('click', () => { state.page--; loadLogs(); });
        document.getElementById('log-next')?.addEventListener('click', () => { state.page++; loadLogs(); });
      } else if (pagDiv) {
        pagDiv.innerHTML = '';
      }
    } catch (err) {
      logList.innerHTML = `<div style="padding:20px;text-align:center;color:#f87171">Error: ${err.message}</div>`;
    }
  }

  function startLive() {
    if (liveInterval) return;
    liveInterval = setInterval(async () => {
      const newLogs = await fetchLiveLogs();
      if (!newLogs.length) return;
      state.lastTimestamp = newLogs[newLogs.length - 1].timestamp;
      const list = document.getElementById('log-list');
      if (list) {
        list.insertAdjacentHTML('afterbegin', newLogs.map(renderLogEntry).join(''));
      }
    }, 10000);
  }

  function stopLive() {
    clearInterval(liveInterval);
    liveInterval = null;
  }

  function toggleSetFilter(set, value, el) {
    if (set.has(value)) { set.delete(value); el.classList.remove('active'); }
    else { set.add(value); el.classList.add('active'); }
    state.page = 1;
    loadLogs();
  }

  function exportCSV() {
    const url = `${API}/api/v1/logs/export?${buildParams(true)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${Date.now()}.csv`;
    a.click();
  }

  function render() {
    state = { levels: new Set(), categories: new Set(), search: '', from: '', to: '', page: 1, live: false, lastTimestamp: null };

    const container = document.getElementById('view-container');
    container.innerHTML = `
      <div class="log-panel">
        <div style="padding:10px 14px;border-bottom:1px solid #334155;display:flex;flex-wrap:wrap;align-items:center;gap:8px;background:#0f172a">
          <div style="display:flex;align-items:center;gap:6px">
            <div class="live-dot" id="live-dot" style="display:none"></div>
            <label class="toggle-switch" style="margin:0">
              <input type="checkbox" id="live-toggle">
              <span class="toggle-track"></span>
            </label>
            <span style="font-size:11px;color:#64748b">Live</span>
          </div>
          <span style="color:#334155">|</span>
          <span style="font-size:10px;color:#475569;font-weight:600">LEVEL</span>
          ${['error','warn','info','debug','http'].map((l) =>
            `<button class="filter-pill" data-level="${l}">${l.toUpperCase()}</button>`
          ).join('')}
          <span style="color:#334155">|</span>
          <span style="font-size:10px;color:#475569;font-weight:600">CATEGORY</span>
          ${['general','admin','user','security','auth'].map((c) =>
            `<button class="filter-pill" data-cat="${c}">${c}</button>`
          ).join('')}
        </div>
        <div style="padding:8px 14px;border-bottom:1px solid #334155;display:flex;align-items:center;gap:8px;background:#0f172a;flex-wrap:wrap">
          <select id="time-preset" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:5px;padding:4px 8px;font-size:11px">
            <option value="1h">Last 1 hour</option>
            <option value="6h">Last 6 hours</option>
            <option value="24h" selected>Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="custom">Custom range</option>
          </select>
          <div id="custom-range" style="display:none;gap:6px;align-items:center">
            <input type="datetime-local" id="range-from" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:5px;padding:4px 8px;font-size:11px">
            <span style="color:#475569">→</span>
            <input type="datetime-local" id="range-to" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:5px;padding:4px 8px;font-size:11px">
          </div>
          <input class="search-input" id="log-search" placeholder="🔍  Search logs..." style="width:200px">
          <button class="btn btn-ghost" style="font-size:10px;margin-left:auto" id="log-export">Export CSV</button>
        </div>
        <div id="log-stats-bar"></div>
        <div id="log-list"></div>
        <div id="log-pagination"></div>
      </div>`;

    const applyPreset = (val) => {
      const now = new Date();
      const offsets = { '1h': 1, '6h': 6, '24h': 24, '7d': 24 * 7 };
      if (val === 'custom') {
        document.getElementById('custom-range').style.display = 'flex';
        state.from = '';
        state.to = '';
      } else {
        document.getElementById('custom-range').style.display = 'none';
        state.from = new Date(now.getTime() - offsets[val] * 3600000).toISOString();
        state.to = now.toISOString();
        state.page = 1;
        loadLogs();
      }
    };

    document.getElementById('time-preset').addEventListener('change', (e) => applyPreset(e.target.value));
    document.getElementById('range-from')?.addEventListener('change', (e) => { state.from = e.target.value ? new Date(e.target.value).toISOString() : ''; state.page = 1; loadLogs(); });
    document.getElementById('range-to')?.addEventListener('change', (e) => { state.to = e.target.value ? new Date(e.target.value).toISOString() : ''; state.page = 1; loadLogs(); });

    container.querySelectorAll('[data-level]').forEach((btn) => {
      btn.addEventListener('click', () => toggleSetFilter(state.levels, btn.dataset.level, btn));
    });
    container.querySelectorAll('[data-cat]').forEach((btn) => {
      btn.addEventListener('click', () => toggleSetFilter(state.categories, btn.dataset.cat, btn));
    });

    document.getElementById('log-search').addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; loadLogs(); }, 300);
    });

    document.getElementById('live-toggle').addEventListener('change', (e) => {
      state.live = e.target.checked;
      const dot = document.getElementById('live-dot');
      if (state.live) { startLive(); dot.style.display = ''; }
      else { stopLive(); dot.style.display = 'none'; }
    });

    document.getElementById('log-export').addEventListener('click', exportCSV);

    applyPreset('24h');
  }

  function destroy() {
    stopLive();
    clearTimeout(debounceTimer);
  }

  return { render, destroy };
})();
