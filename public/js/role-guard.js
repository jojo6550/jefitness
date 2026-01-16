/**
 * Role Guard
 * Protects routes by verifying user roles
 */

const roleGuard = {
    /**
     * Check if user has required role
     * @param {string[]} allowedRoles - Array of allowed roles
     * @returns {boolean} - True if user has allowed role
     */
    hasRole: (allowedRoles) => {
        const userRole = localStorage.getItem('userRole');
        
        if (!userRole) {
            logger.warn('No user role found');
            return false;
        }
        
        return allowedRoles.includes(userRole);
    },

    /**
     * Protect route - redirect if not authorized
     * @param {string[]} allowedRoles - Array of allowed roles
     * @param {string} redirectUrl - URL to redirect to if not authorized
     */
    protectRoute: (allowedRoles, redirectUrl = '/') => {
        const userRole = localStorage.getItem('userRole');
        
        if (!userRole) {
            logger.info('No user role, redirecting to login');
            window.location.href = redirectUrl;
            return false;
        }
        
        if (!allowedRoles.includes(userRole)) {
            logger.warn('User role not authorized', { userRole, requiredRoles: allowedRoles });
            window.location.href = redirectUrl;
            return false;
        }
        
        return true;
    },

    /**
     * Initialize role-based UI elements
     */
    init: () => {
        const token = localStorage.getItem('token');
        
        if (!token) {
            // No token, hide protected elements
            document.querySelectorAll('.role-protected').forEach(el => {
                el.style.display = 'none';
            });
            return;
        }

        try {
            // Verify token and get user role
            const userRole = localStorage.getItem('userRole');
            
            if (!userRole) {
                localStorage.removeItem('token');
                window.location.href = 'login.html';
                return;
            }

            // Show/hide elements based on role
            document.querySelectorAll('[data-role]').forEach(el => {
                const allowedRoles = el.dataset.role.split(',');
                if (allowedRoles.includes(userRole)) {
                    el.style.display = '';
                } else {
                    el.style.display = 'none';
                }
            });
        } catch (error) {
            logger.error('Role guard initialization failed', { error: error?.message });
            localStorage.removeItem('token');
            window.location.href = 'login.html';
        }
    }
};

// Make available globally
window.roleGuard = roleGuard;

// Auto-initialize on DOM ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        roleGuard.init();
    });
}
