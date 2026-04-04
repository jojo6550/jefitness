window.API_BASE = window.ApiConfig.getAPI_BASE();

let foodCount = 0;
let searchDebounceTimers = {};

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    document.getElementById('mealDate').valueAsDate = new Date();
    addFoodItem();

    document.getElementById('addFoodBtn').addEventListener('click', addFoodItem);
    document.getElementById('mealForm').addEventListener('submit', handleSubmit);
    document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = '/dashboard';
    });

    // Close search dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.food-search-wrap')) {
            document.querySelectorAll('.food-search-results').forEach(el => el.classList.add('d-none'));
        }
    });
});

function addFoodItem() {
    foodCount++;
    const id = foodCount;

    const html = `
        <div class="food-item-card card mb-3 border-success border-opacity-25" data-food-id="${id}">
            <div class="card-header bg-light d-flex justify-content-between align-items-center py-2">
                <h6 class="mb-0 text-success"><i class="bi bi-bag me-1"></i>Food Item ${id}</h6>
                <button type="button" class="btn btn-sm btn-outline-danger remove-food-btn" data-food-id="${id}">
                    <i class="bi bi-trash"></i> Remove
                </button>
            </div>
            <div class="card-body pb-2">

                <!-- Search -->
                <div class="mb-2">
                    <label class="form-label small fw-semibold">Search food (Open Food Facts)</label>
                    <div class="food-search-wrap">
                        <input type="text" class="form-control form-control-sm food-search"
                               placeholder="Type to search, e.g. chicken breast..." autocomplete="off">
                        <div class="food-search-results d-none"></div>
                    </div>
                    <small class="text-muted">Search to auto-fill macros, or fill in manually below</small>
                </div>

                <!-- Food Name -->
                <div class="mb-2">
                    <label class="form-label small fw-semibold">Food Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control form-control-sm food-name"
                           placeholder="e.g., Chicken Breast" required maxlength="200">
                    <div class="invalid-feedback">Please enter a food name.</div>
                </div>

                <!-- Calories -->
                <div class="mb-2">
                    <label class="form-label small fw-semibold">Calories (kcal) <span class="text-danger">*</span></label>
                    <input type="number" class="form-control form-control-sm food-calories"
                           placeholder="0" min="0" step="0.1" required>
                    <div class="invalid-feedback">Please enter calories.</div>
                </div>

                <!-- Macros -->
                <div class="macro-grid mb-2">
                    <div>
                        <label class="form-label small fw-semibold">Protein (g)</label>
                        <input type="number" class="form-control form-control-sm food-protein"
                               placeholder="0" min="0" step="0.1" value="0">
                    </div>
                    <div>
                        <label class="form-label small fw-semibold">Carbs (g)</label>
                        <input type="number" class="form-control form-control-sm food-carbs"
                               placeholder="0" min="0" step="0.1" value="0">
                    </div>
                    <div>
                        <label class="form-label small fw-semibold">Fat (g)</label>
                        <input type="number" class="form-control form-control-sm food-fat"
                               placeholder="0" min="0" step="0.1" value="0">
                    </div>
                    <div>
                        <label class="form-label small fw-semibold">Quantity <span class="text-danger">*</span></label>
                        <div class="input-group input-group-sm">
                            <input type="number" class="form-control food-quantity"
                                   placeholder="100" min="0.01" step="0.01" value="100" required>
                            <select class="form-select food-unit" style="max-width: 80px;">
                                <option value="g">g</option>
                                <option value="ml">ml</option>
                                <option value="oz">oz</option>
                                <option value="serving">serv</option>
                            </select>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    `;

    document.getElementById('foodsContainer').insertAdjacentHTML('beforeend', html);

    const card = document.querySelector(`.food-item-card[data-food-id="${id}"]`);

    card.querySelector('.remove-food-btn').addEventListener('click', () => removeFoodItem(id));

    const searchInput = card.querySelector('.food-search');
    searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimers[id]);
        const query = searchInput.value.trim();
        searchDebounceTimers[id] = setTimeout(() => searchFood(query, id), 300);
    });

    card.querySelector('.food-calories').addEventListener('input', updateTotalCalories);
}

function removeFoodItem(id) {
    const cards = document.querySelectorAll('.food-item-card');
    if (cards.length <= 1) {
        showError('You must have at least one food item.');
        return;
    }
    const card = document.querySelector(`.food-item-card[data-food-id="${id}"]`);
    if (card) card.remove();
    updateTotalCalories();
}

async function searchFood(query, foodId) {
    const card = document.querySelector(`.food-item-card[data-food-id="${foodId}"]`);
    if (!card) return;
    const resultsDiv = card.querySelector('.food-search-results');

    if (!query || query.length < 2) {
        resultsDiv.classList.add('d-none');
        return;
    }

    resultsDiv.innerHTML = '<div class="p-2 text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Searching...</div>';
    resultsDiv.classList.remove('d-none');

    try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=5`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Search failed');
        const data = await resp.json();

        const products = (data.products || []).filter(p => p.product_name);
        if (products.length === 0) {
            resultsDiv.innerHTML = '<div class="p-2 text-muted small">No results found</div>';
            return;
        }

        resultsDiv.innerHTML = products.map(p => {
            const kcal  = Math.round(p.nutriments?.['energy-kcal']          || 0);
            const prot  = Math.round(p.nutriments?.proteins_value            || 0);
            const carbs = Math.round(p.nutriments?.carbohydrates_value       || 0);
            const fat   = Math.round(p.nutriments?.fat_value                 || 0);
            return `
                <div class="food-result-item p-2 border-bottom"
                     style="cursor:pointer"
                     data-name="${escapeHtml(p.product_name)}"
                     data-kcal="${kcal}"
                     data-protein="${prot}"
                     data-carbs="${carbs}"
                     data-fat="${fat}">
                    <div class="fw-semibold small">${escapeHtml(p.product_name)}</div>
                    <div class="text-muted" style="font-size:0.75rem">${kcal} kcal &middot; P: ${prot}g &middot; C: ${carbs}g &middot; F: ${fat}g</div>
                </div>`;
        }).join('');

        resultsDiv.querySelectorAll('.food-result-item').forEach(item => {
            item.addEventListener('click', () => {
                populateFoodFromResult(foodId, {
                    name:    item.dataset.name,
                    kcal:    parseFloat(item.dataset.kcal),
                    protein: parseFloat(item.dataset.protein),
                    carbs:   parseFloat(item.dataset.carbs),
                    fat:     parseFloat(item.dataset.fat),
                });
                resultsDiv.classList.add('d-none');
                card.querySelector('.food-search').value = '';
            });
        });
    } catch {
        resultsDiv.innerHTML = '<div class="p-2 text-danger small">Search unavailable — enter details manually</div>';
    }
}

function populateFoodFromResult(foodId, data) {
    const card = document.querySelector(`.food-item-card[data-food-id="${foodId}"]`);
    if (!card) return;
    card.querySelector('.food-name').value     = data.name;
    card.querySelector('.food-calories').value = data.kcal;
    card.querySelector('.food-protein').value  = data.protein;
    card.querySelector('.food-carbs').value    = data.carbs;
    card.querySelector('.food-fat').value      = data.fat;
    updateTotalCalories();
}

function updateTotalCalories() {
    let total = 0;
    document.querySelectorAll('.food-item-card .food-calories').forEach(input => {
        total += parseFloat(input.value) || 0;
    });
    document.getElementById('totalCaloriesValue').textContent = Math.round(total);
}

async function handleSubmit(e) {
    e.preventDefault();

    const form = e.target;
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        return;
    }

    const token = localStorage.getItem('token');
    const btn = document.getElementById('saveMealBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

    try {
        const foods = [];
        document.querySelectorAll('.food-item-card').forEach(card => {
            const foodName = card.querySelector('.food-name').value.trim();
            if (!foodName) return;
            foods.push({
                foodName,
                calories: parseFloat(card.querySelector('.food-calories').value) || 0,
                protein:  parseFloat(card.querySelector('.food-protein').value)  || 0,
                carbs:    parseFloat(card.querySelector('.food-carbs').value)    || 0,
                fat:      parseFloat(card.querySelector('.food-fat').value)      || 0,
                quantity: parseFloat(card.querySelector('.food-quantity').value) || 1,
                unit:     card.querySelector('.food-unit').value || 'g',
            });
        });

        if (foods.length === 0) {
            showError('Please add at least one food item with a name.');
            return;
        }

        const payload = {
            date:     document.getElementById('mealDate').value,
            mealType: document.getElementById('mealType').value,
            foods,
        };

        const notes = document.getElementById('mealNotes').value.trim();
        if (notes) payload.notes = notes;

        const response = await fetch(`${window.API_BASE}/api/v1/nutrition/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error?.message || data.error || 'Failed to log meal');
        }

        showSuccess();
        setTimeout(() => { window.location.href = '/nutrition-history'; }, 1500);
    } catch (err) {
        showError(err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Save Meal';
    }
}

function showSuccess() {
    const toast = new bootstrap.Toast(document.getElementById('successToast'));
    toast.show();
}

function showError(message) {
    document.getElementById('errorToastMessage').textContent = message || 'An error occurred.';
    const toast = new bootstrap.Toast(document.getElementById('errorToast'));
    toast.show();
}
