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
                    <a href="program-details.html?id=${program._id}" class="btn btn-primary w-100 rounded-pill">Open Workout Plan</a>
                </div>
            </div>
        </div>
    `;
    return col;
}