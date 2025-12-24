/**
 * Database Service
 * Main service layer for all database operations using Supabase
 * Replaces localStorage and FileService
 * 
 * ARCHITECTURE:
 * - All database operations go through a centralized query interface
 * - Currently uses direct fetch (native fetch API) due to Supabase JS client hanging
 * - To switch implementations, only modify the query methods below
 * - This ensures reliable, always-fresh data from Supabase
 */

const DatabaseService = {
    client: null,
    monthsCache: null,
    cacheTimestamp: null,
    CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    CACHE_STORAGE_KEY: 'money_tracker_months_cache',
    CACHE_TIMESTAMP_KEY: 'money_tracker_cache_timestamp',
    EXAMPLE_YEAR: 2045, // Example data year - protected from deletion
    
    /**
     * ============================================================================
     * CENTRALIZED DATABASE QUERY INTERFACE
     * ============================================================================
     * All database operations go through these methods.
     * To change how we interact with Supabase, modify ONLY these methods.
     * ============================================================================
     */
    
    /**
     * Get the current authenticated user ID
     * @returns {string|null} User ID or null if not authenticated
     * @throws {Error} If AuthService is not available
     */
    _getCurrentUserId() {
        if (!window.AuthService) {
            throw new Error('AuthService not available - cannot get current user ID');
        }
        
        if (!window.AuthService.isAuthenticated()) {
            return null;
        }
        
        const currentUser = window.AuthService.getCurrentUser();
        if (!currentUser || !currentUser.id) {
            return null;
        }
        
        return currentUser.id;
    },
    
    /**
     * Get authentication headers for database requests
     * Uses authenticated user token if available, otherwise falls back to API key
     * @returns {Object} Headers object with apikey and Authorization
     */
    _getAuthHeaders() {
        let authToken = this.client.supabaseKey;
        
        // Try to get authenticated user token from AuthService
        if (window.AuthService && window.AuthService.isAuthenticated()) {
            const accessToken = window.AuthService.getAccessToken();
            if (accessToken) {
                authToken = accessToken;
            }
        }
        
        return {
            'apikey': this.client.supabaseKey,
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
    },
    
    /**
     * Execute a SELECT query
     * @param {string} table - Table name
     * @param {Object} options - Query options
     * @returns {Promise<{data: Array|null, error: Object|null}>}
     */
    async querySelect(table, options = {}) {
        const url = new URL(`${this.client.supabaseUrl}/rest/v1/${table}`);
        
        // Add query parameters
        if (options.select) {
            url.searchParams.append('select', options.select);
        }
        if (options.filter) {
            Object.entries(options.filter).forEach(([key, value]) => {
                url.searchParams.append(key, `eq.${value}`);
            });
        }
        if (options.order) {
            options.order.forEach(({ column, ascending }) => {
                url.searchParams.append('order', `${column}.${ascending ? 'asc' : 'desc'}`);
            });
        }
        if (options.limit) {
            url.searchParams.append('limit', options.limit);
        }
        
        console.log(`[DatabaseService] querySelect URL: ${url.toString()}`);
        
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: this._getAuthHeaders()
        });
        
        console.log(`[DatabaseService] querySelect response status: ${response.status} ${response.statusText}`);
        
        const result = await this._handleResponse(response);
        console.log(`[DatabaseService] querySelect result:`, {
            hasData: result.data !== null && result.data !== undefined,
            dataType: typeof result.data,
            isArray: Array.isArray(result.data),
            dataLength: Array.isArray(result.data) ? result.data.length : 'N/A',
            hasError: result.error !== null
        });
        
        return result;
    },
    
    /**
     * Execute an INSERT/UPSERT operation
     * @param {string} table - Table name
     * @param {Object|Array} data - Data to insert/upsert
     * @param {Object} options - Upsert options (onConflict, etc.)
     * @returns {Promise<{data: Array|null, error: Object|null}>}
     */
    async queryUpsert(table, data, options = {}) {
        // Try PATCH first (update if exists), then POST (insert if not)
        const { year, month, user_id } = options.filter || {};
        const identifier = options.identifier || 'id';
        const identifierValue = options.identifierValue;
        
        if (year !== undefined && month !== undefined) {
            // For months table - use year/month as identifier
            // For user_months, also include user_id in filter
            const patchUrl = new URL(`${this.client.supabaseUrl}/rest/v1/${table}`);
            patchUrl.searchParams.append('year', `eq.${year}`);
            patchUrl.searchParams.append('month', `eq.${month}`);
            if (user_id !== undefined && table === 'user_months') {
                patchUrl.searchParams.append('user_id', `eq.${user_id}`);
            }
            patchUrl.searchParams.append('select', '*');
            
            let response = await fetch(patchUrl.toString(), {
                method: 'PATCH',
                headers: this._getAuthHeaders(),
                body: JSON.stringify(data)
            });
            
            const patchStatus = response.status;
            const patchStatusText = response.statusText;
            console.log(`[DatabaseService] PATCH response status: ${patchStatus} ${patchStatusText}`);
            
            // Read response body to check if PATCH actually updated anything
            let patchResult = null;
            if (response.ok) {
                const patchText = await response.text();
                console.log(`[DatabaseService] PATCH response body (first 200 chars):`, patchText.substring(0, 200));
                console.log(`[DatabaseService] PATCH response body length:`, patchText.length);
                if (patchText && patchText.trim() !== '' && patchText.trim() !== '[]') {
                    try {
                        const patchData = JSON.parse(patchText);
                        console.log(`[DatabaseService] PATCH returned data:`, Array.isArray(patchData) ? `${patchData.length} items` : 'single object');
                        if (Array.isArray(patchData) && patchData.length > 0) {
                            // PATCH succeeded and returned data
                            patchResult = { data: patchData, error: null };
                        } else if (!Array.isArray(patchData) && patchData) {
                            // Single object returned
                            patchResult = { data: [patchData], error: null };
                        } else {
                            // Empty array - no rows updated, need to POST
                            console.log(`[DatabaseService] PATCH returned empty array - no rows matched, will try POST`);
                        }
                    } catch (e) {
                        console.warn(`[DatabaseService] PATCH response not JSON:`, patchText.substring(0, 100), e);
                    }
                } else {
                    console.log(`[DatabaseService] PATCH returned empty body or empty array - will try POST`);
                }
            }
            
            // If PATCH didn't work or returned empty, try POST for insert
            if (!response.ok || response.status === 404 || !patchResult) {
                console.log(`[DatabaseService] Trying POST for insert...`);
                const postUrl = new URL(`${this.client.supabaseUrl}/rest/v1/${table}`);
                response = await fetch(postUrl.toString(), {
                    method: 'POST',
                    headers: this._getAuthHeaders(),
                    body: JSON.stringify(data)
                });
                const postStatus = response.status;
                const postStatusText = response.statusText;
                console.log(`[DatabaseService] POST response status: ${postStatus} ${postStatusText}`);
                
                // Read POST response body
                if (response.ok) {
                    const postText = await response.text();
                    console.log(`[DatabaseService] POST response body (first 200 chars):`, postText.substring(0, 200));
                    console.log(`[DatabaseService] POST response body length:`, postText.length);
                    if (postText && postText.trim() !== '' && postText.trim() !== '[]') {
                        try {
                            const postData = JSON.parse(postText);
                            console.log(`[DatabaseService] POST returned data:`, Array.isArray(postData) ? `${postData.length} items` : 'single object');
                            patchResult = Array.isArray(postData) ? { data: postData, error: null } : { data: [postData], error: null };
                        } catch (e) {
                            console.warn(`[DatabaseService] POST response not JSON:`, postText.substring(0, 100), e);
                            // Try to parse as error
                            patchResult = await this._handleResponse(new Response(postText, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            }));
                        }
                    } else {
                        console.warn(`[DatabaseService] POST returned empty body or empty array`);
                        // Empty response - might be RLS blocking return representation
                        patchResult = { data: [], error: null };
                    }
                } else {
                    // POST failed - use _handleResponse to get error
                    patchResult = await this._handleResponse(response);
                }
            }
            
            console.log(`[DatabaseService] queryUpsert final result:`, {
                hasData: patchResult && patchResult.data !== null && patchResult.data !== undefined,
                dataType: patchResult && typeof patchResult.data,
                isArray: patchResult && Array.isArray(patchResult.data),
                dataLength: patchResult && Array.isArray(patchResult.data) ? patchResult.data.length : 'N/A',
                hasError: patchResult && patchResult.error !== null,
                error: patchResult && patchResult.error
            });
            
            return patchResult || { data: null, error: { message: 'Upsert failed - no response' } };
            
            const result = await this._handleResponse(response);
            console.log(`[DatabaseService] queryUpsert result:`, {
                hasData: result.data !== null && result.data !== undefined,
                dataType: typeof result.data,
                isArray: Array.isArray(result.data),
                dataLength: Array.isArray(result.data) ? result.data.length : 'N/A',
                hasError: result.error !== null,
                error: result.error
            });
            
            return result;
        } else if (identifierValue !== undefined) {
            // For settings table - use id as identifier
            const patchUrl = new URL(`${this.client.supabaseUrl}/rest/v1/${table}`);
            patchUrl.searchParams.append(identifier, `eq.${identifierValue}`);
            patchUrl.searchParams.append('select', '*');
            
            let response = await fetch(patchUrl.toString(), {
                method: 'PATCH',
                headers: this._getAuthHeaders(),
                body: JSON.stringify(data)
            });
            
            if (!response.ok || response.status === 404) {
                // Try POST for insert
                const postUrl = new URL(`${this.client.supabaseUrl}/rest/v1/${table}`);
                response = await fetch(postUrl.toString(), {
                    method: 'POST',
                    headers: this._getAuthHeaders(),
                    body: JSON.stringify({ [identifier]: identifierValue, ...data })
                });
            }
            
            return await this._handleResponse(response);
        } else {
            // Simple POST for new records
            const postUrl = new URL(`${this.client.supabaseUrl}/rest/v1/${table}`);
            const response = await fetch(postUrl.toString(), {
                method: 'POST',
                headers: this._getAuthHeaders(),
                body: JSON.stringify(data)
            });
            
            return await this._handleResponse(response);
        }
    },
    
    /**
     * Execute a DELETE operation
     * @param {string} table - Table name
     * @param {Object} filter - Filter conditions
     * @returns {Promise<{data: Array|null, error: Object|null}>}
     */
    async queryDelete(table, filter = {}) {
        const deleteUrl = new URL(`${this.client.supabaseUrl}/rest/v1/${table}`);
        deleteUrl.searchParams.append('select', '*');
        
        // Add filter conditions
        Object.entries(filter).forEach(([key, value]) => {
            deleteUrl.searchParams.append(key, `eq.${value}`);
        });
        
        const response = await fetch(deleteUrl.toString(), {
            method: 'DELETE',
            headers: this._getAuthHeaders()
        });
        
        return await this._handleResponse(response);
    },
    
    /**
     * Handle HTTP response and convert to standard format
     * @private
     */
    async _handleResponse(response) {
        if (!response.ok) {
            const errorText = await response.text();
            let errorObj;
            try {
                errorObj = JSON.parse(errorText);
            } catch {
                errorObj = { message: errorText };
            }
            return {
                data: null,
                error: {
                    message: errorObj.message || errorText,
                    code: errorObj.code,
                    details: errorObj.details,
                    hint: errorObj.hint,
                    status: response.status
                }
            };
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const text = await response.text();
            if (!text || text.trim() === '') {
                return { data: null, error: null };
            }
            try {
                const data = JSON.parse(text);
                return { data, error: null };
            } catch (e) {
                return { data: null, error: { message: 'Invalid JSON response', status: response.status } };
            }
        }
        
        return { data: null, error: null };
    },
    
    /**
     * Check if a month key is example data (protected)
     * Checks if the month exists in the example_months table
     * @param {string} monthKey - Month key
     * @returns {Promise<boolean>} True if example data
     */
    async isExampleData(monthKey) {
        try {
            console.log(`[DatabaseService] isExampleData() called for: ${monthKey}`);
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            const { year, month } = this.parseMonthKey(monthKey);
            console.log(`[DatabaseService] Checking example_months for year=${year}, month=${month}...`);
            
            const { data, error } = await this.querySelect('example_months', {
                select: 'id',
                filter: { year: year, month: month },
                limit: 1
            });
            
            if (error) {
                if (error.code === 'PGRST116' || error.status === 404) {
                    console.log(`[DatabaseService] ${monthKey} not found in example_months - not example data`);
                    return false; // Not found in example_months
                }
                console.error(`[DatabaseService] Error checking example_months:`, error);
                return false;
            }
            
            const isExample = data !== null && Array.isArray(data) && data.length > 0;
            console.log(`[DatabaseService] ${monthKey} isExampleData result: ${isExample}`);
            return isExample;
        } catch (error) {
            console.warn(`[DatabaseService] Error checking if ${monthKey} is example data:`, error);
            return false;
        }
    },
    
    /**
     * Synchronous version of isExampleData for backward compatibility
     * Uses year check as fallback if database check fails
     * @param {string} monthKey - Month key
     * @returns {boolean} True if example data (based on year)
     */
    isExampleDataSync(monthKey) {
        try {
            const { year } = this.parseMonthKey(monthKey);
            return year === this.EXAMPLE_YEAR;
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Get the table name for a month based on whether it's example data
     * @param {string} monthKey - Month key
     * @returns {Promise<string>} Table name ('example_months' or 'user_months')
     */
    async getTableName(monthKey) {
        console.log(`[DatabaseService] getTableName() called for: ${monthKey}`);
        const isExample = await this.isExampleData(monthKey);
        const tableName = isExample ? 'example_months' : 'user_months';
        console.log(`[DatabaseService] getTableName() result for ${monthKey}: ${tableName}`);
        return tableName;
    },
    
    /**
     * Load cache from localStorage
     * @returns {Object|null} Cached months or null
     */
    loadCacheFromStorage() {
        try {
            const cachedData = localStorage.getItem(this.CACHE_STORAGE_KEY);
            const cachedTimestamp = localStorage.getItem(this.CACHE_TIMESTAMP_KEY);
            
            if (cachedData && cachedTimestamp) {
                const timestamp = parseInt(cachedTimestamp, 10);
                const now = Date.now();
                
                // Check if cache is still valid (within 24 hours)
                if (now - timestamp < this.CACHE_DURATION) {
                    return JSON.parse(cachedData);
                }
            }
        } catch (error) {
            console.warn('Error loading cache from storage:', error);
        }
        return null;
    },
    
    /**
     * Save cache to localStorage
     * @param {Object} monthsData - Months data object
     */
    saveCacheToStorage(monthsData) {
        try {
            localStorage.setItem(this.CACHE_STORAGE_KEY, JSON.stringify(monthsData));
            localStorage.setItem(this.CACHE_TIMESTAMP_KEY, Date.now().toString());
        } catch (error) {
            console.warn('Error saving cache to storage:', error);
        }
    },
    
    /**
     * Clear cache (both memory and storage)
     */
    clearCache() {
        console.log('[DatabaseService] clearCache() called');
        this.monthsCache = null;
        this.cacheTimestamp = null;
        try {
            localStorage.removeItem(this.CACHE_STORAGE_KEY);
            localStorage.removeItem(this.CACHE_TIMESTAMP_KEY);
            console.log('[DatabaseService] Cache cleared from memory and localStorage');
        } catch (error) {
            console.warn('[DatabaseService] Error clearing cache from storage:', error);
        }
    },
    
    /**
     * Clear example months from cache only (not from database)
     * Uses year-based check for faster performance
     * @returns {Promise<void>}
     */
    async clearExampleDataFromCache() {
        try {
            console.log('[DatabaseService] clearExampleDataFromCache() called');
            
            // Clear from memory cache using year-based check (faster than database queries)
            if (this.monthsCache) {
                const exampleMonthKeys = [];
                for (const monthKey of Object.keys(this.monthsCache)) {
                    // Use year-based check for performance (example data is year 2045)
                    const { year } = this.parseMonthKey(monthKey);
                    if (year === this.EXAMPLE_YEAR) {
                        exampleMonthKeys.push(monthKey);
                    }
                }
                console.log(`[DatabaseService] Clearing ${exampleMonthKeys.length} example months from in-memory cache:`, exampleMonthKeys);
                exampleMonthKeys.forEach(monthKey => {
                    delete this.monthsCache[monthKey];
                });
            }
            
            // Clear from localStorage cache (if it exists)
            const cachedData = localStorage.getItem(this.CACHE_STORAGE_KEY);
            if (cachedData) {
                try {
                    const monthsCache = JSON.parse(cachedData);
                    const exampleMonthKeys = [];
                    
                    // Use year-based check for performance
                    for (const monthKey of Object.keys(monthsCache)) {
                        try {
                            const { year } = this.parseMonthKey(monthKey);
                            if (year === this.EXAMPLE_YEAR) {
                                exampleMonthKeys.push(monthKey);
                            }
                        } catch (error) {
                            // Skip invalid month keys
                            continue;
                        }
                    }
                    
                    console.log(`[DatabaseService] Clearing ${exampleMonthKeys.length} example months from localStorage cache:`, exampleMonthKeys);
                    exampleMonthKeys.forEach(monthKey => {
                        delete monthsCache[monthKey];
                    });
                    
                    localStorage.setItem(this.CACHE_STORAGE_KEY, JSON.stringify(monthsCache));
                    localStorage.setItem(this.CACHE_TIMESTAMP_KEY, Date.now().toString());
                } catch (error) {
                    console.warn('[DatabaseService] Error processing cache:', error);
                    // If cache is corrupted, just remove it
                    localStorage.removeItem(this.CACHE_STORAGE_KEY);
                    localStorage.removeItem(this.CACHE_TIMESTAMP_KEY);
                }
            }
            
            console.log('[DatabaseService] clearExampleDataFromCache() completed');
        } catch (error) {
            console.error('[DatabaseService] Error clearing example data from cache:', error);
            throw error;
        }
    },
    
    /**
     * Initialize database service with Supabase client
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            console.log('[DatabaseService] Initializing...');
            
            if (!window.SupabaseConfig) {
                throw new Error('SupabaseConfig not available');
            }
            
            this.client = window.SupabaseConfig.getClient();
            console.log('[DatabaseService] Supabase client obtained:', this.client ? 'Success' : 'Failed');
            
            if (!this.client) {
                throw new Error('Failed to initialize Supabase client');
            }
            
            // Test the client connection - check if we can reach Supabase at all
            console.log('[DatabaseService] Testing Supabase connection...');
            console.log('[DatabaseService] Supabase URL:', window.SupabaseConfig?.PROJECT_URL);
            console.log('[DatabaseService] API Key present:', !!window.SupabaseConfig?.PUBLISHABLE_API_KEY);
            console.log('[DatabaseService] API Key length:', window.SupabaseConfig?.PUBLISHABLE_API_KEY?.length);
            
            // Check if we can make a simple HTTP request to Supabase
            try {
                const supabaseUrl = window.SupabaseConfig?.PROJECT_URL;
                if (supabaseUrl) {
                    console.log('[DatabaseService] Testing HTTP connectivity to Supabase...');
                    const healthCheckUrl = `${supabaseUrl}/rest/v1/`;
                    
                    // Try a simple fetch to see if we can reach the server
                    const fetchStart = Date.now();
                    const fetchResult = await Promise.race([
                        fetch(healthCheckUrl, {
                            method: 'HEAD',
                            headers: {
                                'apikey': window.SupabaseConfig?.PUBLISHABLE_API_KEY || '',
                                'Authorization': `Bearer ${window.SupabaseConfig?.PUBLISHABLE_API_KEY || ''}`
                            }
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('HTTP test timeout')), 5000))
                    ]).catch(err => {
                        const fetchElapsed = Date.now() - fetchStart;
                        console.error(`[DatabaseService] HTTP test failed after ${fetchElapsed}ms:`, err);
                        return null;
                    });
                    
                    if (fetchResult) {
                        const fetchElapsed = Date.now() - fetchStart;
                        console.log(`[DatabaseService] HTTP connectivity test successful (${fetchElapsed}ms) - Status: ${fetchResult.status}`);
            } else {
                        console.error('[DatabaseService] HTTP connectivity test failed - cannot reach Supabase server');
                        console.error('[DatabaseService] Possible issues:');
                        console.error('[DatabaseService] 1. Network connectivity problem');
                        console.error('[DatabaseService] 2. CORS policy blocking requests');
                        console.error('[DatabaseService] 3. Supabase project URL is incorrect');
                        console.error('[DatabaseService] 4. Supabase project is paused or deleted');
                        console.error('[DatabaseService] 5. Firewall/proxy blocking requests');
                    }
                }
            } catch (httpTestError) {
                console.warn('[DatabaseService] HTTP connectivity test error:', httpTestError);
            }
            
            // Test the client with a simple query (with timeout)
            console.log('[DatabaseService] Testing Supabase client with query...');
            try {
                // First, try a direct fetch to see if we can reach the API
                console.log('[DatabaseService] Testing direct fetch to Supabase REST API...');
                const directFetchUrl = `${this.client.supabaseUrl}/rest/v1/user_months?select=id&limit=1`;
                console.log('[DatabaseService] Direct fetch URL:', directFetchUrl);
                
                try {
                    const directFetchResult = await Promise.race([
                        fetch(directFetchUrl, {
                            method: 'GET',
                            headers: this._getAuthHeaders()
                        }),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Direct fetch timeout')), 5000))
                    ]);
                    
                    console.log('[DatabaseService] Direct fetch completed - Status:', directFetchResult.status);
                    console.log('[DatabaseService] Direct fetch headers:', Object.fromEntries(directFetchResult.headers.entries()));
                    
                    if (directFetchResult.ok) {
                        const directData = await directFetchResult.json();
                        console.log('[DatabaseService] Direct fetch successful - data:', directData);
                    } else {
                        const errorText = await directFetchResult.text();
                        console.error('[DatabaseService] Direct fetch failed - Status:', directFetchResult.status);
                        console.error('[DatabaseService] Direct fetch error:', errorText);
                    }
                } catch (directFetchError) {
                    console.error('[DatabaseService] Direct fetch error:', directFetchError);
                }
                
                // Now try the Supabase client query
                console.log('[DatabaseService] Testing Supabase client query...');
                const testQuery = this.client.from('user_months').select('id').limit(1);
                console.log('[DatabaseService] Test query created, testing connection...');
                console.log('[DatabaseService] Client object:', this.client);
                console.log('[DatabaseService] Client supabaseUrl:', this.client.supabaseUrl);
                console.log('[DatabaseService] Client supabaseKey present:', !!this.client.supabaseKey);
                console.log('[DatabaseService] Client type/version:', this.client.constructor?.name);
                
                // Set a short timeout for the test
                const testTimeout = setTimeout(() => {
                    console.warn('[DatabaseService] Query test timed out - queries are not completing');
                    console.warn('[DatabaseService] If direct fetch worked but client query didn\'t, there\'s an issue with the Supabase JS client');
                }, 3000);
                
                const testStartTime = Date.now();
                const testResult = await Promise.race([
                    testQuery,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Test timeout')), 3000))
                ]).catch(err => {
                    clearTimeout(testTimeout);
                    const elapsed = Date.now() - testStartTime;
                    if (err.message === 'Test timeout') {
                        console.error(`[DatabaseService] Query test failed after ${elapsed}ms - queries are timing out`);
                        console.error('[DatabaseService] If direct fetch worked, the Supabase JS client may have an issue');
                        console.error('[DatabaseService] Check: Supabase JS library version compatibility');
                    }
                    return { data: null, error: err };
                });
                
                clearTimeout(testTimeout);
                if (testResult && testResult.error) {
                    console.warn('[DatabaseService] Query test returned error:', testResult.error);
                    console.warn('[DatabaseService] Error code:', testResult.error.code);
                    console.warn('[DatabaseService] Error message:', testResult.error.message);
                } else if (testResult && testResult.data !== undefined) {
                    console.log('[DatabaseService] Query test successful - client is working');
                    console.log('[DatabaseService] Test result:', testResult);
                } else {
                    console.warn('[DatabaseService] Query test returned unexpected result:', testResult);
                }
            } catch (testError) {
                console.warn('[DatabaseService] Query test error:', testError);
                console.warn('[DatabaseService] Error stack:', testError.stack);
            }
            
            // Always initialize fresh - never load cache from localStorage
            // User data is always loaded from user_months table on every page load
            // Example data is loaded from example_months table
            // Cache is only used for example data clearing functionality (local only)
            console.log('[DatabaseService] Initialized successfully - will fetch fresh data from database');
            
            return true;
        } catch (error) {
            console.error('[DatabaseService] Error initializing:', error);
            throw error;
        }
    },
    
    /**
     * Get all months from database (always fetches fresh from database)
     * @param {boolean} forceRefresh - Deprecated, always fetches fresh
     * @returns {Promise<Object>} Object with all months keyed by monthKey
     */
    /**
     * Low-level direct fetch helper - bypasses Supabase JS client when it hangs
     * 
     * NOTE: This is a low-level helper method. All database operations should use
     * the centralized query interface methods (querySelect, queryUpsert, queryDelete)
     * instead of calling this directly. This method is kept for:
     * - Testing/debugging purposes
     * - Initialization connectivity tests
     * - Future migration if needed
     * 
     * We're using direct fetch instead of the Supabase JS client because:
     * - The Supabase JS client queries were hanging indefinitely (promises never resolving)
     * - Direct fetch works reliably and returns data immediately
     * - This ensures we always get fresh, accurate data from the database
     * 
     * The centralized query interface (querySelect, queryUpsert, queryDelete) uses
     * this method internally, so if we need to switch implementations in the future,
     * we only need to modify those three methods.
     * 
     * @private (kept public for testing/debugging, but prefer using querySelect/queryUpsert/queryDelete)
     */
    async directFetch(table, queryParams = {}) {
        const url = new URL(`${this.client.supabaseUrl}/rest/v1/${table}`);
        
        // Add query parameters for GET requests
        if (queryParams.method === 'GET' || !queryParams.method) {
            if (queryParams.select) {
                url.searchParams.append('select', queryParams.select);
            }
            if (queryParams.filter) {
                Object.entries(queryParams.filter).forEach(([key, value]) => {
                    url.searchParams.append(key, `eq.${value}`);
                });
            }
            if (queryParams.order) {
                queryParams.order.forEach(({ column, ascending }) => {
                    url.searchParams.append('order', `${column}.${ascending ? 'asc' : 'desc'}`);
                });
            }
            if (queryParams.limit) {
                url.searchParams.append('limit', queryParams.limit);
            }
        }
        
        const headers = this._getAuthHeaders();
        
        // For upsert operations, add resolution header
        if (queryParams.onConflict) {
            headers['Prefer'] = `resolution=merge-duplicates,return=representation`;
        }
        
        const response = await fetch(url.toString(), {
            method: queryParams.method || 'GET',
            headers: headers,
            body: queryParams.body ? JSON.stringify(queryParams.body) : undefined
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            let errorObj;
            try {
                errorObj = JSON.parse(errorText);
            } catch {
                errorObj = { message: errorText };
            }
            return { 
                data: null, 
                error: { 
                    message: errorObj.message || errorText, 
                    code: errorObj.code,
                    details: errorObj.details,
                    hint: errorObj.hint,
                    status: response.status 
                } 
            };
        }
        
        // Handle response body - read once
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const text = await response.text();
            if (!text || text.trim() === '') {
                return { data: null, error: null };
            }
            try {
                const data = JSON.parse(text);
                return { data, error: null };
            } catch (e) {
                console.error('[DatabaseService] Failed to parse JSON response:', e);
                console.error('[DatabaseService] Response text:', text);
                return { data: null, error: { message: 'Invalid JSON response', status: response.status } };
            }
        }
        
        // Non-JSON response or empty
        return { data: null, error: null };
    },
    
    /**
     * Get the list of enabled example month keys from localStorage
     * @returns {Array<string>} Array of month keys that user has enabled
     */
    getEnabledExampleMonths() {
        try {
            const stored = localStorage.getItem('money_tracker_enabled_example_months');
            if (stored) {
                const enabled = JSON.parse(stored);
                return Array.isArray(enabled) ? enabled : [];
            }
            return [];
        } catch (error) {
            console.warn('[DatabaseService] Error reading enabled example months:', error);
            return [];
        }
    },
    
    /**
     * Set the list of enabled example month keys in localStorage
     * @param {Array<string>} monthKeys - Array of month keys to enable
     */
    setEnabledExampleMonths(monthKeys) {
        try {
            localStorage.setItem('money_tracker_enabled_example_months', JSON.stringify(monthKeys));
            console.log('[DatabaseService] Enabled example months updated:', monthKeys);
        } catch (error) {
            console.error('[DatabaseService] Error saving enabled example months:', error);
        }
    },
    
    /**
     * Add example month keys to the enabled list
     * @param {Array<string>} monthKeys - Month keys to add
     */
    addEnabledExampleMonths(monthKeys) {
        const current = this.getEnabledExampleMonths();
        const updated = [...new Set([...current, ...monthKeys])]; // Remove duplicates
        this.setEnabledExampleMonths(updated);
    },
    
    /**
     * Remove example month keys from the enabled list
     * @param {Array<string>} monthKeys - Month keys to remove (optional, if not provided removes all)
     */
    removeEnabledExampleMonths(monthKeys = null) {
        if (monthKeys === null) {
            // Remove all
            this.setEnabledExampleMonths([]);
        } else {
            const current = this.getEnabledExampleMonths();
            const updated = current.filter(key => !monthKeys.includes(key));
            this.setEnabledExampleMonths(updated);
        }
    },

    async getAllMonths(forceRefresh = false, includeExampleData = true) {
        try {
            console.log('[DatabaseService] getAllMonths() called, forceRefresh:', forceRefresh, 'includeExampleData:', includeExampleData);
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            // Always fetch fresh from database - no caching
            console.log('[DatabaseService] Fetching months from database...');
            
            // Fetch user months using centralized query interface
            console.log('[DatabaseService] Querying user_months table...');
            
            // Get current user ID for filtering
            const currentUserId = this._getCurrentUserId();
            if (!currentUserId) {
                console.warn('[DatabaseService] No authenticated user - skipping user_months query');
                // Return empty array for user months, but still process example months if enabled
            } else {
                console.log(`[DatabaseService] Filtering user_months by user_id: ${currentUserId}`);
            }
            
            // First, do a diagnostic query to check if ANY data exists (just count)
            if (currentUserId) {
                try {
                    const diagnosticUrl = new URL(`${this.client.supabaseUrl}/rest/v1/user_months`);
                    diagnosticUrl.searchParams.append('select', 'id');
                    diagnosticUrl.searchParams.append('user_id', `eq.${currentUserId}`);
                    diagnosticUrl.searchParams.append('limit', '1');
                    
                    const diagnosticResponse = await fetch(diagnosticUrl.toString(), {
                        method: 'GET',
                        headers: this._getAuthHeaders()
                    });
                    
                    const diagnosticText = await diagnosticResponse.text();
                    const diagnosticData = diagnosticText ? JSON.parse(diagnosticText) : [];
                    console.log(`[DatabaseService] Diagnostic query: Status ${diagnosticResponse.status}, Found ${Array.isArray(diagnosticData) ? diagnosticData.length : 'unknown'} rows`);
                    console.log(`[DatabaseService] Diagnostic response headers:`, {
                        'content-range': diagnosticResponse.headers.get('content-range'),
                        'content-length': diagnosticResponse.headers.get('content-length')
                    });
                } catch (diagError) {
                    console.warn('[DatabaseService] Diagnostic query failed:', diagError);
                }
            }
            
            // Query user_months with user_id filter
            const userMonthsQueryOptions = {
                select: '*',
                order: [
                    { column: 'year', ascending: false },
                    { column: 'month', ascending: false }
                ]
            };
            
            if (currentUserId) {
                userMonthsQueryOptions.filter = { user_id: currentUserId };
            }
            
            const { data: userMonthsData, error: userMonthsError } = await this.querySelect('user_months', userMonthsQueryOptions);
            
            if (userMonthsError) {
                console.error('[DatabaseService] Error fetching user_months:', userMonthsError);
                console.error('[DatabaseService] Error details:', {
                    message: userMonthsError.message,
                    code: userMonthsError.code,
                    status: userMonthsError.status
                });
                throw userMonthsError;
            }
            
            // Ensure userMonthsData is an array
            // Handle case where query returns null, undefined, or empty array
            let safeUserMonthsData = [];
            if (userMonthsData !== null && userMonthsData !== undefined) {
                if (Array.isArray(userMonthsData)) {
                    safeUserMonthsData = userMonthsData;
                } else if (typeof userMonthsData === 'object') {
                    // Single object returned instead of array
                    safeUserMonthsData = [userMonthsData];
                }
            }
            
            console.log(`[DatabaseService] user_months query result: ${safeUserMonthsData.length} months found`);
            console.log('[DatabaseService] Raw userMonthsData type:', typeof userMonthsData, Array.isArray(userMonthsData) ? 'array' : 'not array');
            console.log('[DatabaseService] Raw userMonthsData value:', userMonthsData);
            console.log('[DatabaseService] safeUserMonthsData length:', safeUserMonthsData.length);
            if (safeUserMonthsData.length > 0) {
                console.log('[DatabaseService] First month in safeUserMonthsData:', safeUserMonthsData[0]);
            }
            
            if (safeUserMonthsData.length > 0) {
                console.log('[DatabaseService] user_months data:', safeUserMonthsData.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`));
            } else {
                if (currentUserId) {
                    console.warn('[DatabaseService] No user months found in database. If you just imported data, try refreshing the page.');
                    // Always retry once if no data found (helps with timing issues after import)
                    console.log('[DatabaseService] No data found - waiting 500ms and retrying query...');
                    await new Promise(resolve => setTimeout(resolve, 500));
                    const retryQueryOptions = {
                        select: '*',
                        order: [
                            { column: 'year', ascending: false },
                            { column: 'month', ascending: false }
                        ],
                        filter: { user_id: currentUserId }
                    };
                    const retryResult = await this.querySelect('user_months', retryQueryOptions);
                    if (!retryResult.error && retryResult.data) {
                        const retryData = Array.isArray(retryResult.data) ? retryResult.data : (retryResult.data ? [retryResult.data] : []);
                        if (retryData.length > 0) {
                            console.log(`[DatabaseService] Retry successful: found ${retryData.length} months`);
                            safeUserMonthsData = retryData;
                        } else {
                            console.warn('[DatabaseService] Retry also returned empty array - data may not be committed yet or RLS policy may be blocking');
                        }
                    } else if (retryResult.error) {
                        console.error('[DatabaseService] Retry query failed:', retryResult.error);
                    }
                }
            }
            
            // Fetch example months only if requested AND user has enabled them
            let exampleMonthsData = [];
            const enabledExampleMonths = this.getEnabledExampleMonths();
            console.log('[DatabaseService] Enabled example months from localStorage:', enabledExampleMonths);
            
            if (includeExampleData && enabledExampleMonths.length > 0) {
                console.log('[DatabaseService] Querying example_months table for enabled months...');
                const { data: exampleData, error: exampleMonthsError } = await this.querySelect('example_months', {
                    select: '*',
                    order: [
                        { column: 'year', ascending: false },
                        { column: 'month', ascending: false }
                    ]
                });
                
                if (exampleMonthsError) {
                    // If table doesn't exist yet, log warning but don't fail
                    if (exampleMonthsError.message && exampleMonthsError.message.includes('relation') && exampleMonthsError.message.includes('does not exist')) {
                        console.warn('[DatabaseService] example_months table does not exist yet. Run 01-schema-fresh-install.sql to create it.');
                        exampleMonthsData = [];
                    } else {
                        console.error('[DatabaseService] Error fetching example_months:', exampleMonthsError);
                        // Don't throw - just log and continue with empty array
                        exampleMonthsData = [];
                    }
                } else {
                    // Filter to only include enabled example months
                    const allExampleData = exampleData || [];
                    exampleMonthsData = allExampleData.filter(monthRecord => {
                        const monthKey = this.generateMonthKey(monthRecord.year, monthRecord.month);
                        return enabledExampleMonths.includes(monthKey);
                    });
                    console.log(`[DatabaseService] example_months query result: ${allExampleData.length} total, ${exampleMonthsData.length} enabled`);
                    if (exampleMonthsData.length > 0) {
                        console.log('[DatabaseService] Enabled example_months data:', exampleMonthsData.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`));
                    }
                }
            } else {
                if (!includeExampleData) {
                    console.log('[DatabaseService] Skipping example_months query (includeExampleData=false)');
                } else {
                    console.log('[DatabaseService] Skipping example_months query (no enabled example months)');
                }
            }
            
            const monthsObject = {};
            
            // Add user months (always include user months, regardless of example data settings)
            if (safeUserMonthsData.length > 0) {
                console.log(`[DatabaseService] Processing ${safeUserMonthsData.length} user months...`);
                safeUserMonthsData.forEach(monthRecord => {
                    try {
                        const monthKey = this.generateMonthKey(monthRecord.year, monthRecord.month);
                        monthsObject[monthKey] = this.transformMonthFromDatabase(monthRecord);
                        console.log(`[DatabaseService] Added user month: ${monthKey}`);
                    } catch (error) {
                        console.error(`[DatabaseService] Error processing user month ${monthRecord.year}-${monthRecord.month}:`, error);
                    }
                });
            } else {
                console.warn('[DatabaseService] No user months to process');
            }
            
            // Add enabled example months only (they will override user months if same key exists, which shouldn't happen)
            if (includeExampleData && Array.isArray(exampleMonthsData) && exampleMonthsData.length > 0) {
                console.log(`[DatabaseService] Processing ${exampleMonthsData.length} enabled example months...`);
                exampleMonthsData.forEach(monthRecord => {
                    const monthKey = this.generateMonthKey(monthRecord.year, monthRecord.month);
                    monthsObject[monthKey] = this.transformMonthFromDatabase(monthRecord);
                });
            }
            
            console.log(`[DatabaseService] getAllMonths() completed. Total months: ${Object.keys(monthsObject).length}`);
            console.log('[DatabaseService] Month keys:', Object.keys(monthsObject));
            
            // Update in-memory cache for current session only (not persisted)
            this.monthsCache = monthsObject;
            this.cacheTimestamp = Date.now();
            
            // Don't save to localStorage - always fetch fresh from database
            // Only save cache to storage for example data clearing functionality
            // User data is always loaded fresh from user_months table
            
            return monthsObject;
        } catch (error) {
            console.error('[DatabaseService] Error getting all months:', error);
            console.error('[DatabaseService] Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            
            // If database fetch fails, try to use cache as fallback
            if (this.monthsCache) {
                console.warn('[DatabaseService] Database fetch failed, using cached data as fallback');
                return { ...this.monthsCache };
            }
            
            throw error;
        }
    },
    
    /**
     * Get a specific month by monthKey (always fetches fresh from database)
     * @param {string} monthKey - Month key (e.g., "2025-11")
     * @param {boolean} forceRefresh - Deprecated, always fetches fresh
     * @returns {Promise<Object|null>} Month data or null
     */
    async getMonth(monthKey, forceRefresh = false) {
        try {
            console.log(`[DatabaseService] getMonth() called for: ${monthKey}`);
            
            if (!monthKey) {
                throw new Error('Month key is required');
            }
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            // Always fetch fresh from database - check both tables using direct fetch
            const { year, month } = this.parseMonthKey(monthKey);
            console.log(`[DatabaseService] Parsed monthKey: year=${year}, month=${month}`);
            
            // First check example_months using centralized query interface
            console.log(`[DatabaseService] Checking example_months for ${year}-${month}...`);
            let fetchResult = await this.querySelect('example_months', {
                select: '*',
                filter: { year: year, month: month },
                limit: 1
            });
            
            let data = null;
            let error = null;
            
            // Check if we got data from example_months
            if (fetchResult.data && Array.isArray(fetchResult.data) && fetchResult.data.length > 0) {
                data = fetchResult.data[0];
                console.log(`[DatabaseService] Found month ${monthKey} in example_months table`);
            } else {
                // Not found in example_months (empty array or error), check user_months
                console.log(`[DatabaseService] Not found in example_months (empty or error), checking user_months...`);
                
                // Get current user ID for filtering
                const currentUserId = this._getCurrentUserId();
                if (!currentUserId) {
                    console.log(`[DatabaseService] No authenticated user - skipping user_months query`);
                    return null;
                }
                
                const userFetchFilter = { year: year, month: month, user_id: currentUserId };
                const userFetchResult = await this.querySelect('user_months', {
                    select: '*',
                    filter: userFetchFilter,
                    limit: 1
                });
                
                if (userFetchResult.data && Array.isArray(userFetchResult.data) && userFetchResult.data.length > 0) {
                    data = userFetchResult.data[0];
                    console.log(`[DatabaseService] Found month ${monthKey} in user_months table`);
                } else if (userFetchResult.error && (userFetchResult.error.code === 'PGRST116' || userFetchResult.error.status === 404)) {
                    console.log(`[DatabaseService] Month ${monthKey} not found in either table`);
                    return null; // Not found in either table
                } else if (userFetchResult.error) {
                    console.error(`[DatabaseService] Error fetching from user_months:`, userFetchResult.error);
                    error = userFetchResult.error;
                } else if (!userFetchResult.data || (Array.isArray(userFetchResult.data) && userFetchResult.data.length === 0)) {
                    // Empty result from user_months too
                    console.log(`[DatabaseService] Month ${monthKey} not found in either table (both returned empty)`);
                    return null;
                }
                
                // If we had an error from example_months but user_months worked, clear the error
                if (data && fetchResult.error) {
                    console.log(`[DatabaseService] Found in user_months despite example_months error, ignoring example_months error`);
                } else if (fetchResult.error && !data) {
                    // Both failed or both empty
                    console.error(`[DatabaseService] Error fetching from example_months:`, fetchResult.error);
                    error = fetchResult.error;
                }
            }
            
            if (error) {
                throw error;
            }
            
            const monthData = data ? this.transformMonthFromDatabase(data) : null;
            console.log(`[DatabaseService] getMonth() completed for ${monthKey}:`, monthData ? 'Found' : 'Not found');
            
            // No caching - always return fresh data from database
            return monthData;
        } catch (error) {
            console.error(`[DatabaseService] Error getting month ${monthKey}:`, error);
            console.error('[DatabaseService] Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                status: error.status
            });
            
            // No fallback to cache - fail hard to ensure data accuracy
            throw error;
        }
    },
    
    /**
     * Save a month to database
     * @param {string} monthKey - Month key
     * @param {Object} monthData - Month data object
     * @param {boolean} forceUserTable - Force save to user_months table (for imports)
     * @returns {Promise<boolean>} Success status
     */
    async saveMonth(monthKey, monthData, forceUserTable = false) {
        try {
            console.log(`[DatabaseService] saveMonth() called for: ${monthKey}, forceUserTable: ${forceUserTable}`);
            
            if (!monthKey || !monthData) {
                throw new Error('Month key and data are required');
            }
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            const { year, month } = this.parseMonthKey(monthKey);
            console.log(`[DatabaseService] Parsed monthKey: year=${year}, month=${month}`);
            
            // Determine which table to use
            // If forceUserTable is true (for imports), always use user_months
            // Otherwise, check if it's example data
            let tableName;
            if (forceUserTable) {
                tableName = 'user_months';
                console.log(`[DatabaseService] Using user_months table (forced for import)`);
            } else {
                tableName = await this.getTableName(monthKey);
                console.log(`[DatabaseService] Using ${tableName} table (determined from monthKey)`);
            }
            
            // Get user ID if saving to user_months table
            let userId = null;
            if (tableName === 'user_months') {
                userId = this._getCurrentUserId();
                if (!userId) {
                    throw new Error('User not authenticated - cannot save to user_months without authentication');
                }
                console.log(`[DatabaseService] User ID for user_months: ${userId}`);
            }
            
            const monthRecord = this.transformMonthToDatabase(monthData, year, month, userId);
            console.log(`[DatabaseService] Transformed month record:`, {
                year: monthRecord.year,
                month: monthRecord.month,
                month_name: monthRecord.month_name,
                user_id: monthRecord.user_id || 'N/A (example_months)'
            });
            
            console.log(`[DatabaseService] Upserting to ${tableName} table...`);
            
            // Use centralized upsert method
            // For user_months, include user_id in filter to ensure we update the correct user's record
            const upsertOptions = { filter: { year, month } };
            if (tableName === 'user_months' && userId) {
                upsertOptions.filter.user_id = userId;
            }
            
            const upsertResult = await this.queryUpsert(tableName, monthRecord, upsertOptions);
            
            if (upsertResult.error) {
                console.error(`[DatabaseService] Error upserting to ${tableName}:`, upsertResult.error);
                console.error('[DatabaseService] Error details:', upsertResult.error);
                throw upsertResult.error;
            }
            
            console.log(`[DatabaseService] Successfully saved month ${monthKey} to ${tableName} table`);
            console.log(`[DatabaseService] Upsert result:`, {
                hasData: upsertResult.data !== null && upsertResult.data !== undefined,
                dataType: typeof upsertResult.data,
                isArray: Array.isArray(upsertResult.data),
                dataValue: upsertResult.data
            });
            
            if (upsertResult.data) {
                const upsertData = Array.isArray(upsertResult.data) ? upsertResult.data : [upsertResult.data];
                if (upsertData.length > 0) {
                    console.log(`[DatabaseService] Upsert returned data:`, upsertData[0]);
                    console.log(`[DatabaseService] Upsert returned record ID:`, upsertData[0].id);
                    console.log(`[DatabaseService] Upsert returned year/month:`, upsertData[0].year, upsertData[0].month);
                    
                    // Verify the data can be read back immediately
                    console.log(`[DatabaseService] Verifying saved data can be read back...`);
                    const verifyResult = await this.querySelect(tableName, {
                        select: '*',
                        filter: { year: year, month: month },
                        limit: 1
                    });
                    if (verifyResult.data && Array.isArray(verifyResult.data) && verifyResult.data.length > 0) {
                        console.log(`[DatabaseService] ✓ Verification successful - data can be read back`);
                    } else {
                        console.error(`[DatabaseService] ✗ Verification failed - data cannot be read back (RLS policy issue?)`);
                        console.error(`[DatabaseService] Verify result:`, verifyResult);
                    }
                } else {
                    console.warn(`[DatabaseService] Upsert succeeded but returned empty array`);
                }
            } else {
                console.warn(`[DatabaseService] Upsert succeeded but upsertResult.data is null/undefined`);
            }
            
            // Small delay to ensure Supabase commit completes before next query
            // This helps with timing issues where queries happen immediately after save
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Clear cache to ensure next fetch gets fresh data
            if (this.monthsCache && this.monthsCache[monthKey]) {
                delete this.monthsCache[monthKey];
            }
            
            // Don't save to localStorage - data is in database, will be loaded fresh on next page load
            // User data is always saved to user_months table and loaded fresh
            
            return true;
        } catch (error) {
            console.error(`[DatabaseService] Error saving month ${monthKey}:`, error);
            console.error('[DatabaseService] Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            throw error;
        }
    },
    
    /**
     * Delete a month from database
     * @param {string} monthKey - Month key
     * @returns {Promise<boolean>} Success status
     * @throws {Error} If attempting to delete example data
     */
    async deleteMonth(monthKey) {
        try {
            console.log(`[DatabaseService] deleteMonth() called for: ${monthKey}`);
            
            if (!monthKey) {
                throw new Error('Month key is required');
            }
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            // Protect example data from deletion
            console.log(`[DatabaseService] Checking if ${monthKey} is example data...`);
            const isExample = await this.isExampleData(monthKey);
            if (isExample) {
                console.log(`[DatabaseService] ${monthKey} is example data - deletion blocked`);
                throw new Error('Example data cannot be deleted. This data is protected.');
            }
            
            const { year, month } = this.parseMonthKey(monthKey);
            console.log(`[DatabaseService] Parsed monthKey: year=${year}, month=${month}`);
            
            // Get user ID for user_months deletion
            const userId = this._getCurrentUserId();
            if (!userId) {
                throw new Error('User not authenticated - cannot delete from user_months without authentication');
            }
            console.log(`[DatabaseService] User ID for deletion: ${userId}`);
            
            // Only delete from user_months (never from example_months) using centralized query interface
            // Include user_id in filter to ensure we only delete the current user's records
            console.log(`[DatabaseService] Deleting from user_months table...`);
            
            const deleteResult = await this.queryDelete('user_months', { year, month, user_id: userId });
            
            if (deleteResult.error) {
                console.error(`[DatabaseService] Error deleting from user_months:`, deleteResult.error);
                console.error('[DatabaseService] Error details:', deleteResult.error);
                throw deleteResult.error;
            }
            
            console.log(`[DatabaseService] Successfully deleted month ${monthKey} from user_months`);
            if (deleteResult.data) {
                const deletedData = Array.isArray(deleteResult.data) ? deleteResult.data : [deleteResult.data];
                if (deletedData.length > 0) {
                    console.log(`[DatabaseService] Delete returned data:`, deletedData);
                }
            }
            
            // Clear cache to ensure next fetch gets fresh data
            if (this.monthsCache && this.monthsCache[monthKey]) {
                delete this.monthsCache[monthKey];
                console.log(`[DatabaseService] Removed ${monthKey} from in-memory cache`);
            }
            
            // Don't save to localStorage - data is deleted from database, will be reflected on next page load
            
            return true;
        } catch (error) {
            console.error(`[DatabaseService] Error deleting month ${monthKey}:`, error);
            console.error('[DatabaseService] Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            throw error;
        }
    },
    
    /**
     * Get all pots from database
     * @returns {Promise<Object>} Pots data object
     */
    async getAllPots() {
        try {
            if (!this.client) {
                await this.initialize();
            }
            
            const { data, error } = await this.client
                .from('pots')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) {
                throw error;
            }
            
            const potsObject = {};
            if (data && Array.isArray(data)) {
                data.forEach(pot => {
                    potsObject[pot.id] = this.transformPotFromDatabase(pot);
                });
            }
            
            return potsObject;
        } catch (error) {
            console.error('Error getting all pots:', error);
            throw error;
        }
    },
    
    /**
     * Save all pots to database
     * @param {Object} potsData - Pots data object
     * @returns {Promise<boolean>} Success status
     */
    async saveAllPots(potsData) {
        try {
            if (!this.client) {
                await this.initialize();
            }
            
            if (!potsData || typeof potsData !== 'object') {
                throw new Error('Pots data must be an object');
            }
            
            const potsArray = Object.values(potsData);
            
            if (potsArray.length === 0) {
                return true;
            }
            
            const potsRecords = potsArray.map(pot => this.transformPotToDatabase(pot));
            
            console.log('[DatabaseService] Upserting pots...');
            // For pots, we'll do a simple POST (no conflict resolution needed for now)
            const upsertResult = await this.queryUpsert('pots', potsRecords);
            
            if (upsertResult.error) {
                console.error('[DatabaseService] Error saving pots:', upsertResult.error);
                throw upsertResult.error;
            }
            
            console.log('[DatabaseService] Successfully saved pots');
            return true;
        } catch (error) {
            console.error('Error saving pots:', error);
            throw error;
        }
    },
    
    /**
     * Get settings from database
     * @returns {Promise<Object|null>} Settings object or null
     */
    async getSettings() {
        try {
            console.log('[DatabaseService] getSettings() called');
            const startTime = Date.now();
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            console.log('[DatabaseService] Querying settings table...');
            console.log('[DatabaseService] Client status:', this.client ? 'Available' : 'Not available');
            console.log('[DatabaseService] Client type:', typeof this.client);
            console.log('[DatabaseService] Client has from method:', typeof this.client?.from === 'function');
            
            // First, check if the settings table exists and has any data using direct fetch
            console.log('[DatabaseService] Checking if settings table exists and has data...');
            try {
                const tableCheckStart = Date.now();
                
                // Use centralized query interface to check table existence and row count
                console.log('[DatabaseService] Executing table existence and row count check...');
                const tableCheckResult = await Promise.race([
                    this.querySelect('settings', {
                        select: '*',
                        limit: 1
                    }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Table check timeout')), 3000))
                ]);
                
                const tableCheckElapsed = Date.now() - tableCheckStart;
                console.log(`[DatabaseService] Table check completed in ${tableCheckElapsed}ms`);
                console.log('[DatabaseService] Table check result:', tableCheckResult);
                
                if (tableCheckResult && tableCheckResult.error) {
                    console.error('[DatabaseService] Settings table check returned error:', tableCheckResult.error);
                    const errorMsg = tableCheckResult.error.message || '';
                    const errorCode = tableCheckResult.error.code || '';
                    
                    if (errorMsg.includes('relation') && errorMsg.includes('does not exist')) {
                        console.warn('[DatabaseService] Settings table does not exist - returning null');
                        return null;
                    }
                    
                    if (errorCode === 'PGRST116' || errorMsg.includes('No rows found')) {
                        console.warn('[DatabaseService] Settings table exists but is empty (PGRST116) - returning null');
                        return null;
                    }
                    
                    // If it's a different error, log it but continue with main query
                    console.warn('[DatabaseService] Table check error (continuing anyway):', tableCheckResult.error);
                }
                
                // Check if we got data back
                if (tableCheckResult && tableCheckResult.data !== undefined) {
                    const rowCount = Array.isArray(tableCheckResult.data) ? tableCheckResult.data.length : 0;
                    const count = tableCheckResult.count !== undefined ? tableCheckResult.count : rowCount;
                    
                    console.log(`[DatabaseService] Settings table row count: ${count} (from data array: ${rowCount})`);
                    
                    if (count === 0 || rowCount === 0) {
                        console.warn('[DatabaseService] Settings table exists but is empty - returning null');
                        return null;
                    }
                    
                    console.log('[DatabaseService] Settings table exists and has data - proceeding with main query');
                } else {
                    console.warn('[DatabaseService] Table check returned no data - table may be empty or inaccessible');
                    // Continue with main query to see if we get a more specific error
                }
            } catch (tableCheckError) {
                console.warn('[DatabaseService] Table check failed (non-fatal):', tableCheckError);
                const errorMsg = tableCheckError.message || '';
                
                if (errorMsg.includes('does not exist') || errorMsg.includes('relation')) {
                    console.warn('[DatabaseService] Settings table does not exist - returning null');
                    return null;
                }
                
                if (errorMsg.includes('timeout')) {
                    console.warn('[DatabaseService] Table check timed out - there may be a connection issue');
                    // Continue with main query to see if it works
                } else {
                    // Continue with the main query even if the check failed
                    console.log('[DatabaseService] Continuing with main query despite check failure');
                }
            }
            
            // Get current user ID for filtering
            const currentUserId = this._getCurrentUserId();
            if (!currentUserId) {
                console.warn('[DatabaseService] No authenticated user - cannot fetch settings');
                return null;
            }
            
            // Use centralized query interface for settings
            console.log('[DatabaseService] Querying settings for user_id:', currentUserId);
            const queryResult = await Promise.race([
                this.querySelect('settings', {
                    select: '*',
                    filter: { user_id: currentUserId },
                    limit: 1
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Settings fetch timeout')), 5000))
            ]).catch(err => {
                console.error('[DatabaseService] Settings query failed:', err);
                return { data: null, error: err };
            });
            
            const totalElapsed = Date.now() - startTime;
            console.log(`[DatabaseService] Settings fetch completed in ${totalElapsed}ms`);
            
            // Convert direct fetch result to Supabase-like format
            let queryResultFormatted;
            if (queryResult.error) {
                queryResultFormatted = { data: null, error: queryResult.error };
            } else if (queryResult.data && Array.isArray(queryResult.data) && queryResult.data.length > 0) {
                // Return single item (like .single() would)
                queryResultFormatted = { data: queryResult.data[0], error: null };
            } else if (queryResult.data && Array.isArray(queryResult.data) && queryResult.data.length === 0) {
                // No data found
                queryResultFormatted = { data: null, error: { code: 'PGRST116', message: 'No rows found' } };
            } else {
                queryResultFormatted = { data: queryResult.data, error: null };
            }
            
            const { data, error } = queryResultFormatted;
            
            if (error) {
                if (error.code === 'TIMEOUT') {
                    console.warn('[DatabaseService] Settings query timed out - returning null');
                    return null;
                }
                if (error.code === 'PGRST116') {
                    console.log('[DatabaseService] Settings not found (PGRST116) - returning null');
                    return null;
                }
                // Handle network/connection errors gracefully
                if (error.message && error.message.includes('Load failed')) {
                    console.warn('[DatabaseService] Settings table may not exist or connection failed. Returning null.');
                    return null;
                }
                console.error('[DatabaseService] Error fetching settings:', error);
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                });
                // Return null instead of throwing to prevent blocking initialization
                return null;
            }
            
            console.log('[DatabaseService] Settings fetched successfully:', data ? 'Found' : 'Not found');
            const settings = data ? this.transformSettingsFromDatabase(data) : null;
            if (settings) {
                console.log('[DatabaseService] Settings data:', settings);
            } else {
                console.log('[DatabaseService] No settings data returned');
            }
            
            return settings;
        } catch (error) {
            // Only log error once, don't spam console
            if (!this._settingsErrorLogged) {
                console.error('[DatabaseService] Error getting settings:', error);
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                });
                this._settingsErrorLogged = true;
            }
            // Return null instead of throwing to prevent cascading errors
            console.log('[DatabaseService] getSettings() returning null due to error');
            return null;
        }
    },
    
    /**
     * Save settings to database
     * @param {Object} settings - Settings object
     * @returns {Promise<boolean>} Success status
     */
    async saveSettings(settings) {
        try {
            console.log('[DatabaseService] saveSettings() called:', settings);
            
            if (!settings || typeof settings !== 'object') {
                throw new Error('Settings must be an object');
            }
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            // Get current user ID
            const currentUserId = this._getCurrentUserId();
            if (!currentUserId) {
                throw new Error('User must be authenticated to save settings');
            }
            
            const settingsRecord = this.transformSettingsToDatabase(settings);
            settingsRecord.user_id = currentUserId;
            console.log('[DatabaseService] Transformed settings record:', settingsRecord);
            
            console.log('[DatabaseService] Upserting to settings table for user_id:', currentUserId);
            
            // Use centralized upsert method with user_id as identifier
            const upsertResult = await this.queryUpsert('settings', settingsRecord, {
                identifier: 'user_id',
                identifierValue: currentUserId
            });
            
            if (upsertResult.error) {
                console.error('[DatabaseService] Error saving settings:', upsertResult.error);
                console.error('[DatabaseService] Error details:', {
                    message: upsertResult.error.message,
                    code: upsertResult.error.code,
                    details: upsertResult.error.details,
                    hint: upsertResult.error.hint,
                    status: upsertResult.error.status
                });
                throw upsertResult.error;
            }
            
            console.log('[DatabaseService] Successfully saved settings');
            if (upsertResult.data) {
                console.log('[DatabaseService] Upsert returned data:', upsertResult.data);
            }
            
            return true;
        } catch (error) {
            console.error('[DatabaseService] Error saving settings:', error);
            console.error('[DatabaseService] Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            throw error;
        }
    },
    
    /**
     * Transform month data from database format to application format
     * @param {Object} dbRecord - Database record
     * @returns {Object} Application format month data
     */
    transformMonthFromDatabase(dbRecord) {
        return {
            key: this.generateMonthKey(dbRecord.year, dbRecord.month),
            year: dbRecord.year,
            month: dbRecord.month,
            monthName: dbRecord.month_name || this.getMonthName(dbRecord.month),
            dateRange: dbRecord.date_range || {},
            weeklyBreakdown: dbRecord.weekly_breakdown || [],
            fixedCosts: dbRecord.fixed_costs || [],
            variableCosts: dbRecord.variable_costs || [],
            unplannedExpenses: dbRecord.unplanned_expenses || [],
            incomeSources: dbRecord.income_sources || [],
            pots: dbRecord.pots || [],
            createdAt: dbRecord.created_at,
            updatedAt: dbRecord.updated_at
        };
    },
    
    /**
     * Transform month data from application format to database format
     * @param {Object} monthData - Application format month data
     * @param {number} year - Year
     * @param {number} month - Month
     * @returns {Object} Database format record
     */
    transformMonthToDatabase(monthData, year, month, userId = null) {
        const now = new Date().toISOString();
        
        const record = {
            year: year,
            month: month,
            month_name: monthData.monthName || this.getMonthName(month),
            date_range: monthData.dateRange || {},
            weekly_breakdown: monthData.weeklyBreakdown || [],
            fixed_costs: monthData.fixedCosts || [],
            variable_costs: monthData.variableCosts || [],
            unplanned_expenses: monthData.unplannedExpenses || [],
            income_sources: monthData.incomeSources || [],
            pots: monthData.pots || [],
            updated_at: now,
            created_at: monthData.createdAt || now
        };
        
        // Include user_id only for user_months table
        if (userId !== null) {
            record.user_id = userId;
        }
        
        return record;
    },
    
    /**
     * Transform pot data from database format to application format
     * @param {Object} dbRecord - Database record
     * @returns {Object} Application format pot data
     */
    transformPotFromDatabase(dbRecord) {
        return {
            id: dbRecord.id,
            name: dbRecord.name,
            estimatedAmount: dbRecord.estimated_amount || 0,
            actualAmount: dbRecord.actual_amount || 0,
            comments: dbRecord.comments || '',
            createdAt: dbRecord.created_at,
            updatedAt: dbRecord.updated_at
        };
    },
    
    /**
     * Transform pot data from application format to database format
     * @param {Object} potData - Application format pot data
     * @returns {Object} Database format record
     */
    transformPotToDatabase(potData) {
        const now = new Date().toISOString();
        
        return {
            id: potData.id || undefined,
            name: potData.name || '',
            estimated_amount: potData.estimatedAmount || 0,
            actual_amount: potData.actualAmount || 0,
            comments: potData.comments || '',
            updated_at: now,
            created_at: potData.createdAt || now
        };
    },
    
    /**
     * Transform settings from database format to application format
     * @param {Object} dbRecord - Database record
     * @returns {Object} Application format settings
     */
    transformSettingsFromDatabase(dbRecord) {
        return {
            currency: dbRecord.currency || '£',
            fontSize: dbRecord.font_size || '16',
            defaultFixedCosts: dbRecord.default_fixed_costs || [],
            defaultVariableCategories: dbRecord.default_variable_categories || ['Food', 'Travel/Transport', 'Activities'],
            defaultPots: dbRecord.default_pots || []
        };
    },
    
    /**
     * Transform settings from application format to database format
     * @param {Object} settings - Application format settings
     * @returns {Object} Database format record
     */
    transformSettingsToDatabase(settings) {
        return {
            currency: settings.currency || '£',
            font_size: settings.fontSize || '16',
            default_fixed_costs: settings.defaultFixedCosts || [],
            default_variable_categories: settings.defaultVariableCategories || ['Food', 'Travel/Transport', 'Activities'],
            default_pots: settings.defaultPots || []
        };
    },
    
    /**
     * Generate month key from year and month
     * @param {number} year - Year
     * @param {number} month - Month (1-12)
     * @returns {string} Month key
     */
    generateMonthKey(year, month) {
        return `${year}-${String(month).padStart(2, '0')}`;
    },
    
    /**
     * Parse month key to year and month
     * Handles both formats: "2026-01" (year-month) and "january-2026" (monthname-year)
     * @param {string} monthKey - Month key
     * @returns {Object} Object with year and month
     */
    parseMonthKey(monthKey) {
        if (!monthKey || typeof monthKey !== 'string') {
            throw new Error('Invalid month key');
        }
        
        const parts = monthKey.split('-');
        if (parts.length !== 2) {
            throw new Error('Invalid month key format');
        }
        
        // Check if first part is a month name (text) or year (number)
        const firstPart = parts[0].toLowerCase();
        const secondPart = parts[1].toLowerCase();
        
        // Month names for conversion
        const monthNames = [
            'january', 'february', 'march', 'april', 'may', 'june',
            'july', 'august', 'september', 'october', 'november', 'december'
        ];
        
        let year, month;
        
        // Check if format is "monthname-year" (e.g., "january-2026")
        if (monthNames.includes(firstPart)) {
            month = monthNames.indexOf(firstPart) + 1; // Convert to 1-12
            year = parseInt(secondPart, 10);
            if (isNaN(year)) {
                throw new Error(`Invalid year in month key: ${monthKey}`);
            }
        }
        // Check if format is "year-month" (e.g., "2026-01")
        else {
            year = parseInt(firstPart, 10);
            month = parseInt(secondPart, 10);
            if (isNaN(year) || isNaN(month)) {
                throw new Error(`Invalid year or month in month key: ${monthKey}`);
            }
        }
        
        // Validate month is 1-12
        if (month < 1 || month > 12) {
            throw new Error(`Invalid month number: ${month} (must be 1-12)`);
        }
        
        return { year, month };
    },
    
    /**
     * Get month name from month number
     * @param {number} monthNumber - Month number (1-12)
     * @returns {string} Month name
     */
    getMonthName(monthNumber) {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        if (monthNumber < 1 || monthNumber > 12) {
            throw new Error('Invalid month number');
        }
        return monthNames[monthNumber - 1] || '';
    },
    
    /**
     * Clear all user data from database tables
     * Deletes all data from user_months and pots tables
     * Does NOT delete example_months or settings
     * @returns {Promise<Object>} Result object with success status and counts
     */
    async clearAllUserTables() {
        try {
            console.log('[DatabaseService] clearAllUserTables() called');
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            const result = {
                userMonthsDeleted: 0,
                potsDeleted: 0,
                success: false,
                errors: []
            };
            
            // Delete all user months using centralized query interface
            console.log('[DatabaseService] Deleting all user_months...');
            try {
                // Delete all rows - use a filter that matches all (id >= 1)
                // Note: queryDelete uses eq filters, so we need to use direct fetch for gte
                const deleteUrl = new URL(`${this.client.supabaseUrl}/rest/v1/user_months`);
                deleteUrl.searchParams.append('id', 'gte.1');
                deleteUrl.searchParams.append('select', '*');
                
                const deleteResponse = await fetch(deleteUrl.toString(), {
                    method: 'DELETE',
                    headers: this._getAuthHeaders()
                });
                
                const deleteResult = await this._handleResponse(deleteResponse);
                
                if (deleteResult.error) {
                    throw deleteResult.error;
                }
                
                const deletedMonths = deleteResult.data;
                result.userMonthsDeleted = deletedMonths ? (Array.isArray(deletedMonths) ? deletedMonths.length : 1) : 0;
                console.log(`[DatabaseService] Deleted ${result.userMonthsDeleted} user months`);
            } catch (monthsError) {
                console.error('[DatabaseService] Exception deleting user_months:', monthsError);
                result.errors.push(`user_months: ${monthsError.message}`);
            }
            
            // Delete all pots using centralized query interface
            console.log('[DatabaseService] Deleting all pots...');
            try {
                // Delete all rows - use a filter that matches all (id >= 1)
                const deleteUrl = new URL(`${this.client.supabaseUrl}/rest/v1/pots`);
                deleteUrl.searchParams.append('id', 'gte.1');
                deleteUrl.searchParams.append('select', '*');
                
                const deleteResponse = await fetch(deleteUrl.toString(), {
                    method: 'DELETE',
                    headers: this._getAuthHeaders()
                });
                
                const deleteResult = await this._handleResponse(deleteResponse);
                
                if (deleteResult.error) {
                    throw deleteResult.error;
                }
                
                const deletedPots = deleteResult.data;
                result.potsDeleted = deletedPots ? (Array.isArray(deletedPots) ? deletedPots.length : 1) : 0;
                console.log(`[DatabaseService] Deleted ${result.potsDeleted} pots`);
            } catch (potsError) {
                console.error('[DatabaseService] Exception deleting pots:', potsError);
                result.errors.push(`pots: ${potsError.message}`);
            }
            
            // Clear in-memory cache
            this.clearCache();
            console.log('[DatabaseService] Cleared in-memory cache');
            
            result.success = result.errors.length === 0;
            console.log('[DatabaseService] clearAllUserTables() completed:', result);
            
            return result;
        } catch (error) {
            console.error('[DatabaseService] Error clearing user tables:', error);
            throw error;
        }
    }
};

if (typeof window !== 'undefined') {
    window.DatabaseService = DatabaseService;
}

