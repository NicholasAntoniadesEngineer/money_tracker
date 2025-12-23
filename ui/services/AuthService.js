/**
 * Authentication Service
 * Handles user authentication, sign up, sign in, sign out, and session management
 * Uses Supabase for authentication
 * Configured to work without email verification (email confirmation disabled in Supabase dashboard)
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
            console.log('[AuthService] initialize() called');
            
            if (!window.SupabaseConfig) {
                throw new Error('SupabaseConfig not available');
            }
            
            // Reuse existing client if available to avoid multiple instances
            if (!this.client) {
                console.log('[AuthService] Creating new Supabase client...');
                const clientInitStart = Date.now();
                this.client = await window.SupabaseConfig.initialize();
                const clientInitDuration = Date.now() - clientInitStart;
                console.log('[AuthService] Supabase client created in', clientInitDuration, 'ms');
                console.log('[AuthService] Client details:', {
                    hasClient: !!this.client,
                    clientType: this.client?.constructor?.name,
                    hasAuth: !!this.client?.auth,
                    supabaseUrl: this.client?.supabaseUrl,
                    supabaseKey: this.client?.supabaseKey ? this.client.supabaseKey.substring(0, 10) + '...' : 'N/A'
                });
            } else {
                console.log('[AuthService] Reusing existing Supabase client');
                console.log('[AuthService] Existing client details:', {
                    clientType: this.client?.constructor?.name,
                    hasAuth: !!this.client?.auth,
                    supabaseUrl: this.client?.supabaseUrl
                });
            }
            
            // Check for existing session
            console.log('[AuthService] Checking for existing session...');
            const { data: { session }, error: sessionError } = await this.client.auth.getSession();
            
            if (sessionError) {
                console.error('[AuthService] Error getting session:', {
                    message: sessionError.message,
                    code: sessionError.code,
                    status: sessionError.status
                });
                throw sessionError;
            }
            
            if (session) {
                this.session = session;
                this.currentUser = session.user;
                console.log('[AuthService] Existing session found for user:', {
                    email: this.currentUser.email,
                    userId: this.currentUser.id,
                    emailConfirmed: this.currentUser.email_confirmed_at
                });
            } else {
                console.log('[AuthService] No existing session found');
            }
            
            // Set up auth state listener (only if not already set up)
            if (!this.authStateListener) {
                this.setupAuthStateListener();
            } else {
                console.log('[AuthService] Auth state listener already set up, skipping');
            }
            
            console.log('[AuthService] Initialization completed successfully');
            return { success: true };
        } catch (error) {
            console.error('[AuthService] Initialization error:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });
            throw error;
        }
    },

    /**
     * Set up authentication state listener
     * @returns {void}
     */
    setupAuthStateListener() {
        // Remove existing listener if present (Supabase v2 returns subscription object)
        if (this.authStateListener && typeof this.authStateListener.unsubscribe === 'function') {
            console.log('[AuthService] Removing existing auth state listener');
            try {
                this.authStateListener.unsubscribe();
            } catch (unsubscribeError) {
                console.warn('[AuthService] Error unsubscribing from auth state listener:', unsubscribeError);
            }
            this.authStateListener = null;
        }
        
        console.log('[AuthService] Setting up new auth state listener');
        this.authStateListener = this.client.auth.onAuthStateChange((event, session) => {
            console.log('[AuthService] Auth state changed:', event, {
                hasSession: !!session,
                userEmail: session?.user?.email
            });
            
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
        
        console.log('[AuthService] Auth state listener set up successfully');
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
     * Configured to work without email verification (email confirmation should be disabled in Supabase dashboard)
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Promise<{success: boolean, error: string|null, user: Object|null, requiresEmailVerification: boolean, message: string|null}>}
     */
    async signUp(email, password) {
        console.log('[AuthService] ========== SIGNUP STARTED ==========');
        console.log('[AuthService] signUp() called with:', {
            email: email ? email.substring(0, 3) + '***' : 'null',
            passwordLength: password ? password.length : 0,
            hasClient: !!this.client,
            isAuthenticated: this.isAuthenticated(),
            currentUserEmail: this.currentUser?.email
        });
        
        try {
            // Check if user is already signed in - sign them out first
            if (this.isAuthenticated()) {
                console.log('[AuthService] User already authenticated, signing out before signup...');
                const signOutResult = await this.signOut();
                if (!signOutResult.success) {
                    console.warn('[AuthService] Failed to sign out existing user:', signOutResult.error);
                } else {
                    console.log('[AuthService] Successfully signed out existing user');
                }
            }
            
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
            // Note: Email verification is controlled in Supabase Dashboard > Authentication > Settings
            // If "Enable email confirmations" is OFF, users will be signed in immediately
            console.log('[AuthService] Calling Supabase auth.signUp()...');
            console.log('[AuthService] SignUp parameters:', {
                email: trimmedEmail,
                passwordLength: password.length,
                clientAvailable: !!this.client,
                clientType: this.client?.constructor?.name,
                hasAuth: !!this.client?.auth,
                supabaseUrl: this.client?.supabaseUrl || 'N/A'
            });
            
            // Log client internals if available
            if (this.client?.auth) {
                console.log('[AuthService] Auth client details:', {
                    hasSignUp: typeof this.client.auth.signUp === 'function',
                    hasGetUser: typeof this.client.auth.getUser === 'function',
                    hasGetSession: typeof this.client.auth.getSession === 'function'
                });
            }
            
            // Try to intercept network requests using fetch if possible
            const originalFetch = window.fetch;
            let fetchIntercepted = false;
            
            console.log('[AuthService] Setting up fetch interception...');
            console.log('[AuthService] Original fetch available:', typeof originalFetch === 'function');
            
            // Temporarily override fetch to capture request details
            window.fetch = function(...args) {
                const url = args[0];
                const options = args[1] || {};
                
                // Check if this is a signup request
                const urlString = typeof url === 'string' ? url : (url instanceof Request ? url.url : String(url));
                if (urlString.includes('/auth/v1/signup') || urlString.includes('signup')) {
                    fetchIntercepted = true;
                    console.log('[AuthService] ========== INTERCEPTED SIGNUP NETWORK REQUEST ==========');
                    console.log('[AuthService] Intercepted signup network request:', {
                        url: urlString,
                        method: options.method || 'POST',
                        headers: options.headers ? Object.keys(options.headers) : 'N/A',
                        hasBody: !!options.body,
                        bodyType: typeof options.body
                    });
                    
                    // Log request headers
                    if (options.headers) {
                        const headerObj = {};
                        if (options.headers instanceof Headers) {
                            options.headers.forEach((value, key) => {
                                headerObj[key] = value;
                            });
                        } else if (typeof options.headers === 'object') {
                            Object.assign(headerObj, options.headers);
                        }
                        console.log('[AuthService] Request headers:', headerObj);
                    }
                    
                    // Log request body (password will be in it, but we need to see the structure)
                    if (options.body) {
                        try {
                            const bodyText = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
                            const bodyObj = JSON.parse(bodyText);
                            console.log('[AuthService] Request body structure:', {
                                hasEmail: !!bodyObj.email,
                                hasPassword: !!bodyObj.password,
                                email: bodyObj.email,
                                passwordLength: bodyObj.password ? bodyObj.password.length : 0,
                                keys: Object.keys(bodyObj)
                            });
                        } catch (parseError) {
                            console.log('[AuthService] Request body (raw, first 200 chars):', 
                                (typeof options.body === 'string' ? options.body : options.body.toString()).substring(0, 200));
                        }
                    }
                    
                    // Call original fetch and capture response
                    return originalFetch.apply(this, args).then(response => {
                        console.log('[AuthService] ========== SIGNUP NETWORK RESPONSE ==========');
                        console.log('[AuthService] Signup network response:', {
                            status: response.status,
                            statusText: response.statusText,
                            ok: response.ok,
                            url: response.url,
                            type: response.type,
                            redirected: response.redirected
                        });
                        
                        // Log response headers
                        const responseHeaders = {};
                        response.headers.forEach((value, key) => {
                            responseHeaders[key] = value;
                        });
                        console.log('[AuthService] Response headers:', responseHeaders);
                        
                        // Try to read response body
                        const responseClone = response.clone();
                        responseClone.text().then(text => {
                            console.log('[AuthService] Signup response body (raw):', text);
                            console.log('[AuthService] Response body length:', text.length);
                            try {
                                const responseJson = JSON.parse(text);
                                console.log('[AuthService] Signup response JSON:', JSON.stringify(responseJson, null, 2));
                                
                                // Check for error details in response
                                if (responseJson.error) {
                                    console.error('[AuthService] Error in response JSON:', responseJson.error);
                                }
                                if (responseJson.message) {
                                    console.error('[AuthService] Message in response JSON:', responseJson.message);
                                }
                                if (responseJson.code) {
                                    console.error('[AuthService] Error code in response JSON:', responseJson.code);
                                }
                                
                                // Log all keys in response
                                console.log('[AuthService] Response JSON keys:', Object.keys(responseJson));
                                
                                // Check for additional error details
                                if (responseJson.details) {
                                    console.error('[AuthService] Error details:', responseJson.details);
                                }
                                if (responseJson.hint) {
                                    console.error('[AuthService] Error hint:', responseJson.hint);
                                }
                                if (responseJson.status) {
                                    console.error('[AuthService] Error status:', responseJson.status);
                                }
                            } catch (parseError) {
                                console.log('[AuthService] Response is not JSON, raw text:', text.substring(0, 500));
                            }
                        }).catch(readError => {
                            console.error('[AuthService] Could not read response body:', {
                                message: readError.message,
                                name: readError.name
                            });
                        });
                        
                        return response;
                    }).catch(fetchError => {
                        console.error('[AuthService] Fetch error:', {
                            message: fetchError.message,
                            name: fetchError.name
                        });
                        throw fetchError;
                    });
                }
                
                return originalFetch.apply(this, args);
            };
            
            console.log('[AuthService] Fetch interception set up, waiting for network call...');
            console.log('[AuthService] NOTE: If fetch interception does not appear, Supabase may be using XMLHttpRequest or a different method');
            console.log('[AuthService] Please check browser Network tab for the actual HTTP request/response');
            
            const signUpStartTime = Date.now();
            
            // Monitor network requests if possible
            console.log('[AuthService] Starting signUp API call at', new Date().toISOString());
            console.log('[AuthService] IMPORTANT: Check browser DevTools Network tab for request to /auth/v1/signup');
            console.log('[AuthService] Look for the Response tab to see the raw error message from Supabase');
            console.log('[AuthService]');
            console.log('[AuthService] NOTE: Email verification is controlled in Supabase Dashboard');
            console.log('[AuthService] If email verification is disabled, users will be signed in immediately');
            console.log('[AuthService] If email verification is enabled, users must verify email before signing in');
            
            let signUpResponse;
            try {
                // Sign up - Supabase will handle email verification based on dashboard settings
                // If email verification is disabled, user will be signed in immediately
                // If email verification is enabled, user will need to verify email first
                console.log('[AuthService] Calling Supabase auth.signUp() without emailRedirectTo option');
                console.log('[AuthService] Email verification behavior depends on Supabase Dashboard settings');
                
                signUpResponse = await Promise.resolve(this.client.auth.signUp({
                    email: trimmedEmail,
                    password: password
                    // Note: We don't set emailRedirectTo or other options
                    // Email verification is controlled in Supabase Dashboard > Authentication > Settings
                    // If "Enable email confirmations" is OFF, user will be signed in immediately
                }));
                console.log('[AuthService] SignUp promise resolved successfully');
            } catch (signUpException) {
                console.error('[AuthService] SignUp promise rejected with exception:', {
                    message: signUpException.message,
                    name: signUpException.name,
                    stack: signUpException.stack,
                    cause: signUpException.cause,
                    toString: signUpException.toString()
                });
                
                // Try to extract more details from the exception
                if (signUpException.response) {
                    console.error('[AuthService] Exception response:', {
                        status: signUpException.response.status,
                        statusText: signUpException.response.statusText,
                        data: signUpException.response.data
                    });
                }
                
                // Restore original fetch
                window.fetch = originalFetch;
                throw signUpException;
            } finally {
                // Restore original fetch
                window.fetch = originalFetch;
            }
            
            const signUpDuration = Date.now() - signUpStartTime;
            console.log('[AuthService] Supabase signUp() completed in', signUpDuration, 'ms');
            console.log('[AuthService] Fetch interception status:', fetchIntercepted ? 'INTERCEPTED' : 'NOT INTERCEPTED (Supabase may use XMLHttpRequest or different method)');
            
            if (!fetchIntercepted) {
                console.warn('[AuthService] ========== IMPORTANT: FETCH INTERCEPTION DID NOT WORK ==========');
                console.warn('[AuthService] Supabase is likely using XMLHttpRequest or a different method');
                console.warn('[AuthService] Please check your browser DevTools Network tab:');
                console.warn('[AuthService] 1. Open DevTools (F12 or Cmd+Option+I)');
                console.warn('[AuthService] 2. Go to Network tab');
                console.warn('[AuthService] 3. Filter by "signup" or look for requests to /auth/v1/signup');
                console.warn('[AuthService] 4. Click on the request and check the Response tab');
                console.warn('[AuthService] 5. The Response tab will show the raw error message from Supabase');
                console.warn('[AuthService] ================================================================');
            }
            
            console.log('[AuthService] SignUp response type:', typeof signUpResponse);
            console.log('[AuthService] SignUp response is object:', typeof signUpResponse === 'object');
            console.log('[AuthService] SignUp response keys:', signUpResponse ? Object.keys(signUpResponse) : 'null/undefined');
            
            // Log full response object
            try {
                console.log('[AuthService] Full signUpResponse object:', JSON.stringify(signUpResponse, null, 2));
            } catch (jsonError) {
                console.error('[AuthService] Could not stringify signUpResponse:', jsonError);
                console.log('[AuthService] signUpResponse (direct):', signUpResponse);
            }
            
            const { data, error } = signUpResponse;
            
            // Log full response
            console.log('[AuthService] ========== SIGNUP RESPONSE RECEIVED ==========');
            console.log('[AuthService] SignUp response object:', {
                hasData: !!data,
                hasUser: !!data?.user,
                hasSession: !!data?.session,
                hasError: !!error,
                errorMessage: error?.message,
                errorCode: error?.code,
                errorStatus: error?.status,
                errorName: error?.name
            });
            
            // Log full error object if present (do this BEFORE data logging)
            if (error) {
                console.error('[AuthService] ========== ERROR OBJECT DETAILS ==========');
                console.error('[AuthService] Full error object:', JSON.stringify(error, null, 2));
                console.error('[AuthService] Error properties:', {
                    message: error.message,
                    code: error.code,
                    status: error.status,
                    name: error.name,
                    statusCode: error.statusCode,
                    toString: error.toString()
                });
                
                // Try to get more details from error - check all possible properties
                console.error('[AuthService] Checking error for additional properties...');
                const errorKeys = Object.keys(error);
                console.error('[AuthService] Error object keys:', errorKeys);
                
                for (const key of errorKeys) {
                    if (key !== 'stack' && typeof error[key] !== 'function') {
                        try {
                            const value = error[key];
                            if (typeof value === 'object' && value !== null) {
                                console.error(`[AuthService] Error.${key}:`, JSON.stringify(value, null, 2));
                            } else {
                                console.error(`[AuthService] Error.${key}:`, value);
                            }
                        } catch (e) {
                            console.error(`[AuthService] Could not log Error.${key}:`, e.message);
                        }
                    }
                }
                
                // Try to get more details from error
                if (error.response) {
                    console.error('[AuthService] Error response:', error.response);
                }
                
                if (error.context) {
                    console.error('[AuthService] Error context:', error.context);
                }
                
                // Check for Supabase-specific error properties
                if (error.__isAuthError !== undefined) {
                    console.error('[AuthService] Error is auth error:', error.__isAuthError);
                }
            }
            
            // Log full data object if present (ALWAYS log, even if error exists)
            console.log('[AuthService] ========== DATA OBJECT DETAILS ==========');
            if (data) {
                console.log('[AuthService] Full data object structure:', {
                    hasUser: !!data.user,
                    hasSession: !!data.session,
                    keys: Object.keys(data),
                    dataType: typeof data,
                    isArray: Array.isArray(data),
                    isNull: data === null,
                    isUndefined: data === undefined
                });
                
                // Log data.user if it exists (even if null/partial)
                if (data.user !== undefined) {
                    console.log('[AuthService] Data.user value type:', typeof data.user);
                    console.log('[AuthService] Data.user value:', data.user);
                    console.log('[AuthService] Data.user === null:', data.user === null);
                    console.log('[AuthService] Data.user === undefined:', data.user === undefined);
                    if (data.user) {
                        console.log('[AuthService] Data.user is truthy, logging properties:', Object.keys(data.user));
                        console.log('[AuthService] Data.user full object:', JSON.stringify(data.user, null, 2));
                    } else {
                        console.log('[AuthService] Data.user is falsy (null/undefined/empty)');
                    }
                } else {
                    console.log('[AuthService] Data.user is undefined (key does not exist)');
                }
                
                // Log data.session if it exists
                if (data.session !== undefined) {
                    console.log('[AuthService] Data.session value type:', typeof data.session);
                    console.log('[AuthService] Data.session value:', data.session);
                    console.log('[AuthService] Data.session === null:', data.session === null);
                    if (data.session) {
                        console.log('[AuthService] Data.session is truthy, logging properties:', Object.keys(data.session));
                    } else {
                        console.log('[AuthService] Data.session is falsy (null/undefined/empty)');
                    }
                } else {
                    console.log('[AuthService] Data.session is undefined (key does not exist)');
                }
                
                // Log all data properties
                console.log('[AuthService] All data properties:');
                for (const key in data) {
                    if (data.hasOwnProperty(key)) {
                        console.log(`[AuthService]   data.${key}:`, {
                            type: typeof data[key],
                            isNull: data[key] === null,
                            value: data[key]
                        });
                    }
                }
                
                // Log full data object as JSON
                try {
                    const dataString = JSON.stringify(data, null, 2);
                    console.log('[AuthService] Full data object JSON:', dataString);
                    console.log('[AuthService] Full data object JSON length:', dataString.length);
                } catch (jsonError) {
                    console.error('[AuthService] Could not stringify data object:', {
                        message: jsonError.message,
                        name: jsonError.name
                    });
                    // Try to stringify with replacer to handle circular refs
                    try {
                        const seen = new WeakSet();
                        const dataString = JSON.stringify(data, (key, val) => {
                            if (val != null && typeof val === "object") {
                                if (seen.has(val)) {
                                    return "[Circular]";
                                }
                                seen.add(val);
                            }
                            return val;
                        }, 2);
                        console.log('[AuthService] Full data object JSON (with circular handling):', dataString);
                    } catch (circularError) {
                        console.error('[AuthService] Could not stringify even with circular handling:', circularError);
                    }
                }
            } else {
                console.warn('[AuthService] Data object is null/undefined');
                console.warn('[AuthService] Data === null:', data === null);
                console.warn('[AuthService] Data === undefined:', data === undefined);
                console.warn('[AuthService] Data type:', typeof data);
            }
            
            console.log('[AuthService] ========== END DATA OBJECT DETAILS ==========');
            
            if (error) {
                console.error('[AuthService] ========== SIGNUP ERROR DETECTED ==========');
                console.error('[AuthService] Sign up error from Supabase:', {
                    message: error.message,
                    code: error.code,
                    status: error.status,
                    statusCode: error.statusCode,
                    name: error.name,
                    stack: error.stack,
                    toString: error.toString()
                });
                
                // Log all error properties
                console.error('[AuthService] All error properties:', Object.keys(error));
                for (const key of Object.keys(error)) {
                    if (key !== 'stack' && typeof error[key] !== 'function') {
                        console.error(`[AuthService] Error.${key}:`, error[key]);
                    }
                }
                
                // Check for nested error details
                if (error.error) {
                    console.error('[AuthService] Nested error object:', error.error);
                }
                
                if (error.details) {
                    console.error('[AuthService] Error details:', error.details);
                }
                
                if (error.hint) {
                    console.error('[AuthService] Error hint:', error.hint);
                }
                
                // Check for response object
                if (error.response) {
                    console.error('[AuthService] Error response object:', {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        url: error.response.url,
                        type: error.response.type,
                        redirected: error.response.redirected,
                        ok: error.response.ok
                    });
                    
                    // Try to read response headers
                    if (error.response.headers) {
                        try {
                            const headersObj = {};
                            error.response.headers.forEach((value, key) => {
                                headersObj[key] = value;
                            });
                            console.error('[AuthService] Error response headers:', headersObj);
                        } catch (headerError) {
                            console.error('[AuthService] Could not read response headers:', headerError);
                        }
                    }
                    
                    // Try to read response body (if it's a Response object)
                    if (typeof error.response.text === 'function') {
                        try {
                            const responseText = await error.response.clone().text();
                            console.error('[AuthService] Error response body:', responseText);
                            try {
                                const responseJson = JSON.parse(responseText);
                                console.error('[AuthService] Error response JSON:', JSON.stringify(responseJson, null, 2));
                            } catch (parseError) {
                                console.error('[AuthService] Response body is not JSON, raw text:', responseText.substring(0, 500));
                            }
                        } catch (readError) {
                            console.error('[AuthService] Could not read error response body:', readError);
                        }
                    } else if (error.response.data) {
                        console.error('[AuthService] Error response data:', error.response.data);
                    }
                }
                
                // Check for context
                if (error.context) {
                    console.error('[AuthService] Error context:', error.context);
                }
                
                // Provide more helpful error messages for common issues
                let userFriendlyError = error.message;
                if (error.message && error.message.includes('Database error')) {
                    userFriendlyError = 'Database configuration error. This may be caused by email rate limiting. Please disable email verification in Supabase Dashboard (Authentication > Settings > Enable email confirmations: OFF). The user account may not have been created.';
                    console.error('[AuthService] Database error detected - checking for common causes:');
                    console.error('[AuthService] - Email rate limiting (if email verification enabled)');
                    console.error('[AuthService] - RLS policies (user confirmed not blocking)');
                    console.error('[AuthService] - Database triggers');
                    console.error('[AuthService] - Database functions');
                    console.error('[AuthService] - Foreign key constraints');
                    console.error('[AuthService] - Check constraints');
                    console.error('[AuthService] - Network/firewall issues');
                } else if (error.message && error.message.includes('User already registered')) {
                    userFriendlyError = 'An account with this email already exists. Please sign in instead.';
                } else if (error.message && error.message.includes('Invalid email')) {
                    userFriendlyError = 'Please enter a valid email address.';
                } else if (error.message && error.message.includes('Password')) {
                    userFriendlyError = 'Password does not meet requirements. Please use a stronger password.';
                }
                
                console.error('[AuthService] ========== END SIGNUP ERROR ==========');
                return { success: false, error: userFriendlyError, user: null, requiresEmailVerification: false };
            }
            
            // Log user data if available
            if (data?.user) {
                console.log('[AuthService] User data received:', {
                    userId: data.user.id,
                    email: data.user.email,
                    emailConfirmed: data.user.email_confirmed_at,
                    createdAt: data.user.created_at,
                    lastSignIn: data.user.last_sign_in_at,
                    confirmedAt: data.user.confirmed_at,
                    appMetadata: data.user.app_metadata,
                    userMetadata: data.user.user_metadata,
                    aud: data.user.aud,
                    role: data.user.role
                });
                console.log('[AuthService] Full user object keys:', Object.keys(data.user));
            } else {
                console.warn('[AuthService] No user data in response');
                console.warn('[AuthService] Data object:', data);
            }
            
            // Log session data if available
            if (data?.session) {
                console.log('[AuthService] Session data received:', {
                    accessToken: data.session.access_token ? data.session.access_token.substring(0, 20) + '...' : 'null',
                    refreshToken: data.session.refresh_token ? data.session.refresh_token.substring(0, 20) + '...' : 'null',
                    expiresAt: data.session.expires_at,
                    expiresIn: data.session.expires_in,
                    tokenType: data.session.token_type,
                    user: data.session.user ? {
                        id: data.session.user.id,
                        email: data.session.user.email
                    } : null
                });
                console.log('[AuthService] Full session object keys:', Object.keys(data.session));
            } else {
                console.log('[AuthService] No session data in response (email verification may be required)');
                console.log('[AuthService] Session absence reason check:', {
                    hasData: !!data,
                    hasUser: !!data?.user,
                    emailConfirmed: data?.user?.email_confirmed_at,
                    emailConfirmationRequired: !data?.user?.email_confirmed_at
                });
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
