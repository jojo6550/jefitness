document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('my-programs-container');
    const token = localStorage.getItem('token');
    
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_BASE_URL = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

    try {
        const res = await fetch(`${API_BASE_URL}/api/programs/my`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.status === 401) {
            window.location.href = 'login.html';
            return;
        }

        const programs = await res.json();

        if (programs.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center py-5">
                    <div class="card p-5 border-0 shadow-sm rounded-4">
                        <i class="bi bi-lightning-charge display-1 text-muted mb-4"></i>
                        <h3>No programs assigned yet</h3>
                        <p class="text-muted">Browse the marketplace to find the right training plan for you.</p>
                        <div class="mt-4">
                            <a href="marketplace.html" class="btn btn-primary px-5 rounded-pill">Explore Marketplace</a>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        programs.forEach(program => {
            const card = createProgramCard(program);
            container.appendChild(card);
        });

    } catch (err) {
        console.error('Error loading my programs:', err);
        container.innerHTML = '<div class="col-12 text-center text-danger"><p>Error loading your programs. Please try again later.</p></div>';
    }
});

function createProgramCard(program) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';
    
    const badgeColor = program.level === 'Beginner' ? 'success' : (program.level === 'Intermediate' ? 'warning' : 'danger');
    
    col.innerHTML = `
        <div class="card h-100 border-0 shadow-sm overflow-hidden program-card">
            <div class="card-body p-4">
                <div class="d-flex justify-content-between align-items-start mb-3">
                    <span class="badge bg-${badgeColor}-subtle text-${badgeColor} rounded-pill px-3">${program.level}</span>
                    <span class="text-muted small"><i class="bi bi-calendar3 me-1"></i> ${program.duration}</span>
                </div>
                <h3 class="h4 fw-bold mb-2">${program.title}</h3>
                <p class="text-muted small mb-4">${program.description.substring(0, 100)}...</p>
                <div class="mt-auto">
                    <button class="btn btn-primary w-100 rounded-pill view-program-btn" data-program-id="${program._id}">Open Workout Plan</button>
                </div>
            </div>
        </div>
    `;
    return col;
}

async function showProgramModal(programId) {
    try {
        const res = await fetch(`${API_BASE_URL}/api/programs/${programId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!res.ok) throw new Error('Failed to fetch program details');

        const program = await res.json();

        // Create modal HTML
        const modalHtml = `
            <div class="modal fade" id="programModal" tabindex="-1" aria-labelledby="programModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-xl">
                    <div class="modal-content">
                        <div class="modal-header bg-primary text-white">
                            <h5 class="modal-title" id="programModalLabel">
                                <i class="bi bi-journal-text me-2"></i>${program.title}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                            <div class="row">
                                <div class="col-md-4">
                                    <div class="card border-0 bg-light mb-3">
                                        <div class="card-body">
                                            <h6 class="fw-bold text-primary mb-3">Program Info</h6>
                                            <ul class="list-unstyled small">
                                                <li class="mb-2"><i class="bi bi-bar-chart text-${program.level === 'Beginner' ? 'success' : program.level === 'Intermediate' ? 'warning' : 'danger'} me-2"></i><strong>Level:</strong> ${program.level}</li>
                                                <li class="mb-2"><i class="bi bi-calendar-check text-success me-2"></i><strong>Duration:</strong> ${program.duration}</li>
                                                <li class="mb-2"><i class="bi bi-clock text-info me-2"></i><strong>Frequency:</strong> ${program.frequency}</li>
                                                <li class="mb-2"><i class="bi bi-stopwatch text-warning me-2"></i><strong>Session:</strong> ${program.sessionLength}</li>
                                            </ul>
                                            ${program.features && program.features.length > 0 ? `
                                                <h6 class="fw-bold text-primary mb-2 mt-3">Features</h6>
                                                <div class="d-flex flex-wrap gap-1">
                                                    ${program.features.map(feature => `<span class="badge bg-secondary">${feature}</span>`).join('')}
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-8">
                                    <div class="mb-4">
                                        <h6 class="fw-bold text-primary mb-3">Description</h6>
                                        <p class="text-muted">${program.description}</p>
                                    </div>

                                    <h6 class="fw-bold text-primary mb-3">Weekly Workout Plan</h6>
                                    <div class="accordion" id="workoutAccordion">
                                        ${program.days.map((day, index) => `
                                            <div class="accordion-item border-0 shadow-sm rounded-4 mb-2 overflow-hidden">
                                                <h2 class="accordion-header">
                                                    <button class="accordion-button ${index === 0 ? '' : 'collapsed'} fw-bold py-3 px-4" type="button" data-bs-toggle="collapse" data-bs-target="#day${index}">
                                                        <div class="d-flex align-items-center w-100">
                                                            <i class="bi bi-calendar-day text-primary me-3 fs-5"></i>
                                                            <span>${day.dayName}</span>
                                                            <span class="badge bg-primary ms-auto">${day.exercises ? day.exercises.length : 0} exercises</span>
                                                        </div>
                                                    </button>
                                                </h2>
                                                <div id="day${index}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" data-bs-parent="#workoutAccordion">
                                                    <div class="accordion-body p-0">
                                                        ${day.exercises && day.exercises.length > 0 ? `
                                                            <div class="table-responsive">
                                                                <table class="table table-hover mb-0 align-middle">
                                                                    <thead class="table-light">
                                                                        <tr>
                                                                            <th class="ps-4 py-2">#</th>
                                                                            <th class="py-2">Exercise</th>
                                                                            <th class="py-2 text-center">Sets</th>
                                                                            <th class="py-2 text-center">Reps</th>
                                                                            <th class="py-2">Notes</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        ${day.exercises.map((ex, exIndex) => `
                                                                            <tr>
                                                                                <td class="ps-4 py-2">
                                                                                    <span class="badge bg-secondary">${exIndex + 1}</span>
                                                                                </td>
                                                                                <td class="py-2">
                                                                                    <div class="fw-bold text-primary">${ex.name}</div>
                                                                                </td>
                                                                                <td class="py-2 text-center">
                                                                                    <span class="badge bg-info">${ex.sets}</span>
                                                                                </td>
                                                                                <td class="py-2 text-center">
                                                                                    <span class="badge bg-warning text-dark">${ex.reps}</span>
                                                                                </td>
                                                                                <td class="py-2 text-muted small pe-4">
                                                                                    ${ex.notes || '<em>No additional notes</em>'}
                                                                                </td>
                                                                            </tr>
                                                                        `).join('')}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            <div class="p-3 bg-light border-top">
                                                                <div class="row text-center">
                                                                    <div class="col-4">
                                                                        <div class="fw-bold text-primary h6 mb-0">${day.exercises.length}</div>
                                                                        <small class="text-muted">Exercises</small>
                                                                    </div>
                                                                    <div class="col-4">
                                                                        <div class="fw-bold text-info h6 mb-0">${day.exercises.reduce((sum, ex) => sum + ex.sets, 0)}</div>
                                                                        <small class="text-muted">Total Sets</small>
                                                                    </div>
                                                                    <div class="col-4">
                                                                        <div class="fw-bold text-success h6 mb-0">~${Math.round(day.exercises.reduce((sum, ex) => sum + ex.sets, 0) * 2)} min</div>
                                                                        <small class="text-muted">Est. Time</small>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ` : `
                                                            <div class="p-4 text-center text-muted">
                                                                <i class="bi bi-calendar-x display-4 mb-3"></i>
                                                                <p>No exercises scheduled for this day.</p>
                                                                <small>Rest day or flexible training day.</small>
                                                            </div>
                                                        `}
                                                    </div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">
                                <i class="bi bi-x-circle me-1"></i>Close
                            </button>
                            <a href="program-details.html?id=${programId}" class="btn btn-primary">
                                <i class="bi bi-arrow-right-circle me-1"></i>Open Full Details
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existingModal = document.getElementById('programModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('programModal'));
        modal.show();

        // Clean up modal when hidden
        document.getElementById('programModal').addEventListener('hidden.bs.modal', () => {
            document.getElementById('programModal').remove();
        });

    } catch (err) {
        console.error('Error loading program details:', err);
        alert('Failed to load program details. Please try again.');
    }
}
