(function () {
    const ITEMS_PER_PAGE = 50;

    const state = {
        allAppointments: [],
        allClients: [],
        currentView: 'active',
        currentTab: 'schedule',
        myTrainerId: null,
        availabilityDirty: false,
        appointmentsPagination: { currentPage: 1, totalPages: 1 },
        clientsPagination: { currentPage: 1, totalPages: 1 },
        selectedAppointmentIds: new Set(),
    };

    function debounce(fn, ms) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), ms);
        };
    }

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

    function formatTime12(timeStr) {
        const [h, m] = timeStr.split(':').map(Number);
        const suffix = h >= 12 ? 'PM' : 'AM';
        const hour = h % 12 || 12;
        return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
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

    window.TrainerShared = {
        ITEMS_PER_PAGE,
        state,
        debounce,
        apiFetch,
        setFooter,
        formatTime12,
        renderPaginationControls,
        showConfirm,
    };
})();
