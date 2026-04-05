window.API_BASE = window.ApiConfig.getAPI_BASE();

const escapeHtml = str => Validators.escapeHtml(str);

let foodCount = 0;
let searchDebounceTimers = {};

// per-100g macro data stored per food card id
const foodBaseMacros = {};

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

document.addEventListener('DOMContentLoaded', async () => {
    const allowed = await requireSubscription();
    if (!allowed) return;

    document.getElementById('mealDate').valueAsDate = new Date();
    addFoodItem();

    document.getElementById('addFoodBtn').addEventListener('click', addFoodItem);
    document.getElementById('mealForm').addEventListener('submit', handleSubmit);
    document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = '/dashboard';
    });

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
                <div class="mb-3">
                    <label class="form-label small fw-semibold">Search food</label>
                    <div class="food-search-wrap position-relative">
                        <input type="text" class="form-control form-control-sm food-search"
                               placeholder="e.g. chicken breast, cheddar cheese, brown rice..." autocomplete="off">
                        <div class="food-search-results d-none"></div>
                    </div>
                    <small class="text-muted">Select a food to auto-fill macros, or fill in manually below</small>
                </div>

                <!-- Grams row — hidden until a food is selected from search -->
                <div class="mb-3 grams-row d-none">
                    <label class="form-label small fw-semibold">
                        Amount (g) — macros will update automatically
                    </label>
                    <div class="input-group input-group-sm" style="max-width:200px">
                        <input type="number" class="form-control food-grams"
                               placeholder="100" min="1" step="1" value="100">
                        <span class="input-group-text">g</span>
                    </div>
                    <div class="text-muted small mt-1 grams-preview"></div>
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

                <!-- Macros row -->
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
                            <select class="form-select food-unit food-unit--sm">
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
        if (!query) {
            card.querySelector('.food-search-results').classList.add('d-none');
            return;
        }
        searchDebounceTimers[id] = setTimeout(() => searchFood(query, id), 350);
    });

    card.querySelector('.food-calories').addEventListener('input', updateTotalCalories);

    // Grams input → recalculate macros live
    card.querySelector('.food-grams').addEventListener('input', () => recalcFromGrams(id));
}

function removeFoodItem(id) {
    const cards = document.querySelectorAll('.food-item-card');
    if (cards.length <= 1) {
        window.Toast.error('You must have at least one food item.');
        return;
    }
    document.querySelector(`.food-item-card[data-food-id="${id}"]`)?.remove();
    delete foodBaseMacros[id];
    updateTotalCalories();
}

async function searchFood(query, foodId) {
    const card = document.querySelector(`.food-item-card[data-food-id="${foodId}"]`);
    if (!card) return;
    const resultsDiv = card.querySelector('.food-search-results');

    if (query.length < 2) { resultsDiv.classList.add('d-none'); return; }

    resultsDiv.innerHTML = '<div class="p-2 text-muted small"><span class="spinner-border spinner-border-sm me-1"></span>Searching...</div>';
    resultsDiv.classList.remove('d-none');

    try {
        const resp = await fetch(`${window.API_BASE}/api/v1/nutrition/food-search?q=${encodeURIComponent(query)}`);
        if (!resp.ok) throw new Error();
        const { foods } = await resp.json();

        if (!foods || foods.length === 0) {
            resultsDiv.innerHTML = '<div class="p-2 text-muted small">No results — try a different term or fill in manually</div>';
            return;
        }

        resultsDiv.innerHTML = foods.map((f, i) => `
            <div class="food-result-item" data-idx="${i}">
                <div class="food-result-name">${escapeHtml(f.name)}</div>
                <div class="food-result-macros">
                    <span class="food-result-macro-pill pill-kcal">&#128293; ${f.kcalPer100g} kcal</span>
                    <span class="food-result-macro-pill pill-protein">P ${f.proteinPer100g}g</span>
                    <span class="food-result-macro-pill pill-carbs">C ${f.carbsPer100g}g</span>
                    <span class="food-result-macro-pill pill-fat">F ${f.fatPer100g}g</span>
                    <span class="text-muted" style="font-size:0.68rem;align-self:center">per 100g</span>
                </div>
            </div>`).join('');

        resultsDiv.querySelectorAll('.food-result-item').forEach((item) => {
            item.addEventListener('mouseenter', () => item.classList.add('bg-light'));
            item.addEventListener('mouseleave', () => item.classList.remove('bg-light'));
            item.addEventListener('click', () => {
                const f = foods[parseInt(item.dataset.idx)];
                selectFood(foodId, f);
                resultsDiv.classList.add('d-none');
                card.querySelector('.food-search').value = '';
            });
        });
    } catch {
        resultsDiv.innerHTML = '<div class="p-2 text-danger small">Search unavailable — enter details manually</div>';
    }
}

function selectFood(foodId, food) {
    const card = document.querySelector(`.food-item-card[data-food-id="${foodId}"]`);
    if (!card) return;

    // Store per-100g base values
    foodBaseMacros[foodId] = {
        kcal:    food.kcalPer100g,
        protein: food.proteinPer100g,
        carbs:   food.carbsPer100g,
        fat:     food.fatPer100g,
    };

    card.querySelector('.food-name').value = food.name;

    // Show grams row, default to 100g
    const gramsRow = card.querySelector('.grams-row');
    gramsRow.classList.remove('d-none');
    card.querySelector('.food-grams').value = 100;

    recalcFromGrams(foodId);
}

function recalcFromGrams(foodId) {
    const card = document.querySelector(`.food-item-card[data-food-id="${foodId}"]`);
    const base = foodBaseMacros[foodId];
    if (!card || !base) return;

    const grams = parseFloat(card.querySelector('.food-grams').value) || 0;
    const ratio = grams / 100;

    const kcal    = Math.round(base.kcal    * ratio * 10) / 10;
    const protein = Math.round(base.protein * ratio * 10) / 10;
    const carbs   = Math.round(base.carbs   * ratio * 10) / 10;
    const fat     = Math.round(base.fat     * ratio * 10) / 10;

    card.querySelector('.food-calories').value = kcal;
    card.querySelector('.food-protein').value  = protein;
    card.querySelector('.food-carbs').value    = carbs;
    card.querySelector('.food-fat').value      = fat;

    // sync quantity field to grams
    card.querySelector('.food-quantity').value = grams;
    card.querySelector('.food-unit').value     = 'g';

    card.querySelector('.grams-preview').textContent =
        `${kcal} kcal · P: ${protein}g · C: ${carbs}g · F: ${fat}g`;

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
            window.Toast.error('Please add at least one food item with a name.');
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
            },
            credentials: 'include',
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || data.error || 'Failed to log meal');

        window.Toast.success('Meal logged successfully!');
        setTimeout(() => { window.location.href = '/nutrition-history'; }, 1500);
    } catch (err) {
        window.Toast.error(err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Save Meal';
    }
}

