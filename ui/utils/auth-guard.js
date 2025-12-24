/**
 * Authentication Guard
 * Protects routes and ensures only authenticated users can access pages
 * Redirects unauthenticated users to the auth page
 */

const AuthGuard = {
    redirecting: false,
    
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
            
            // Wait a bit for session to be loaded after redirect
            // This prevents race conditions where session isn't ready immediately
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Try to get the session directly to ensure it's loaded
            try {
                const session = await window.AuthService.client.auth.getSession();
                if (session.data?.session) {
                    window.AuthService.session = session.data.session;
                    window.AuthService.currentUser = session.data.session.user;
                }
            } catch (sessionError) {
                console.warn('[AuthGuard] Error getting session:', sessionError);
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
        // Prevent multiple redirects
        if (this.redirecting) {
            return;
        }
        
        const currentPath = window.location.pathname;
        const authPath = 'views/auth.html';
        
        // Don't redirect if already on auth page
        if (currentPath.includes('auth.html')) {
            return;
        }
        
        this.redirecting = true;
        
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
        // Prevent multiple redirects using sessionStorage
        const redirectKey = 'auth_redirecting';
        if (sessionStorage.getItem(redirectKey)) {
            console.log('[AuthGuard] Redirect already in progress, skipping');
            return;
        }
        
        sessionStorage.setItem(redirectKey, 'true');
        
        // Clear the flag after a delay to allow redirect to complete
        setTimeout(() => {
            sessionStorage.removeItem(redirectKey);
        }, 2000);
        
        const returnUrl = this.getReturnUrl();
        
        if (returnUrl) {
            // Check if we're already on the target page
            const currentUrl = window.location.href.split('?')[0];
            const targetUrl = returnUrl.split('?')[0];
            if (currentUrl === targetUrl) {
                console.log('[AuthGuard] Already on target page, skipping redirect');
                sessionStorage.removeItem(redirectKey);
                return;
            }
            window.location.href = returnUrl;
        } else {
            // Default to home page
            const basePath = window.location.pathname.includes('/views/') ? '../' : '';
            const targetPath = `${basePath}index.html`;
            const currentPath = window.location.pathname;
            
            // Check if we're already on the target page
            if (currentPath.includes('index.html') || (currentPath.endsWith('/') && !currentPath.includes('/views/'))) {
                console.log('[AuthGuard] Already on home page, skipping redirect');
                sessionStorage.removeItem(redirectKey);
                return;
            }
            
            window.location.href = targetPath;
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

