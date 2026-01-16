/**
 * Program Marketplace
 * Browse and purchase programs
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Load and display available programs
 */
async function loadPrograms() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${window.API_BASE}/api/v1/programs`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (!response.ok) {
            throw new Error('Failed to load programs');
        }

        const data = await response.json();
        renderPrograms(data.data || []);
    } catch (err) {
        logger.error('Failed to load programs', { error: err?.message });
        showError('Failed to load programs. Please try again.');
    }
}

/**
 * Render programs grid
 */
function renderPrograms(programs) {
    const container = document.getElementById('programsGrid');
    if (!container) return;

    if (programs.length === 0) {
        container.innerHTML = '<p class="text-center text-muted">No programs available.</p>';
        return;
    }

    container.innerHTML = programs.map(program => `
        <div class="col-md-4 mb-4">
            <div class="card h-100">
                <img src="${program.imageUrl || '/images/hero.jpg'}" class="card-img-top" alt="${program.name}">
                <div class="card-body">
                    <h5 class="card-title">${program.name}</h5>
                    <p class="card-text">${program.description?.substring(0, 100)}...</p>
                    <div class="d-flex justify-content-between align-items-center">
                        <span class="h5 text-primary">$${(program.price / 100).toFixed(2)}</span>
                        <button class="btn btn-primary" onclick="previewProgram('${program._id}')">
                            Preview
                        </button>
                    </div>
                <div class="card-footer">
                    <button class="btn btn-outline-primary w-100" onclick="purchaseProgram('${program._id}')">
                        <i class="bi bi-cart-plus"></i> Purchase
                    </button>
                </div>
        </div>
    `).join('');
}

/**
 * Preview program details
 */
async function previewProgram(programId) {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${window.API_BASE}/api/v1/programs/${programId}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (!response.ok) {
            throw new Error('Failed to load program details');
        }

        const program = await response.json();
        
        // Show in modal
        const modal = document.getElementById('programPreviewModal');
        const content = document.getElementById('programPreviewContent');
        
        if (modal && content) {
            content.innerHTML = `
                <h4>${program.name}</h4>
                <p>${program.description}</p>
                <h5>What's Included:</h5>
                <ul>
                    ${(program.workouts || []).map(w => `<li>${w.name} - ${w.duration} minutes</li>`).join('')}
                </ul>
                <h4 class="text-primary">$${(program.price / 100).toFixed(2)}</h4>
            `;
            new bootstrap.Modal(modal).show();
        }
    } catch (err) {
        logger.error('Failed to show program preview', { error: err?.message });
        showError('Failed to load program details');
    }
}

/**
 * Purchase program
 */
async function purchaseProgram(programId) {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'pages/login.html';
        return;
    }

    try {
        const response = await fetch(`${window.API_BASE}/api/v1/programs/${programId}/purchase`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || 'Failed to create checkout');
        }

        const data = await response.json();
        
        if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
        } else {
            showError('Failed to start checkout. Please try again.');
        }
    } catch (err) {
        logger.error('Failed to create checkout', { error: err?.message });
        showError(err.message || 'Failed to start checkout. Please try again.');
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

// Export globally
window.previewProgram = previewProgram;
window.purchaseProgram = purchaseProgram;

// Initialize
document.addEventListener('DOMContentLoaded', loadPrograms);
