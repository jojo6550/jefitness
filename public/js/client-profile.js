/**
 * Client profile page — /clients/:id
 * Requires admin auth. Fetches from GET /api/v1/admin/clients/:id
 */
(() => {
  const API = window.ApiConfig.getAPI_BASE();

  // ── Helpers ──────────────────────────────────────────────
  function esc(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function daysLeft(iso) {
    if (!iso) return null;
    return Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 86400000));
  }

  function avatarColor(name) {
    const colors = ['#6366f1','#8b5cf6','#10b981','#ef4444','#f59e0b','#3b82f6','#ec4899'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  }

  function pill(text, cls) {
    return `<span class="hero-pill ${cls}"><span class="hero-dot" style="background:currentColor;opacity:.6"></span>${esc(text)}</span>`;
  }

  function cell(label, val, mono = false) {
    return `<div class="data-cell"><div class="data-label">${label}</div><div class="data-val${mono ? ' mono' : ''}">${val}</div></div>`;
  }

  function empty(icon, text) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div>${esc(text)}</div>`;
  }

  function bool(val) {
    return val ? '<span style="color:var(--green)">✓ Yes</span>' : '<span style="color:var(--text-dim)">— No</span>';
  }

  // ── Auth guard ────────────────────────────────────────────
  // Returns 'admin', 'trainer', or null
  async function checkAuth() {
    try {
      const res = await fetch(`${API}/api/v1/auth/me`, { credentials: 'include' });
      if (!res.ok) return null;
      const data = await res.json();
      const role = data.data?.role;
      if (role === 'admin' || role === 'trainer') return role;
      return null;
    } catch { return null; }
  }

  // ── Tab routing ───────────────────────────────────────────
  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`panel-${key}`)?.classList.add('active');
      });
    });
  }

  // ── Render overview ───────────────────────────────────────
  function renderOverview(client) {
    // Personal grid
    const personal = [
      ['First Name',    esc(client.firstName)],
      ['Last Name',     esc(client.lastName)],
      ['Date of Birth', fmtDate(client.dob)],
      ['Gender',        esc(client.gender) || '<span class="data-val dim">—</span>'],
      ['Phone',         esc(client.phone) || '<span class="data-val dim">—</span>'],
      ['Goals',         esc(client.goals) || '<span class="data-val dim">—</span>'],
      ['Start Weight',  client.startWeight ? `${client.startWeight} lbs` : '<span class="data-val dim">—</span>'],
      ['Current Weight',client.currentWeight ? `${client.currentWeight} lbs` : '<span class="data-val dim">—</span>'],
      ['Height',        client.height ? `${client.height} cm` : '<span class="data-val dim">—</span>'],
      ['Joined',        fmtDate(client.createdAt)],
      ['Last Login',    fmtDate(client.lastLoggedIn)],
      ['2FA Enabled',   bool(client.twoFactorEnabled)],
    ];
    document.getElementById('grid-personal').innerHTML = personal.map(([l, v]) => cell(l, v)).join('');

    // Subscription
    const sub = client.subscription;
    const subEl = document.getElementById('sub-card');
    if (!sub) {
      subEl.innerHTML = empty('💳', 'No active subscription');
    } else {
      const days = daysLeft(sub.currentPeriodEnd);
      const pct = Math.min(100, sub.plan
        ? (days / { '1-month':30,'3-month':90,'6-month':180,'12-month':365 }[sub.plan] * 100)
        : 50);
      const barColor = days !== null && days <= 14 ? 'var(--amber)' : 'var(--green)';
      subEl.innerHTML = `
        <div class="data-grid">
          ${cell('Plan', esc(sub.plan) || '—')}
          ${cell('Status', esc(sub.status))}
          ${cell('Period Start', fmtDate(sub.currentPeriodStart))}
          ${cell('Period End', fmtDate(sub.currentPeriodEnd))}
          ${cell('Days Left', days !== null ? `<span style="color:${barColor};font-family:var(--mono);font-weight:700">${days}d</span>` : '—')}
          ${cell('Amount', sub.amount ? `${(sub.amount / 100).toFixed(2)} ${(sub.currency || 'JMD').toUpperCase()}` : '—')}
        </div>
        <div style="padding:0 16px 16px">
          <div class="sub-bar-wrap">
            <div class="sub-bar" style="width:${pct}%;background:${barColor}"></div>
          </div>
        </div>`;
    }

    // Measurements
    const measEl = document.getElementById('measurements-card');
    const meas = client.measurements || [];
    if (!meas.length) {
      measEl.innerHTML = empty('📏', 'No measurements recorded');
    } else {
      const latest = meas[meas.length - 1];
      measEl.innerHTML = `<div class="data-grid">
        ${cell('Date', fmtDate(latest.date))}
        ${cell('Weight', latest.weight ? `<span class="meas-val">${latest.weight} lbs</span>` : '—')}
        ${cell('Neck', latest.neck ? `<span class="meas-val">${latest.neck}"</span>` : '—')}
        ${cell('Waist', latest.waist ? `<span class="meas-val">${latest.waist}"</span>` : '—')}
        ${cell('Hips', latest.hips ? `<span class="meas-val">${latest.hips}"</span>` : '—')}
        ${cell('Chest', latest.chest ? `<span class="meas-val">${latest.chest}"</span>` : '—')}
      </div>
      ${meas.length > 1 ? `<div style="padding:6px 16px 10px;font-family:var(--mono);font-size:9px;color:var(--text-dim)">${meas.length} total entries · showing latest</div>` : ''}`;
    }

    // Goals
    const goalsEl = document.getElementById('goals-card');
    const goals = client.workoutGoals || [];
    if (!goals.length) {
      goalsEl.innerHTML = empty('🎯', 'No workout goals set');
    } else {
      goalsEl.innerHTML = goals.map(g => `
        <div class="goal-item">
          <span class="goal-achieved">${g.achieved ? '✅' : '🎯'}</span>
          <div class="goal-exercise">${esc(g.exercise)}</div>
          <span class="goal-target">${g.targetWeight ? `${g.targetWeight} lbs` : ''} ${g.targetDate ? '· ' + fmtDate(g.targetDate) : ''}</span>
        </div>`).join('');
    }
  }

  // ── Render workouts ───────────────────────────────────────
  function renderWorkouts(client) {
    const logs = (client.workoutLogs || []).filter(w => !w.deletedAt).slice().reverse();
    document.getElementById('tc-workouts').textContent = logs.length;
    const tbody = document.getElementById('tbody-workouts');
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="4">${empty('🏋️', 'No workout logs')}</td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map(w => {
      const exercises = (w.exercises || []).map(e => `<span class="exercise-tag">${esc(e.exerciseName)}</span>`).join('');
      const totalSets = (w.exercises || []).reduce((s, e) => s + (e.sets?.length || 0), 0);
      return `<tr>
        <td><span class="log-date">${fmtDate(w.date)}</span></td>
        <td style="font-weight:600;color:var(--text-hi)">${esc(w.workoutName)}</td>
        <td>${exercises || '<span style="color:var(--text-dim)">—</span>'}</td>
        <td><span style="font-family:var(--mono);color:var(--cyan)">${totalSets}</span></td>
      </tr>`;
    }).join('');
  }

  // ── Render nutrition ──────────────────────────────────────
  function renderNutrition(client) {
    const logs = (client.mealLogs || []).filter(m => !m.deletedAt).slice().reverse();
    document.getElementById('tc-nutrition').textContent = logs.length;
    const tbody = document.getElementById('tbody-nutrition');
    if (!logs.length) {
      tbody.innerHTML = `<tr><td colspan="4">${empty('🍽️', 'No meal logs')}</td></tr>`;
      return;
    }
    tbody.innerHTML = logs.map(m => {
      const foods = (m.foods || []).map(f => `<span class="exercise-tag">${esc(f.foodName)}</span>`).join('');
      return `<tr>
        <td><span class="log-date">${fmtDate(m.date)}</span></td>
        <td style="font-weight:600;color:var(--text-hi);text-transform:capitalize">${esc(m.mealType)}</td>
        <td>${foods || '—'}</td>
        <td><span class="kcal-badge">${m.totalCalories || 0} kcal</span></td>
      </tr>`;
    }).join('');
  }

  // ── Render programs ───────────────────────────────────────
  function renderPrograms(client) {
    const assigned = client.assignedPrograms || [];
    const purchased = client.purchasedPrograms || [];
    document.getElementById('tc-programs').textContent = assigned.length + purchased.length;

    const assignedEl = document.getElementById('assigned-programs-card');
    if (!assigned.length) {
      assignedEl.innerHTML = empty('📚', 'No assigned programs');
    } else {
      assignedEl.innerHTML = `<div style="padding:14px 16px;display:flex;flex-wrap:wrap;gap:8px">` +
        assigned.map(p => `<span class="prog-badge"><i class="bi bi-collection-play"></i> ${esc(p.programId?.name || p.programId || 'Program')} <span style="font-size:9px;opacity:.5">· ${fmtDate(p.assignedAt)}</span></span>`).join('') +
        '</div>';
    }

    const purchasedEl = document.getElementById('purchased-programs-card');
    if (!purchased.length) {
      purchasedEl.innerHTML = empty('🛒', 'No purchased programs');
    } else {
      purchasedEl.innerHTML = `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Program</th><th>Purchased</th><th>Amount</th></tr></thead>
        <tbody>${purchased.map(p => `<tr>
          <td style="font-weight:600;color:var(--text-hi)">${esc(p.programId?.name || p.programId || '—')}</td>
          <td><span class="log-date">${fmtDate(p.purchasedAt)}</span></td>
          <td><span class="kcal-badge">${p.amountPaid ? `$${(p.amountPaid/100).toFixed(2)}` : '—'}</span></td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
  }

  // ── Render appointments ───────────────────────────────────
  async function renderAppointments(clientId) {
    const el = document.getElementById('appointments-card');
    try {
      const res = await fetch(`${API}/api/v1/appointments?clientId=${clientId}`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const appts = data.appointments || data || [];
      document.getElementById('tc-appts').textContent = appts.length;
      if (!appts.length) { el.innerHTML = empty('📅', 'No appointments'); return; }
      el.innerHTML = `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>${appts.map(a => `<tr>
          <td><span class="log-date">${fmtDateTime(a.date || a.scheduledAt)}</span></td>
          <td>${esc(a.type || a.appointmentType || '—')}</td>
          <td>${esc(a.status || '—')}</td>
          <td style="color:var(--text-dim)">${esc(a.notes || '—')}</td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    } catch {
      el.innerHTML = empty('📅', 'Could not load appointments');
    }
  }

  // ── Render appointments (inline — data already fetched) ───
  function renderAppointmentsInline(appts) {
    const el = document.getElementById('appointments-card');
    document.getElementById('tc-appts').textContent = appts.length;
    if (!appts.length) { el.innerHTML = empty('📅', 'No appointments'); return; }
    el.innerHTML = `<div class="table-scroll"><table class="data-table">
      <thead><tr><th>Date</th><th>Type</th><th>Status</th><th>Notes</th></tr></thead>
      <tbody>${appts.map(a => `<tr>
        <td><span class="log-date">${fmtDateTime(a.date || a.scheduledAt)}</span></td>
        <td>${esc(a.type || a.appointmentType || '—')}</td>
        <td>${esc(a.status || '—')}</td>
        <td style="color:var(--text-dim)">${esc(a.notes || '—')}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  // ── Render medical ────────────────────────────────────────
  function renderMedical(client) {
    const docs = client.medicalDocuments || [];
    document.getElementById('tc-medical').textContent = docs.length;

    document.getElementById('medical-info-card').innerHTML = `<div class="data-grid">
      ${cell('Has Medical History', bool(client.hasMedical))}
      ${cell('Conditions', client.medicalConditions ? `<span style="color:var(--text-hi)">${esc(client.medicalConditions)}</span>` : '<span class="data-val dim">None reported</span>')}
    </div>`;

    const docsEl = document.getElementById('medical-docs-card');
    if (!docs.length) {
      docsEl.innerHTML = empty('📄', 'No medical documents uploaded');
    } else {
      docsEl.innerHTML = `<div class="table-scroll"><table class="data-table">
        <thead><tr><th>Filename</th><th>Type</th><th>Size</th><th>Uploaded</th></tr></thead>
        <tbody>${docs.map(d => `<tr>
          <td style="font-weight:600;color:var(--text-hi)">${esc(d.originalName || d.filename)}</td>
          <td><span class="exercise-tag">${esc(d.mimeType || '—')}</span></td>
          <td style="font-family:var(--mono);font-size:11px;color:var(--text-mid)">${d.size ? Math.round(d.size / 1024) + ' KB' : '—'}</td>
          <td><span class="log-date">${fmtDate(d.uploadedAt)}</span></td>
        </tr>`).join('')}</tbody>
      </table></div>`;
    }
  }

  // ── Render GDPR ───────────────────────────────────────────
  function renderGdpr(client) {
    const dpc = client.dataProcessingConsent || {};
    const hdc = client.healthDataConsent || {};
    const mkt = client.marketingConsent || {};
    const dsr = client.dataSubjectRights || {};
    const priv = client.privacySettings || {};

    document.getElementById('consent-card').innerHTML = `<div class="consent-grid">
      <div class="consent-item">
        <div class="consent-icon">🗂️</div>
        <div><div class="consent-name">Data Processing</div><div class="consent-date">${dpc.given ? 'Granted ' + fmtDate(dpc.givenAt) : 'Not given'}</div></div>
        <div class="consent-check">${dpc.given ? '✅' : '❌'}</div>
      </div>
      <div class="consent-item">
        <div class="consent-icon">🏥</div>
        <div><div class="consent-name">Health Data</div><div class="consent-date">${hdc.given ? 'Granted ' + fmtDate(hdc.givenAt) : 'Not given'}</div></div>
        <div class="consent-check">${hdc.given ? '✅' : '❌'}</div>
      </div>
      <div class="consent-item">
        <div class="consent-icon">📧</div>
        <div><div class="consent-name">Marketing</div><div class="consent-date">${mkt.given ? (mkt.withdrawnAt ? 'Withdrawn ' + fmtDate(mkt.withdrawnAt) : 'Granted ' + fmtDate(mkt.givenAt)) : 'Not given'}</div></div>
        <div class="consent-check">${mkt.given && !mkt.withdrawnAt ? '✅' : '❌'}</div>
      </div>
      <div class="consent-item">
        <div class="consent-icon">🔒</div>
        <div><div class="consent-name">Restriction Active</div><div class="consent-date">${dsr.restrictionRequested ? 'Requested ' + fmtDate(dsr.restrictionRequestedAt) : 'Not requested'}</div></div>
        <div class="consent-check">${dsr.restrictionRequested ? '⚠️' : '✅'}</div>
      </div>
    </div>`;

    const rights = [
      ['Access',        dsr.accessRequested,        dsr.accessProvidedAt],
      ['Rectification', dsr.rectificationRequested,  dsr.rectificationCompletedAt],
      ['Erasure',       dsr.erasureRequested,        dsr.erasureCompletedAt],
      ['Portability',   dsr.portabilityRequested,    dsr.portabilityCompletedAt],
      ['Objection',     dsr.objectionRequested,      dsr.objectionCompletedAt],
      ['Restriction',   dsr.restrictionRequested,    dsr.restrictionCompletedAt],
    ];
    document.getElementById('rights-card').innerHTML = `<div class="rights-grid">${rights.map(([name, requested, completed]) => {
      const cls = !requested ? 'right-none' : completed ? 'right-done' : 'right-pending';
      const status = !requested ? 'No request' : completed ? 'Completed' : 'Pending';
      return `<div class="right-item"><div class="right-name">${name}</div><div class="right-status ${cls}">■ ${status}</div></div>`;
    }).join('')}</div>`;

    document.getElementById('grid-privacy').innerHTML = [
      ['Marketing Emails', bool(priv.marketingEmails)],
      ['Data Analytics',   bool(priv.dataAnalytics)],
      ['Third-Party Share',bool(priv.thirdPartySharing)],
    ].map(([l, v]) => cell(l, v)).join('');
  }

  // ── Render hero ───────────────────────────────────────────
  function renderHero(client) {
    const color = avatarColor(client.firstName);
    const initials = ((client.firstName?.[0] || '') + (client.lastName?.[0] || '')).toUpperCase() || '?';
    const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim();

    document.getElementById('hero-avatar').style.background = color;
    document.getElementById('hero-avatar').textContent = initials;
    document.getElementById('hero-name').textContent = fullName;
    document.getElementById('hero-email').textContent = client.email || '—';
    document.getElementById('crumb-name').textContent = fullName;
    document.getElementById('topbar-id').textContent = client._id;
    document.title = `${fullName} — JE Fitness Admin`;

    const meta = [];
    const statusMap = { active: 'hp-green', inactive: 'hp-red', 'on-break': 'hp-amber' };
    meta.push(pill(client.activityStatus || 'unknown', statusMap[client.activityStatus] || 'hp-gray'));
    meta.push(pill(client.role, 'hp-indigo'));
    if (client.isEmailVerified) meta.push(pill('Verified', 'hp-green'));
    if (client.subscription) {
      const sub = client.subscription;
      const days = daysLeft(sub.currentPeriodEnd);
      const cls = ['active','trialing'].includes(sub.status) ? (days <= 14 ? 'hp-amber' : 'hp-green') : 'hp-gray';
      meta.push(pill(sub.plan || sub.status, cls));
    }
    document.getElementById('hero-meta').innerHTML = meta.join('');

    document.getElementById('stat-workouts').textContent = (client.workoutLogs || []).filter(w => !w.deletedAt).length;
    document.getElementById('stat-meals').textContent = (client.mealLogs || []).filter(m => !m.deletedAt).length;
    document.getElementById('stat-goals').textContent = (client.workoutGoals || []).length;
  }

  // ── Main init ─────────────────────────────────────────────
  async function init() {
    // Extract client ID from URL: /clients/:id
    const match = window.location.pathname.match(/\/clients\/([a-f0-9]{24})/i);
    if (!match) {
      showError();
      return;
    }
    const clientId = match[1];

    const role = await checkAuth();
    if (!role) {
      window.location.href = '/login';
      return;
    }

    // Admins use admin endpoint; trainers use their own (relationship-gated) endpoint
    const endpoint = role === 'admin'
      ? `${API}/api/v1/admin/clients/${clientId}`
      : `${API}/api/v1/trainer/client/${clientId}`;

    try {
      const res = await fetch(endpoint, { credentials: 'include' });
      if (!res.ok) { showError(); return; }
      const data = await res.json();
      // Admin endpoint returns { client }, trainer endpoint returns { client, appointmentHistory, ... }
      const client = data.client;

      setBackLink(role);
      renderHero(client);
      renderOverview(client);
      renderWorkouts(client);
      renderNutrition(client);
      renderPrograms(client);
      renderMedical(client);
      renderGdpr(client);
      // Trainer response already includes appointmentHistory; admins fetch separately
      if (data.appointmentHistory) {
        renderAppointmentsInline(data.appointmentHistory);
      } else {
        renderAppointments(clientId); // async, non-blocking (admin path)
      }

      initTabs();
      showApp();
    } catch {
      showError();
    }
  }

  function setBackLink(role) {
    const dest = role === 'trainer' ? '/trainer-dashboard' : '/admin';
    const label = role === 'trainer' ? 'Trainer Portal' : 'Admin';
    const backLink = document.getElementById('back-link');
    const errorBack = document.getElementById('error-back-link');
    if (backLink) { backLink.href = dest; document.getElementById('back-label').textContent = label; }
    if (errorBack) { errorBack.href = dest; errorBack.textContent = `← BACK TO ${label.toUpperCase()}`; }
  }

  function showApp() {
    document.getElementById('page-loading').style.display = 'none';
    document.getElementById('app').classList.add('visible');
  }

  function showError() {
    document.getElementById('page-loading').style.display = 'none';
    document.getElementById('page-error').classList.add('visible');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
