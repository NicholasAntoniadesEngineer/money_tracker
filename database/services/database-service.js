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
            console.log(`[DatabaseService] Checking example_months for year=${year}, month=${month}...`);
            
            const { data, error } = await this.client
                .from('example_months')
                .select('id')
                .eq('year', year)
                .eq('month', month)
                .single();
            
            if (error) {
                if (error.code === 'PGRST116') {
                    console.log(`[DatabaseService] ${monthKey} not found in example_months (PGRST116) - not example data`);
                    return false; // Not found in example_months
                }
                console.error(`[DatabaseService] Error checking example_months:`, error);
                throw error;
            }
            
            const isExample = data !== null;
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
    async getAllMonths(forceRefresh = false) {
        try {
            console.log('[DatabaseService] getAllMonths() called, forceRefresh:', forceRefresh);
            
            if (!this.client) {
                console.log('[DatabaseService] Client not initialized, initializing...');
                await this.initialize();
            }
            
            // Always fetch fresh from database - no caching
            console.log('[DatabaseService] Fetching months from database...');
            
            // Fetch user months
            console.log('[DatabaseService] Querying user_months table...');
            const { data: userMonthsData, error: userMonthsError } = await this.client
                .from('user_months')
                .select('*')
                .order('year', { ascending: false })
                .order('month', { ascending: false });
            
            if (userMonthsError) {
                console.error('[DatabaseService] Error fetching user_months:', userMonthsError);
                throw userMonthsError;
            }
            
            console.log(`[DatabaseService] user_months query result: ${userMonthsData ? userMonthsData.length : 0} months found`);
            if (userMonthsData && userMonthsData.length > 0) {
                console.log('[DatabaseService] user_months data:', userMonthsData.map(m => `${m.year}-${String(m.month).padStart(2, '0')}`));
            }
            
            // Fetch example months
            console.log('[DatabaseService] Querying example_months table...');
            let exampleMonthsData = [];
            const { data: exampleData, error: exampleMonthsError } = await this.client
                .from('example_months')
                .select('*')
                .order('year', { ascending: false })
                .order('month', { ascending: false });
            
            if (exampleMonthsError) {
                // If table doesn't exist yet, log warning but don't fail
                if (exampleMonthsError.message && exampleMonthsError.message.includes('relation') && exampleMonthsError.message.includes('does not exist')) {
                    console.warn('[DatabaseService] example_months table does not exist yet. Run schema-fresh-install.sql to create it.');
                    exampleMonthsData = [];
                } else {
                    console.error('[DatabaseService] Error fetching example_months:', exampleMonthsError);
                    throw exampleMonthsError;
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
            
            // Always fetch fresh from database - check both tables
            const { year, month } = this.parseMonthKey(monthKey);
            console.log(`[DatabaseService] Parsed monthKey: year=${year}, month=${month}`);
            
            // First check example_months
            console.log(`[DatabaseService] Checking example_months for ${year}-${month}...`);
            let { data, error } = await this.client
                .from('example_months')
                .select('*')
                .eq('year', year)
                .eq('month', month)
                .single();
            
            // If not found in example_months, check user_months
            if (error && error.code === 'PGRST116') {
                console.log(`[DatabaseService] Not found in example_months, checking user_months...`);
                const { data: userData, error: userError } = await this.client
                    .from('user_months')
                    .select('*')
                    .eq('year', year)
                    .eq('month', month)
                    .single();
                
                if (userError) {
                    if (userError.code === 'PGRST116') {
                        console.log(`[DatabaseService] Month ${monthKey} not found in either table`);
                        return null; // Not found in either table
                    }
                    console.error(`[DatabaseService] Error fetching from user_months:`, userError);
                    throw userError;
                }
                
                console.log(`[DatabaseService] Found month ${monthKey} in user_months table`);
                data = userData;
                error = null;
            } else if (error) {
                console.error(`[DatabaseService] Error fetching from example_months:`, error);
                throw error;
            } else {
                console.log(`[DatabaseService] Found month ${monthKey} in example_months table`);
            }
            
            const monthData = data ? this.transformMonthFromDatabase(data) : null;
            console.log(`[DatabaseService] getMonth() completed for ${monthKey}:`, monthData ? 'Found' : 'Not found');
            
            // Update in-memory cache for current session only
            if (monthData) {
                if (!this.monthsCache) {
                    this.monthsCache = {};
                }
                this.monthsCache[monthKey] = monthData;
            }
            
            return monthData;
        } catch (error) {
            console.error(`[DatabaseService] Error getting month ${monthKey}:`, error);
            console.error('[DatabaseService] Error details:', {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            });
            
            // If database fetch fails, try to use in-memory cache as fallback
            if (this.monthsCache && this.monthsCache[monthKey]) {
                console.warn(`[DatabaseService] Database fetch failed for ${monthKey}, using in-memory cache as fallback`);
                return { ...this.monthsCache[monthKey] };
            }
            
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
            
            console.log(`[DatabaseService] Upserting to ${tableName} table...`);
            const { data, error } = await this.client
                .from(tableName)
                .upsert(monthRecord, { onConflict: 'year,month' })
                .select();
            
            if (error) {
                console.error(`[DatabaseService] Error upserting to ${tableName}:`, error);
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                });
                throw error;
            }
            
            console.log(`[DatabaseService] Successfully saved month ${monthKey} to ${tableName} table`);
            if (data && data.length > 0) {
                console.log(`[DatabaseService] Upsert returned data:`, data[0]);
            }
            
            // Update in-memory cache for current session only
            if (!this.monthsCache) {
                this.monthsCache = {};
            }
            this.monthsCache[monthKey] = monthData;
            this.cacheTimestamp = Date.now();
            
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
            
            // Only delete from user_months (never from example_months)
            console.log(`[DatabaseService] Deleting from user_months table...`);
            const { data, error } = await this.client
                .from('user_months')
                .delete()
                .eq('year', year)
                .eq('month', month)
                .select();
            
            if (error) {
                console.error(`[DatabaseService] Error deleting from user_months:`, error);
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                });
                throw error;
            }
            
            console.log(`[DatabaseService] Successfully deleted month ${monthKey} from user_months`);
            if (data && data.length > 0) {
                console.log(`[DatabaseService] Delete returned data:`, data);
            }
            
            // Update in-memory cache after deletion
            if (this.monthsCache && this.monthsCache[monthKey]) {
                delete this.monthsCache[monthKey];
                this.cacheTimestamp = Date.now();
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
            
            const { error } = await this.client
                .from('pots')
                .upsert(potsRecords);
            
            if (error) {
                throw error;
            }
            
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
            
            // Wrap the entire query in a timeout to prevent indefinite hanging
            const queryWithTimeout = async () => {
                return new Promise(async (resolve, reject) => {
                    console.log('[DatabaseService] Setting up timeout wrapper...');
                    
                    // Set up timeout
                    const timeoutId = setTimeout(() => {
                        const elapsed = Date.now() - startTime;
                        console.error(`[DatabaseService] Settings query timeout after 5 seconds (elapsed: ${elapsed}ms) - returning null`);
                        resolve({ data: null, error: { message: 'Query timeout', code: 'TIMEOUT' } });
                    }, 5000);
                    
                    console.log('[DatabaseService] Timeout set for 5 seconds');
                    
                    try {
                        console.log('[DatabaseService] Creating query builder...');
                        const queryBuilder = this.client.from('settings');
                        console.log('[DatabaseService] Query builder created:', typeof queryBuilder);
                        
                        console.log('[DatabaseService] Adding select...');
                        const selectBuilder = queryBuilder.select('*');
                        console.log('[DatabaseService] Select added:', typeof selectBuilder);
                        
                        console.log('[DatabaseService] Adding eq filter...');
                        const eqBuilder = selectBuilder.eq('id', 1);
                        console.log('[DatabaseService] Eq filter added:', typeof eqBuilder);
                        
                        console.log('[DatabaseService] Adding single()...');
                        const singleBuilder = eqBuilder.single();
                        console.log('[DatabaseService] Single() added, executing query...');
                        console.log('[DatabaseService] Query builder chain complete, awaiting result...');
                        
                        const queryStartTime = Date.now();
                        const result = await singleBuilder;
                        const queryElapsed = Date.now() - queryStartTime;
                        
                        console.log(`[DatabaseService] Query completed in ${queryElapsed}ms, result:`, result);
                        console.log('[DatabaseService] Result type:', typeof result);
                        console.log('[DatabaseService] Result has data:', 'data' in result);
                        console.log('[DatabaseService] Result has error:', 'error' in result);
                        
                        clearTimeout(timeoutId);
                        console.log('[DatabaseService] Timeout cleared, resolving with result');
                        resolve(result);
                    } catch (queryError) {
                        const elapsed = Date.now() - startTime;
                        clearTimeout(timeoutId);
                        console.error(`[DatabaseService] Query threw error after ${elapsed}ms:`, queryError);
                        console.error('[DatabaseService] Error type:', typeof queryError);
                        console.error('[DatabaseService] Error constructor:', queryError?.constructor?.name);
                        console.error('[DatabaseService] Error message:', queryError?.message);
                        console.error('[DatabaseService] Error stack:', queryError?.stack);
                        resolve({ data: null, error: queryError });
                    }
                });
            };
            
            console.log('[DatabaseService] Calling queryWithTimeout...');
            const queryResult = await queryWithTimeout();
            const totalElapsed = Date.now() - startTime;
            console.log(`[DatabaseService] queryWithTimeout completed in ${totalElapsed}ms`);
            console.log('[DatabaseService] Query result:', queryResult);
            
            const { data, error } = queryResult;
            
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
            
            console.log('[DatabaseService] Upserting to settings table...');
            const { data, error } = await this.client
                .from('settings')
                .upsert({ id: 1, ...settingsRecord }, { onConflict: 'id' })
                .select();
            
            if (error) {
                console.error('[DatabaseService] Error saving settings:', error);
                console.error('[DatabaseService] Error details:', {
                    message: error.message,
                    code: error.code,
                    details: error.details,
                    hint: error.hint
                });
                throw error;
            }
            
            console.log('[DatabaseService] Successfully saved settings');
            if (data && data.length > 0) {
                console.log('[DatabaseService] Upsert returned data:', data[0]);
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
        return {
            year: parseInt(parts[0], 10),
            month: parseInt(parts[1], 10)
        };
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
    }
};

if (typeof window !== 'undefined') {
    window.DatabaseService = DatabaseService;
}

