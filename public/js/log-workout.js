window.API_BASE = window.ApiConfig.getAPI_BASE();

let exerciseCount = 0;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../index.html';
        return;
    }

    // Set default date to today
    document.getElementById('workoutDate').valueAsDate = new Date();

    // Add first exercise by default
    addExercise();

    // Event listeners
    document.getElementById('addExerciseBtn').addEventListener('click', addExercise);
    document.getElementById('workoutForm').addEventListener('submit', handleSubmit);
    document.getElementById('cancelBtn').addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });
});

function addExercise() {
    exerciseCount++;
    const exerciseHtml = `
        <div class="exercise-card card mb-3" data-exercise-id="${exerciseCount}">
            <div class="card-header bg-light d-flex justify-content-between align-items-center">
                <h6 class="mb-0">Exercise ${exerciseCount}</h6>
                <button type="button" class="btn btn-sm btn-outline-danger remove-exercise-btn" data-exercise-id="${exerciseCount}">
                    <i class="bi bi-trash"></i> Remove
                </button>
            </div>
            <div class="card-body">
                <div class="mb-3">
                    <label class="form-label fw-bold">Exercise Name <span class="text-danger">*</span></label>
                    <input type="text" class="form-control exercise-name" placeholder="e.g., Bench Press" required maxlength="100">
                </div>

                <div class="sets-container">
                    <!-- Sets will be added here -->
                </div>

                <button type="button" class="btn btn-sm btn-outline-primary add-set-btn" data-exercise-id="${exerciseCount}">
                    <i class="bi bi-plus"></i> Add Set
                </button>
            </div>
        </div>
    `;

    document.getElementById('exercisesContainer').insertAdjacentHTML('beforeend', exerciseHtml);

    // Add event listeners
    const exerciseCard = document.querySelector(`[data-exercise-id="${exerciseCount}"]`);
    exerciseCard.querySelector('.remove-exercise-btn').addEventListener('click', () => removeExercise(exerciseCount));
    exerciseCard.querySelector('.add-set-btn').addEventListener('click', (e) => {
        const card = e.target.closest('.exercise-card');
        const setsContainer = card.querySelector('.sets-container');
        addSet(setsContainer);
    });

    // Add first set
    const setsContainer = exerciseCard.querySelector('.sets-container');
    addSet(setsContainer);
}

function removeExercise(exerciseId) {
    const exercises = document.querySelectorAll('.exercise-card');
    if (exercises.length <= 1) {
        showError('You must have at least one exercise');
        return;
    }
    
    const exerciseCard = document.querySelector(`.exercise-card[data-exercise-id="${exerciseId}"]`);
    if (exerciseCard) {
        exerciseCard.remove();
    }
}

function addSet(setsContainer) {
    const setNumber = setsContainer.children.length + 1;
    
    const setHtml = `
        <div class="set-row row g-2 mb-2 align-items-end">
            <div class="col-2">
                <label class="form-label small mb-1">Set</label>
                <input type="number" class="form-control form-control-sm set-number" value="${setNumber}" readonly>
            </div>
            <div class="col-3">
                <label class="form-label small mb-1">Reps <span class="text-danger">*</span></label>
                <input type="number" class="form-control form-control-sm set-reps" min="0" required placeholder="0">
            </div>
            <div class="col-3">
                <label class="form-label small mb-1">Weight (lbs) <span class="text-danger">*</span></label>
                <input type="number" class="form-control form-control-sm set-weight" min="0" step="0.1" required placeholder="0">
            </div>
            <div class="col-2">
                <label class="form-label small mb-1">RPE</label>
                <input type="number" class="form-control form-control-sm set-rpe" min="1" max="10" placeholder="1-10">
            </div>
            <div class="col-2">
                <button type="button" class="btn btn-sm btn-outline-danger w-100 remove-set-btn">
                    <i class="bi bi-x"></i>
                </button>
            </div>
        </div>
    `;
    
    setsContainer.insertAdjacentHTML('beforeend', setHtml);
    
    // Add remove set listener
    const setRow = setsContainer.lastElementChild;
    setRow.querySelector('.remove-set-btn').addEventListener('click', () => {
        if (setsContainer.children.length <= 1) {
            showError('Each exercise must have at least one set');
            return;
        }
        setRow.remove();
        renumberSets(setsContainer);
    });
}

function renumberSets(exerciseId) {
    const setsContainer = document.querySelector(`.sets-container[data-exercise-id="${exerciseId}"]`);
    const setRows = setsContainer.querySelectorAll('.set-row');
    setRows.forEach((row, index) => {
        row.querySelector('.set-number').value = index + 1;
    });
}

async function handleSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    if (!form.checkValidity()) {
        e.stopPropagation();
        form.classList.add('was-validated');
        return;
    }
    
    const token = localStorage.getItem('token');
    const saveBtn = document.getElementById('saveWorkoutBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';
    
    try {
        // Collect form data
        const workoutData = {
            workoutName: document.getElementById('workoutName').value.trim(),
            date: document.getElementById('workoutDate').value,
            duration: parseInt(document.getElementById('duration').value) || undefined,
            notes: document.getElementById('notes').value.trim() || undefined,
            exercises: []
        };
        
        // Collect exercises
        const exerciseCards = document.querySelectorAll('.exercise-card');
        exerciseCards.forEach(card => {
            const exerciseName = card.querySelector('.exercise-name').value.trim();
            if (!exerciseName) return;

            const setsContainer = card.querySelector('.sets-container');
            const setRows = setsContainer.querySelectorAll('.set-row');
            
            const sets = [];
            setRows.forEach(row => {
                const reps = parseInt(row.querySelector('.set-reps').value);
                const weight = parseFloat(row.querySelector('.set-weight').value);
                const rpe = parseInt(row.querySelector('.set-rpe').value) || undefined;
                const setNumber = parseInt(row.querySelector('.set-number').value);
                
                if (!isNaN(reps) && !isNaN(weight)) {
                    sets.push({
                        setNumber,
                        reps,
                        weight,
                        rpe,
                        completed: true
                    });
                }
            });
            
            if (sets.length > 0) {
                workoutData.exercises.push({
                    exerciseName,
                    sets
                });
            }
        });
        
        if (workoutData.exercises.length === 0) {
            showError('Please add at least one exercise with sets');
            return;
        }
        
        // Submit to API
        const response = await fetch(`${window.API_BASE}/api/v1/workouts/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(workoutData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to log workout');
        }
        
        showSuccess();
        
        // Reset form or redirect
        setTimeout(() => {
            window.location.href = 'dashboard.html';
        }, 1500);
        
    } catch (error) {
        console.error('Error logging workout:', error);
        showError(error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Save Workout';
    }
}

function showSuccess() {
    const toast = new bootstrap.Toast(document.getElementById('successToast'));
    toast.show();
}

function showError(message) {
    const errorToast = document.getElementById('errorToast');
    document.getElementById('errorToastMessage').textContent = message;
    const toast = new bootstrap.Toast(errorToast);
    toast.show();
}
