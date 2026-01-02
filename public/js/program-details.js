document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const programId = urlParams.get('id');
    const isPreview = urlParams.get('preview') === 'true';
    const token = localStorage.getItem('token');
    
    if (!programId) {
        window.location.href = 'marketplace.html';
        return;
    }

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_BASE_URL = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

    try {
        let endpoint = `${API_BASE_URL}/api/programs/${programId}`;
        let headers = {};

        if (isPreview || !token) {
            endpoint = `${API_BASE_URL}/api/programs/marketplace/${programId}`;
        } else {
            headers = { 'Authorization': `Bearer ${token}` };
        }

        const res = await fetch(endpoint, { headers });
        
        if (res.status === 403) {
            // User logged in but doesn't own it, fallback to marketplace preview
            window.location.href = `program-details.html?id=${programId}&preview=true`;
            return;
        }

        if (!res.ok) throw new Error('Failed to fetch program');

        const program = await res.json();
        renderProgramDetails(program, !isPreview && token);

    } catch (err) {
        console.error('Error loading program details:', err);
        document.getElementById('workout-content').innerHTML = `
            <div class="alert alert-danger">
                <h4>Error Loading Program</h4>
                <p>We couldn't load the details for this program. It might be unavailable or you might not have access.</p>
                <a href="marketplace.html" class="btn btn-outline-danger">Back to Marketplace</a>
            </div>
        `;
    }
});

function renderProgramDetails(program, hasFullAccess) {
    const header = document.getElementById('program-header');
    const content = document.getElementById('workout-content');
    const sidebar = document.getElementById('program-meta-sidebar');

    const badgeColor = program.level === 'Beginner' ? 'success' : (program.level === 'Intermediate' ? 'warning' : 'danger');

    // Render Header
    header.innerHTML = `
        <nav aria-label="breadcrumb" class="mb-3">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="${hasFullAccess ? 'my-programs.html' : 'marketplace.html'}">${hasFullAccess ? 'My Programs' : 'Marketplace'}</a></li>
                <li class="breadcrumb-item active" aria-current="page">${program.title}</li>
            </ol>
        </nav>
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
            <div>
                <span class="badge bg-${badgeColor} mb-2">${program.level}</span>
                <h1 class="display-5 fw-bold mb-0">${program.title}</h1>
            </div>
            ${!hasFullAccess ? `<div class="text-md-end"><span class="h2 fw-bold text-primary">$${program.price}</span></div>` : ''}
        </div>
    `;

    // Render Sidebar
    sidebar.innerHTML = `
        <div class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body p-4">
                <h5 class="fw-bold mb-3">Program Details</h5>
                <ul class="list-unstyled mb-0">
                    <li class="mb-3 d-flex align-items-center">
                        <i class="bi bi-clock text-primary me-3 fs-4"></i>
                        <div>
                            <div class="text-muted small">Duration</div>
                            <div class="fw-bold">${program.duration}</div>
                        </div>
                    </li>
                    <li class="mb-3 d-flex align-items-center">
                        <i class="bi bi-bar-chart text-primary me-3 fs-4"></i>
                        <div>
                            <div class="text-muted small">Level</div>
                            <div class="fw-bold">${program.level}</div>
                        </div>
                    </li>
                    <li class="d-flex align-items-center">
                        <i class="bi bi-calendar-event text-primary me-3 fs-4"></i>
                        <div>
                            <div class="text-muted small">Access Status</div>
                            <div class="fw-bold text-${hasFullAccess ? 'success' : 'primary'}">
                                ${hasFullAccess ? '<i class="bi bi-check-circle-fill me-1"></i> Full Access' : 'Marketplace Preview'}
                            </div>
                        </div>
                    </li>
                </ul>
                ${!hasFullAccess ? `
                    <hr class="my-4">
                    <button class="btn btn-primary w-100 rounded-pill py-2 fw-bold">Request Full Access</button>
                    <p class="text-center text-muted small mt-2 mb-0">Coming Soon: Direct Purchase</p>
                ` : ''}
            </div>
        </div>
    `;

    // Render Main Content
    if (hasFullAccess) {
        content.innerHTML = `
            <div class="mb-5">
                <h4 class="fw-bold mb-3">About the Program</h4>
                <p class="text-muted">${program.description}</p>
            </div>
            <h4 class="fw-bold mb-4">Your Weekly Routine</h4>
            <div class="accordion" id="workoutAccordion">
                ${program.days.map((day, index) => `
                    <div class="accordion-item border-0 shadow-sm rounded-4 mb-3 overflow-hidden">
                        <h2 class="accordion-header">
                            <button class="accordion-button ${index === 0 ? '' : 'collapsed'} fw-bold py-4" type="button" data-bs-toggle="collapse" data-bs-target="#day${index}">
                                ${day.dayName}
                            </button>
                        </h2>
                        <div id="day${index}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" data-bs-parent="#workoutAccordion">
                            <div class="accordion-body p-0">
                                <div class="table-responsive">
                                    <table class="table table-hover mb-0 align-middle">
                                        <thead class="table-light">
                                            <tr>
                                                <th class="ps-4 py-3">Exercise</th>
                                                <th class="py-3">Sets</th>
                                                <th class="py-3">Reps</th>
                                                <th class="py-3">Notes</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${day.exercises.map(ex => `
                                                <tr>
                                                    <td class="ps-4 py-3">
                                                        <div class="fw-bold text-primary">${ex.name}</div>
                                                    </td>
                                                    <td class="py-3">${ex.sets}</td>
                                                    <td class="py-3">${ex.reps}</td>
                                                    <td class="py-3 text-muted small pe-4">${ex.notes || '-'}</td>
                                                </tr>
                                            `).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        // Preview Mode
        content.innerHTML = `
            <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
                <h4 class="fw-bold mb-3">Overview</h4>
                <p class="text-muted mb-0">${program.preview}</p>
            </div>
            <div class="card border-0 shadow-sm rounded-4 p-4">
                <h4 class="fw-bold mb-4">Structure Preview</h4>
                <div class="row g-3">
                    ${program.days.map(day => `
                        <div class="col-sm-6">
                            <div class="d-flex align-items-center p-3 bg-light rounded-3">
                                <i class="bi bi-check2-circle text-success me-3 fs-5"></i>
                                <span class="fw-semibold">${day.dayName}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="mt-5 text-center p-4 bg-primary bg-opacity-10 rounded-4">
                    <i class="bi bi-lock-fill display-5 text-primary mb-3"></i>
                    <h5 class="fw-bold">Exercises are Locked</h5>
                    <p class="text-muted mb-0">Get full access to view detailed exercises, sets, and reps for each day.</p>
                </div>
            </div>
        `;
    }
}