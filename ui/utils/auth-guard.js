/**
 * Authentication Guard
 * Protects routes and ensures user is authenticated before accessing pages
 */

const AuthGuard = {
    /**
     * Check if user is authenticated and redirect if not
     * @returns {Promise<boolean>} True if authenticated, false if redirected
     */
    async requireAuth() {
        try {
            if (!window.AuthService) {
                console.error('[AuthGuard] AuthService not available');
                this.redirectToAuth();
                return false;
            }

            const isAuthenticated = await window.AuthService.checkSession();

            if (!isAuthenticated) {
                console.log('[AuthGuard] User not authenticated, redirecting to auth page');
                this.redirectToAuth();
                return false;
            }

            return true;
        } catch (error) {
            console.error('[AuthGuard] Error checking authentication:', error);
            this.redirectToAuth();
            return false;
        }
    },

    /**
     * Redirect to authentication page
     * @returns {void}
     */
    redirectToAuth() {
        const currentPath = window.location.pathname;
        const authPath = 'views/auth.html';
        
        if (!currentPath.includes('auth.html')) {
            const returnUrl = encodeURIComponent(currentPath);
            window.location.href = `${authPath}?returnUrl=${returnUrl}`;
        }
    },

    /**
     * Initialize auth guard for a page
     * This should be called before any data loading
     * @returns {Promise<boolean>} True if authenticated, false if redirected
     */
    async init() {
        return await this.requireAuth();
    }
};

if (typeof window !== 'undefined') {
    window.AuthGuard = AuthGuard;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthGuard;
}
