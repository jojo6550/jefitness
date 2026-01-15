/**
 * Program Access Control
 * Verifies that the user has purchased the program before allowing access
 */

(function() {
    'use strict';

    // Extract program slug from current page URL
    function getProgramSlug() {
        const path = window.location.pathname;
        // Extract filename without .html extension
        const match = path.match(/\/programs\/([^\/]+)\.html$/);
        if (match) {
            return match[1];
        }
        return null;
    }

    // Check if user has access to this program
    async function verifyProgramAccess() {
        try {
            // Check authentication
            const token = localStorage.getItem('token');
            if (!token) {
                // Redirect to login page
                window.location.href = '../../index.html?redirect=' + encodeURIComponent(window.location.pathname);
                return;
            }

            // Get program slug
            const slug = getProgramSlug();
            if (!slug) {
                console.error('Could not determine program slug from URL');
                showAccessDenied('Invalid program page');
                return;
            }

            // Check access via API
            const response = await fetch(`${window.API_BASE}/api/v1/programs/user/access/${slug}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Token expired or invalid
                    localStorage.removeItem('token');
                    window.location.href = '../../index.html?redirect=' + encodeURIComponent(window.location.pathname);
                    return;
                }
                throw new Error('Failed to verify access');
            }

            const data = await response.json();

            if (!data.hasAccess) {
                // User doesn't have access - redirect to marketplace
                showAccessDenied('You need to purchase this program to view it.');
                setTimeout(() => {
                    window.location.href = '../program-marketplace.html';
                }, 3000);
            } else {
                // User has access - show content
                showProgramContent();
            }
        } catch (error) {
            console.error('Error verifying program access:', error);
            showAccessDenied('An error occurred while verifying your access.');
        }
    }

    // Show access denied message
    function showAccessDenied(message) {
        const main = document.querySelector('main');
        if (main) {
            main.innerHTML = `
                <div class="container my-5">
                    <div class="row justify-content-center">
                        <div class="col-lg-6 text-center">
                            <div class="card shadow-sm p-5">
                                <div class="card-body">
                                    <i class="bi bi-lock-fill text-danger" style="font-size: 4rem;"></i>
                                    <h2 class="mt-4 mb-3">Access Denied</h2>
                                    <p class="text-muted mb-4">${message}</p>
                                    <a href="../program-marketplace.html" class="btn btn-primary">
                                        <i class="bi bi-shop me-2"></i>Browse Programs
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // Show program content (remove loading overlay if any)
    function showProgramContent() {
        // Remove any loading overlays
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }

        // Show the main content
        const main = document.querySelector('main');
        if (main) {
            main.style.display = 'block';
        }
    }

    // Run verification when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', verifyProgramAccess);
    } else {
        verifyProgramAccess();
    }
})();