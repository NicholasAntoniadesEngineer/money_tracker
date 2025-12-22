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
     * @param {string} monthKey - Month key
     * @returns {boolean} True if example data
     */
    isExampleData(monthKey) {
        try {
            const { year } = this.parseMonthKey(monthKey);
            return year === this.EXAMPLE_YEAR;
        } catch (error) {
            return false;
        }
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
            
            // Load cache from localStorage on initialization
            const cachedData = this.loadCacheFromStorage();
            if (cachedData) {
                this.monthsCache = cachedData;
                this.cacheTimestamp = Date.now();
                console.log('Database service initialized with cached data');
            } else {
                console.log('Database service initialized');
            }
            
            return true;
        } catch (error) {
            console.error('Error initializing database service:', error);
            throw error;
        }
    },
    
    /**
     * Get all months from database (with caching)
     * @param {boolean} forceRefresh - Force refresh from database, bypass cache
     * @returns {Promise<Object>} Object with all months keyed by monthKey
     */
    async getAllMonths(forceRefresh = false) {
        try {
            if (!this.client) {
                await this.initialize();
            }
            
            // Check cache first (unless force refresh)
            if (!forceRefresh && this.monthsCache && this.cacheTimestamp) {
                const now = Date.now();
                // Use cache if it's less than 24 hours old
                if (now - this.cacheTimestamp < this.CACHE_DURATION) {
                    console.log('Using cached months data');
                    return { ...this.monthsCache }; // Return copy to prevent mutation
                }
            }
            
            // Fetch from database
            console.log('Fetching months from database...');
            const { data, error } = await this.client
                .from('months')
                .select('*')
                .order('year', { ascending: false })
                .order('month', { ascending: false });
            
            if (error) {
                throw error;
            }
            
            const monthsObject = {};
            if (data && Array.isArray(data)) {
                data.forEach(monthRecord => {
                    const monthKey = this.generateMonthKey(monthRecord.year, monthRecord.month);
                    monthsObject[monthKey] = this.transformMonthFromDatabase(monthRecord);
                });
            }
            
            // Update cache
            this.monthsCache = monthsObject;
            this.cacheTimestamp = Date.now();
            this.saveCacheToStorage(monthsObject);
            
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
     * Get a specific month by monthKey (with caching)
     * @param {string} monthKey - Month key (e.g., "2025-11")
     * @param {boolean} forceRefresh - Force refresh from database, bypass cache
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
            
            // Check cache first (unless force refresh)
            if (!forceRefresh && this.monthsCache && this.cacheTimestamp) {
                const now = Date.now();
                // Use cache if it's less than 24 hours old
                if (now - this.cacheTimestamp < this.CACHE_DURATION) {
                    if (this.monthsCache[monthKey]) {
                        console.log(`Using cached data for month ${monthKey}`);
                        return { ...this.monthsCache[monthKey] }; // Return copy to prevent mutation
                    }
                }
            }
            
            // If not in cache or cache expired, fetch from database
            const { year, month } = this.parseMonthKey(monthKey);
            
            const { data, error } = await this.client
                .from('months')
                .select('*')
                .eq('year', year)
                .eq('month', month)
                .single();
            
            if (error) {
                if (error.code === 'PGRST116') {
                    return null;
                }
                throw error;
            }
            
            const monthData = data ? this.transformMonthFromDatabase(data) : null;
            
            // Update cache if we got data
            if (monthData && this.monthsCache) {
                this.monthsCache[monthKey] = monthData;
                this.saveCacheToStorage(this.monthsCache);
            }
            
            return monthData;
        } catch (error) {
            console.error(`Error getting month ${monthKey}:`, error);
            
            // If database fetch fails, try to use cache as fallback
            if (this.monthsCache && this.monthsCache[monthKey]) {
                console.warn(`Database fetch failed for ${monthKey}, using cached data as fallback`);
                return { ...this.monthsCache[monthKey] };
            }
            
            throw error;
        }
    },
    
    /**
     * Save a month to database
     * @param {string} monthKey - Month key
     * @param {Object} monthData - Month data object
     * @returns {Promise<boolean>} Success status
     */
    async saveMonth(monthKey, monthData) {
        try {
            if (!monthKey || !monthData) {
                throw new Error('Month key and data are required');
            }
            
            if (!this.client) {
                await this.initialize();
            }
            
            const { year, month } = this.parseMonthKey(monthKey);
            
            const monthRecord = this.transformMonthToDatabase(monthData, year, month);
            
            const { error } = await this.client
                .from('months')
                .upsert(monthRecord, { onConflict: 'year,month' });
            
            if (error) {
                throw error;
            }
            
            // Update cache after save
            if (!this.monthsCache) {
                this.monthsCache = {};
            }
            this.monthsCache[monthKey] = monthData;
            this.cacheTimestamp = Date.now();
            this.saveCacheToStorage(this.monthsCache);
            
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
            
            // Protect example data from deletion
            if (this.isExampleData(monthKey)) {
                throw new Error('Example data (year 2045) cannot be deleted. This data is protected.');
            }
            
            if (!this.client) {
                await this.initialize();
            }
            
            const { year, month } = this.parseMonthKey(monthKey);
            
            const { error } = await this.client
                .from('months')
                .delete()
                .eq('year', year)
                .eq('month', month);
            
            if (error) {
                throw error;
            }
            
            // Update cache after deletion
            if (this.monthsCache && this.monthsCache[monthKey]) {
                delete this.monthsCache[monthKey];
                this.cacheTimestamp = Date.now();
                this.saveCacheToStorage(this.monthsCache);
            }
            
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
                throw error;
            }
            
            return data ? this.transformSettingsFromDatabase(data) : null;
        } catch (error) {
            console.error('Error getting settings:', error);
            throw error;
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

