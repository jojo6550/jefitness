(function () {
    const { state, apiFetch, setFooter } = window.TrainerShared;

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

    async function load() {
        const grid = document.getElementById('availabilityGrid');
        grid.innerHTML = `<div class="window-loading"><div class="spinner-border text-primary spinner-border-sm me-2"></div><span>Loading schedule...</span></div>`;

        if (!state.myTrainerId) {
            try {
                const res = await apiFetch('/api/v1/trainer/me');
                if (res.ok) {
                    const data = await res.json();
                    state.myTrainerId = data.trainerId || data._id;
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
        if (state.myTrainerId) {
            try {
                const res = await apiFetch(`/api/v1/trainer/${state.myTrainerId}/availability`);
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

        renderGrid(existing);
        setFooter('Availability loaded');

        document.getElementById('saveAvailabilityBtn')?.addEventListener('click', save);
    }

    function renderGrid(existing) {
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

        grid.querySelectorAll('.avail-toggle').forEach(toggle => {
            toggle.addEventListener('change', () => {
                state.availabilityDirty = true;
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

        grid.querySelectorAll('.avail-start, .avail-end, .avail-cap').forEach(input => {
            input.addEventListener('change', () => {
                state.availabilityDirty = true;
            });
        });
    }

    async function save() {
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
                window.Toast.success('Schedule saved (no active days).');
                state.availabilityDirty = false;
                return;
            }
            const res = await apiFetch('/api/v1/trainer/availability', {
                method: 'PUT',
                body: JSON.stringify({ availability }),
            });
            if (!res.ok) throw new Error('Save failed');
            state.availabilityDirty = false;
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

    window.TrainerAvailability = { load, renderGrid, save };
})();
