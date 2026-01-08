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

            // Build pairing page URL
            let pairingUrl = '/messaging/views/device-pairing.html';

            // Add return URL if provided
            if (returnUrl) {
                pairingUrl += `?returnUrl=${encodeURIComponent(returnUrl)}`;
            }

            window.location.href = pairingUrl;
            return false;
        }

        console.log('[PairingGuard] Device is paired, allowing access');
        return true;
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
