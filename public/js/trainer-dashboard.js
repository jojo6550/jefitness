
window.API_BASE = window.ApiConfig.getAPI_BASE();

(function () {
    const { state, debounce, showConfirm } = window.TrainerShared;

    window.initTrainerDashboard = async () => {
        try {
            setupTabNavigation();
            window.TrainerSchedule.setupListeners();
            if (window.attachLogoutListener) window.attachLogoutListener();
            await window.TrainerSchedule.load();
        } catch (err) {
            console.error('Error initializing trainer dashboard:', err);
        }
    };

    function setupTabNavigation() {
        document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });
        document.getElementById('refreshBtn')?.addEventListener('click', () => refreshCurrentTab());

        document.getElementById('clientSearch')?.addEventListener('input', debounce(e => {
            const term = e.target.value.toLowerCase().trim();
            window.TrainerClients.render(term ? state.allClients.filter(c =>
                `${c.firstName} ${c.lastName} ${c.email}`.toLowerCase().includes(term)
            ) : state.allClients);
        }, 200));
    }

    function switchTab(tab) {
        if (state.currentTab === 'availability' && state.availabilityDirty) {
            showConfirm('You have unsaved changes to your availability. Discard them?', () => {
                state.availabilityDirty = false;
                switchTab(tab);
            });
            return;
        }

        state.currentTab = tab;

        document.querySelectorAll('.tab-btn[data-tab]').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });

        document.getElementById('panelSchedule').classList.toggle('d-none', tab !== 'schedule');
        document.getElementById('panelClients').classList.toggle('d-none', tab !== 'clients');
        document.getElementById('panelAvailability').classList.toggle('d-none', tab !== 'availability');
        document.getElementById('panelNotifications').classList.toggle('d-none', tab !== 'notifications');

        document.getElementById('scheduleSubtabs').classList.toggle('d-none', tab !== 'schedule');
        document.getElementById('clientsSearchBar').classList.toggle('d-none', tab !== 'clients');
        document.getElementById('availabilityHeader').classList.toggle('d-none', tab !== 'availability');
        document.getElementById('notificationsHeader').classList.toggle('d-none', tab !== 'notifications');

        const titles = { schedule: 'Schedule Manager', clients: 'My Clients', availability: 'Weekly Availability', notifications: 'Email Notifications' };
        document.getElementById('windowTitleText').textContent = titles[tab] || 'Trainer Portal';

        if (tab === 'clients' && state.allClients.length === 0) window.TrainerClients.load();
        if (tab === 'availability') window.TrainerAvailability.load();
        if (tab === 'notifications') window.TrainerNotifications.load();
    }

    function refreshCurrentTab() {
        if (state.currentTab === 'schedule') window.TrainerSchedule.load(1);
        else if (state.currentTab === 'clients') window.TrainerClients.load(1);
        else if (state.currentTab === 'availability') window.TrainerAvailability.load();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initTrainerDashboard);
    } else {
        window.initTrainerDashboard();
    }
})();
