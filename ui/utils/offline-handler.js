/**
 * Offline Handler
 * Manages offline/online status and provides UI feedback
 */

const OfflineHandler = {
    offlineIndicator: null,
    isCurrentlyOffline: false,

    /**
     * Initialize offline detection and UI
     */
    initialize() {
        console.log('[OfflineHandler] Initializing offline detection...');

        // Create offline indicator UI
        this.createOfflineIndicator();

        // Set initial state
        this.isCurrentlyOffline = !navigator.onLine;
        if (this.isCurrentlyOffline) {
            this.showOfflineIndicator();
        }

        // Listen for online/offline events
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        console.log('[OfflineHandler] Offline detection initialized (currently:', navigator.onLine ? 'online' : 'offline', ')');
    },

    /**
     * Create the offline indicator UI element
     */
    createOfflineIndicator() {
        if (this.offlineIndicator) {
            return; // Already created
        }

        this.offlineIndicator = document.createElement('div');
        this.offlineIndicator.id = 'offline-indicator';
        this.offlineIndicator.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 12px 20px;
                text-align: center;
                z-index: 10000;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                font-weight: 500;
                display: none;
                animation: slideDown 0.3s ease-out;
            " id="offline-banner">
                <span style="margin-right: 8px;">📡</span>
                <span id="offline-message">You are currently offline. Some features may be unavailable.</span>
            </div>
        `;

        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideDown {
                from {
                    transform: translateY(-100%);
                    opacity: 0;
                }
                to {
                    transform: translateY(0);
                    opacity: 1;
                }
            }
            @keyframes slideUp {
                from {
                    transform: translateY(0);
                    opacity: 1;
                }
                to {
                    transform: translateY(-100%);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);

        // Append to body when DOM is ready
        if (document.body) {
            document.body.appendChild(this.offlineIndicator);
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(this.offlineIndicator);
            });
        }
    },

    /**
     * Show the offline indicator
     */
    showOfflineIndicator() {
        const banner = document.getElementById('offline-banner');
        if (banner) {
            banner.style.display = 'block';
        }
    },

    /**
     * Hide the offline indicator
     */
    hideOfflineIndicator() {
        const banner = document.getElementById('offline-banner');
        if (banner) {
            banner.style.animation = 'slideUp 0.3s ease-out';
            setTimeout(() => {
                banner.style.display = 'none';
                banner.style.animation = 'slideDown 0.3s ease-out';
            }, 300);
        }
    },

    /**
     * Handle when device goes offline
     */
    handleOffline() {
        console.warn('[OfflineHandler] Device went offline');
        this.isCurrentlyOffline = true;
        this.showOfflineIndicator();

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('app:offline'));

        // Show user-friendly message if they're in the middle of something
        if (document.activeElement && (
            document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA'
        )) {
            console.warn('[OfflineHandler] User is editing - data may not save');
        }
    },

    /**
     * Handle when device comes back online
     */
    async handleOnline() {
        console.log('[OfflineHandler] Device came back online');
        this.isCurrentlyOffline = false;

        // Update indicator message
        const message = document.getElementById('offline-message');
        if (message) {
            message.innerHTML = '<span style="margin-right: 8px;">✅</span>You are back online!';
        }

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('app:online'));

        // Revalidate session when coming back online
        if (window.AuthService && window.AuthService.isAuthenticated()) {
            console.log('[OfflineHandler] Revalidating session after coming back online...');
            try {
                await window.AuthService.validateSession(true, true); // autoRedirect=true, bypassCache=true
                console.log('[OfflineHandler] Session revalidation successful');
            } catch (error) {
                console.error('[OfflineHandler] Session revalidation failed:', error);
            }
        }

        // Hide the indicator after a brief delay
        setTimeout(() => {
            this.hideOfflineIndicator();
        }, 2000);
    },

    /**
     * Check if currently offline
     * @returns {boolean} True if offline
     */
    isOffline() {
        return this.isCurrentlyOffline;
    }
};

// Auto-initialize when DOM is ready - but defer to avoid blocking page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Defer initialization slightly to ensure other scripts are ready
        setTimeout(() => OfflineHandler.initialize(), 100);
    });
} else {
    setTimeout(() => OfflineHandler.initialize(), 100);
}

// Make OfflineHandler available globally
if (typeof window !== 'undefined') {
    window.OfflineHandler = OfflineHandler;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OfflineHandler;
}
