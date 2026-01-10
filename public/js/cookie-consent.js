/**
 * Cookie Consent Management
 * Handles the display and functionality of the cookie consent banner
 * Integrates with backend GDPR APIs for authenticated users
 */

class CookieConsentManager {
    constructor() {
        this.banner = document.getElementById('cookie-consent-banner');
        this.acceptAllBtn = document.getElementById('accept-cookies');
        this.acceptSelectedBtn = document.getElementById('accept-selected');
        this.declineBtn = document.getElementById('decline-cookies');

        // Consent checkboxes
        this.dataProcessingCheckbox = document.getElementById('data-processing-consent');
        this.marketingCheckbox = document.getElementById('marketing-consent');
        this.healthDataCheckbox = document.getElementById('health-data-consent');
        this.healthConsentCategory = document.getElementById('health-consent-category');

        // API configuration
        this.apiBase = window.API_CONFIG ? window.API_CONFIG.baseURL : '';
        this.isLoggedIn = false;
        this.userToken = null;

        this.init();
    }

    async init() {
        // Check authentication status
        this.checkAuthStatus();

        // Check existing consent
        const existingConsent = this.getStoredConsent();

        if (!existingConsent || existingConsent.needsUpdate) {
            this.showBanner();
            this.populateCheckboxes(existingConsent);
        }

        // Show health consent for logged-in users
        if (this.isLoggedIn) {
            this.healthConsentCategory.style.display = 'block';
        }

        this.bindEvents();
    }

    checkAuthStatus() {
        this.userToken = localStorage.getItem('token') || sessionStorage.getItem('token');
        this.isLoggedIn = !!this.userToken;
    }

    getStoredConsent() {
        const consent = {
            essential: true, // Always true
            dataProcessing: localStorage.getItem('data-processing-consent') === 'true',
            marketing: localStorage.getItem('marketing-consent') === 'true',
            healthData: localStorage.getItem('health-data-consent') === 'true',
            timestamp: localStorage.getItem('consent-timestamp'),
            version: localStorage.getItem('consent-version') || '1.0'
        };

        // Check if consent needs update (version mismatch)
        const currentVersion = '1.1'; // Update this when consent text changes
        consent.needsUpdate = consent.version !== currentVersion;

        return consent;
    }

    populateCheckboxes(consent) {
        if (consent.dataProcessing) {
            this.dataProcessingCheckbox.checked = true;
        }
        if (consent.marketing) {
            this.marketingCheckbox.checked = true;
        }
        if (consent.healthData && this.isLoggedIn) {
            this.healthDataCheckbox.checked = true;
        }
    }

    showBanner() {
        this.banner.classList.remove('hidden-state');
    }

    hideBanner() {
        this.banner.classList.add('hidden-state');
    }

    bindEvents() {
        this.acceptAllBtn.addEventListener('click', () => this.handleAcceptAll());
        this.acceptSelectedBtn.addEventListener('click', () => this.handleAcceptSelected());
        this.declineBtn.addEventListener('click', () => this.handleDecline());
    }

    async handleAcceptAll() {
        const consents = {
            dataProcessing: true,
            marketing: true,
            healthData: this.isLoggedIn ? true : false
        };

        await this.saveConsents(consents);
        this.hideBanner();
        this.triggerConsentEvent('accepted', consents);
    }

    async handleAcceptSelected() {
        const consents = {
            dataProcessing: this.dataProcessingCheckbox.checked,
            marketing: this.marketingCheckbox.checked,
            healthData: this.isLoggedIn ? this.healthDataCheckbox.checked : false
        };

        await this.saveConsents(consents);
        this.hideBanner();
        this.triggerConsentEvent('accepted', consents);
    }

    async handleDecline() {
        const consents = {
            dataProcessing: false,
            marketing: false,
            healthData: false
        };

        await this.saveConsents(consents);
        this.hideBanner();
        this.triggerConsentEvent('declined', consents);
    }

    async saveConsents(consents) {
        // Store locally
        localStorage.setItem('data-processing-consent', consents.dataProcessing.toString());
        localStorage.setItem('marketing-consent', consents.marketing.toString());
        localStorage.setItem('health-data-consent', consents.healthData.toString());
        localStorage.setItem('consent-timestamp', new Date().toISOString());
        localStorage.setItem('consent-version', '1.1');

        // If user is logged in, sync with backend
        if (this.isLoggedIn && this.userToken) {
            try {
                await this.syncWithBackend(consents);
            } catch (error) {
                console.error('Failed to sync consent with backend:', error);
                // Continue with local storage even if backend sync fails
            }
        }
    }

    async syncWithBackend(consents) {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.userToken}`
        };

        const promises = [];

        // Grant data processing consent if checked
        if (consents.dataProcessing) {
            promises.push(
                fetch(`${this.apiBase}/api/v1/gdpr/consent/data-processing`, {
                    method: 'POST',
                    headers
                })
            );
        }

        // Grant marketing consent if checked
        if (consents.marketing) {
            promises.push(
                fetch(`${this.apiBase}/api/v1/gdpr/consent/marketing`, {
                    method: 'POST',
                    headers
                })
            );
        }

        // Grant health data consent if checked and user is logged in
        if (consents.healthData && this.isLoggedIn) {
            promises.push(
                fetch(`${this.apiBase}/api/v1/gdpr/consent/health-data`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ purpose: 'fitness_tracking' })
                })
            );
        }

        await Promise.all(promises);
    }

    triggerConsentEvent(action, consents) {
        const event = new CustomEvent('cookieConsentChanged', {
            detail: { action, consents }
        });
        window.dispatchEvent(event);

        console.log(`Cookie consent ${action}:`, consents);
    }

    // Public API methods
    getConsentStatus() {
        return this.getStoredConsent();
    }

    async updateConsent(type, granted) {
        const consents = this.getStoredConsent();
        consents[type] = granted;

        // Update checkbox if visible
        const checkbox = this.getCheckboxForType(type);
        if (checkbox) {
            checkbox.checked = granted;
        }

        await this.saveConsents(consents);
        this.triggerConsentEvent('updated', consents);
    }

    getCheckboxForType(type) {
        switch (type) {
            case 'dataProcessing': return this.dataProcessingCheckbox;
            case 'marketing': return this.marketingCheckbox;
            case 'healthData': return this.healthDataCheckbox;
            default: return null;
        }
    }

    resetConsent() {
        localStorage.removeItem('data-processing-consent');
        localStorage.removeItem('marketing-consent');
        localStorage.removeItem('health-data-consent');
        localStorage.removeItem('consent-timestamp');
        localStorage.removeItem('consent-version');

        // Reset checkboxes
        if (this.dataProcessingCheckbox) this.dataProcessingCheckbox.checked = false;
        if (this.marketingCheckbox) this.marketingCheckbox.checked = false;
        if (this.healthDataCheckbox) this.healthDataCheckbox.checked = false;

        this.showBanner();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    window.cookieConsentManager = new CookieConsentManager();
});

// Global API for backward compatibility
window.getCookieConsent = function() {
    if (window.cookieConsentManager) {
        return window.cookieConsentManager.getConsentStatus();
    }
    return null;
};

window.resetCookieConsent = function() {
    if (window.cookieConsentManager) {
        window.cookieConsentManager.resetConsent();
    }
};
