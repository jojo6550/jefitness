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

        // Add event listeners to the "Open Workout Plan" buttons
        document.querySelectorAll('.view-program-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const programId = btn.dataset.programId;
                try {
                    const res = await fetch(`${API_BASE_URL}/api/programs/${programId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });

                    if (res.ok) {
                        const program = await res.json();
                        window.location.href = `programs/${program.slug}.html`;
                    } else {
                        alert('Failed to load program details. Please try again.');
                    }
                } catch (err) {
                    console.error('Error loading program:', err);
                    alert('Error loading program. Please try again.');
                }
            });
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
        // First, fetch program details to get the slug
        const res = await fetch(`${API_BASE_URL}/api/programs/${programId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!res.ok) throw new Error('Failed to fetch program details');

        const program = await res.json();

        // Now fetch the corresponding HTML file using the slug
        const htmlRes = await fetch(`../../pages/programs/${program.slug}.html`);

        if (!htmlRes.ok) throw new Error('Failed to fetch program HTML');

        const htmlContent = await htmlRes.text();

        // Extract the main content from the HTML (remove head, scripts, etc.)
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        const mainContent = doc.querySelector('main') ? doc.querySelector('main').innerHTML : htmlContent;

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
                            ${mainContent}
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
