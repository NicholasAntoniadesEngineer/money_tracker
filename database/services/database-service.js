/**
 * Database Service
 * Main service layer for all database operations using Supabase
 * Replaces localStorage and FileService
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
            console.log(`[DatabaseService] Checking example_months for year=${year}, month=${month} using direct fetch...`);
            
            const { data, error } = await this.directFetch('example_months', {
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
                            headers: {
                                'apikey': this.client.supabaseKey,
                                'Authorization': `Bearer ${this.client.supabaseKey}`,
                                'Content-Type': 'application/json',
                                'Prefer': 'return=representation'
                            }
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
     * Direct fetch helper - bypasses Supabase JS client when it hangs
     * Always fetches fresh data from database - no caching
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
        
        const headers = {
            'apikey': this.client.supabaseKey,
            'Authorization': `Bearer ${this.client.supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
        
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

    async getAllMonths(forceRefresh = false) {
        try {
            console.log('[DatabaseService] getAllMonths() called, forceRefresh:', forceRefresh);
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            // Always fetch fresh from database - no caching
            console.log('[DatabaseService] Fetching months from database...');
            
            // Fetch user months using direct fetch (Supabase JS client is hanging)
            console.log('[DatabaseService] Querying user_months table using direct fetch...');
            const userMonthsResult = await Promise.race([
                this.directFetch('user_months', {
                    select: '*',
                    order: [
                        { column: 'year', ascending: false },
                        { column: 'month', ascending: false }
                    ]
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('User months fetch timeout')), 10000))
            ]).catch(err => {
                console.error('[DatabaseService] Direct fetch for user_months failed:', err);
                return { data: null, error: err };
            });
            
            const { data: userMonthsData, error: userMonthsError } = userMonthsResult;
            
            if (userMonthsError) {
                console.error('[DatabaseService] Error fetching user_months:', userMonthsError);
                throw userMonthsError;
            }
            
            console.log(`[DatabaseService] user_months query result: ${userMonthsData ? userMonthsData.length : 0} months found`);
            if (userMonthsData && userMonthsData.length > 0) {
                console.log('[DatabaseService] user_months data:', userMonthsData.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`));
            }
            
            // Fetch example months using direct fetch
            console.log('[DatabaseService] Querying example_months table using direct fetch...');
            let exampleMonthsData = [];
            const exampleMonthsResult = await Promise.race([
                this.directFetch('example_months', {
                    select: '*',
                    order: [
                        { column: 'year', ascending: false },
                        { column: 'month', ascending: false }
                    ]
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Example months fetch timeout')), 10000))
            ]).catch(err => {
                console.error('[DatabaseService] Direct fetch for example_months failed:', err);
                return { data: null, error: err };
            });
            
            const { data: exampleData, error: exampleMonthsError } = exampleMonthsResult;
            
            if (exampleMonthsError) {
                // If table doesn't exist yet, log warning but don't fail
                if (exampleMonthsError.message && exampleMonthsError.message.includes('relation') && exampleMonthsError.message.includes('does not exist')) {
                    console.warn('[DatabaseService] example_months table does not exist yet. Run schema-fresh-install.sql to create it.');
                    exampleMonthsData = [];
                } else {
                    console.error('[DatabaseService] Error fetching example_months:', exampleMonthsError);
                    // Don't throw - just log and continue with empty array
                    exampleMonthsData = [];
                }
            } else {
                exampleMonthsData = exampleData || [];
                console.log(`[DatabaseService] example_months query result: ${exampleMonthsData.length} months found`);
                if (exampleMonthsData.length > 0) {
                    console.log('[DatabaseService] example_months data:', exampleMonthsData.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`));
                }
            }
            
            const monthsObject = {};
            
            // Add user months
            if (userMonthsData && Array.isArray(userMonthsData)) {
                console.log(`[DatabaseService] Processing ${userMonthsData.length} user months...`);
                userMonthsData.forEach(monthRecord => {
                    const monthKey = this.generateMonthKey(monthRecord.year, monthRecord.month);
                    monthsObject[monthKey] = this.transformMonthFromDatabase(monthRecord);
                });
            }
            
            // Add example months (they will override user months if same key exists, which shouldn't happen)
            if (Array.isArray(exampleMonthsData) && exampleMonthsData.length > 0) {
                console.log(`[DatabaseService] Processing ${exampleMonthsData.length} example months...`);
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
            
            // First check example_months using direct fetch
            console.log(`[DatabaseService] Checking example_months for ${year}-${month} using direct fetch...`);
            let fetchResult = await this.directFetch('example_months', {
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
            } else if (fetchResult.error && (fetchResult.error.code === 'PGRST116' || fetchResult.error.status === 404)) {
                // Not found in example_months, check user_months
                console.log(`[DatabaseService] Not found in example_months, checking user_months using direct fetch...`);
                const userFetchResult = await this.directFetch('user_months', {
                    select: '*',
                    filter: { year: year, month: month },
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
                }
            } else if (fetchResult.error) {
                console.error(`[DatabaseService] Error fetching from example_months:`, fetchResult.error);
                error = fetchResult.error;
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
            
            const monthRecord = this.transformMonthToDatabase(monthData, year, month);
            console.log(`[DatabaseService] Transformed month record:`, {
                year: monthRecord.year,
                month: monthRecord.month,
                month_name: monthRecord.month_name
            });
            
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
            
            console.log(`[DatabaseService] Upserting to ${tableName} table using direct fetch...`);
            
            // Use PATCH method with Prefer header for upsert (Supabase REST API)
            // Upsert = update if exists, insert if not
            const upsertUrl = new URL(`${this.client.supabaseUrl}/rest/v1/${tableName}`);
            upsertUrl.searchParams.append('year', `eq.${year}`);
            upsertUrl.searchParams.append('month', `eq.${month}`);
            upsertUrl.searchParams.append('select', '*');
            
            // Try PATCH first (update if exists)
            let upsertResponse = await fetch(upsertUrl.toString(), {
                method: 'PATCH',
                headers: {
                    'apikey': this.client.supabaseKey,
                    'Authorization': `Bearer ${this.client.supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                },
                body: JSON.stringify(monthRecord)
            });
            
            // If PATCH returns 404 or no rows updated, use POST (insert)
            if (!upsertResponse.ok || upsertResponse.status === 404) {
                console.log(`[DatabaseService] PATCH returned ${upsertResponse.status}, trying POST for insert...`);
                const insertUrl = new URL(`${this.client.supabaseUrl}/rest/v1/${tableName}`);
                upsertResponse = await fetch(insertUrl.toString(), {
                    method: 'POST',
                    headers: {
                        'apikey': this.client.supabaseKey,
                        'Authorization': `Bearer ${this.client.supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(monthRecord)
                });
            }
            
            if (!upsertResponse.ok) {
                const errorText = await upsertResponse.text();
                let errorObj;
                try {
                    errorObj = JSON.parse(errorText);
                } catch {
                    errorObj = { message: errorText };
                }
                const error = {
                    message: errorObj.message || errorText,
                    code: errorObj.code,
                    details: errorObj.details,
                    hint: errorObj.hint,
                    status: upsertResponse.status
                };
                console.error(`[DatabaseService] Error upserting to ${tableName}:`, error);
                console.error('[DatabaseService] Error details:', error);
                throw error;
            }
            
            const upsertData = await upsertResponse.json();
            console.log(`[DatabaseService] Successfully saved month ${monthKey} to ${tableName} table`);
            if (upsertData && Array.isArray(upsertData) && upsertData.length > 0) {
                console.log(`[DatabaseService] Upsert returned data:`, upsertData[0]);
            } else if (upsertData) {
                console.log(`[DatabaseService] Upsert returned data:`, upsertData);
            }
            
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
            
            // Only delete from user_months (never from example_months) using direct fetch
            console.log(`[DatabaseService] Deleting from user_months table using direct fetch...`);
            
            // Build delete URL with filters
            const deleteUrl = new URL(`${this.client.supabaseUrl}/rest/v1/user_months`);
            deleteUrl.searchParams.append('year', `eq.${year}`);
            deleteUrl.searchParams.append('month', `eq.${month}`);
            deleteUrl.searchParams.append('select', '*');
            
            const deleteResponse = await fetch(deleteUrl.toString(), {
                method: 'DELETE',
                headers: {
                    'apikey': this.client.supabaseKey,
                    'Authorization': `Bearer ${this.client.supabaseKey}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
            });
            
            if (!deleteResponse.ok) {
                const errorText = await deleteResponse.text();
                let errorObj;
                try {
                    errorObj = JSON.parse(errorText);
                } catch {
                    errorObj = { message: errorText };
                }
                const error = {
                    message: errorObj.message || errorText,
                    code: errorObj.code,
                    details: errorObj.details,
                    hint: errorObj.hint,
                    status: deleteResponse.status
                };
                console.error(`[DatabaseService] Error deleting from user_months:`, error);
                console.error('[DatabaseService] Error details:', error);
                throw error;
            }
            
            const deletedData = await deleteResponse.json();
            console.log(`[DatabaseService] Successfully deleted month ${monthKey} from user_months`);
            if (deletedData && deletedData.length > 0) {
                console.log(`[DatabaseService] Delete returned data:`, deletedData);
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
            
            console.log('[DatabaseService] Upserting pots using direct fetch...');
            const upsertResult = await this.directFetch('pots', {
                method: 'POST',
                body: potsRecords
            });
            
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
                
                // Use direct fetch to check table existence and row count
                console.log('[DatabaseService] Executing table existence and row count check using direct fetch...');
                const tableCheckResult = await Promise.race([
                    this.directFetch('settings', {
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
            
            // Use direct fetch instead of Supabase JS client (which is hanging)
            console.log('[DatabaseService] Using direct fetch for settings query...');
            const queryResult = await Promise.race([
                this.directFetch('settings', {
                    select: '*',
                    filter: { id: 1 },
                    limit: 1
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Settings fetch timeout')), 5000))
            ]).catch(err => {
                console.error('[DatabaseService] Direct fetch for settings failed:', err);
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
            
            const settingsRecord = this.transformSettingsToDatabase(settings);
            console.log('[DatabaseService] Transformed settings record:', settingsRecord);
            
            console.log('[DatabaseService] Upserting to settings table using direct fetch...');
            
            // Use POST with Prefer header for upsert
            const upsertResult = await this.directFetch('settings', {
                method: 'POST',
                body: { id: 1, ...settingsRecord },
                onConflict: 'id'
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
    transformMonthToDatabase(monthData, year, month) {
        const now = new Date().toISOString();
        
        return {
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
            
            // Delete all user months using direct fetch
            console.log('[DatabaseService] Deleting all user_months using direct fetch...');
            try {
                // Delete all rows by using a filter that matches all (id >= 1)
                const deleteUrl = new URL(`${this.client.supabaseUrl}/rest/v1/user_months`);
                deleteUrl.searchParams.append('id', 'gte.1');
                deleteUrl.searchParams.append('select', '*');
                
                const deleteResponse = await fetch(deleteUrl.toString(), {
                    method: 'DELETE',
                    headers: {
                        'apikey': this.client.supabaseKey,
                        'Authorization': `Bearer ${this.client.supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    }
                });
                
                if (!deleteResponse.ok) {
                    const errorText = await deleteResponse.text();
                    throw new Error(`HTTP ${deleteResponse.status}: ${errorText}`);
                }
                
                const deletedMonths = await deleteResponse.json();
                result.userMonthsDeleted = deletedMonths ? (Array.isArray(deletedMonths) ? deletedMonths.length : 1) : 0;
                console.log(`[DatabaseService] Deleted ${result.userMonthsDeleted} user months`);
            } catch (monthsError) {
                console.error('[DatabaseService] Exception deleting user_months:', monthsError);
                result.errors.push(`user_months: ${monthsError.message}`);
            }
            
            // Delete all pots using direct fetch
            console.log('[DatabaseService] Deleting all pots using direct fetch...');
            try {
                // Delete all rows by using a filter that matches all (id >= 1)
                const deleteUrl = new URL(`${this.client.supabaseUrl}/rest/v1/pots`);
                deleteUrl.searchParams.append('id', 'gte.1');
                deleteUrl.searchParams.append('select', '*');
                
                const deleteResponse = await fetch(deleteUrl.toString(), {
                    method: 'DELETE',
                    headers: {
                        'apikey': this.client.supabaseKey,
                        'Authorization': `Bearer ${this.client.supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    }
                });
                
                if (!deleteResponse.ok) {
                    const errorText = await deleteResponse.text();
                    throw new Error(`HTTP ${deleteResponse.status}: ${errorText}`);
                }
                
                const deletedPots = await deleteResponse.json();
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

