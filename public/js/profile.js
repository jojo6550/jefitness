document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('userProfileForm');
    const formMessage = document.getElementById('formMessage');

    window.API_BASE = window.ApiConfig.getAPI_BASE();

    let currentUserId = null;

    // Helper to show messages
    function showMessage(message, type = 'success') {
        formMessage.textContent = message;
        formMessage.className = 'alert alert-' + type;
        formMessage.classList.remove('d-none');
        setTimeout(() => {
            formMessage.classList.add('d-none');
        }, 5000);
    }

    // Fetch profile data and populate form
    async function loadProfile() {
        try {
            const response = await fetch(`${window.API_BASE}/api/v1/users/profile`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });
            if (!response.ok) {
                throw new Error('Failed to load profile data');
            }
            const data = await response.json();

            // Store user ID for updates
            currentUserId = data._id;

            // Populate form fields
            document.getElementById('fullName').value = (data.firstName || '') + ' ' + (data.lastName || '');
            if (data.dob) document.getElementById('dob').value = new Date(data.dob).toISOString().split('T')[0];
            if (data.gender) document.getElementById('gender').value = data.gender;
            if (data.email) document.getElementById('email').value = data.email;
            if (data.phone) document.getElementById('phone').value = data.phone;
            if (data.activityStatus) document.getElementById('activityStatus').value = data.activityStatus;
            if (data.startWeight !== undefined && data.startWeight !== null) document.getElementById('startWeight').value = data.startWeight;
            if (data.currentWeight !== undefined && data.currentWeight !== null) document.getElementById('currentWeight').value = data.currentWeight;
            if (data.goals) document.getElementById('goals').value = data.goals;
            if (data.reason) document.getElementById('reason').value = data.reason;

            // Calculate days enrolled
            if (data.createdAt) {
                const createdDate = new Date(data.createdAt);
                const now = new Date();
                const diffTime = Math.abs(now - createdDate);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                document.getElementById('enrolledDays').value = diffDays;
            }
        } catch (error) {
            showMessage(error.message, 'danger');
        }
    }

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUserId) {
            showMessage('Profile not loaded yet. Please wait and try again.', 'danger');
            return;
        }

        // Extract form values
        const fullName = document.getElementById('fullName').value.trim();
        const [firstName, ...lastNameParts] = fullName.split(' ');
        const lastName = lastNameParts.join(' ');
        const dob = document.getElementById('dob').value || null;
        const gender = document.getElementById('gender').value || null;
        const phone = document.getElementById('phone').value.trim() || null;
        const activityStatus = document.getElementById('activityStatus').value || null;
        const startWeight = parseFloat(document.getElementById('startWeight').value) || null;
        const currentWeight = parseFloat(document.getElementById('currentWeight').value) || null;
        const goals = document.getElementById('goals').value.trim() || null;
        const reason = document.getElementById('reason').value.trim() || null;

        // Validate required fields
        if (!firstName || !lastName) {
            showMessage('Please enter your full name (first and last).', 'danger');
            return;
        }

        // Prepare payload
        const payload = {
            firstName,
            lastName,
            dob,
            gender,
            phone,
            activityStatus,
            startWeight,
            currentWeight,
            goals,
            reason
        };

        try {
            const response = await fetch(`${window.API_BASE}/api/v1/users/${currentUserId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || errorData.msg || 'Failed to update profile');
            }

            await response.json();
            window.Toast.success('Profile updated successfully.');

            // Dispatch event so medical-documents.js can save medical info
            window.dispatchEvent(new Event('profileFormSubmitted'));

        } catch (error) {
            window.Toast.error(error.message || 'Failed to update profile');
        }
    });

    loadProfile();

    // ── Body Measurements ─────────────────────────────────────────────────────

    async function loadMeasurements() {
        try {
            const res = await fetch(`${window.API_BASE}/api/v1/users/measurements`, {
                headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
            });
            if (!res.ok) return;
            const data = await res.json();
            renderMeasurements(data.measurements || []);
        } catch (e) {
            console.error('Failed to load measurements', e);
        }
    }

    function renderMeasurements(measurements) {
        const container = document.getElementById('measurementsList');
        if (!container) return;
        if (measurements.length === 0) {
            container.innerHTML = '<p class="text-muted small">No measurements recorded yet.</p>';
            return;
        }
        const rows = measurements.map(m => {
            const date = m.date ? new Date(m.date).toLocaleDateString() : '—';
            return `<tr>
                <td>${date}</td>
                <td>${m.weight ?? '—'}</td>
                <td>${m.neck ?? '—'}</td>
                <td>${m.waist ?? '—'}</td>
                <td>${m.hips ?? '—'}</td>
                <td>${m.chest ?? '—'}</td>
                <td class="text-muted small">${m.notes || ''}</td>
                <td><button class="btn btn-sm btn-outline-danger delete-meas-btn" data-id="${m._id}"><i class="bi bi-trash"></i></button></td>
            </tr>`;
        }).join('');
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead><tr>
                        <th>Date</th><th>Weight</th><th>Neck</th><th>Waist</th><th>Hips</th><th>Chest</th><th>Notes</th><th></th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        container.querySelectorAll('.delete-meas-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const res = await fetch(`${window.API_BASE}/api/v1/users/measurements/${btn.dataset.id}`, {
                        method: 'DELETE',
                        headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
                    });
                    if (res.ok) {
                        window.Toast.success('Measurement deleted.');
                        loadMeasurements();
                    }
                } catch (e) {
                    window.Toast.error('Failed to delete measurement.');
                }
            });
        });
    }

    document.getElementById('measurementForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const payload = {};
        const date = document.getElementById('measDate').value;
        const weight = parseFloat(document.getElementById('measWeight').value);
        const neck = parseFloat(document.getElementById('measNeck').value);
        const waist = parseFloat(document.getElementById('measWaist').value);
        const hips = parseFloat(document.getElementById('measHips').value);
        const chest = parseFloat(document.getElementById('measChest').value);
        const notes = document.getElementById('measNotes').value.trim();

        if (date) payload.date = date;
        if (!isNaN(weight)) payload.weight = weight;
        if (!isNaN(neck)) payload.neck = neck;
        if (!isNaN(waist)) payload.waist = waist;
        if (!isNaN(hips)) payload.hips = hips;
        if (!isNaN(chest)) payload.chest = chest;
        if (notes) payload.notes = notes;

        try {
            const res = await fetch(`${window.API_BASE}/api/v1/users/measurements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + localStorage.getItem('token'),
                },
                body: JSON.stringify(payload),
            });
            if (!res.ok) throw new Error('Failed to save');
            window.Toast.success('Measurement saved.');
            e.target.reset();
            loadMeasurements();
        } catch (err) {
            window.Toast.error('Failed to save measurement.');
        }
    });

    // ── Change Password ───────────────────────────────────────────────────────

    document.getElementById('changePasswordForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmNewPassword) {
            window.Toast.error('New passwords do not match.');
            return;
        }

        try {
            const res = await fetch(`${window.API_BASE}/api/v1/users/change-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + localStorage.getItem('token'),
                },
                body: JSON.stringify({ currentPassword, newPassword }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to update password');
            window.Toast.success('Password updated. Please log in again.');
            e.target.reset();
            setTimeout(() => {
                localStorage.removeItem('token');
                window.location.href = '/login';
            }, 2000);
        } catch (err) {
            window.Toast.error(err.message || 'Failed to update password.');
        }
    });

    loadMeasurements();
    // Set today's date as default for measurement form
    const measDateInput = document.getElementById('measDate');
    if (measDateInput) measDateInput.value = new Date().toISOString().split('T')[0];
});
