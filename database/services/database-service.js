/**
 * Database Service
 * Main service layer for all database operations using Supabase
 * Replaces localStorage and FileService
 */

const DatabaseService = {
    client: null,
    
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
            
            console.log('Database service initialized');
            return true;
        } catch (error) {
            console.error('Error initializing database service:', error);
            throw error;
        }
    },
    
    /**
     * Get all months from database
     * @returns {Promise<Object>} Object with all months keyed by monthKey
     */
    async getAllMonths() {
        try {
            if (!this.client) {
                await this.initialize();
            }
            
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
            
            return monthsObject;
        } catch (error) {
            console.error('Error getting all months:', error);
            throw error;
        }
    },
    
    /**
     * Get a specific month by monthKey
     * @param {string} monthKey - Month key (e.g., "2025-11")
     * @returns {Promise<Object|null>} Month data or null
     */
    async getMonth(monthKey) {
        try {
            if (!monthKey) {
                throw new Error('Month key is required');
            }
            
            if (!this.client) {
                await this.initialize();
            }
            
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
            
            return data ? this.transformMonthFromDatabase(data) : null;
        } catch (error) {
            console.error(`Error getting month ${monthKey}:`, error);
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
     */
    async deleteMonth(monthKey) {
        try {
            if (!monthKey) {
                throw new Error('Month key is required');
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

