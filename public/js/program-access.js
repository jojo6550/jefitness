/**
 * Program Access Verification
 * Checks if user has access to a program
 */

window.API_BASE = window.ApiConfig.getAPI_BASE();

/**
 * Check if user has access to a program
 */
async function checkProgramAccess() {
    const token = localStorage.getItem('token');
    if (!token) {
        showAccessDenied('Please log in to access this program');
        return false;
    }

    // Get program slug from URL
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug');

    if (!slug) {
        logger.error('Could not determine program slug from URL');
        showAccessDenied('Invalid program page');
        return false;
    }

    try {
        const response = await fetch(`${window.API_BASE}/api/programs/${slug}/access`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
            const data = await response.json();
            showAccessDenied(data.message || 'Access denied to this program');
            return false;
        }

        const data = await response.json();
        return data.hasAccess;
    } catch (error) {
        logger.error('Error verifying program access', { error: error?.message, slug });
        showAccessDenied('An error occurred while verifying your access.');
        return false;
    }
}

/**
 * Show access denied message
 */
function showAccessDenied(message) {
    const container = document.getElementById('programContent');
    if (container) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-lock-fill text-danger" style="font-size: 4rem;"></i>
                <h3 class="mt-3">Access Denied</h3>
                <p class="text-muted">${message}</p>
                <a href="subscriptions.html" class="btn btn-primary mt-3">
                    View Plans
                </a>
            </div>
        `;
    }
}

// Auto-run on program pages
document.addEventListener('DOMContentLoaded', async () => {
    // Only run on program pages
    if (window.location.pathname.includes('/programs/')) {
        const hasAccess = await checkProgramAccess();
        if (hasAccess) {
            // Load program content
            loadProgramContent();
        }
    }
});

/**
 * Load program content (to be implemented per program)
 */
function loadProgramContent() {
    logger.debug('Loading program content');
    // Program-specific content loading goes here
}
