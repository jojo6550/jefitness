
window.API_BASE = window.ApiConfig.getAPI_BASE();

// ── State ─────────────────────────────────────────────────────────────────────
let allAppointments = [];
let allClients = [];
let currentView = 'active';   // 'active' | 'archive' (within Schedule tab)
let currentTab = 'schedule';  // 'schedule' | 'clients' | 'availability'
let myTrainerId = null;        // populated after first auth'd request

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.initTrainerDashboard = async () => {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = '/login'; return; }

    try {
        setupTabNavigation();
        setupScheduleListeners();
        if (window.attachLogoutListener) window.attachLogoutListener();
        await loadAppointments();
    } catch (err) {
        console.error('Error initializing trainer dashboard:', err);
    }
};

// ── Tab Navigation ─────────────────────────────────────────────────────────────
function setupTabNavigation() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
    document.getElementById('refreshBtn')?.addEventListener('click', () => refreshCurrentTab());
}

function switchTab(tab) {
    currentTab = tab;

    // Toggle tab button active state
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });

    // Toggle panels
    document.getElementById('panelSchedule').classList.toggle('d-none', tab !== 'schedule');
    document.getElementById('panelClients').classList.toggle('d-none', tab !== 'clients');
    document.getElementById('panelAvailability').classList.toggle('d-none', tab !== 'availability');

    // Toggle sub-bars
    document.getElementById('scheduleSubtabs').classList.toggle('d-none', tab !== 'schedule');
    document.getElementById('clientsSearchBar').classList.toggle('d-none', tab !== 'clients');
    document.getElementById('availabilityHeader').classList.toggle('d-none', tab !== 'availability');

    // Update title
    const titles = { schedule: 'Schedule Manager', clients: 'My Clients', availability: 'Weekly Availability' };
    document.getElementById('windowTitleText').textContent = titles[tab] || 'Trainer Portal';

    // Load data on first open
    if (tab === 'clients' && allClients.length === 0) loadClients();
    if (tab === 'availability') loadAvailability();
}

function refreshCurrentTab() {
    if (currentTab === 'schedule') loadAppointments();
    else if (currentTab === 'clients') loadClients();
    else if (currentTab === 'availability') loadAvailability();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function authHeaders() {
    return { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };
}

async function apiFetch(url, opts = {}) {
    opts.headers = { ...authHeaders(), ...(opts.headers || {}) };
    const res = await fetch(`${window.API_BASE}${url}`, opts);
    if (res.status === 401) { localStorage.removeItem('token'); window.location.href = '/login'; throw new Error('Unauthorized'); }
    if (res.status === 403) { window.Toast.error('Access denied.'); throw new Error('Forbidden'); }
    return res;
}

function setFooter(msg) {
    const el = document.getElementById('footerStatus');
    if (el) el.textContent = msg;
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULE TAB
// ══════════════════════════════════════════════════════════════════════════════

async function loadAppointments() {
    const container = document.getElementById('appointmentsList');
    if (container) container.innerHTML = `<div class="window-loading"><div class="spinner-border text-primary spinner-border-sm me-2"></div><span>Synchronizing sessions...</span></div>`;

    try {
        const res = await apiFetch(`/api/v1/trainer/appointments?limit=100&view=${currentView}`);
        if (!res.ok) throw new Error('Failed to load appointments');
        const data = await res.json();
        allAppointments = data.appointments || [];
        // Capture trainer ID from first appointment or use a separate call
        if (!myTrainerId && allAppointments.length > 0) {
            myTrainerId = allAppointments[0].trainerId?.toString?.() || null;
        }
        renderAppointments(allAppointments);
        setFooter(`${allAppointments.length} ${currentView} sessions loaded`);
    } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
        console.error(err);
        window.Toast.error('Failed to load schedule.');
        setFooter('Sync failed');
    }
}

function renderAppointments(appointments) {
    const container = document.getElementById('appointmentsList');
    if (!container) return;

    if (appointments.length === 0) {
        container.innerHTML = `<div class="window-loading"><div class="text-center opacity-50"><i class="bi bi-calendar-x fs-1 mb-2 d-block"></i><span>No ${currentView} sessions found</span></div></div>`;
        return;
    }

    container.innerHTML = appointments.map(apt => {
        const dateStr = new Date(apt.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        const clientName = apt.clientId ? `${apt.clientId.firstName} ${apt.clientId.lastName}` : 'Unknown Client';
        const canUpdate = (apt.status === 'scheduled' || apt.status === 'late') && currentView === 'active';

        return `
            <div class="apt-row">
                <div class="apt-time-block">
                    <div class="apt-time">${apt.time}</div>
                    <div class="apt-date">${dateStr}</div>
                </div>
                <div class="apt-client">
                    <div class="client-name text-truncate">${clientName}</div>
                    ${currentView === 'archive' && apt.statusUpdatedAt ? `<div class="small text-muted" style="font-size:0.6rem">Updated: ${new Date(apt.statusUpdatedAt).toLocaleString()}</div>` : ''}
                </div>
                <div class="apt-actions d-flex align-items-center gap-2">
                    <span class="apt-status status-${apt.status || 'scheduled'}">${apt.status || 'scheduled'}</span>
                    ${canUpdate ? `
                    <div class="btn-group btn-group-sm status-buttons" data-appointment-id="${apt._id}">
                        <button class="btn btn-dark border-0 py-0 complete-btn" title="Complete"><i class="bi bi-check text-success"></i></button>
                        <button class="btn btn-dark border-0 py-0 late-btn" title="Late"><i class="bi bi-clock text-warning"></i></button>
                        <button class="btn btn-dark border-0 py-0 noshow-btn" title="No Show"><i class="bi bi-x text-danger"></i></button>
                    </div>` : ''}
                </div>
            </div>`;
    }).join('');
}

function setupScheduleListeners() {
    // Search
    document.getElementById('appointmentSearch')?.addEventListener('input', e => {
        const term = e.target.value.toLowerCase().trim();
        renderAppointments(term ? allAppointments.filter(apt => {
            const name = apt.clientId ? `${apt.clientId.firstName} ${apt.clientId.lastName}`.toLowerCase() : '';
            return name.includes(term);
        }) : allAppointments);
    });

    // Status buttons (event delegation)
    document.getElementById('appointmentsList').addEventListener('click', e => {
        const aptId = e.target.closest('.status-buttons')?.dataset.appointmentId;
        if (!aptId) return;
        let status;
        if (e.target.closest('.complete-btn')) status = 'completed';
        else if (e.target.closest('.late-btn')) status = 'late';
        else if (e.target.closest('.noshow-btn')) status = 'no_show';
        else return;
        updateStatus(aptId, status);
    });

    // Active / Archive sub-tabs
    document.getElementById('activeTab')?.addEventListener('click', () => {
        if (currentView === 'active') return;
        currentView = 'active';
        document.getElementById('activeTab').classList.add('active');
        document.getElementById('archiveTab').classList.remove('active');
        loadAppointments();
    });

    document.getElementById('archiveTab')?.addEventListener('click', () => {
        if (currentView === 'archive') return;
        currentView = 'archive';
        document.getElementById('archiveTab').classList.add('active');
        document.getElementById('activeTab').classList.remove('active');
        loadAppointments();
    });
}

window.updateStatus = async (id, status) => {
    const statusText = status.replace('_', ' ');
    showConfirm(`Mark session as ${statusText}?`, async () => {
        try {
            const res = await apiFetch(`/api/v1/trainer/appointments/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error('Failed to update');
            window.Toast.success(`Updated to ${statusText}`);
            await loadAppointments();
        } catch (err) {
            if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
            console.error(err);
            window.Toast.error('Update failed.');
        }
    });
};

function showConfirm(message, callback) {
    const el = document.getElementById('confirmModal');
    if (!el) { if (confirm(message)) callback(); return; }
    document.getElementById('confirmModalBody').textContent = message;
    const modal = new bootstrap.Modal(el);
    document.getElementById('confirmActionBtn').onclick = () => { callback(); modal.hide(); };
    modal.show();
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTS TAB
// ══════════════════════════════════════════════════════════════════════════════

async function loadClients() {
    const container = document.getElementById('clientsList');
    container.innerHTML = `<div class="window-loading"><div class="spinner-border text-primary spinner-border-sm me-2"></div><span>Loading clients...</span></div>`;

    try {
        const res = await apiFetch('/api/v1/trainer/clients?limit=100');
        if (!res.ok) throw new Error('Failed to load clients');
        const data = await res.json();
        allClients = data.clients || [];
        renderClients(allClients);
        setFooter(`${allClients.length} clients`);
    } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
        console.error(err);
        window.Toast.error('Failed to load clients.');
    }
}

function renderClients(clients) {
    const container = document.getElementById('clientsList');
    if (!container) return;

    if (clients.length === 0) {
        container.innerHTML = `<div class="window-loading"><div class="text-center opacity-50"><i class="bi bi-people fs-1 mb-2 d-block"></i><span>No clients yet</span></div></div>`;
        return;
    }

    container.innerHTML = `<div class="row g-3">${clients.map(c => `
        <div class="col-12 col-sm-6">
            <div class="apt-row d-flex align-items-center gap-3 p-3" style="cursor:default">
                <div class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                     style="width:42px;height:42px;background:rgba(0,210,255,0.12);color:var(--primary-accent);font-weight:800;font-size:1rem;">
                    ${(c.firstName || '?')[0].toUpperCase()}
                </div>
                <div class="flex-grow-1 min-w-0">
                    <div class="fw-bold text-truncate">${c.firstName} ${c.lastName}</div>
                    <div class="small text-muted text-truncate">${c.email}</div>
                    <span class="badge ${c.activityStatus === 'active' ? 'bg-success' : 'bg-secondary'} mt-1" style="font-size:0.6rem">${c.activityStatus || 'unknown'}</span>
                </div>
                <button class="btn btn-sm btn-outline-primary rounded-pill px-3 flex-shrink-0 view-client-btn"
                        data-client-id="${c._id}" style="font-size:0.75rem">
                    View
                </button>
            </div>
        </div>`).join('')}</div>`;

    // Wire up view buttons
    container.querySelectorAll('.view-client-btn').forEach(btn => {
        btn.addEventListener('click', () => openClientDetail(btn.dataset.clientId));
    });
}

// Client search
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('clientSearch')?.addEventListener('input', e => {
        const term = e.target.value.toLowerCase().trim();
        renderClients(term ? allClients.filter(c =>
            `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(term)
        ) : allClients);
    });
});

async function openClientDetail(clientId) {
    const modal = new bootstrap.Modal(document.getElementById('clientDetailModal'));
    document.getElementById('clientDetailName').textContent = 'Loading…';
    document.getElementById('clientDetailBody').innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm"></div></div>`;
    modal.show();

    try {
        const res = await apiFetch(`/api/v1/trainer/client/${clientId}`);
        if (!res.ok) throw new Error('Failed to load client');
        const { client, appointmentCount, completedCount } = await res.json();

        document.getElementById('clientDetailName').textContent = `${client.firstName} ${client.lastName}`;

        const token = localStorage.getItem('token');
        const docRows = (client.medicalDocuments || []).map(doc => `
            <div class="d-flex align-items-center gap-3 py-2 border-bottom" style="border-color:rgba(255,255,255,.06)!important">
                <i class="bi bi-file-earmark-text text-muted"></i>
                <div class="flex-grow-1 text-truncate small">${doc.originalName || doc.filename}</div>
                <a href="${window.API_BASE}/api/v1/medical-documents/view/${encodeURIComponent(doc.filename)}?token=${token}"
                   target="_blank" class="btn btn-sm btn-outline-primary rounded-pill px-3" style="font-size:0.7rem">
                    View
                </a>
            </div>`).join('');

        document.getElementById('clientDetailBody').innerHTML = `
            <div class="row g-4">
                <div class="col-md-6">
                    <p class="text-muted mb-1" style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em">Contact</p>
                    <p class="mb-1"><i class="bi bi-envelope me-2 text-muted"></i>${client.email}</p>
                    ${client.phone ? `<p class="mb-1"><i class="bi bi-phone me-2 text-muted"></i>${client.phone}</p>` : ''}
                    ${client.dob ? `<p class="mb-1"><i class="bi bi-calendar me-2 text-muted"></i>${new Date(client.dob).toLocaleDateString()}</p>` : ''}
                    ${client.gender ? `<p class="mb-0"><i class="bi bi-person me-2 text-muted"></i>${client.gender}</p>` : ''}
                </div>
                <div class="col-md-6">
                    <p class="text-muted mb-1" style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em">Appointments</p>
                    <p class="mb-0"><strong>${completedCount}</strong> completed / <strong>${appointmentCount}</strong> total</p>
                </div>
                ${client.hasMedical ? `
                <div class="col-12">
                    <p class="text-muted mb-1" style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em">Medical Notes</p>
                    <p class="mb-0 small">${client.medicalConditions || 'No notes recorded'}</p>
                </div>` : ''}
                ${(client.medicalDocuments || []).length > 0 ? `
                <div class="col-12">
                    <p class="text-muted mb-2" style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em">
                        Medical Documents (${client.medicalDocuments.length})
                    </p>
                    ${docRows}
                </div>` : ''}
            </div>`;
    } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
        console.error(err);
        document.getElementById('clientDetailBody').innerHTML = `<p class="text-danger text-center py-3">Failed to load client details.</p>`;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// AVAILABILITY TAB
// ══════════════════════════════════════════════════════════════════════════════

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function hourLabel(h) {
    if (h === 0) return '12:00 AM';
    if (h < 12) return `${h}:00 AM`;
    if (h === 12) return '12:00 PM';
    return `${h - 12}:00 PM`;
}

function buildHourOptions(selected, min = 0, max = 24) {
    let html = '';
    for (let h = min; h <= max; h++) {
        html += `<option value="${h}" ${h === selected ? 'selected' : ''}>${hourLabel(h)}</option>`;
    }
    return html;
}

async function loadAvailability() {
    const grid = document.getElementById('availabilityGrid');
    grid.innerHTML = `<div class="window-loading"><div class="spinner-border text-primary spinner-border-sm me-2"></div><span>Loading schedule...</span></div>`;

    // Get my trainer ID if we don't have it yet
    if (!myTrainerId) {
        try {
            const res = await apiFetch('/api/v1/trainer/dashboard');
            if (res.ok) {
                // We can't get the ID from dashboard response easily; decode from token
                const token = localStorage.getItem('token');
                const payload = JSON.parse(atob(token.split('.')[1]));
                myTrainerId = payload.id || payload._id || payload.sub;
            }
        } catch (e) { /* ignore */ }
    }

    if (!myTrainerId) {
        // Fallback: decode from token
        try {
            const token = localStorage.getItem('token');
            const payload = JSON.parse(atob(token.split('.')[1]));
            myTrainerId = payload.id || payload._id || payload.sub;
        } catch(e) {}
    }

    let existing = {};
    if (myTrainerId) {
        try {
            const res = await apiFetch(`/api/v1/trainer/${myTrainerId}/availability`);
            if (res.ok) {
                const data = await res.json();
                (data.availability || []).forEach(s => { existing[s.dayOfWeek] = s; });
            }
        } catch (e) { /* ignore, render empty grid */ }
    }

    renderAvailabilityGrid(existing);
    setFooter('Availability loaded');

    document.getElementById('saveAvailabilityBtn')?.addEventListener('click', saveAvailability);
}

function renderAvailabilityGrid(existing) {
    const grid = document.getElementById('availabilityGrid');

    grid.innerHTML = DAYS.map((day, dow) => {
        const slot = existing[dow];
        const isActive = slot ? slot.isActive : false;
        const start = slot ? slot.startHour : 6;
        const end = slot ? slot.endHour : 20;

        return `
            <div class="avail-row apt-row mb-2 p-3" data-dow="${dow}">
                <div class="d-flex align-items-center gap-3 flex-wrap">
                    <div class="form-check form-switch mb-0" style="min-width:120px">
                        <input class="form-check-input avail-toggle" type="checkbox" id="toggle-${dow}" ${isActive ? 'checked' : ''} data-dow="${dow}">
                        <label class="form-check-label fw-bold" for="toggle-${dow}" style="font-size:.85rem">${day}</label>
                    </div>
                    <div class="avail-hours d-flex align-items-center gap-2 flex-wrap ${isActive ? '' : 'd-none'}" id="hours-${dow}">
                        <select class="form-select form-select-sm avail-start bg-dark text-light border-secondary" id="start-${dow}" style="width:auto">
                            ${buildHourOptions(start, 0, 23)}
                        </select>
                        <span class="text-muted" style="font-size:.8rem">to</span>
                        <select class="form-select form-select-sm avail-end bg-dark text-light border-secondary" id="end-${dow}" style="width:auto">
                            ${buildHourOptions(end, 1, 24)}
                        </select>
                    </div>
                    ${!isActive ? `<span class="text-muted small" id="offLabel-${dow}">Unavailable</span>` : ''}
                </div>
            </div>`;
    }).join('');

    // Wire up toggles
    grid.querySelectorAll('.avail-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
            const dow = toggle.dataset.dow;
            const hours = document.getElementById(`hours-${dow}`);
            const offLabel = document.getElementById(`offLabel-${dow}`);
            if (toggle.checked) {
                hours?.classList.remove('d-none');
                if (offLabel) offLabel.style.display = 'none';
            } else {
                hours?.classList.add('d-none');
                if (offLabel) offLabel.style.display = '';
            }
        });
    });
}

async function saveAvailability() {
    const availability = [];
    for (let dow = 0; dow < 7; dow++) {
        const toggle = document.getElementById(`toggle-${dow}`);
        const startSel = document.getElementById(`start-${dow}`);
        const endSel = document.getElementById(`end-${dow}`);
        if (!toggle) continue;

        const isActive = toggle.checked;
        const startHour = parseInt(startSel?.value ?? 6);
        const endHour = parseInt(endSel?.value ?? 20);

        if (isActive && endHour <= startHour) {
            window.Toast.error(`${DAYS[dow]}: end time must be after start time`);
            return;
        }

        if (isActive) {
            availability.push({ dayOfWeek: dow, startHour, endHour, isActive: true });
        }
    }

    const btn = document.getElementById('saveAvailabilityBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…'; }

    try {
        if (availability.length === 0) {
            // No active days — send a no-op or just notify
            window.Toast.success('Schedule saved (no active days).');
            return;
        }
        const res = await apiFetch('/api/v1/trainer/availability', {
            method: 'PUT',
            body: JSON.stringify({ availability }),
        });
        if (!res.ok) throw new Error('Save failed');
        window.Toast.success('Availability saved!');
        setFooter('Schedule saved');
    } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
        console.error(err);
        window.Toast.error('Failed to save availability.');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Save Schedule'; }
    }
}

// ── Initialize ────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTrainerDashboard);
} else {
    initTrainerDashboard();
}
