document.addEventListener("DOMContentLoaded", () => {
    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_BASE_URL = isLocalhost
        ? 'http://localhost:10000'
        : 'https://jojo6550-github-io.onrender.com';

    const nutritionForm = document.getElementById('nutritionForm');
    const editNutritionForm = document.getElementById('editNutritionForm');
    const mealsList = document.getElementById('mealsList');
    const editMealModal = new bootstrap.Modal(document.getElementById('editMealModal'));

    let currentEditId = null;

    // Set default date to today
    document.getElementById('dateInput').valueAsDate = new Date();

    // Fetch and display meals
    async function fetchMeals() {
        try {
            const response = await fetch(API_BASE_URL + '/api/nutrition', {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });

            if (!response.ok) throw new Error('Failed to fetch meals');

            const data = await response.json();
            displayMeals(data.nutritionLogs);
        } catch (error) {
            console.error('Error fetching meals:', error);
            showAlert('Failed to load meals. Please try again.', 'danger');
        }
    }

    // Display meals in the list
    function displayMeals(meals) {
        mealsList.innerHTML = '';

        if (meals.length === 0) {
            mealsList.innerHTML = '<p class="text-muted text-center">No meals logged yet. Start by adding your first meal!</p>';
            return;
        }

        // Sort meals by date descending
        meals.sort((a, b) => new Date(b.date) - new Date(a.date));

        meals.forEach(meal => {
            const mealItem = document.createElement('div');
            mealItem.className = 'list-group-item d-flex justify-content-between align-items-center';
            mealItem.innerHTML = `
                <div>
                    <h6 class="mb-1">${meal.foodItem}</h6>
                    <small class="text-muted">${meal.mealType} • ${new Date(meal.date).toLocaleDateString()}</small>
                    <div class="mt-1">
                        <span class="badge bg-primary">${meal.calories} cal</span>
                        <span class="badge bg-success">${meal.protein}g P</span>
                        <span class="badge bg-warning text-dark">${meal.carbs}g C</span>
                        <span class="badge bg-danger">${meal.fats}g F</span>
                    </div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline-primary me-2 edit-btn" data-id="${meal.id}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${meal.id}">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            `;
            mealsList.appendChild(mealItem);
        });

        // Add event listeners for edit and delete buttons
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mealId = e.currentTarget.dataset.id;
                openEditModal(mealId, meals);
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mealId = e.currentTarget.dataset.id;
                deleteMeal(mealId);
            });
        });
    }

    // Add new meal
    nutritionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = {
            date: document.getElementById('dateInput').value,
            mealType: document.getElementById('mealTypeInput').value,
            foodItem: document.getElementById('foodItemInput').value,
            calories: document.getElementById('caloriesInput').value,
            protein: document.getElementById('proteinInput').value,
            carbs: document.getElementById('carbsInput').value,
            fats: document.getElementById('fatsInput').value
        };

        try {
            const response = await fetch(API_BASE_URL + '/api/nutrition', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) throw new Error('Failed to add meal');

            const result = await response.json();
            showAlert('Meal logged successfully!', 'success');
            nutritionForm.reset();
            document.getElementById('dateInput').valueAsDate = new Date();
            fetchMeals();
        } catch (error) {
            console.error('Error adding meal:', error);
            showAlert('Failed to log meal. Please try again.', 'danger');
        }
    });

    // Open edit modal
    function openEditModal(mealId, meals) {
        const meal = meals.find(m => m.id === mealId);
        if (!meal) return;

        currentEditId = mealId;
        document.getElementById('editMealId').value = meal.id;
        document.getElementById('editDateInput').value = meal.date;
        document.getElementById('editMealTypeInput').value = meal.mealType;
        document.getElementById('editFoodItemInput').value = meal.foodItem;
        document.getElementById('editCaloriesInput').value = meal.calories;
        document.getElementById('editProteinInput').value = meal.protein;
        document.getElementById('editCarbsInput').value = meal.carbs;
        document.getElementById('editFatsInput').value = meal.fats;

        editMealModal.show();
    }

    // Update meal
    editNutritionForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = {
            date: document.getElementById('editDateInput').value,
            mealType: document.getElementById('editMealTypeInput').value,
            foodItem: document.getElementById('editFoodItemInput').value,
            calories: document.getElementById('editCaloriesInput').value,
            protein: document.getElementById('editProteinInput').value,
            carbs: document.getElementById('editCarbsInput').value,
            fats: document.getElementById('editFatsInput').value
        };

        try {
            const response = await fetch(API_BASE_URL + `/api/nutrition/${currentEditId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) throw new Error('Failed to update meal');

            const result = await response.json();
            showAlert('Meal updated successfully!', 'success');
            editMealModal.hide();
            fetchMeals();
        } catch (error) {
            console.error('Error updating meal:', error);
            showAlert('Failed to update meal. Please try again.', 'danger');
        }
    });

    // Delete meal
    async function deleteMeal(mealId) {
        if (!confirm('Are you sure you want to delete this meal?')) return;

        try {
            const response = await fetch(API_BASE_URL + `/api/nutrition/${mealId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                }
            });

            if (!response.ok) throw new Error('Failed to delete meal');

            showAlert('Meal deleted successfully!', 'success');
            fetchMeals();
        } catch (error) {
            console.error('Error deleting meal:', error);
            showAlert('Failed to delete meal. Please try again.', 'danger');
        }
    }

    // Show alert messages
    function showAlert(message, type) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(alertDiv);

        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }

    // Initialize
    fetchMeals();
});
