/**
 * Cookie Consent Management
 */

const COOKIE_CONSENT_KEY = 'jefitness_cookie_consent';

/**
 * Get stored consent
 */
function getConsent() {
    try {
        const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
        return stored ? JSON.parse(stored) : null;
    } catch (err) {
        return null;
    }
}

/**
 * Save consent
 */
function saveConsent(consent) {
    const consentData = {
        ...consent,
        timestamp: new Date().toISOString()
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consentData));
    
    // Sync with backend if user is logged in
    syncConsentWithBackend(consentData);
    
    return consentData;
}

/**
 * Sync consent with backend
 */
async function syncConsentWithBackend(consent) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE}/api/gdpr/consent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(consent)
        });

        if (response.ok) {
            logger.info('Consent synced with backend', { action: consent.action });
        }
    } catch (err) {
        logger.warn('Failed to sync consent with backend', { error: err?.message });
        // Continue with local storage even if backend sync fails
    }
}

/**
 * Check if consent is required
 */
function isConsentRequired() {
    return !getConsent();
}

/**
 * Show consent banner
 */
function showConsentBanner() {
    if (!isConsentRequired()) return;

    const banner = document.createElement('div');
    banner.className = 'cookie-consent-banner position-fixed bottom-0 start-0 w-100 p-3 bg-dark text-white';
    banner.innerHTML = `
        <div class="container d-flex justify-content-between align-items-center flex-wrap">
            <p class="mb-0">We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.
            <a href="pages/privacy-policy.html" class="text-light">Learn more</a></p>
            <div class="btn-group mt-2 mt-md-0">
                <button class="btn btn-outline-light" id="rejectCookies">Reject</button>
                <button class="btn btn-primary" id="acceptCookies">Accept</button>
            </div>
    `;
    document.body.appendChild(banner);

    document.getElementById('acceptCookies').addEventListener('click', () => {
        const consent = saveConsent({ essential: true, analytics: true, marketing: true, action: 'accept_all' });
        banner.remove();
        onConsentGiven(consent);
    });

    document.getElementById('rejectCookies').addEventListener('click', () => {
        const consent = saveConsent({ essential: true, analytics: false, marketing: false, action: 'reject_all' });
        banner.remove();
        onConsentGiven(consent);
    });
}

/**
 * Handle consent given
 */
function onConsentGiven(consent) {
    // Enable/disable analytics based on consent
    if (consent.analytics) {
        enableAnalytics();
    } else {
        disableAnalytics();
    }
}

/**
 * Enable analytics
 */
function enableAnalytics() {
    // Initialize analytics scripts here
    logger.info('Analytics enabled');
}

/**
 * Disable analytics
 */
function disableAnalytics() {
    // Disable/remove analytics scripts here
    logger.info('Analytics disabled');
}

/**
 * Update specific consent category
 */
function updateConsent(category, value) {
    const current = getConsent() || { essential: true };
    current[category] = value;
    current.action = 'update';
    saveConsent(current);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    showConsentBanner();
});

// Export globally
window.getConsent = getConsent;
window.saveConsent = saveConsent;
window.updateConsent = updateConsent;
