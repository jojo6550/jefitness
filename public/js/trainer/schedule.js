(function () {
    const {
        state,
        ITEMS_PER_PAGE,
        debounce,
        apiFetch,
        setFooter,
        formatTime12,
        renderPaginationControls,
        showConfirm,
    } = window.TrainerShared;

    async function load(page = 1) {
        const container = document.getElementById('appointmentsList');
        if (container) container.innerHTML = `<div class="window-loading"><div class="spinner-border text-primary spinner-border-sm me-2"></div><span>Synchronizing sessions...</span></div>`;

        try {
            const res = await apiFetch(`/api/v1/trainer/appointments?page=${page}&limit=${ITEMS_PER_PAGE}&view=${state.currentView}`);
            if (!res.ok) throw new Error('Failed to load appointments');
            const data = await res.json();
            state.allAppointments = data.appointments || [];
            state.appointmentsPagination = data.pagination || { currentPage: page, totalPages: 1 };

            if (!state.myTrainerId && state.allAppointments.length > 0) {
                state.myTrainerId = state.allAppointments[0].trainerId?.toString?.() || null;
            }
            render(state.allAppointments);
            renderPaginationControls('appointmentsPagination', page, state.appointmentsPagination.totalPages, (p) => load(p));
            if (state.currentView === 'archive') updateBulkActionPanel();
            setFooter(`${data.pagination?.totalAppointments || 0} total ${state.currentView} sessions (page ${page})`);
        } catch (err) {
            if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
            console.error(err);
            window.Toast.error('Failed to load schedule.');
            setFooter('Sync failed');
        }
    }

    function render(appointments) {
        const container = document.getElementById('appointmentsList');
        if (!container) return;

        if (appointments.length === 0) {
            container.innerHTML = `<div class="window-loading"><div class="text-center opacity-50"><i class="bi bi-calendar-x fs-1 mb-2 d-block"></i><span>No ${state.currentView} sessions found</span></div></div>`;
            return;
        }

        container.innerHTML = appointments.map(apt => {
            const dateObj = new Date(apt.date);
            const dayLabel  = dateObj.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
            const dateLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
            const timeLabel = formatTime12(apt.time);
            const clientName = apt.clientId ? `${apt.clientId.firstName} ${apt.clientId.lastName}` : 'Unknown Client';
            const canUpdate = apt.status === 'scheduled' && state.currentView === 'active';

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

            const statusLabel = { completed: 'On Time', late: 'Late', no_show: 'No Show', cancelled: 'Cancelled', scheduled: 'Scheduled' }[apt.status] || apt.status;
            const checkboxHtml = state.currentView === 'archive' ? `<input type="checkbox" class="apt-checkbox" data-appointment-id="${apt._id}" style="min-width: 20px;">` : '';
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

    function setupListeners() {
        document.getElementById('appointmentSearch')?.addEventListener('input', debounce(e => {
            const term = e.target.value.toLowerCase().trim();
            render(term ? state.allAppointments.filter(apt => {
                const name = apt.clientId ? `${apt.clientId.firstName} ${apt.clientId.lastName}`.toLowerCase() : '';
                return name.includes(term);
            }) : state.allAppointments);
        }, 200));

        document.getElementById('appointmentsList').addEventListener('click', e => {
            if (e.target.classList.contains('apt-checkbox')) {
                const appointmentId = e.target.dataset.appointmentId;
                if (e.target.checked) {
                    state.selectedAppointmentIds.add(appointmentId);
                } else {
                    state.selectedAppointmentIds.delete(appointmentId);
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

        document.getElementById('activeTab')?.addEventListener('click', () => {
            if (state.currentView === 'active') return;
            state.currentView = 'active';
            state.selectedAppointmentIds.clear();
            document.getElementById('activeTab').classList.add('active');
            document.getElementById('loggedTab').classList.remove('active');
            load(1);
        });

        document.getElementById('loggedTab')?.addEventListener('click', () => {
            if (state.currentView === 'archive') return;
            state.currentView = 'archive';
            state.selectedAppointmentIds.clear();
            document.getElementById('loggedTab').classList.add('active');
            document.getElementById('activeTab').classList.remove('active');
            load(1);
        });
    }

    function updateBulkActionPanel() {
        const panel = document.getElementById('bulkActionPanel');
        if (!panel) return;

        if (state.selectedAppointmentIds.size === 0) {
            panel.innerHTML = '';
            return;
        }

        const container = document.createElement('div');
        container.className = 'p-3 bg-light border-top d-flex align-items-center justify-content-between gap-3';

        const info = document.createElement('span');
        info.className = 'text-muted small';
        info.textContent = `${state.selectedAppointmentIds.size} session(s) selected`;

        const actions = document.createElement('div');
        actions.className = 'd-flex gap-2';

        const selectAllBtn = document.createElement('button');
        selectAllBtn.className = 'btn btn-sm btn-outline-secondary';
        selectAllBtn.textContent = 'Select All';
        selectAllBtn.addEventListener('click', () => {
            document.querySelectorAll('.apt-checkbox').forEach(cb => {
                cb.checked = true;
                state.selectedAppointmentIds.add(cb.dataset.appointmentId);
            });
            updateBulkActionPanel();
        });

        const clearBtn = document.createElement('button');
        clearBtn.className = 'btn btn-sm btn-outline-secondary';
        clearBtn.textContent = 'Clear';
        clearBtn.addEventListener('click', () => {
            document.querySelectorAll('.apt-checkbox').forEach(cb => cb.checked = false);
            state.selectedAppointmentIds.clear();
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
        if (state.selectedAppointmentIds.size === 0) return;

        const count = state.selectedAppointmentIds.size;
        showConfirm(`Mark ${count} session(s) as complete?`, async () => {
            const btn = document.querySelector('#bulkActionPanel .btn-primary');
            if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Updating…'; }

            try {
                const res = await apiFetch('/api/v1/trainer/appointments/bulk-update', {
                    method: 'POST',
                    body: JSON.stringify({ appointmentIds: Array.from(state.selectedAppointmentIds), status }),
                });

                if (!res.ok) {
                    window.Toast.error('Failed to update appointments.');
                    return;
                }

                const data = await res.json();
                window.Toast.success(`${data.updatedCount} session(s) marked as complete and archived.`);
                state.selectedAppointmentIds.clear();
                await load(state.appointmentsPagination.currentPage);
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

    async function updateStatus(id, status, label, clientName, time, date) {
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

            function isValidObjectId(testId) {
                return /^[0-9a-fA-F]{24}$/.test(testId);
            }

            if (!isValidObjectId(id)) {
                window.Toast.error('Invalid session ID. Refreshing schedule...');
                await load();
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
                    await load();
                    return;
                }

                window.Toast.success(`${who}'s session logged as "${displayLabel}" and archived.`);
                state.currentView = 'archive';
                document.getElementById('loggedTab')?.classList.add('active');
                document.getElementById('activeTab')?.classList.remove('active');
                await load();
            } catch (err) {
                if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
                console.error('Update status error:', err);
                window.Toast.error('Failed to update session.');
                await load();
            }
        });
    }

    window.TrainerSchedule = { load, render, setupListeners, updateBulkActionPanel, bulkUpdateStatus, updateStatus };
    window.updateStatus = updateStatus;
})();
