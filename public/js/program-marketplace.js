// Program Marketplace JavaScript

window.API_BASE = window.ApiConfig.getAPI_BASE();

let allPrograms = [];
let filteredPrograms = [];
let selectedTags = new Set();
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
    programModal = new bootstrap.Modal(document.getElementById('programPreviewModal'));

    // Load programs
    loadPrograms();

    // Setup event listeners
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(handleSearch, 300));

    // Clear search
    document.getElementById('clearSearchBtn').addEventListener('click', () => {
        searchInput.value = '';
        handleSearch();
    });

    // Buy now button
    document.getElementById('buyNowBtn').addEventListener('click', handleBuyNow);
}

// Load all programs from API
async function loadPrograms() {
    try {
        showLoading();

        const response = await fetch(`${window.API_BASE}/programs`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load programs');
        }

        const data = await response.json();
        allPrograms = data.programs || [];
        filteredPrograms = [...allPrograms];

        if (allPrograms.length === 0) {
            showEmpty();
        } else {
            renderPrograms();
            renderTagFilters();
        }
    } catch (error) {
        console.error('Error loading programs:', error);
        showError('Failed to load programs. Please try again.');
    }
}

// Render programs grid
function renderPrograms() {
    const grid = document.getElementById('programsGrid');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');

    loadingState.classList.add('d-none');

    if (filteredPrograms.length === 0) {
        emptyState.classList.remove('d-none');
        emptyState.classList.add('d-flex');
        grid.innerHTML = '';
        return;
    }

    emptyState.classList.add('d-none');
    emptyState.classList.remove('d-flex');

    grid.innerHTML = filteredPrograms.map(program => `
        <div class="col-md-6 col-lg-4">
            <div class="card program-card" onclick="showProgramPreview('${program._id}')">
                <div class="position-relative">
                    ${program.difficulty ? `
                        <span class="badge difficulty-badge ${getDifficultyBadgeClass(program.difficulty)}">
                            ${program.difficulty}
                        </span>
                    ` : ''}
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
                        <span class="price-badge">${program.price ? program.price.formatted : 'N/A'}</span>
                        <button class="btn btn-primary" onclick="event.stopPropagation(); showProgramPreview('${program._id}')">
                            <i class="bi bi-eye"></i> Preview
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Render tag filters
function renderTagFilters() {
    const tagFilters = document.getElementById('tagFilters');
    const allTags = new Set();

    allPrograms.forEach(program => {
        if (program.tags) {
            program.tags.forEach(tag => allTags.add(tag));
        }
    });

    if (allTags.size === 0) {
        tagFilters.innerHTML = '<p class="text-muted mb-0">No tags available</p>';
        return;
    }

    tagFilters.innerHTML = Array.from(allTags).sort().map(tag => `
        <span class="badge bg-light text-dark border filter-chip ${selectedTags.has(tag) ? 'active' : ''}" 
              onclick="toggleTagFilter('${tag}')">
            ${escapeHtml(tag)}
        </span>
    `).join('');
}

// Toggle tag filter
function toggleTagFilter(tag) {
    if (selectedTags.has(tag)) {
        selectedTags.delete(tag);
    } else {
        selectedTags.add(tag);
    }
    
    applyFilters();
    renderTagFilters();
}

// Handle search
function handleSearch() {
    applyFilters();
}

// Apply all filters
function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    filteredPrograms = allPrograms.filter(program => {
        // Search filter
        const matchesSearch = !searchTerm || 
            program.title.toLowerCase().includes(searchTerm) ||
            program.author.toLowerCase().includes(searchTerm) ||
            program.goals.toLowerCase().includes(searchTerm) ||
            (program.tags && program.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

        // Tag filter
        const matchesTags = selectedTags.size === 0 || 
            (program.tags && program.tags.some(tag => selectedTags.has(tag)));

        return matchesSearch && matchesTags;
    });

    renderPrograms();
}

// Show program preview modal
async function showProgramPreview(programId) {
    try {
        currentProgram = allPrograms.find(p => p._id === programId);
        
        if (!currentProgram) {
            throw new Error('Program not found');
        }

        // Populate modal
        document.getElementById('modalProgramTitle').textContent = currentProgram.title;
        document.getElementById('modalProgramAuthor').textContent = currentProgram.author;
        document.getElementById('modalProgramGoals').textContent = currentProgram.goals;
        document.getElementById('modalProgramDescription').textContent = currentProgram.description || 'No description available';
        
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
        
        // Price
        document.getElementById('modalProgramPrice').textContent = currentProgram.price ? currentProgram.price.formatted : 'N/A';

        programModal.show();
    } catch (error) {
        console.error('Error showing program preview:', error);
        showError('Failed to load program details');
    }
}

// Handle buy now
async function handleBuyNow() {
    if (!currentProgram) return;

    try {
        const buyBtn = document.getElementById('buyNowBtn');
        buyBtn.disabled = true;
        buyBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';

        const response = await fetch(`${window.API_BASE}/programs/checkout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                programId: currentProgram._id
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create checkout session');
        }

        // Redirect to Stripe checkout
        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error('No checkout URL received');
        }
    } catch (error) {
        console.error('Error creating checkout:', error);
        showError(error.message || 'Failed to start checkout. Please try again.');
        
        const buyBtn = document.getElementById('buyNowBtn');
        buyBtn.disabled = false;
        buyBtn.innerHTML = '<i class="bi bi-cart-plus"></i> Buy Now';
    }
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

function getDifficultyBadgeClass(difficulty) {
    const classes = {
        'beginner': 'bg-success',
        'intermediate': 'bg-warning',
        'advanced': 'bg-danger'
    };
    return classes[difficulty] || 'bg-secondary';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}