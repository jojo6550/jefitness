
window.API_BASE = window.ApiConfig.getAPI_BASE();

function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// ── State ─────────────────────────────────────────────────────────────────────
let allAppointments = [];
let allClients = [];
let currentView = 'active';   // 'active' | 'archive' (within Schedule tab)
let currentTab = 'schedule';  // 'schedule' | 'clients' | 'availability'
let myTrainerId = null;        // populated after first auth'd request
let availabilityDirty = false; // tracks unsaved changes in availability tab

// Pagination state
let appointmentsPagination = { currentPage: 1, totalPages: 1 };
let clientsPagination = { currentPage: 1, totalPages: 1 };
const ITEMS_PER_PAGE = 50;

// Bulk selection state
let selectedAppointmentIds = new Set();

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.initTrainerDashboard = async () => {
    // auth enforced by httpOnly cookie

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

    // Client search
    document.getElementById('clientSearch')?.addEventListener('input', debounce(e => {
        const term = e.target.value.toLowerCase().trim();
        renderClients(term ? allClients.filter(c =>
            `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(term)
        ) : allClients);
    }, 200));
}

function switchTab(tab) {
    // Warn if leaving availability with unsaved changes
    if (currentTab === 'availability' && availabilityDirty) {
        showConfirm('You have unsaved changes to your availability. Discard them?', () => {
            availabilityDirty = false;
            switchTab(tab);
        });
        return;
    }

    currentTab = tab;

    // Toggle tab button active state
    document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });

    // Toggle panels
    document.getElementById('panelSchedule').classList.toggle('d-none', tab !== 'schedule');
    document.getElementById('panelClients').classList.toggle('d-none', tab !== 'clients');
    document.getElementById('panelAvailability').classList.toggle('d-none', tab !== 'availability');
    document.getElementById('panelNotifications').classList.toggle('d-none', tab !== 'notifications');

    // Toggle sub-bars
    document.getElementById('scheduleSubtabs').classList.toggle('d-none', tab !== 'schedule');
    document.getElementById('clientsSearchBar').classList.toggle('d-none', tab !== 'clients');
    document.getElementById('availabilityHeader').classList.toggle('d-none', tab !== 'availability');
    document.getElementById('notificationsHeader').classList.toggle('d-none', tab !== 'notifications');

    // Update title
    const titles = { schedule: 'Schedule Manager', clients: 'My Clients', availability: 'Weekly Availability', notifications: 'Email Notifications' };
    document.getElementById('windowTitleText').textContent = titles[tab] || 'Trainer Portal';

    // Load data on first open
    if (tab === 'clients' && allClients.length === 0) loadClients();
    if (tab === 'availability') loadAvailability();
    if (tab === 'notifications') loadNotificationPreference();
}

function refreshCurrentTab() {
    if (currentTab === 'schedule') loadAppointments(1);
    else if (currentTab === 'clients') loadClients(1);
    else if (currentTab === 'availability') loadAvailability();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
    try {
        opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
        opts.credentials = 'include';
        const res = await fetch(`${window.API_BASE}${url}`, opts);
        if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized'); }
        if (res.status === 403) { window.Toast.error('Access denied.'); throw new Error('Forbidden'); }
        return res;
    } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Forbidden') throw err;
        window.Toast.error('Network error. Check your connection.');
        throw err;
    }
}

function setFooter(msg) {
    const el = document.getElementById('footerStatus');
    if (el) el.textContent = msg;
}

function renderPaginationControls(containerId, currentPage, totalPages, onPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    if (totalPages <= 1) return;

    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Pagination');
    nav.className = 'd-flex justify-content-center mt-3 mb-3';

    const ul = document.createElement('ul');
    ul.className = 'pagination pagination-sm';

    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage <= 1 ? 'disabled' : ''}`;
    const prevBtn = document.createElement('a');
    prevBtn.className = 'page-link';
    prevBtn.href = '#';
    prevBtn.textContent = '← Previous';
    prevBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) onPageChange(currentPage - 1);
    });
    prevLi.appendChild(prevBtn);
    ul.appendChild(prevLi);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        const li = document.createElement('li');
        li.className = `page-item ${i === currentPage ? 'active' : ''}`;
        const a = document.createElement('a');
        a.className = 'page-link';
        a.href = '#';
        a.textContent = i;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            if (i !== currentPage) onPageChange(i);
        });
        li.appendChild(a);
        ul.appendChild(li);
    }

    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage >= totalPages ? 'disabled' : ''}`;
    const nextBtn = document.createElement('a');
    nextBtn.className = 'page-link';
    nextBtn.href = '#';
    nextBtn.textContent = 'Next →';
    nextBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) onPageChange(currentPage + 1);
    });
    nextLi.appendChild(nextBtn);
    ul.appendChild(nextLi);

    nav.appendChild(ul);
    container.appendChild(nav);
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULE TAB
// ══════════════════════════════════════════════════════════════════════════════

async function loadAppointments(page = 1) {
    const container = document.getElementById('appointmentsList');
    if (container) container.innerHTML = `<div class="window-loading"><div class="spinner-border text-primary spinner-border-sm me-2"></div><span>Synchronizing sessions...</span></div>`;

    try {
        const res = await apiFetch(`/api/v1/trainer/appointments?page=${page}&limit=${ITEMS_PER_PAGE}&view=${currentView}`);
        if (!res.ok) throw new Error('Failed to load appointments');
        const data = await res.json();
        allAppointments = data.appointments || [];
        appointmentsPagination = data.pagination || { currentPage: page, totalPages: 1 };

        // Capture trainer ID from first appointment or use a separate call
        if (!myTrainerId && allAppointments.length > 0) {
            myTrainerId = allAppointments[0].trainerId?.toString?.() || null;
        }
        renderAppointments(allAppointments);
        renderPaginationControls('appointmentsPagination', page, appointmentsPagination.totalPages, (p) => loadAppointments(p));
        if (currentView === 'archive') updateBulkActionPanel();
        setFooter(`${data.pagination?.totalAppointments || 0} total ${currentView} sessions (page ${page})`);
    } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
        console.error(err);
        window.Toast.error('Failed to load schedule.');
        setFooter('Sync failed');
    }
}

function formatTime12(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function renderAppointments(appointments) {
    const container = document.getElementById('appointmentsList');
    if (!container) return;

    if (appointments.length === 0) {
        container.innerHTML = `<div class="window-loading"><div class="text-center opacity-50"><i class="bi bi-calendar-x fs-1 mb-2 d-block"></i><span>No ${currentView} sessions found</span></div></div>`;
        return;
    }

    container.innerHTML = appointments.map(apt => {
        const dateObj = new Date(apt.date);
        const dayLabel  = dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
        const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        const timeLabel = formatTime12(apt.time);
        const clientName = apt.clientId ? `${apt.clientId.firstName} ${apt.clientId.lastName}` : 'Unknown Client';
        const canUpdate = apt.status === 'scheduled' && currentView === 'active';

        if (canUpdate) {
            return `
            <div class="apt-card-active">
                <div class="apt-card-time">
                    <div class="apt-card-clock">${timeLabel}</div>
                    <div class="apt-card-day">${dayLabel}</div>
                    <div class="apt-card-date">${dateLabel}</div>
                </div>
                <div class="apt-card-client">
                    <i class="bi bi-person-circle apt-card-icon"></i>
                    <div class="apt-card-name">${clientName}</div>
                </div>
                <div class="apt-card-actions"
                     data-appointment-id="${apt._id}"
                     data-client-name="${clientName}"
                     data-time="${timeLabel}"
                     data-date="${dayLabel}, ${dateLabel}">
                    <button class="apt-btn apt-btn-ontime ontime-btn">
                        <i class="bi bi-check-circle-fill"></i>
                        <span>On Time</span>
                    </button>
                    <button class="apt-btn apt-btn-late late-btn">
                        <i class="bi bi-clock-fill"></i>
                        <span>Late</span>
                    </button>
                    <button class="apt-btn apt-btn-noshow noshow-btn">
                        <i class="bi bi-x-circle-fill"></i>
                        <span>No Show</span>
                    </button>
                </div>
            </div>`;
        }

        // Archive / read-only row with checkbox for bulk operations
        const statusLabel = { completed: 'On Time', late: 'Late', no_show: 'No Show', cancelled: 'Cancelled', scheduled: 'Scheduled' }[apt.status] || apt.status;
        const checkboxHtml = currentView === 'archive' ? `<input type="checkbox" class="apt-checkbox" data-appointment-id="${apt._id}" style="min-width: 20px;">` : '';
        return `
            <div class="apt-row d-flex align-items-center gap-2">
                ${checkboxHtml}
                <div class="apt-time-block flex-shrink-0">
                    <div class="apt-time">${timeLabel}</div>
                    <div class="apt-date">${dayLabel}</div>
                    <div class="apt-date">${dateLabel}</div>
                </div>
                <div class="apt-client flex-grow-1">
                    <div class="client-name text-truncate">${clientName}</div>
                    ${apt.statusUpdatedAt ? `<div class="small text-muted apt-updated-time">Logged: ${new Date(apt.statusUpdatedAt).toLocaleString()}</div>` : ''}
                </div>
                <div class="apt-actions d-flex align-items-center">
                    <span class="apt-status status-${apt.status || 'scheduled'}">${statusLabel}</span>
                </div>
            </div>`;
    }).join('');
}

function setupScheduleListeners() {
    // Search
    document.getElementById('appointmentSearch')?.addEventListener('input', debounce(e => {
        const term = e.target.value.toLowerCase().trim();
        renderAppointments(term ? allAppointments.filter(apt => {
            const name = apt.clientId ? `${apt.clientId.firstName} ${apt.clientId.lastName}`.toLowerCase() : '';
            return name.includes(term);
        }) : allAppointments);
    }, 200));

    // Status buttons (event delegation on the actions container)
    document.getElementById('appointmentsList').addEventListener('click', e => {
        // Handle checkbox selection
        if (e.target.classList.contains('apt-checkbox')) {
            const appointmentId = e.target.dataset.appointmentId;
            if (e.target.checked) {
                selectedAppointmentIds.add(appointmentId);
            } else {
                selectedAppointmentIds.delete(appointmentId);
            }
            updateBulkActionPanel();
            return;
        }

        const actionsEl = e.target.closest('.apt-card-actions');
        if (!actionsEl) return;
        const { appointmentId, clientName, time, date } = actionsEl.dataset;
        let status, label;
        if (e.target.closest('.ontime-btn'))  { status = 'completed'; label = 'On Time'; }
        else if (e.target.closest('.late-btn'))   { status = 'late';      label = 'Late'; }
        else if (e.target.closest('.noshow-btn')) { status = 'no_show';   label = 'No Show'; }
        else return;
        updateStatus(appointmentId, status, label, clientName, time, date);
    });

    // Active / Logged Sessions sub-tabs
    document.getElementById('activeTab')?.addEventListener('click', () => {
        if (currentView === 'active') return;
        currentView = 'active';
        selectedAppointmentIds.clear();
        document.getElementById('activeTab').classList.add('active');
        document.getElementById('loggedTab').classList.remove('active');
        loadAppointments(1);
    });

    document.getElementById('loggedTab')?.addEventListener('click', () => {
        if (currentView === 'archive') return;
        currentView = 'archive';
        selectedAppointmentIds.clear();
        document.getElementById('loggedTab').classList.add('active');
        document.getElementById('activeTab').classList.remove('active');
        loadAppointments(1);
    });
}

function updateBulkActionPanel() {
    const panel = document.getElementById('bulkActionPanel');
    if (!panel) return;

    if (selectedAppointmentIds.size === 0) {
        panel.innerHTML = '';
        return;
    }

    const container = document.createElement('div');
    container.className = 'p-3 bg-light border-top d-flex align-items-center justify-content-between gap-3';

    const info = document.createElement('span');
    info.className = 'text-muted small';
    info.textContent = `${selectedAppointmentIds.size} session(s) selected`;

    const actions = document.createElement('div');
    actions.className = 'd-flex gap-2';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.className = 'btn btn-sm btn-outline-secondary';
    selectAllBtn.textContent = 'Select All';
    selectAllBtn.addEventListener('click', () => {
        document.querySelectorAll('.apt-checkbox').forEach(cb => {
            cb.checked = true;
            selectedAppointmentIds.add(cb.dataset.appointmentId);
        });
        updateBulkActionPanel();
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-sm btn-outline-secondary';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
        document.querySelectorAll('.apt-checkbox').forEach(cb => cb.checked = false);
        selectedAppointmentIds.clear();
        updateBulkActionPanel();
    });

    const markBtn = document.createElement('button');
    markBtn.className = 'btn btn-sm btn-primary';
    markBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Mark as Complete';
    markBtn.addEventListener('click', () => bulkUpdateStatus('completed'));

    actions.appendChild(selectAllBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(markBtn);

    container.appendChild(info);
    container.appendChild(actions);

    panel.innerHTML = '';
    panel.appendChild(container);
}

async function bulkUpdateStatus(status) {
    if (selectedAppointmentIds.size === 0) return;

    const count = selectedAppointmentIds.size;
    showConfirm(`Mark ${count} session(s) as complete?`, async () => {
        const btn = document.querySelector('#bulkActionPanel .btn-primary');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Updating…'; }

        try {
            const res = await apiFetch('/api/v1/trainer/appointments/bulk-update', {
                method: 'POST',
                body: JSON.stringify({ appointmentIds: Array.from(selectedAppointmentIds), status }),
            });

            if (!res.ok) {
                window.Toast.error('Failed to update appointments.');
                return;
            }

            const data = await res.json();
            window.Toast.success(`${data.updatedCount} session(s) marked as complete and archived.`);
            selectedAppointmentIds.clear();
            await loadAppointments(appointmentsPagination.currentPage);
            updateBulkActionPanel();
        } catch (err) {
            if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
            console.error('Bulk update error:', err);
            window.Toast.error('Failed to update sessions.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Mark as Complete'; }
        }
    });
}

window.updateStatus = async (id, status, label, clientName, time, date) => {
    const displayLabel = label || status.replace('_', ' ');
    const who  = clientName || 'this client';
    const when = (time && date) ? `${time} — ${date}` : '';
    const confirmLines = [
        `Log ${who} as "${displayLabel}"?`,
        when ? when : null,
        'Session will be moved to archive.',
    ].filter(Boolean);

    showConfirm(confirmLines, async () => {
        const ts = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
        const logNote = `[${ts}] Marked as ${displayLabel}${when ? ' — ' + when : ''}.`;

        // Validate MongoDB ObjectId format (24 hex chars)
        function isValidObjectId(testId) {
            return /^[0-9a-fA-F]{24}$/.test(testId);
        }
        
        if (!isValidObjectId(id)) {
            window.Toast.error('Invalid session ID. Refreshing schedule...');
            await loadAppointments();
            return;
        }

        try {
            const res = await apiFetch(`/api/v1/trainer/appointments/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ status, notes: logNote }),
            });
            
            if (!res.ok) {
                if (res.status === 404) {
                    window.Toast.error('Session no longer available. Refreshed schedule.');
                } else {
                    window.Toast.error('Failed to log session status.');
                }
                await loadAppointments();
                return;
            }
            
            window.Toast.success(`${who}'s session logged as "${displayLabel}" and archived.`);
            // Switch to logged sessions so the trainer immediately sees the logged record
            currentView = 'archive';
            document.getElementById('loggedTab')?.classList.add('active');
            document.getElementById('activeTab')?.classList.remove('active');
            await loadAppointments();
        } catch (err) {
            if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
            console.error('Update status error:', err);
            window.Toast.error('Failed to update session.');
            await loadAppointments();
        }
    });
};

function showConfirm(message, callback) {
    const el = document.getElementById('confirmModal');
    const lines = Array.isArray(message) ? message : [message];
    if (!el) { if (confirm(lines.join('\n'))) callback(); return; }
    const body = document.getElementById('confirmModalBody');
    body.innerHTML = '';
    lines.forEach((line, i) => {
        const p = document.createElement('p');
        p.textContent = line;
        if (i === 0) p.classList.add('fw-bold', 'mb-1');
        else p.classList.add('small', 'text-muted', 'mb-1');
        body.appendChild(p);
    });
    const modal = new bootstrap.Modal(el);
    document.getElementById('confirmActionBtn').onclick = () => { callback(); modal.hide(); };
    modal.show();
}

// ══════════════════════════════════════════════════════════════════════════════
// CLIENTS TAB
// ══════════════════════════════════════════════════════════════════════════════

async function loadClients(page = 1) {
    const container = document.getElementById('clientsList');
    container.innerHTML = `<div class="window-loading"><div class="spinner-border text-primary spinner-border-sm me-2"></div><span>Loading clients...</span></div>`;

    try {
        const res = await apiFetch(`/api/v1/trainer/clients?page=${page}&limit=${ITEMS_PER_PAGE}`);
        if (!res.ok) throw new Error('Failed to load clients');
        const data = await res.json();
        allClients = data.clients || [];
        clientsPagination = data.pagination || { currentPage: page, totalPages: 1 };

        renderClients(allClients);
        renderPaginationControls('clientsPagination', page, clientsPagination.totalPages, (p) => loadClients(p));
        setFooter(`${data.pagination?.totalClients || 0} total clients (page ${page})`);
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

    container.innerHTML = `<div class="row g-3"></div>`;
    const row = container.querySelector('.row');

    clients.forEach(c => {
        const col = document.createElement('div');
        col.className = 'col-12 col-sm-6';

        const card = document.createElement('div');
        card.className = 'apt-row client-card d-flex align-items-center gap-3 p-3';

        const avatar = document.createElement('div');
        avatar.className = 'client-avatar rounded-circle d-flex align-items-center justify-content-center flex-shrink-0';
        avatar.textContent = (c.firstName || '?')[0].toUpperCase();

        const info = document.createElement('div');
        info.className = 'flex-grow-1 min-w-0';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'fw-bold text-truncate';
        nameDiv.textContent = `${c.firstName} ${c.lastName}`;

        const emailDiv = document.createElement('div');
        emailDiv.className = 'small text-muted text-truncate';
        emailDiv.textContent = c.email;

        const badge = document.createElement('span');
        badge.className = `badge badge-xs ${c.activityStatus === 'active' ? 'bg-success' : 'bg-secondary'} mt-1`;
        badge.textContent = c.activityStatus || 'unknown';

        const viewBtn = document.createElement('button');
        viewBtn.className = 'btn btn-sm btn-outline-primary rounded-pill px-3 flex-shrink-0 view-client-btn btn-view-client';
        viewBtn.dataset.clientId = c._id;
        viewBtn.textContent = 'View';
        viewBtn.addEventListener('click', () => openClientDetail(viewBtn.dataset.clientId));

        info.appendChild(nameDiv);
        info.appendChild(emailDiv);
        info.appendChild(badge);

        card.appendChild(avatar);
        card.appendChild(info);
        card.appendChild(viewBtn);

        col.appendChild(card);
        row.appendChild(col);
    });
}


// Cache modal instance to avoid recreating it
let clientDetailModal = null;

async function openClientDetail(clientId) {
    if (!clientDetailModal) {
        clientDetailModal = new bootstrap.Modal(document.getElementById('clientDetailModal'));
    }
    document.getElementById('clientDetailName').textContent = 'Loading…';
    document.getElementById('clientDetailBody').innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary spinner-border-sm"></div></div>`;
    clientDetailModal.show();

    try {
        const res = await apiFetch(`/api/v1/trainer/client/${clientId}`);
        if (!res.ok) throw new Error('Failed to load client');
        const { client, appointmentCount, completedCount } = await res.json();

        document.getElementById('clientDetailName').textContent = `${client.firstName} ${client.lastName}`;

        const body = document.getElementById('clientDetailBody');
        body.innerHTML = '';

        const row = document.createElement('div');
        row.className = 'row g-4';

        // Contact section
        const contactCol = document.createElement('div');
        contactCol.className = 'col-md-6';

        const contactLabel = document.createElement('p');
        contactLabel.className = 'text-muted section-label mb-1';
        contactLabel.textContent = 'Contact';

        const emailP = document.createElement('p');
        emailP.className = 'mb-1';
        emailP.innerHTML = '<i class="bi bi-envelope me-2 text-muted"></i>';
        emailP.appendChild(document.createTextNode(client.email));

        contactCol.appendChild(contactLabel);
        contactCol.appendChild(emailP);

        if (client.phone) {
            const phoneP = document.createElement('p');
            phoneP.className = 'mb-1';
            phoneP.innerHTML = '<i class="bi bi-phone me-2 text-muted"></i>';
            phoneP.appendChild(document.createTextNode(client.phone));
            contactCol.appendChild(phoneP);
        }

        if (client.dob) {
            const dobP = document.createElement('p');
            dobP.className = 'mb-1';
            dobP.innerHTML = '<i class="bi bi-calendar me-2 text-muted"></i>';
            dobP.appendChild(document.createTextNode(new Date(client.dob).toLocaleDateString()));
            contactCol.appendChild(dobP);
        }

        if (client.gender) {
            const genderP = document.createElement('p');
            genderP.className = 'mb-0';
            genderP.innerHTML = '<i class="bi bi-person me-2 text-muted"></i>';
            genderP.appendChild(document.createTextNode(client.gender));
            contactCol.appendChild(genderP);
        }

        // Appointments section
        const apptCol = document.createElement('div');
        apptCol.className = 'col-md-6';

        const apptLabel = document.createElement('p');
        apptLabel.className = 'text-muted section-label mb-1';
        apptLabel.textContent = 'Appointments';

        const apptP = document.createElement('p');
        apptP.className = 'mb-0';
        const completed = document.createElement('strong');
        completed.textContent = completedCount;
        const slash = document.createTextNode(' completed / ');
        const total = document.createElement('strong');
        total.textContent = appointmentCount;
        const finalText = document.createTextNode(' total');
        apptP.appendChild(completed);
        apptP.appendChild(slash);
        apptP.appendChild(total);
        apptP.appendChild(finalText);

        apptCol.appendChild(apptLabel);
        apptCol.appendChild(apptP);

        row.appendChild(contactCol);
        row.appendChild(apptCol);

        // Medical notes
        if (client.hasMedical) {
            const medCol = document.createElement('div');
            medCol.className = 'col-12';

            const medLabel = document.createElement('p');
            medLabel.className = 'text-muted section-label mb-1';
            medLabel.textContent = 'Medical Notes';

            const medP = document.createElement('p');
            medP.className = 'mb-0 small';
            medP.textContent = client.medicalConditions || 'No notes recorded';

            medCol.appendChild(medLabel);
            medCol.appendChild(medP);
            row.appendChild(medCol);
        }

        // Medical documents
        if ((client.medicalDocuments || []).length > 0) {
            const docCol = document.createElement('div');
            docCol.className = 'col-12';

            const docLabel = document.createElement('p');
            docLabel.className = 'text-muted section-label mb-2';
            docLabel.textContent = `Medical Documents (${client.medicalDocuments.length})`;

            docCol.appendChild(docLabel);

            client.medicalDocuments.forEach(doc => {
                const docRow = document.createElement('div');
                docRow.className = 'd-flex align-items-center gap-3 py-2 border-bottom doc-row';

                const icon = document.createElement('i');
                icon.className = 'bi bi-file-earmark-text text-muted';

                const nameDiv = document.createElement('div');
                nameDiv.className = 'flex-grow-1 text-truncate small';
                nameDiv.textContent = doc.originalName || doc.filename;

                const link = document.createElement('a');
                link.href = `${window.API_BASE}/api/v1/medical-documents/view/${encodeURIComponent(doc.filename)}`;
                link.target = '_blank';
                link.className = 'btn btn-sm btn-outline-primary rounded-pill px-3 btn-doc-view';
                link.textContent = 'View';

                docRow.appendChild(icon);
                docRow.appendChild(nameDiv);
                docRow.appendChild(link);
                docCol.appendChild(docRow);
            });

            row.appendChild(docCol);
        }

        body.appendChild(row);
    } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
        console.error(err);
        window.Toast.error('Failed to load client details.');
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

    // Get my trainer ID from /trainer/me endpoint if we don't have it yet
    if (!myTrainerId) {
        try {
            const res = await apiFetch('/api/v1/trainer/me');
            if (res.ok) {
                const data = await res.json();
                myTrainerId = data.trainerId || data._id;
            } else {
                console.error('Failed to get trainer info:', res.status);
                window.Toast.error('Unable to load your availability.');
            }
        } catch (e) {
            console.error('Failed to get trainer info:', e);
            window.Toast.error('Unable to load your availability.');
        }
    }

    let existing = {};
    if (myTrainerId) {
        try {
            const res = await apiFetch(`/api/v1/trainer/${myTrainerId}/availability`);
            if (res.ok) {
                const data = await res.json();
                (data.availability || []).forEach(s => { existing[s.dayOfWeek] = s; });
            } else {
                console.error('Failed to load availability:', res.status);
                window.Toast.error('Failed to load availability.');
            }
        } catch (e) {
            console.error('Error loading availability:', e);
            window.Toast.error('Failed to load availability.');
        }
    } else {
        window.Toast.error('Unable to determine your trainer ID.');
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
        const capacity = slot ? (slot.slotCapacity ?? 6) : 6;

        return `
            <div class="avail-row apt-row mb-2 p-3" data-dow="${dow}">
                <div class="d-flex align-items-center gap-3 flex-wrap">
                    <div class="form-check form-switch mb-0 avail-day-check">
                        <input class="form-check-input avail-toggle" type="checkbox" id="toggle-${dow}" ${isActive ? 'checked' : ''} data-dow="${dow}">
                        <label class="form-check-label fw-bold avail-day-label" for="toggle-${dow}">${day}</label>
                    </div>
                    <div class="avail-hours d-flex align-items-center gap-2 flex-wrap ${isActive ? '' : 'd-none'}" id="hours-${dow}">
                        <select class="form-select form-select-sm avail-start avail-select bg-dark text-light border-secondary" id="start-${dow}">
                            ${buildHourOptions(start, 0, 23)}
                        </select>
                        <span class="text-muted avail-sep">to</span>
                        <select class="form-select form-select-sm avail-end avail-select bg-dark text-light border-secondary" id="end-${dow}">
                            ${buildHourOptions(end, 1, 24)}
                        </select>
                        <span class="text-muted avail-sep">·</span>
                        <label class="text-muted avail-day-label mb-0" for="cap-${dow}">Cap</label>
                        <input type="number" class="form-control form-control-sm avail-cap bg-dark text-light border-secondary"
                               id="cap-${dow}" min="1" max="50" value="${capacity}">
                    </div>
                    <span class="text-muted small ${isActive ? 'd-none' : ''}" id="offLabel-${dow}">Unavailable</span>
                </div>
            </div>`;
    }).join('');

    // Wire up toggles and mark dirty on change
    grid.querySelectorAll('.avail-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => {
            availabilityDirty = true;
            const dow = toggle.dataset.dow;
            const hours = document.getElementById(`hours-${dow}`);
            const offLabel = document.getElementById(`offLabel-${dow}`);
            if (toggle.checked) {
                hours?.classList.remove('d-none');
                offLabel?.classList.add('d-none');
            } else {
                hours?.classList.add('d-none');
                offLabel?.classList.remove('d-none');
            }
        });
    });

    // Mark dirty on any input change in hours
    grid.querySelectorAll('.avail-start, .avail-end, .avail-cap').forEach(input => {
        input.addEventListener('change', () => {
            availabilityDirty = true;
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

        const capEl = document.getElementById(`cap-${dow}`);
        const isActive = toggle.checked;
        const startHour = parseInt(startSel?.value ?? 6);
        const endHour = parseInt(endSel?.value ?? 20);
        const slotCapacity = Math.min(50, Math.max(1, parseInt(capEl?.value) || 6));

        if (isActive && endHour <= startHour) {
            window.Toast.error(`${DAYS[dow]}: end time must be after start time`);
            return;
        }

        if (isActive && (slotCapacity < 1 || slotCapacity > 50)) {
            window.Toast.error(`${DAYS[dow]}: capacity must be between 1 and 50`);
            return;
        }

        if (isActive) {
            availability.push({ dayOfWeek: dow, startHour, endHour, isActive: true, slotCapacity });
        }
    }

    const btn = document.getElementById('saveAvailabilityBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…'; }

    try {
        if (availability.length === 0) {
            // No active days — send a no-op or just notify
            window.Toast.success('Schedule saved (no active days).');
            availabilityDirty = false;
            return;
        }
        const res = await apiFetch('/api/v1/trainer/availability', {
            method: 'PUT',
            body: JSON.stringify({ availability }),
        });
        if (!res.ok) throw new Error('Save failed');
        availabilityDirty = false;
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

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS TAB
// ══════════════════════════════════════════════════════════════════════════════

async function loadNotificationPreference() {
    try {
        const res = await apiFetch('/api/v1/trainer/dashboard');
        if (!res.ok) {
            console.error('Failed to load notification preference:', res.status);
            window.Toast.error('Failed to load notification preference.');
            return;
        }
        const data = await res.json();
        const pref = data.trainerEmailPreference || 'daily_digest';
        const radios = document.querySelectorAll('input[name="emailPref"]');
        radios.forEach(r => { r.checked = r.value === pref; });
    } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
        console.error('Failed to load notification preference:', err);
        window.Toast.error('Failed to load notification preference.');
    }

    document.getElementById('saveNotifPrefBtn')?.addEventListener('click', saveNotificationPreference);
}

async function saveNotificationPreference() {
    const selected = document.querySelector('input[name="emailPref"]:checked');
    if (!selected) { window.Toast.error('Please select a preference.'); return; }

    const btn = document.getElementById('saveNotifPrefBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving…';

    try {
        const res = await apiFetch('/api/v1/trainer/notification-preference', {
            method: 'PUT',
            body: JSON.stringify({ preference: selected.value }),
        });
        if (!res.ok) throw new Error('Save failed');
        window.Toast.success('Notification preference saved!');
        setFooter('Preference saved');
    } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
        console.error(err);
        window.Toast.error('Failed to save preference.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check2 me-1"></i>Save Preference';
    }
}

// ── Initialize ────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTrainerDashboard);
} else {
    initTrainerDashboard();
}
