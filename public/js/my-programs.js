// My Programs JavaScript
window.API_BASE = window.ApiConfig.getAPI_BASE();

let myPrograms = [];
let currentProgram = null;
let programModal = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../index.html';
        return;
    }

    // Initialize modal
    programModal = new bootstrap.Modal(document.getElementById('programDetailsModal'));

    // Check for success message from checkout
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    if (sessionId) {
        showSuccessMessage('Program purchased successfully! It has been added to your library.');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Load programs
    loadMyPrograms();
});

// Load user's purchased programs
async function loadMyPrograms() {
    try {
        showLoading();

        const response = await fetch(`${window.API_BASE}/api/v1/programs/user/my-programs`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load programs');
        }

        const data = await response.json();
        myPrograms = data.programs || [];

        if (myPrograms.length === 0) {
            showEmpty();
        } else {
            updateStats();
            renderPrograms();
        }
    } catch (error) {
        console.error('Error loading programs:', error);
        showError('Failed to load your programs. Please try again.');
    }
}

// Update stats
function updateStats() {
    document.getElementById('totalProgramsCount').textContent = myPrograms.length;

    if (myPrograms.length > 0) {
        const mostRecent = myPrograms.reduce((latest, program) => {
            return new Date(program.purchasedAt) > new Date(latest.purchasedAt) ? program : latest;
        });
        
        const date = new Date(mostRecent.purchasedAt);
        document.getElementById('recentPurchaseDate').textContent = formatDate(date);
    } else {
        document.getElementById('recentPurchaseDate').textContent = '-';
    }
}

// Render programs grid
function renderPrograms() {
    const grid = document.getElementById('programsGrid');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');

    loadingState.classList.add('d-none');
    emptyState.classList.add('d-none');
    emptyState.classList.remove('d-flex');

    grid.innerHTML = myPrograms.map(program => `
        <div class="col-md-6 col-lg-4">
            <div class="card program-card" onclick="showProgramDetails('${program._id}')">
                <div class="position-relative">
                    <span class="badge purchased-badge bg-success">
                        <i class="bi bi-check-circle-fill"></i> Purchased
                    </span>
                    <div class="program-image card-img-top ${!program.imageUrl ? 'd-flex align-items-center justify-content-center' : ''}" 
                         ${program.imageUrl ? `style="background-image: url(${program.imageUrl}); background-size: cover; background-position: center;"` : ''}>
                        ${!program.imageUrl ? '<i class="bi bi-book display-1 text-white"></i>' : ''}
                    </div>
                </div>
                <div class="card-body">
                    <h5 class="card-title">${escapeHtml(program.title)}</h5>
                    <p class="text-muted mb-2">
                        <i class="bi bi-person"></i> ${escapeHtml(program.author)}
                    </p>
                    <p class="card-text text-truncate" style="max-height: 3em;">
                        ${escapeHtml(program.goals)}
                    </p>
                    ${program.tags && program.tags.length > 0 ? `
                        <div class="mb-3">
                            ${program.tags.slice(0, 3).map(tag => `
                                <span class="badge badge-tag bg-light text-dark border">${escapeHtml(tag)}</span>
                            `).join('')}
                            ${program.tags.length > 3 ? `<span class="badge badge-tag bg-light text-dark border">+${program.tags.length - 3}</span>` : ''}
                        </div>
                    ` : ''}
                    <div class="d-flex justify-content-between align-items-center">
                        <small class="text-muted">
                            <i class="bi bi-calendar"></i> ${formatDate(new Date(program.purchasedAt))}
                        </small>
                        <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); showProgramDetails('${program._id}')">
                            <i class="bi bi-eye"></i> View
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Show program details modal
function showProgramDetails(programId) {
    try {
        currentProgram = myPrograms.find(p => p._id === programId);
        
        if (!currentProgram) {
            throw new Error('Program not found');
        }

        // Populate modal
        document.getElementById('modalProgramTitle').textContent = currentProgram.title;
        document.getElementById('modalProgramAuthor').textContent = currentProgram.author;
        document.getElementById('modalProgramGoals').textContent = currentProgram.goals;
        document.getElementById('modalProgramDescription').textContent = currentProgram.description || 'No description available';
        document.getElementById('modalPurchaseDate').textContent = `Purchased on ${formatDate(new Date(currentProgram.purchasedAt))}`;
        
        // Features
        const featuresContainer = document.getElementById('modalProgramFeatures');
        if (currentProgram.features && currentProgram.features.length > 0) {
            featuresContainer.innerHTML = currentProgram.features.map(feature => 
                `<li><i class="bi bi-check-circle-fill text-success me-2"></i>${escapeHtml(feature)}</li>`
            ).join('');
        } else {
            featuresContainer.innerHTML = '<li class="text-muted">No features listed</li>';
        }
        
        // Difficulty and duration
        document.getElementById('modalProgramDifficulty').textContent = currentProgram.difficulty || 'Not specified';
        document.getElementById('modalProgramDuration').textContent = currentProgram.duration || 'Not specified';
        
        // Tags
        const tagsContainer = document.getElementById('modalProgramTags');
        if (currentProgram.tags && currentProgram.tags.length > 0) {
            tagsContainer.innerHTML = currentProgram.tags.map(tag => 
                `<span class="badge bg-light text-dark border">${escapeHtml(tag)}</span>`
            ).join('');
        } else {
            tagsContainer.innerHTML = '';
        }

        // View program button
        document.getElementById('viewProgramBtn').href = `#program-content-${currentProgram._id}`;

        programModal.show();
    } catch (error) {
        console.error('Error showing program details:', error);
        showError('Failed to load program details');
    }
}

// Show success message
function showSuccessMessage(message) {
    const successAlert = document.getElementById('successAlert');
    const successMessage = document.getElementById('successMessage');
    
    successMessage.textContent = message;
    successAlert.classList.remove('d-none');
    successAlert.classList.add('show');

    // Auto-hide after 5 seconds
    setTimeout(() => {
        successAlert.classList.remove('show');
        setTimeout(() => {
            successAlert.classList.add('d-none');
        }, 150);
    }, 5000);
}

// Utility functions
function showLoading() {
    document.getElementById('loadingState').classList.remove('d-none');
    document.getElementById('loadingState').classList.add('d-flex');
    document.getElementById('emptyState').classList.add('d-none');
    document.getElementById('programsGrid').innerHTML = '';
}

function showEmpty() {
    document.getElementById('loadingState').classList.add('d-none');
    document.getElementById('emptyState').classList.remove('d-none');
    document.getElementById('emptyState').classList.add('d-flex');
    document.getElementById('programsGrid').innerHTML = '';
}

function showError(message) {
    alert(message);
}

function formatDate(date) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}