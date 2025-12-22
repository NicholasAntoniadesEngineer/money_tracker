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
            if (!this.client) {
                await this.initialize();
            }
            
            const { year, month } = this.parseMonthKey(monthKey);
            
            const { data, error } = await this.client
                .from('example_months')
                .select('id')
                .eq('year', year)
                .eq('month', month)
                .single();
            
            if (error) {
                if (error.code === 'PGRST116') {
                    return false; // Not found in example_months
                }
                throw error;
            }
            
            return data !== null;
        } catch (error) {
            console.warn(`Error checking if ${monthKey} is example data:`, error);
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
        const isExample = await this.isExampleData(monthKey);
        return isExample ? 'example_months' : 'user_months';
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
        this.monthsCache = null;
        this.cacheTimestamp = null;
        try {
            localStorage.removeItem(this.CACHE_STORAGE_KEY);
            localStorage.removeItem(this.CACHE_TIMESTAMP_KEY);
        } catch (error) {
            console.warn('Error clearing cache from storage:', error);
        }
    },
    
    /**
     * Clear example months from cache only (not from database)
     * Uses year-based check for faster performance
     * @returns {Promise<void>}
     */
    async clearExampleDataFromCache() {
        try {
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
                    
                    exampleMonthKeys.forEach(monthKey => {
                        delete monthsCache[monthKey];
                    });
                    
                    localStorage.setItem(this.CACHE_STORAGE_KEY, JSON.stringify(monthsCache));
                    localStorage.setItem(this.CACHE_TIMESTAMP_KEY, Date.now().toString());
                } catch (error) {
                    console.warn('Error processing cache:', error);
                    // If cache is corrupted, just remove it
                    localStorage.removeItem(this.CACHE_STORAGE_KEY);
                    localStorage.removeItem(this.CACHE_TIMESTAMP_KEY);
                }
            }
        } catch (error) {
            console.error('Error clearing example data from cache:', error);
            throw error;
        }
    },
    
    /**
     * Initialize database service with Supabase client
     * @returns {Promise<boolean>} Success status
     */
    async initialize() {
        try {
            if (!window.SupabaseConfig) {
                throw new Error('SupabaseConfig not available');
            }
            
            this.client = window.SupabaseConfig.getClient();
            
            if (!this.client) {
                throw new Error('Failed to initialize Supabase client');
            }
            
            // Always initialize fresh - never load cache from localStorage
            // User data is always loaded from user_months table on every page load
            // Example data is loaded from example_months table
            // Cache is only used for example data clearing functionality (local only)
            console.log('Database service initialized - will fetch fresh data from database');
            
            return true;
        } catch (error) {
            console.error('Error initializing database service:', error);
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
            if (!this.client) {
                await this.initialize();
            }
            
            // Always fetch fresh from database - no caching
            console.log('Fetching months from database...');
            
            // Fetch user months
            const { data: userMonthsData, error: userMonthsError } = await this.client
                .from('user_months')
                .select('*')
                .order('year', { ascending: false })
                .order('month', { ascending: false });
            
            if (userMonthsError) {
                throw userMonthsError;
            }
            
            // Fetch example months
            let exampleMonthsData = [];
            const { data: exampleData, error: exampleMonthsError } = await this.client
                .from('example_months')
                .select('*')
                .order('year', { ascending: false })
                .order('month', { ascending: false });
            
            if (exampleMonthsError) {
                // If table doesn't exist yet, log warning but don't fail
                if (exampleMonthsError.message && exampleMonthsError.message.includes('relation') && exampleMonthsError.message.includes('does not exist')) {
                    console.warn('example_months table does not exist yet. Run schema-fresh-install.sql to create it.');
                    exampleMonthsData = [];
                } else {
                    throw exampleMonthsError;
                }
            } else {
                exampleMonthsData = exampleData || [];
            }
            
            const monthsObject = {};
            
            // Add user months
            if (userMonthsData && Array.isArray(userMonthsData)) {
                userMonthsData.forEach(monthRecord => {
                    const monthKey = this.generateMonthKey(monthRecord.year, monthRecord.month);
                    monthsObject[monthKey] = this.transformMonthFromDatabase(monthRecord);
                });
            }
            
            // Add example months (they will override user months if same key exists, which shouldn't happen)
            if (Array.isArray(exampleMonthsData) && exampleMonthsData.length > 0) {
                exampleMonthsData.forEach(monthRecord => {
                    const monthKey = this.generateMonthKey(monthRecord.year, monthRecord.month);
                    monthsObject[monthKey] = this.transformMonthFromDatabase(monthRecord);
                });
            }
            
            // Update in-memory cache for current session only (not persisted)
            this.monthsCache = monthsObject;
            this.cacheTimestamp = Date.now();
            
            // Don't save to localStorage - always fetch fresh from database
            // Only save cache to storage for example data clearing functionality
            // User data is always loaded fresh from user_months table
            
            return monthsObject;
        } catch (error) {
            console.error('Error getting all months:', error);
            
            // If database fetch fails, try to use cache as fallback
            if (this.monthsCache) {
                console.warn('Database fetch failed, using cached data as fallback');
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
            if (!monthKey) {
                throw new Error('Month key is required');
            }
            
            if (!this.client) {
                await this.initialize();
            }
            
            // Always fetch fresh from database - check both tables
            const { year, month } = this.parseMonthKey(monthKey);
            
            // First check example_months
            let { data, error } = await this.client
                .from('example_months')
                .select('*')
                .eq('year', year)
                .eq('month', month)
                .single();
            
            // If not found in example_months, check user_months
            if (error && error.code === 'PGRST116') {
                const { data: userData, error: userError } = await this.client
                    .from('user_months')
                    .select('*')
                    .eq('year', year)
                    .eq('month', month)
                    .single();
                
                if (userError) {
                    if (userError.code === 'PGRST116') {
                        return null; // Not found in either table
                    }
                    throw userError;
                }
                
                data = userData;
                error = null;
            } else if (error) {
                throw error;
            }
            
            const monthData = data ? this.transformMonthFromDatabase(data) : null;
            
            // Update in-memory cache for current session only
            if (monthData) {
                if (!this.monthsCache) {
                    this.monthsCache = {};
                }
                this.monthsCache[monthKey] = monthData;
            }
            
            return monthData;
        } catch (error) {
            console.error(`Error getting month ${monthKey}:`, error);
            
            // If database fetch fails, try to use in-memory cache as fallback
            if (this.monthsCache && this.monthsCache[monthKey]) {
                console.warn(`Database fetch failed for ${monthKey}, using in-memory cache as fallback`);
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
            if (!monthKey || !monthData) {
                throw new Error('Month key and data are required');
            }
            
            if (!this.client) {
                await this.initialize();
            }
            
            const { year, month } = this.parseMonthKey(monthKey);
            
            const monthRecord = this.transformMonthToDatabase(monthData, year, month);
            
            // Determine which table to use
            // If forceUserTable is true (for imports), always use user_months
            // Otherwise, check if it's example data
            let tableName;
            if (forceUserTable) {
                tableName = 'user_months';
            } else {
                tableName = await this.getTableName(monthKey);
            }
            
            const { error } = await this.client
                .from(tableName)
                .upsert(monthRecord, { onConflict: 'year,month' });
            
            if (error) {
                throw error;
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
            console.error(`Error saving month ${monthKey}:`, error);
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
            if (!monthKey) {
                throw new Error('Month key is required');
            }
            
            if (!this.client) {
                await this.initialize();
            }
            
            // Protect example data from deletion
            const isExample = await this.isExampleData(monthKey);
            if (isExample) {
                throw new Error('Example data cannot be deleted. This data is protected.');
            }
            
            const { year, month } = this.parseMonthKey(monthKey);
            
            // Only delete from user_months (never from example_months)
            const { error } = await this.client
                .from('user_months')
                .delete()
                .eq('year', year)
                .eq('month', month);
            
            if (error) {
                throw error;
            }
            
            // Update in-memory cache after deletion
            if (this.monthsCache && this.monthsCache[monthKey]) {
                delete this.monthsCache[monthKey];
                this.cacheTimestamp = Date.now();
            }
            
            // Don't save to localStorage - data is deleted from database, will be reflected on next page load
            
            return true;
        } catch (error) {
            console.error(`Error deleting month ${monthKey}:`, error);
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
            if (!this.client) {
                await this.initialize();
            }
            
            const { data, error } = await this.client
                .from('settings')
                .select('*')
                .eq('id', 1)
                .single();
            
            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }
                // Handle network/connection errors gracefully
                if (error.message && error.message.includes('Load failed')) {
                    console.warn('Settings table may not exist or connection failed. Returning null.');
                    return null;
                }
                throw error;
            }
            
            return data ? this.transformSettingsFromDatabase(data) : null;
        } catch (error) {
            // Only log error once, don't spam console
            if (!this._settingsErrorLogged) {
                console.error('Error getting settings:', error);
                this._settingsErrorLogged = true;
            }
            // Return null instead of throwing to prevent cascading errors
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
            if (!settings || typeof settings !== 'object') {
                throw new Error('Settings must be an object');
            }
            
            if (!this.client) {
                await this.initialize();
            }
            
            const settingsRecord = this.transformSettingsToDatabase(settings);
            
            const { error } = await this.client
                .from('settings')
                .upsert({ id: 1, ...settingsRecord }, { onConflict: 'id' });
            
            if (error) {
                throw error;
            }
            
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
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

