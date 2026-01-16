/**
 * My Programs
 * Displays user's purchased programs
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Load user's programs
 */
async function loadMyPrograms() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    try {
        const response = await fetch(`${window.API_BASE}/api/users/programs`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load programs');
        }

        const data = await response.json();
        renderPrograms(data.programs || []);
    } catch (err) {
        logger.error('Failed to load programs', { error: err?.message });
        showError('Failed to load your programs. Please try again.');
    }
}

/**
 * Render programs list
 */
function renderPrograms(programs) {
    const container = document.getElementById('programsList');
    const emptyMessage = document.getElementById('emptyProgramsMessage');

    if (!programs || programs.length === 0) {
        if (container) container.innerHTML = '';
        if (emptyMessage) emptyMessage.style.display = 'block';
        return;
    }

    if (emptyMessage) emptyMessage.style.display = 'none';

    if (container) {
        container.innerHTML = programs.map(program => `
            <div class="program-card col-md-4 mb-4">
                <div class="card h-100">
                    <img src="${program.imageUrl || '/images/hero.jpg'}" class="card-img-top" alt="${program.name}">
                    <div class="card-body">
                        <h5 class="card-title">${program.name}</h5>
                        <p class="card-text">${program.description?.substring(0, 100)}...</p>
                        <a href="program.html?slug=${program.slug}" class="btn btn-primary">
                            <i class="bi bi-play-circle"></i> Start Program
                        </a>
                    </div>
                    <div class="card-footer text-muted">
                        <small>Purchased: ${new Date(program.purchasedAt).toLocaleDateString()}</small>
                    </div>
            </div>
        `).join('');
    }
}

/**
 * Show program details
 */
async function showProgramDetails(programId) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/programs/${programId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error('Failed to load program details');
        }

        const program = await response.json();
        
        // Show program details in modal
        const modal = document.getElementById('programDetailsModal');
        const content = document.getElementById('programDetailsContent');
        
        if (modal && content) {
            content.innerHTML = `
                <h4>${program.name}</h4>
                <p>${program.description}</p>
                <h5>Workouts</h5>
                <ul>
                    ${(program.workouts || []).map(w => `<li>${w.name} - ${w.duration} minutes</li>`).join('')}
                </ul>
            `;
            new bootstrap.Modal(modal).show();
        }
    } catch (err) {
        logger.error('Failed to show program details', { error: err?.message });
        showError('Failed to load program details');
    }
}

/**
 * Show error message
 */
function showError(message) {
    const container = document.getElementById('errorContainer');
    if (container) {
        container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
        setTimeout(() => container.innerHTML = '', 5000);
    }
}

// Export functions globally
window.showProgramDetails = showProgramDetails;

// Initialize on load
document.addEventListener('DOMContentLoaded', loadMyPrograms);
