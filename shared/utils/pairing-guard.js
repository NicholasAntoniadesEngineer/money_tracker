/**
 * Pairing Guard
 *
 * Checks if the current device has encryption keys set up.
 * Redirects to pairing page if keys are not found.
 */

const PairingGuard = {
    /**
     * Check if device needs pairing
     * @returns {Promise<boolean>} true if paired, false if needs pairing
     */
    async checkPairingStatus() {
        console.log('[PairingGuard] Checking pairing status...');

        try {
            // Check if user is authenticated
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                console.warn('[PairingGuard] User not authenticated');
                return false;
            }

            const currentUser = window.AuthService.getCurrentUser();
            if (!currentUser) {
                console.warn('[PairingGuard] No current user found');
                return false;
            }

            const userId = currentUser.id;

            // Check if KeyStorageService is available
            if (!window.KeyStorageService) {
                console.warn('[PairingGuard] KeyStorageService not available');
                return false;
            }

            // Initialize KeyStorageService if needed
            if (typeof window.KeyStorageService.initialize === 'function') {
                await window.KeyStorageService.initialize();
            }

            // Check for identity keys
            const keys = await window.KeyStorageService.getIdentityKeys(userId);

            if (!keys || !keys.publicKey || !keys.secretKey) {
                console.log('[PairingGuard] No identity keys found - device needs pairing');
                return false;
            }

            console.log('[PairingGuard] Device is paired');
            return true;

        } catch (error) {
            console.error('[PairingGuard] Error checking pairing status:', error);
            return false;
        }
    },

    /**
     * Redirect to pairing page if device is not paired
     * @param {string} returnUrl - Optional URL to return to after pairing (default: landing page)
     */
    async requirePairing(returnUrl = null) {
        console.log('[PairingGuard] Checking if pairing is required...');

        const isPaired = await this.checkPairingStatus();

        if (!isPaired) {
            console.log('[PairingGuard] Device not paired, redirecting to pairing page');

            // Redirect to auth page for device setup
            // Auth page will detect the user is authenticated and run handlePostSignIn()
            // which will set up encryption keys
            console.log('[PairingGuard] Redirecting to auth page for encryption setup');

            // Calculate relative path dynamically based on current location
            const authUrl = this._calculateAuthUrl();
            console.log('[PairingGuard] Calculated auth URL:', authUrl);
            window.location.href = authUrl;
            return false;
        }

        console.log('[PairingGuard] Device is paired, allowing access');
        return true;
    },

    /**
     * Calculate the auth page URL relative to current location
     * @private
     * @returns {string} The auth page URL
     */
    _calculateAuthUrl() {
        const currentPath = window.location.pathname;
        const baseUrl = window.location.origin;
        const pathParts = currentPath.split('/').filter(p => p && p !== 'index.html');

        // Get all module names from registry if available
        const modules = window.ModuleRegistry?.getAllModuleNames() || [];

        // Find the base path (everything before any known module or 'ui')
        let basePathParts = [];
        for (let i = 0; i < pathParts.length; i++) {
            if (pathParts[i] === 'ui' || modules.includes(pathParts[i])) {
                break;
            }
            basePathParts.push(pathParts[i]);
        }

        // Construct the auth URL
        const basePath = basePathParts.length > 0 ? basePathParts.join('/') + '/' : '';
        return `${baseUrl}/${basePath}auth/views/auth.html`;
    },

    /**
     * Check pairing status without redirecting
     * Useful for conditional UI rendering
     */
    async isPaired() {
        return await this.checkPairingStatus();
    }
};

// Make available globally
window.PairingGuard = PairingGuard;

console.log('[PairingGuard] Pairing guard loaded');
