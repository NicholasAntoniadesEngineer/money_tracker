/**
 * Authentication Guard
 * Protects routes and ensures only authenticated users can access pages
 * Redirects unauthenticated users to the auth page
 */

const AuthGuard = {
    /**
     * Check if user is authenticated and redirect if not
     * @returns {Promise<boolean>} True if authenticated, false if redirected
     */
    async checkAuth() {
        try {
            // Initialize AuthService if not already initialized
            if (!window.AuthService) {
                console.error('[AuthGuard] AuthService not available');
                this.redirectToAuth();
                return false;
            }
            
            // Initialize if needed
            if (!window.AuthService.client) {
                await window.AuthService.initialize();
            }
            
            // Check if user is authenticated
            const isAuthenticated = window.AuthService.isAuthenticated();
            
            if (!isAuthenticated) {
                console.log('[AuthGuard] User not authenticated, redirecting to auth page');
                this.redirectToAuth();
                return false;
            }
            
            console.log('[AuthGuard] User authenticated:', window.AuthService.getCurrentUser()?.email);
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
        
        // Don't redirect if already on auth page
        if (currentPath.includes('auth.html')) {
            return;
        }
        
        // Store the intended destination for redirect after login
        const returnUrl = encodeURIComponent(window.location.href);
        window.location.href = `${authPath}?return=${returnUrl}`;
    },

    /**
     * Protect a route - call this at the start of page initialization
     * @param {Function} onAuthenticated - Callback to execute if authenticated
     * @returns {Promise<void>}
     */
    async protectRoute(onAuthenticated) {
        const isAuthenticated = await this.checkAuth();
        
        if (isAuthenticated && onAuthenticated) {
            await onAuthenticated();
        }
    },

    /**
     * Get the return URL from query parameters
     * @returns {string|null} Return URL or null if not present
     */
    getReturnUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        const returnUrl = urlParams.get('return');
        return returnUrl ? decodeURIComponent(returnUrl) : null;
    },

    /**
     * Redirect to the return URL or default page
     * @returns {void}
     */
    redirectAfterAuth() {
        const returnUrl = this.getReturnUrl();
        
        if (returnUrl) {
            window.location.href = returnUrl;
        } else {
            // Default to home page
            const basePath = window.location.pathname.includes('/views/') ? '../' : '';
            window.location.href = `${basePath}index.html`;
        }
    }
};

// Make AuthGuard available globally
if (typeof window !== 'undefined') {
    window.AuthGuard = AuthGuard;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthGuard;
}

