window.API_BASE = window.ApiConfig.getAPI_BASE();

const escapeHtml = str => Validators.escapeHtml(str);

async function requireSubscription() {
    try {
        const res = await fetch(`${window.API_BASE}/api/v1/subscriptions/current`, {
            credentials: 'include',
        });
        const data = await res.json();
        const activeStatuses = ['active', 'trialing', 'past_due'];
        if (!data.data || !activeStatuses.includes(data.data.status)) {
            window.location.href = '/subscriptions';
            return false;
        }
        return true;
    } catch {
        window.location.href = '/subscriptions';
        return false;
    }
}

let currentPage  = 1;
let totalPages   = 1;
let pendingDeleteId = null;
let deleteModal  = null;

const MEAL_TYPE_BADGES = {
    breakfast: 'warning',
    lunch:     'primary',
    dinner:    'success',
    snack:     'secondary',
};

document.addEventListener('DOMContentLoaded', async () => {
    const allowed = await requireSubscription();
    if (!allowed) return;

    deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));

    await Promise.all([loadStats(), loadChart(), loadMeals()]);

    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
        currentPage = 1;
        loadMeals();
    });
    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
        document.getElementById('filterStart').value    = '';
        document.getElementById('filterEnd').value      = '';
        document.getElementById('filterMealType').value = '';
        currentPage = 1;
        loadMeals();
    });
    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; loadMeals(); }
    });
    document.getElementById('nextPageBtn').addEventListener('click', () => {
        if (currentPage < totalPages) { currentPage++; loadMeals(); }
    });
    document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete);
});

async function apiGet(path) {
    const resp = await fetch(`${window.API_BASE}${path}`, {
        credentials: 'include',
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || err.error || 'Request failed');
    }
    return resp.json();
}

async function loadStats() {
    try {
        const { stats } = await apiGet('/api/v1/nutrition/stats/summary');
        document.getElementById('statTotalMeals').textContent  = stats.totalMeals;
        document.getElementById('statDailyAvgCal').textContent = stats.dailyAverageCalories.toLocaleString() + ' kcal';
        document.getElementById('statLast7Days').textContent   = stats.last7DaysCalories.toLocaleString() + ' kcal';
    } catch {
        document.getElementById('statTotalMeals').textContent  = '--';
        document.getElementById('statDailyAvgCal').textContent = '--';
        document.getElementById('statLast7Days').textContent   = '--';
    }
}

async function loadChart() {
    const container = document.getElementById('calorieChart');
    try {
        const { dailyTotals } = await apiGet('/api/v1/nutrition/daily?days=30');

        if (!dailyTotals || dailyTotals.length === 0) {
            container.innerHTML = `
                <div class="d-flex align-items-center justify-content-center h-100 text-muted">
                    <i class="bi bi-bar-chart me-2"></i>No data yet — log some meals to see your trend.
                </div>`;
            return;
        }

        const W = 700, H = 180, padL = 10, padR = 10, padT = 10, padB = 30;
        const chartW = W - padL - padR;
        const chartH = H - padT - padB;
        const maxCal = Math.max(...dailyTotals.map(d => d.totalCalories), 1);
        const barW   = Math.max(Math.floor(chartW / dailyTotals.length) - 2, 2);

        const bars = dailyTotals.map((d, i) => {
            const bh  = Math.max(Math.round((d.totalCalories / maxCal) * chartH), 1);
            const x   = padL + Math.round(i * chartW / dailyTotals.length);
            const y   = padT + chartH - bh;
            const cal = d.totalCalories.toLocaleString();
            return `<rect class="chart-bar" x="${x}" y="${y}" width="${barW}" height="${bh}"
                          fill="#198754" rx="2" opacity="0.85">
                        <title>${d.date}: ${cal} kcal</title>
                    </rect>`;
        });

        const labelStep = Math.ceil(dailyTotals.length / 5);
        const labels = dailyTotals
            .filter((_, i) => i % labelStep === 0 || i === dailyTotals.length - 1)
            .map(d => {
                const i = dailyTotals.indexOf(d);
                const x = padL + Math.round(i * chartW / dailyTotals.length) + Math.floor(barW / 2);
                const short = d.date.slice(5); // MM-DD
                return `<text x="${x}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#6c757d">${short}</text>`;
            });

        const maxLabel = `<text x="${W - padR}" y="${padT + 10}" text-anchor="end" font-size="10" fill="#6c757d">${maxCal.toLocaleString()} kcal</text>`;
        const baseline = `<line x1="${padL}" y1="${padT + chartH}" x2="${W - padR}" y2="${padT + chartH}" stroke="#dee2e6" stroke-width="1"/>`;

        container.innerHTML = `
            <svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">
                ${baseline}
                ${bars.join('')}
                ${labels.join('')}
                ${maxLabel}
            </svg>`;
    } catch {
        container.innerHTML = `
            <div class="d-flex align-items-center justify-content-center h-100 text-muted">
                <i class="bi bi-exclamation-circle me-2"></i>Could not load chart.
            </div>`;
    }
}

async function loadMeals() {
    const container = document.getElementById('mealsContainer');
    container.innerHTML = '<div class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</div>';

    const params = new URLSearchParams({ page: currentPage, limit: 10 });
    const start = document.getElementById('filterStart').value;
    const end   = document.getElementById('filterEnd').value;
    const type  = document.getElementById('filterMealType').value;
    if (start) params.set('startDate', start);
    if (end)   params.set('endDate', end);
    if (type)  params.set('mealType', type);

    try {
        const { meals, pagination } = await apiGet(`/api/v1/nutrition/?${params}`);

        totalPages = pagination.totalPages;

        document.getElementById('pageInfo').textContent = `Page ${pagination.currentPage} of ${pagination.totalPages}`;
        document.getElementById('prevPageBtn').disabled = !pagination.hasPrevPage;
        document.getElementById('nextPageBtn').disabled = !pagination.hasNextPage;

        const paginationEl = document.getElementById('paginationContainer');
        if (pagination.totalMeals > 0) {
            paginationEl.classList.remove('d-none');
        } else {
            paginationEl.classList.add('d-none');
        }

        if (meals.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-egg-fried fs-1 d-block mb-2 opacity-25"></i>
                    No meals found. <a href="/log-meal">Log your first meal!</a>
                </div>`;
            return;
        }

        container.innerHTML = meals.map(meal => renderMealCard(meal)).join('');

        container.querySelectorAll('.delete-meal-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                pendingDeleteId = btn.dataset.mealId;
                deleteModal.show();
            });
        });
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Failed to load meals: ${err.message}</div>`;
    }
}

function renderMealCard(meal) {
    const badgeColor = MEAL_TYPE_BADGES[meal.mealType] || 'secondary';
    const date = new Date(meal.date).toLocaleDateString('en-US', {
        weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    });
    const foodRows = meal.foods.map(f => `
        <tr>
            <td>${escapeHtml(f.foodName)}</td>
            <td class="text-end">${f.calories}</td>
            <td class="text-end">${f.protein}g</td>
            <td class="text-end">${f.carbs}g</td>
            <td class="text-end">${f.fat}g</td>
            <td class="text-end text-muted">${f.quantity}${f.unit}</td>
        </tr>`).join('');

    const notes = meal.notes
        ? `<div class="text-muted small mt-2"><i class="bi bi-chat-left-text me-1"></i>${escapeHtml(meal.notes)}</div>`
        : '';

    return `
        <div class="card mb-3 shadow-sm" id="meal-card-${meal._id}">
            <div class="card-header d-flex justify-content-between align-items-center py-2">
                <div>
                    <span class="badge bg-${badgeColor} meal-type-badge me-2">${meal.mealType}</span>
                    <span class="text-muted small">${date}</span>
                </div>
                <div class="d-flex align-items-center gap-3">
                    <span class="fw-bold text-success">
                        <i class="bi bi-fire me-1"></i>${meal.totalCalories.toLocaleString()} kcal
                    </span>
                    <button class="btn btn-sm btn-outline-danger delete-meal-btn" data-meal-id="${meal._id}" title="Delete meal">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
            <div class="card-body py-2">
                <div class="table-responsive food-list">
                    <table class="table table-sm table-borderless mb-0">
                        <thead class="text-muted">
                            <tr>
                                <th>Food</th>
                                <th class="text-end">Cal</th>
                                <th class="text-end">Protein</th>
                                <th class="text-end">Carbs</th>
                                <th class="text-end">Fat</th>
                                <th class="text-end">Qty</th>
                            </tr>
                        </thead>
                        <tbody>${foodRows}</tbody>
                    </table>
                </div>
                ${notes}
            </div>
        </div>`;
}

async function confirmDelete() {
    if (!pendingDeleteId) return;

    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true;
    btn.textContent = 'Deleting...';

    try {
        const resp = await fetch(`${window.API_BASE}/api/v1/nutrition/${pendingDeleteId}`, {
            method: 'DELETE',
            credentials: 'include',
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || 'Delete failed');

        deleteModal.hide();
        // Remove card from DOM immediately
        const card = document.getElementById(`meal-card-${pendingDeleteId}`);
        if (card) card.remove();
        pendingDeleteId = null;

        showSuccess('Meal deleted successfully.');
        // Reload stats and chart in background
        loadStats();
        loadChart();
        // If page is now empty, reload meals
        if (document.querySelectorAll('[id^="meal-card-"]').length === 0) {
            if (currentPage > 1) currentPage--;
            loadMeals();
        }
    } catch (err) {
        showError(err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Delete';
    }
}

function showSuccess(msg) {
    window.Toast.success(msg || 'Done!');
}

function showError(msg) {
    window.Toast.error(msg || 'An error occurred.');
}
