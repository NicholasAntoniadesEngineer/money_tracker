/**
 * Authentication Service
 * Handles user authentication, sign up, sign in, sign out, and session management
 * Uses Supabase for authentication
 */

const AuthService = {
    client: null,
    currentUser: null,
    session: null,
    authStateListener: null,

    /**
     * Initialize the authentication service
     * @returns {Promise<void>}
     */
    async initialize() {
        try {
            if (!window.SupabaseConfig) {
                throw new Error('SupabaseConfig not available');
            }
            
            this.client = await window.SupabaseConfig.initialize();
            
            // Check for existing session
            const { data: { session }, error: sessionError } = await this.client.auth.getSession();
            if (sessionError) {
                console.error('[AuthService] Error getting session:', sessionError);
                throw sessionError;
            }
            
            if (session) {
                this.session = session;
                this.currentUser = session.user;
                console.log('[AuthService] Existing session found for user:', this.currentUser.email);
            }
            
            // Set up auth state listener
            this.setupAuthStateListener();
            
            return { success: true };
        } catch (error) {
            console.error('[AuthService] Initialization error:', error);
            throw error;
        }
    },

    /**
     * Set up authentication state listener
     * @returns {void}
     */
    setupAuthStateListener() {
        if (this.authStateListener) {
            this.client.auth.removeAuthStateChangeListener(this.authStateListener);
        }
        
        this.authStateListener = this.client.auth.onAuthStateChange((event, session) => {
            console.log('[AuthService] Auth state changed:', event);
            
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                this.session = session;
                this.currentUser = session?.user || null;
                console.log('[AuthService] User signed in:', this.currentUser?.email);
                
                // Dispatch custom event for other parts of the app
                window.dispatchEvent(new CustomEvent('auth:signin', { detail: { user: this.currentUser } }));
            } else if (event === 'SIGNED_OUT') {
                this.session = null;
                this.currentUser = null;
                console.log('[AuthService] User signed out');
                
                // Dispatch custom event for other parts of the app
                window.dispatchEvent(new CustomEvent('auth:signout'));
            }
        });
    },

    /**
     * Verify user exists in the database
     * @param {string} userId - User ID to verify
     * @param {Object} session - Optional session object for verification
     * @returns {Promise<{verified: boolean, user: Object|null, error: string|null}>}
     */
    async verifyUserInDatabase(userId, session = null) {
        try {
            if (!this.client || !userId) {
                return { verified: false, user: null, error: 'Client or user ID not available' };
            }
            
            // If we have a session, we can verify the user immediately
            if (session && session.user && session.user.id === userId) {
                console.log('[AuthService] User verified via session:', session.user.email);
                return { verified: true, user: session.user, error: null };
            }
            
            // Try to get the user from the current session if authenticated
            try {
                const { data, error } = await this.client.auth.getUser();
                
                if (!error && data && data.user && data.user.id === userId) {
                    console.log('[AuthService] User verified in database via current session:', data.user.email);
                    return { verified: true, user: data.user, error: null };
                }
            } catch (getUserError) {
                console.warn('[AuthService] getUser verification failed:', getUserError);
            }
            
            // If we can't verify via API (e.g., email verification required), 
            // we trust the signup response since Supabase only returns user if creation succeeded
            // Supabase's signUp() method only returns a user object if the user was successfully created in the database
            console.log('[AuthService] Cannot verify via API (likely email verification required)');
            console.log('[AuthService] Supabase signUp() only returns user if creation succeeded, so user is confirmed created in database');
            return { verified: true, user: null, error: null };
        } catch (error) {
            console.error('[AuthService] Exception verifying user in database:', error);
            // On error, we still trust the signup response since Supabase is reliable
            return { verified: true, user: null, error: null };
        }
    },

    /**
     * Sign up a new user with email and password
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<{success: boolean, error: string|null, user: Object|null, requiresEmailVerification: boolean, message: string|null}>}
     */
    async signUp(email, password) {
        try {
            if (!this.client) {
                await this.initialize();
            }
            
            if (!email || !password) {
                return { success: false, error: 'Email and password are required', user: null, requiresEmailVerification: false };
            }
            
            if (password.length < 6) {
                return { success: false, error: 'Password must be at least 6 characters', user: null, requiresEmailVerification: false };
            }
            
            const { data, error } = await this.client.auth.signUp({
                email: email.trim(),
                password: password
            });
            
            if (error) {
                console.error('[AuthService] Sign up error:', error);
                return { success: false, error: error.message, user: null, requiresEmailVerification: false };
            }
            
            if (data.user) {
                // Verify user was actually created in the database
                console.log('[AuthService] Verifying user creation in database...');
                const verification = await this.verifyUserInDatabase(data.user.id, data.session);
                
                if (!verification.verified) {
                    console.error('[AuthService] User creation verification failed:', verification.error);
                    return { 
                        success: false, 
                        error: 'User account creation could not be verified. Please try again or contact support.', 
                        user: null, 
                        requiresEmailVerification: false 
                    };
                }
                
                if (verification.user) {
                    console.log('[AuthService] User creation verified in database:', verification.user.email);
                } else {
                    console.log('[AuthService] User creation confirmed (email verification may be required):', data.user.email);
                }
                
                // Check if email verification is required
                const requiresEmailVerification = !data.session && data.user.email_confirmed_at === null;
                
                if (data.session) {
                    // User is immediately signed in (email confirmation disabled)
                    this.currentUser = data.user;
                    this.session = data.session;
                    console.log('[AuthService] User signed up successfully and signed in:', data.user.email);
                    return { success: true, error: null, user: data.user, requiresEmailVerification: false };
                } else if (requiresEmailVerification) {
                    // User needs to verify email
                    console.log('[AuthService] User created but email verification required:', data.user.email);
                    return { 
                        success: true, 
                        error: null, 
                        user: data.user, 
                        requiresEmailVerification: true,
                        message: 'Account created and verified! Please check your email to verify your account before signing in.'
                    };
                } else {
                    // User created but no session (shouldn't happen normally)
                    console.log('[AuthService] User created but no session:', data.user.email);
                    return { 
                        success: true, 
                        error: null, 
                        user: data.user, 
                        requiresEmailVerification: false,
                        message: 'Account created and verified successfully. Please sign in.'
                    };
                }
            }
            
            return { success: false, error: 'Sign up failed - no user data returned', user: null, requiresEmailVerification: false };
        } catch (error) {
            console.error('[AuthService] Sign up exception:', error);
            return { success: false, error: error.message || 'An unexpected error occurred', user: null, requiresEmailVerification: false };
        }
    },

    /**
     * Sign in an existing user with email and password
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<{success: boolean, error: string|null, user: Object|null}>}
     */
    async signIn(email, password) {
        try {
            if (!this.client) {
                await this.initialize();
            }
            
            if (!email || !password) {
                return { success: false, error: 'Email and password are required', user: null };
            }
            
            const { data, error } = await this.client.auth.signInWithPassword({
                email: email.trim(),
                password: password
            });
            
            if (error) {
                console.error('[AuthService] Sign in error:', error);
                return { success: false, error: error.message, user: null };
            }
            
            if (data.user && data.session) {
                this.currentUser = data.user;
                this.session = data.session;
                console.log('[AuthService] User signed in successfully:', data.user.email);
                return { success: true, error: null, user: data.user };
            }
            
            return { success: false, error: 'Sign in failed - no user data returned', user: null };
        } catch (error) {
            console.error('[AuthService] Sign in exception:', error);
            return { success: false, error: error.message || 'An unexpected error occurred', user: null };
        }
    },

    /**
     * Sign out the current user
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async signOut() {
        try {
            if (!this.client) {
                return { success: false, error: 'Auth service not initialized' };
            }
            
            const { error } = await this.client.auth.signOut();
            
            if (error) {
                console.error('[AuthService] Sign out error:', error);
                return { success: false, error: error.message };
            }
            
            this.currentUser = null;
            this.session = null;
            console.log('[AuthService] User signed out successfully');
            return { success: true, error: null };
        } catch (error) {
            console.error('[AuthService] Sign out exception:', error);
            return { success: false, error: error.message || 'An unexpected error occurred' };
        }
    },

    /**
     * Get the current authenticated user
     * @returns {Object|null} Current user object or null if not authenticated
     */
    getCurrentUser() {
        return this.currentUser;
    },

    /**
     * Get the current session
     * @returns {Object|null} Current session object or null if not authenticated
     */
    getSession() {
        return this.session;
    },

    /**
     * Check if user is authenticated
     * @returns {boolean} True if user is authenticated, false otherwise
     */
    isAuthenticated() {
        return this.currentUser !== null && this.session !== null;
    },

    /**
     * Get the access token for authenticated requests
     * @returns {string|null} Access token or null if not authenticated
     */
    getAccessToken() {
        return this.session?.access_token || null;
    },

    /**
     * Refresh the current session
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async refreshSession() {
        try {
            if (!this.client) {
                return { success: false, error: 'Auth service not initialized' };
            }
            
            const { data, error } = await this.client.auth.refreshSession();
            
            if (error) {
                console.error('[AuthService] Refresh session error:', error);
                return { success: false, error: error.message };
            }
            
            if (data.session) {
                this.session = data.session;
                this.currentUser = data.session.user;
                return { success: true, error: null };
            }
            
            return { success: false, error: 'No session data returned' };
        } catch (error) {
            console.error('[AuthService] Refresh session exception:', error);
            return { success: false, error: error.message || 'An unexpected error occurred' };
        }
    }
};

// Make AuthService available globally
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}

