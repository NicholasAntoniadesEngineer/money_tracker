/**
 * Authentication Service
 * Handles user authentication with Supabase
 */

const AuthService = {
    client: null,
    currentUser: null,
    authStateListeners: [],

    /**
     * Initialize authentication service
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            if (!window.SupabaseConfig) {
                throw new Error('SupabaseConfig not available');
            }

            this.client = window.SupabaseConfig.getClient();
            
            if (!this.client) {
                throw new Error('Failed to initialize Supabase client for authentication');
            }

            await this.checkSession();
            this.setupAuthStateListener();
        } catch (error) {
            console.error('[AuthService] Initialization error:', error);
            throw error;
        }
    },

    /**
     * Check for existing session
     * @returns {Promise<boolean>} True if user is authenticated
     */
    async checkSession() {
        try {
            if (!this.client) {
                return false;
            }

            const { data: { session }, error } = await this.client.auth.getSession();

            if (error) {
                console.error('[AuthService] Session check error:', error);
                return false;
            }

            if (session && session.user) {
                this.currentUser = session.user;
                return true;
            }

            return false;
        } catch (error) {
            console.error('[AuthService] Error checking session:', error);
            return false;
        }
    },

    /**
     * Sign in with email and password
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<{success: boolean, error: string|null, user: Object|null}>}
     */
    async signIn(email, password) {
        try {
            if (!this.client) {
                throw new Error('AuthService not initialized');
            }

            if (!email || !password) {
                return {
                    success: false,
                    error: 'Email and password are required',
                    user: null
                };
            }

            const { data, error } = await this.client.auth.signInWithPassword({
                email: email.trim(),
                password: password
            });

            if (error) {
                console.error('[AuthService] Sign in error:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to sign in',
                    user: null
                };
            }

            if (data && data.user) {
                this.currentUser = data.user;
                this.notifyAuthStateListeners(true, data.user);
                return {
                    success: true,
                    error: null,
                    user: data.user
                };
            }

            return {
                success: false,
                error: 'Sign in failed - no user data returned',
                user: null
            };
        } catch (error) {
            console.error('[AuthService] Sign in exception:', error);
            return {
                success: false,
                error: error.message || 'An unexpected error occurred',
                user: null
            };
        }
    },

    /**
     * Sign up with email and password
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<{success: boolean, error: string|null, user: Object|null}>}
     */
    async signUp(email, password) {
        try {
            if (!this.client) {
                throw new Error('AuthService not initialized');
            }

            if (!email || !password) {
                return {
                    success: false,
                    error: 'Email and password are required',
                    user: null
                };
            }

            if (password.length < 6) {
                return {
                    success: false,
                    error: 'Password must be at least 6 characters',
                    user: null
                };
            }

            const { data, error } = await this.client.auth.signUp({
                email: email.trim(),
                password: password
            });

            if (error) {
                console.error('[AuthService] Sign up error:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to sign up',
                    user: null
                };
            }

            if (data && data.user) {
                this.currentUser = data.user;
                this.notifyAuthStateListeners(true, data.user);
                return {
                    success: true,
                    error: null,
                    user: data.user
                };
            }

            return {
                success: false,
                error: 'Sign up failed - no user data returned',
                user: null
            };
        } catch (error) {
            console.error('[AuthService] Sign up exception:', error);
            return {
                success: false,
                error: error.message || 'An unexpected error occurred',
                user: null
            };
        }
    },

    /**
     * Sign out current user
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async signOut() {
        try {
            if (!this.client) {
                return {
                    success: false,
                    error: 'AuthService not initialized'
                };
            }

            const { error } = await this.client.auth.signOut();

            if (error) {
                console.error('[AuthService] Sign out error:', error);
                return {
                    success: false,
                    error: error.message || 'Failed to sign out'
                };
            }

            this.currentUser = null;
            this.notifyAuthStateListeners(false, null);
            
            return {
                success: true,
                error: null
            };
        } catch (error) {
            console.error('[AuthService] Sign out exception:', error);
            return {
                success: false,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Get current authenticated user
     * @returns {Object|null} Current user object or null
     */
    getCurrentUser() {
        return this.currentUser;
    },

    /**
     * Check if user is authenticated
     * @returns {boolean} True if user is authenticated
     */
    isAuthenticated() {
        return this.currentUser !== null;
    },

    /**
     * Setup listener for auth state changes
     * @returns {void}
     */
    setupAuthStateListener() {
        if (!this.client) {
            return;
        }

        this.client.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' && session && session.user) {
                this.currentUser = session.user;
                this.notifyAuthStateListeners(true, session.user);
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.notifyAuthStateListeners(false, null);
            }
        });
    },

    /**
     * Register listener for auth state changes
     * @param {Function} callback - Callback function (isAuthenticated, user)
     * @returns {Function} Unsubscribe function
     */
    onAuthStateChange(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        this.authStateListeners.push(callback);

        return () => {
            const index = this.authStateListeners.indexOf(callback);
            if (index > -1) {
                this.authStateListeners.splice(index, 1);
            }
        };
    },

    /**
     * Notify all auth state listeners
     * @param {boolean} isAuthenticated - Authentication status
     * @param {Object|null} user - User object or null
     * @returns {void}
     */
    notifyAuthStateListeners(isAuthenticated, user) {
        this.authStateListeners.forEach(callback => {
            try {
                callback(isAuthenticated, user);
            } catch (error) {
                console.error('[AuthService] Error in auth state listener:', error);
            }
        });
    },

    /**
     * Get Supabase client with authenticated session
     * @returns {Object|null} Supabase client or null
     */
    getClient() {
        return this.client;
    }
};

if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}
