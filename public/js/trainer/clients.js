(function () {
    const {
        state,
        ITEMS_PER_PAGE,
        apiFetch,
        setFooter,
        renderPaginationControls,
    } = window.TrainerShared;

    async function load(page = 1) {
        const container = document.getElementById('clientsList');
        container.innerHTML = `<div class="window-loading"><div class="spinner-border text-primary spinner-border-sm me-2"></div><span>Loading clients...</span></div>`;

        try {
            const res = await apiFetch(`/api/v1/trainer/clients?page=${page}&limit=${ITEMS_PER_PAGE}`);
            if (!res.ok) throw new Error('Failed to load clients');
            const data = await res.json();
            state.allClients = data.clients || [];
            state.clientsPagination = data.pagination || { currentPage: page, totalPages: 1 };

            render(state.allClients);
            renderPaginationControls('clientsPagination', page, state.clientsPagination.totalPages, (p) => load(p));
            setFooter(`${data.pagination?.totalClients || 0} total clients (page ${page})`);
        } catch (err) {
            if (err.message === 'Unauthorized' || err.message === 'Forbidden') return;
            console.error(err);
            window.Toast.error('Failed to load clients.');
        }
    }

    function render(clients) {
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
            viewBtn.addEventListener('click', () => openDetail(viewBtn.dataset.clientId));

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

    function openDetail(clientId) {
        window.AdminClientModal.open(clientId);
    }

    window.TrainerClients = { load, render, openDetail };
})();
