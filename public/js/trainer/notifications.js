(function () {
    const { apiFetch, setFooter } = window.TrainerShared;

    async function load() {
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

        document.getElementById('saveNotifPrefBtn')?.addEventListener('click', save);
    }

    async function save() {
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

    window.TrainerNotifications = { load, save };
})();
