document.addEventListener('DOMContentLoaded', async () => {
    const container = document.getElementById('marketplace-container');
    const searchInput = document.getElementById('search-input');
    const token = localStorage.getItem('token');

    const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const API_BASE_URL = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

    let allPrograms = [];
    let ownedIds = [];

    try {
        // 1. Fetch marketplace programs
        const res = await fetch(`${API_BASE_URL}/api/programs/marketplace`);
        allPrograms = await res.json();

        // 2. If logged in, fetch user's assigned programs to check ownership
        if (token) {
            const userRes = await fetch(`${API_BASE_URL}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (userRes.ok) {
                const user = await userRes.json();
                // Check user.assignedPrograms if it's an array of IDs or objects
                // In our API /me returns profile, we might need a better check
                // Let's use the /my endpoint instead for accuracy
                const myRes = await fetch(`${API_BASE_URL}/api/programs/my`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (myRes.ok) {
                    const myPrograms = await myRes.json();
                    ownedIds = myPrograms.map(p => p._id);
                }
            }
        }

        // 3. Initial render
        renderPrograms(allPrograms);

        // 4. Set up search with debounce
        const debouncedSearch = debounce((query) => {
            const filteredPrograms = filterPrograms(allPrograms, query);
            renderPrograms(filteredPrograms);
        }, 300);

        searchInput.addEventListener('input', (e) => {
            debouncedSearch(e.target.value);
        });

    } catch (err) {
        console.error('Error loading marketplace:', err);
        container.innerHTML = '<div class="col-12 text-center text-danger"><p>Error loading programs. Please try again later.</p></div>';
    }

    function renderPrograms(programs) {
        if (programs.length === 0) {
            container.innerHTML = '<div class="col-12 text-center"><p class="lead">No programs match your search.</p></div>';
            return;
        }

        container.innerHTML = '';
        programs.forEach(program => {
            const isOwned = ownedIds.includes(program._id);
            const card = createProgramCard(program, isOwned);
            container.appendChild(card);
        });
    }

    function filterPrograms(programs, query) {
        if (!query.trim()) return programs;

        const lowerQuery = query.toLowerCase();
        const isTagSearch = lowerQuery.startsWith('#');

        return programs.filter(program => {
            if (isTagSearch) {
                const tag = lowerQuery.slice(1); // Remove #
                return program.features.some(feature =>
                    feature.toLowerCase().includes(tag)
                );
            } else {
                // Search in title, description, and features
                return program.title.toLowerCase().includes(lowerQuery) ||
                       program.description.toLowerCase().includes(lowerQuery) ||
                       program.features.some(feature =>
                           feature.toLowerCase().includes(lowerQuery)
                       );
            }
        });
    }

    function debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }
});

function createProgramCard(program, isOwned) {
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
                <p class="text-muted small mb-4">${program.preview}</p>
                <div class="mt-auto d-flex justify-content-between align-items-center">
                    <span class="h5 fw-bold mb-0 text-primary">$${program.price}</span>
                    ${isOwned 
                        ? `<a href="program-details.html?id=${program._id}" class="btn btn-success btn-sm px-4 rounded-pill">View Program</a>`
                        : `<a href="program-details.html?id=${program._id}&preview=true" class="btn btn-outline-primary btn-sm px-4 rounded-pill">Preview Details</a>`
                    }
                </div>
            </div>
        </div>
    `;
    return col;
}