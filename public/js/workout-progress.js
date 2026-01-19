window.API_BASE = window.ApiConfig.getAPI_BASE();

let maxWeightChart = null;
let volumeChart = null;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../index.html';
        return;
    }

    await loadExercises();
    await loadWorkoutHistory();

    document.getElementById('viewProgressBtn').addEventListener('click', viewProgress);
});

async function loadExercises() {
    const token = localStorage.getItem('token');
    const select = document.getElementById('exerciseSelect');

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/workouts?limit=100`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch workouts');

        const data = await response.json();
        const workouts = data.workouts || [];

        // Extract unique exercises
        const exerciseSet = new Set();
        workouts.forEach(workout => {
            workout.exercises.forEach(ex => {
                exerciseSet.add(ex.exerciseName);
            });
        });

        const exercises = Array.from(exerciseSet).sort();

        if (exercises.length === 0) {
            select.innerHTML = '<option value="">No exercises found</option>';
            return;
        }

        select.innerHTML = '<option value="">Select an exercise...</option>';
        exercises.forEach(exercise => {
            const option = document.createElement('option');
            option.value = exercise;
            option.textContent = exercise;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading exercises:', error);
        select.innerHTML = '<option value="">Error loading exercises</option>';
    }
}

async function loadWorkoutHistory() {
    const token = localStorage.getItem('token');
    const container = document.getElementById('workoutHistory');

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/workouts?limit=10`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch workouts');

        const data = await response.json();
        const workouts = data.workouts || [];

        if (workouts.length === 0) {
            container.innerHTML = '<p class="text-muted small">No workouts logged yet</p>';
            return;
        }

        let html = '<div class="list-group list-group-flush">';
        workouts.forEach(workout => {
            const date = new Date(workout.date).toLocaleDateString();
            html += `
                <div class="list-group-item list-group-item-action px-0">
                    <div class="d-flex w-100 justify-content-between">
                        <h6 class="mb-1 small">${workout.workoutName}</h6>
                        <small class="text-muted">${date}</small>
                    </div>
                    <small class="text-muted">${workout.exercises.length} exercises</small>
                </div>
            `;
        });
        html += '</div>';

        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading workout history:', error);
        container.innerHTML = '<p class="text-muted small">Error loading history</p>';
    }
}

async function viewProgress() {
    const exerciseName = document.getElementById('exerciseSelect').value;
    if (!exerciseName) {
        alert('Please select an exercise');
        return;
    }

    const token = localStorage.getItem('token');
    const btn = document.getElementById('viewProgressBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Loading...';

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/workouts/progress/${encodeURIComponent(exerciseName)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to fetch progress data');

        const result = await response.json();
        const data = result.data;

        if (data.sessions.length === 0) {
            alert('No data found for this exercise');
            return;
        }

        displayProgressData(exerciseName, data);

    } catch (error) {
        console.error('Error fetching progress:', error);
        alert('Failed to load progress data');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-graph-up me-1"></i>View Progress';
    }
}

function displayProgressData(exerciseName, data) {
    // Show progress content, hide empty state
    document.getElementById('progressContent').classList.remove('d-none');
    document.getElementById('emptyState').classList.add('d-none');

    // Update title and stats
    document.getElementById('exerciseTitle').innerHTML = `<i class="bi bi-bar-chart-line me-2"></i>${exerciseName}`;
    document.getElementById('statMaxWeight').textContent = `${data.maxWeight} lbs`;
    document.getElementById('statAvgVolume').textContent = `${data.averageVolume} lbs`;
    document.getElementById('statFrequency').textContent = `${data.frequency}x`;

    // Prepare chart data (reverse to show chronological order)
    const sessions = [...data.sessions].reverse();
    const labels = sessions.map(s => new Date(s.date).toLocaleDateString());
    const maxWeights = sessions.map(s => s.maxWeight);
    const volumes = sessions.map(s => s.totalVolume);

    // Create/update Max Weight Chart
    const maxWeightCtx = document.getElementById('maxWeightChart').getContext('2d');
    if (maxWeightChart) {
        maxWeightChart.destroy();
    }
    maxWeightChart = new Chart(maxWeightCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Max Weight (lbs)',
                data: maxWeights,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + ' lbs';
                        }
                    }
                }
            }
        }
    });

    // Create/update Volume Chart
    const volumeCtx = document.getElementById('volumeChart').getContext('2d');
    if (volumeChart) {
        volumeChart.destroy();
    }
    volumeChart = new Chart(volumeCtx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Volume (lbs)',
                data: volumes,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return value + ' lbs';
                        }
                    }
                }
            }
        }
    });
}
