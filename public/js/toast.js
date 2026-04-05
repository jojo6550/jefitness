/**
 * Toast notification utility using Bootstrap
 */
class ToastManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // Create toast container if it doesn't exist
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    show(message, type = 'success', duration = 5000) {
        const toastId = 'toast-' + Date.now();
        const toastHtml = `
            <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">${message}</div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;

        this.container.insertAdjacentHTML('beforeend', toastHtml);

        const toastElement = document.getElementById(toastId);
        const bsToast = new bootstrap.Toast(toastElement, {
            autohide: duration > 0,
            delay: duration
        });

        bsToast.show();

        // Remove from DOM after hiding
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }

    success(message, duration = 5000) {
        this.show(message, 'success', duration);
    }

    error(message, duration = 5000) {
        this.show(message, 'danger', duration);
    }

    info(message, duration = 5000) {
        this.show(message, 'info', duration);
    }

    warning(message, duration = 5000) {
        this.show(message, 'warning', duration);
    }
}

// Global instance
window.Toast = new ToastManager();

// Global error boundary — catches uncaught JS errors and unhandled promise rejections
window.addEventListener('error', (event) => {
    // Ignore cross-origin script errors (no useful info available)
    if (!event.message || event.message === 'Script error.') return;
    console.error('Uncaught error:', event.error || event.message);
    window.Toast.error('Something went wrong. Please refresh the page.');
});

window.addEventListener('unhandledrejection', (event) => {
    // Ignore auth redirects — these are intentional control flow
    if (event.reason?.message === 'Unauthorized' || event.reason?.message === 'Forbidden') return;
    console.error('Unhandled promise rejection:', event.reason);
    window.Toast.error('Something went wrong. Please try again.');
});
