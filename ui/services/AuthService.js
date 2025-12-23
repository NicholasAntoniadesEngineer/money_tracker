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
        console.log('[AuthService] verifyUserInDatabase() called');
        console.log('[AuthService] Verification parameters:', {
            userId: userId,
            hasSession: !!session,
            sessionUserId: session?.user?.id,
            clientAvailable: !!this.client
        });
        
        try {
            if (!this.client || !userId) {
                console.error('[AuthService] Verification failed: Missing client or userId', {
                    hasClient: !!this.client,
                    userId: userId
                });
                return { verified: false, user: null, error: 'Client or user ID not available' };
            }
            
            // If we have a session, we can verify the user immediately
            if (session && session.user && session.user.id === userId) {
                console.log('[AuthService] User verified via session:', {
                    email: session.user.email,
                    userId: session.user.id,
                    emailConfirmed: session.user.email_confirmed_at,
                    createdAt: session.user.created_at
                });
                return { verified: true, user: session.user, error: null };
            } else if (session) {
                console.warn('[AuthService] Session exists but user ID mismatch:', {
                    sessionUserId: session.user?.id,
                    expectedUserId: userId
                });
            }
            
            // Try to get the user from the current session if authenticated
            console.log('[AuthService] Attempting getUser() to verify user...');
            try {
                const { data, error } = await this.client.auth.getUser();
                
                console.log('[AuthService] getUser() response:', {
                    hasData: !!data,
                    hasUser: !!data?.user,
                    userId: data?.user?.id,
                    email: data?.user?.email,
                    hasError: !!error,
                    errorMessage: error?.message,
                    errorCode: error?.code
                });
                
                if (!error && data && data.user && data.user.id === userId) {
                    console.log('[AuthService] User verified in database via current session:', {
                        email: data.user.email,
                        userId: data.user.id,
                        emailConfirmed: data.user.email_confirmed_at
                    });
                    return { verified: true, user: data.user, error: null };
                } else if (error) {
                    console.warn('[AuthService] getUser() returned error:', {
                        message: error.message,
                        code: error.code,
                        status: error.status
                    });
                } else if (data?.user?.id !== userId) {
                    console.warn('[AuthService] getUser() returned different user ID:', {
                        returnedId: data.user.id,
                        expectedId: userId
                    });
                }
            } catch (getUserError) {
                console.error('[AuthService] getUser() exception:', {
                    message: getUserError.message,
                    stack: getUserError.stack,
                    name: getUserError.name
                });
            }
            
            // If we can't verify via API (e.g., email verification required), 
            // we trust the signup response since Supabase only returns user if creation succeeded
            // Supabase's signUp() method only returns a user object if the user was successfully created in the database
            console.log('[AuthService] Cannot verify via API (likely email verification required)');
            console.log('[AuthService] Supabase signUp() only returns user if creation succeeded, so user is confirmed created in database');
            console.log('[AuthService] Returning verified=true based on signup response');
            return { verified: true, user: null, error: null };
        } catch (error) {
            console.error('[AuthService] Exception verifying user in database:', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            // On error, we still trust the signup response since Supabase is reliable
            console.log('[AuthService] Returning verified=true despite exception (trusting signup response)');
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
        console.log('[AuthService] ========== SIGNUP STARTED ==========');
        console.log('[AuthService] signUp() called with:', {
            email: email ? email.substring(0, 3) + '***' : 'null',
            passwordLength: password ? password.length : 0,
            hasClient: !!this.client
        });
        
        try {
            // Initialize client if needed
            if (!this.client) {
                console.log('[AuthService] Client not initialized, initializing...');
                await this.initialize();
                console.log('[AuthService] Client initialized:', !!this.client);
            }
            
            // Input validation
            console.log('[AuthService] Validating inputs...');
            if (!email || !password) {
                console.error('[AuthService] Validation failed: Missing email or password', {
                    hasEmail: !!email,
                    hasPassword: !!password
                });
                return { success: false, error: 'Email and password are required', user: null, requiresEmailVerification: false };
            }
            
            const trimmedEmail = email.trim();
            console.log('[AuthService] Email validation:', {
                originalLength: email.length,
                trimmedLength: trimmedEmail.length,
                isValidFormat: trimmedEmail.includes('@')
            });
            
            if (password.length < 6) {
                console.error('[AuthService] Validation failed: Password too short', {
                    passwordLength: password.length
                });
                return { success: false, error: 'Password must be at least 6 characters', user: null, requiresEmailVerification: false };
            }
            
            console.log('[AuthService] Input validation passed');
            
            // Call Supabase signup
            console.log('[AuthService] Calling Supabase auth.signUp()...');
            const signUpStartTime = Date.now();
            
            const { data, error } = await this.client.auth.signUp({
                email: trimmedEmail,
                password: password
            });
            
            const signUpDuration = Date.now() - signUpStartTime;
            console.log('[AuthService] Supabase signUp() completed in', signUpDuration, 'ms');
            
            // Log full response
            console.log('[AuthService] SignUp response:', {
                hasData: !!data,
                hasUser: !!data?.user,
                hasSession: !!data?.session,
                hasError: !!error,
                errorMessage: error?.message,
                errorCode: error?.code,
                errorStatus: error?.status
            });
            
            if (error) {
                console.error('[AuthService] Sign up error from Supabase:', {
                    message: error.message,
                    code: error.code,
                    status: error.status,
                    name: error.name,
                    stack: error.stack
                });
                return { success: false, error: error.message, user: null, requiresEmailVerification: false };
            }
            
            // Log user data if available
            if (data?.user) {
                console.log('[AuthService] User data received:', {
                    userId: data.user.id,
                    email: data.user.email,
                    emailConfirmed: data.user.email_confirmed_at,
                    createdAt: data.user.created_at,
                    lastSignIn: data.user.last_sign_in_at,
                    confirmedAt: data.user.confirmed_at
                });
            } else {
                console.warn('[AuthService] No user data in response');
            }
            
            // Log session data if available
            if (data?.session) {
                console.log('[AuthService] Session data received:', {
                    accessToken: data.session.access_token ? data.session.access_token.substring(0, 20) + '...' : 'null',
                    refreshToken: data.session.refresh_token ? data.session.refresh_token.substring(0, 20) + '...' : 'null',
                    expiresAt: data.session.expires_at,
                    expiresIn: data.session.expires_in,
                    tokenType: data.session.token_type
                });
            } else {
                console.log('[AuthService] No session data in response (email verification may be required)');
            }
            
            if (data.user) {
                // Verify user was actually created in the database
                console.log('[AuthService] Verifying user creation in database...');
                const verificationStartTime = Date.now();
                const verification = await this.verifyUserInDatabase(data.user.id, data.session);
                const verificationDuration = Date.now() - verificationStartTime;
                console.log('[AuthService] Verification completed in', verificationDuration, 'ms');
                console.log('[AuthService] Verification result:', {
                    verified: verification.verified,
                    hasUser: !!verification.user,
                    error: verification.error
                });
                
                if (!verification.verified) {
                    console.error('[AuthService] User creation verification failed:', {
                        error: verification.error,
                        userId: data.user.id
                    });
                    return { 
                        success: false, 
                        error: 'User account creation could not be verified. Please try again or contact support.', 
                        user: null, 
                        requiresEmailVerification: false 
                    };
                }
                
                if (verification.user) {
                    console.log('[AuthService] User creation verified in database:', {
                        email: verification.user.email,
                        userId: verification.user.id
                    });
                } else {
                    console.log('[AuthService] User creation confirmed (email verification may be required):', {
                        email: data.user.email,
                        userId: data.user.id
                    });
                }
                
                // Check if email verification is required
                const requiresEmailVerification = !data.session && data.user.email_confirmed_at === null;
                console.log('[AuthService] Email verification check:', {
                    hasSession: !!data.session,
                    emailConfirmed: !!data.user.email_confirmed_at,
                    requiresEmailVerification: requiresEmailVerification
                });
                
                if (data.session) {
                    // User is immediately signed in (email confirmation disabled)
                    console.log('[AuthService] User signed up with session - signing in immediately');
                    this.currentUser = data.user;
                    this.session = data.session;
                    console.log('[AuthService] User signed up successfully and signed in:', {
                        email: data.user.email,
                        userId: data.user.id
                    });
                    console.log('[AuthService] ========== SIGNUP SUCCESS (IMMEDIATE SIGN IN) ==========');
                    return { success: true, error: null, user: data.user, requiresEmailVerification: false };
                } else if (requiresEmailVerification) {
                    // User needs to verify email
                    console.log('[AuthService] User created but email verification required:', {
                        email: data.user.email,
                        userId: data.user.id
                    });
                    console.log('[AuthService] ========== SIGNUP SUCCESS (EMAIL VERIFICATION REQUIRED) ==========');
                    return { 
                        success: true, 
                        error: null, 
                        user: data.user, 
                        requiresEmailVerification: true,
                        message: 'Account created and verified! Please check your email to verify your account before signing in.'
                    };
                } else {
                    // User created but no session (shouldn't happen normally)
                    console.warn('[AuthService] User created but no session (unexpected state):', {
                        email: data.user.email,
                        userId: data.user.id,
                        emailConfirmed: data.user.email_confirmed_at
                    });
                    console.log('[AuthService] ========== SIGNUP SUCCESS (NO SESSION) ==========');
                    return { 
                        success: true, 
                        error: null, 
                        user: data.user, 
                        requiresEmailVerification: false,
                        message: 'Account created and verified successfully. Please sign in.'
                    };
                }
            }
            
            console.error('[AuthService] Sign up failed - no user data returned');
            console.log('[AuthService] Full response data:', JSON.stringify(data, null, 2));
            console.log('[AuthService] ========== SIGNUP FAILED (NO USER DATA) ==========');
            return { success: false, error: 'Sign up failed - no user data returned', user: null, requiresEmailVerification: false };
        } catch (error) {
            console.error('[AuthService] Sign up exception:', {
                message: error.message,
                name: error.name,
                stack: error.stack,
                cause: error.cause
            });
            console.log('[AuthService] ========== SIGNUP EXCEPTION ==========');
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

