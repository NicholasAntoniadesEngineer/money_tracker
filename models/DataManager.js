/**
 * Data Manager Model
 * Handles all data persistence using localStorage and individual JSON files
 */

const DataManager = {
    STORAGE_KEY_MONTHS: 'money_tracker_months',
    STORAGE_KEY_POTS: 'money_tracker_pots',
    STORAGE_KEY_SETTINGS: 'money_tracker_settings',
    MONTHS_DIR: 'data/months/',
    _monthsCache: null,

    /**
     * Initialize default settings if they don't exist
     */
    initializeSettings() {
        const existingSettings = this.getSettings();
        if (!existingSettings) {
            const defaultSettings = {
                currency: '£',
                defaultFixedCosts: [],
                defaultVariableCategories: ['Food', 'Travel/Transport', 'Activities'],
                defaultPots: []
            };
            this.saveSettings(defaultSettings);
            return defaultSettings;
        }
        return existingSettings;
    },

    /**
     * Load a month from individual JSON file
     * Note: This only works with HTTP/HTTPS protocol, not file://
     */
    async loadMonthFromFile(monthKey) {
        try {
            // Check if we're using file:// protocol (fetch won't work)
            if (window.location.protocol === 'file:') {
                console.warn('Cannot load JSON files with file:// protocol. Data will be loaded from localStorage only.');
                return null;
            }
            
            const response = await fetch(`${this.MONTHS_DIR}${monthKey}.json`);
            if (!response.ok) {
                return null;
            }
            const monthData = await response.json();
            return monthData;
        } catch (error) {
            // Silently fail - data will be loaded from localStorage instead
            console.warn(`Could not load month file ${monthKey}.json. Using localStorage data.`);
            return null;
        }
    },

    /**
     * Get all months data from localStorage (synchronous)
     */
    getAllMonths() {
        try {
            const monthsData = localStorage.getItem(this.STORAGE_KEY_MONTHS);
            return monthsData ? JSON.parse(monthsData) : {};
        } catch (error) {
            console.error('Error loading months data:', error);
            return {};
        }
    },

    /**
     * Load all months from individual JSON files into localStorage
     * Note: This only works with HTTP/HTTPS protocol, not file://
     * With file://, the app will use localStorage data only
     */
    async loadMonthsFromFiles() {
        // If using file:// protocol, skip file loading (fetch won't work)
        if (window.location.protocol === 'file:') {
            console.log('Using file:// protocol - loading data from localStorage only. JSON files cannot be loaded with file://.');
            return this.getAllMonths();
        }
        
        const knownMonths = ['2025-02', '2025-03', '2025-04', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10', '2025-11'];
        const allMonths = this.getAllMonths();
        let loadedCount = 0;

        for (const monthKey of knownMonths) {
            if (!allMonths[monthKey]) {
                const monthData = await this.loadMonthFromFile(monthKey);
                if (monthData) {
                    allMonths[monthKey] = monthData;
                    loadedCount++;
                }
            }
        }

        if (loadedCount > 0) {
            this.saveAllMonths(allMonths);
            console.log(`Loaded ${loadedCount} months from individual files`);
        }

        return allMonths;
    },

    /**
     * Save all months data to localStorage
     */
    saveAllMonths(monthsData) {
        try {
            localStorage.setItem(this.STORAGE_KEY_MONTHS, JSON.stringify(monthsData));
            return true;
        } catch (error) {
            console.error('Error saving months data:', error);
            return false;
        }
    },

    /**
     * Get a specific month's data from localStorage
     */
    getMonth(monthKey) {
        const allMonths = this.getAllMonths();
        return allMonths[monthKey] || null;
    },

    /**
     * Save a specific month's data to localStorage and optionally export as file
     */
    saveMonth(monthKey, monthData, exportFile = false) {
        monthData.updatedAt = new Date().toISOString();
        if (!monthData.createdAt) {
            monthData.createdAt = new Date().toISOString();
        }
        
        const allMonths = this.getAllMonths();
        allMonths[monthKey] = monthData;
        const saved = this.saveAllMonths(allMonths);
        
        if (saved && exportFile) {
            this.exportMonthToFile(monthKey, monthData).catch(error => {
                console.error('Error exporting month file:', error);
            });
        }
        
        return saved;
    },

    /**
     * Export month data to downloadable JSON file
     * Downloads the file - user should save it to data/months/ folder
     */
    async exportMonthToFile(monthKey, monthData) {
        try {
            const jsonString = JSON.stringify(monthData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `${monthKey}.json`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            console.log(`Month ${monthKey} exported. Please save the file to data/months/ folder.`);
            return true;
        } catch (error) {
            console.error('Error exporting month file:', error);
            return false;
        }
    },

    /**
     * Delete a month from localStorage
     */
    deleteMonth(monthKey) {
        const allMonths = this.getAllMonths();
        delete allMonths[monthKey];
        return this.saveAllMonths(allMonths);
    },

    /**
     * Get all pots data
     */
    getAllPots() {
        try {
            const potsData = localStorage.getItem(this.STORAGE_KEY_POTS);
            return potsData ? JSON.parse(potsData) : {};
        } catch (error) {
            console.error('Error loading pots data:', error);
            return {};
        }
    },

    /**
     * Save all pots data
     */
    saveAllPots(potsData) {
        try {
            localStorage.setItem(this.STORAGE_KEY_POTS, JSON.stringify(potsData));
            return true;
        } catch (error) {
            console.error('Error saving pots data:', error);
            return false;
        }
    },

    /**
     * Get settings
     */
    getSettings() {
        try {
            const settingsData = localStorage.getItem(this.STORAGE_KEY_SETTINGS);
            return settingsData ? JSON.parse(settingsData) : null;
        } catch (error) {
            console.error('Error loading settings:', error);
            return null;
        }
    },

    /**
     * Save settings
     */
    saveSettings(settings) {
        try {
            localStorage.setItem(this.STORAGE_KEY_SETTINGS, JSON.stringify(settings));
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            return false;
        }
    },

    /**
     * Generate a month key from year and month
     */
    generateMonthKey(year, month) {
        return `${year}-${String(month).padStart(2, '0')}`;
    },

    /**
     * Parse month key to year and month
     */
    parseMonthKey(monthKey) {
        const parts = monthKey.split('-');
        return {
            year: parseInt(parts[0], 10),
            month: parseInt(parts[1], 10)
        };
    },

    /**
     * Get month name from month number
     */
    getMonthName(monthNumber) {
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        return monthNames[monthNumber - 1] || '';
    },

    /**
     * Create a new month with default structure
     */
    createNewMonth(year, month) {
        const monthKey = this.generateMonthKey(year, month);
        const monthName = this.getMonthName(month);
        const settings = this.getSettings() || this.initializeSettings();

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const newMonth = {
            key: monthKey,
            year: year,
            month: month,
            monthName: monthName,
            dateRange: {
                start: startDate.toISOString().split('T')[0],
                end: endDate.toISOString().split('T')[0]
            },
            weeklyBreakdown: [],
            fixedCosts: [],
            variableCosts: [],
            unplannedExpenses: [],
            incomeSources: [],
            pots: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.saveMonth(monthKey, newMonth, true);
        return newMonth;
    },

    /**
     * Calculate totals for a month
     */
    calculateMonthTotals(monthData) {
        const totals = {
            fixedCosts: { estimated: 0, actual: 0 },
            variableCosts: { estimated: 0, actual: 0 },
            unplannedExpenses: { actual: 0 },
            income: { estimated: 0, actual: 0 },
            pots: { estimated: 0, actual: 0 },
            expenses: { estimated: 0, actual: 0 },
            savings: { estimated: 0, actual: 0 }
        };

        if (monthData.fixedCosts) {
            monthData.fixedCosts.forEach(cost => {
                totals.fixedCosts.estimated += parseFloat(cost.estimatedAmount || 0);
                totals.fixedCosts.actual += parseFloat(cost.actualAmount || 0);
            });
        }

        if (monthData.variableCosts) {
            monthData.variableCosts.forEach(cost => {
                totals.variableCosts.estimated += parseFloat(cost.monthlyBudget || cost.estimatedAmount || 0);
                totals.variableCosts.actual += parseFloat(cost.actualSpent || cost.actualAmount || 0);
            });
        }

        if (monthData.unplannedExpenses) {
            monthData.unplannedExpenses.forEach(expense => {
                totals.unplannedExpenses.actual += parseFloat(expense.amount || 0);
            });
        }

        if (monthData.incomeSources && Array.isArray(monthData.incomeSources)) {
            monthData.incomeSources.forEach(income => {
                totals.income.estimated += parseFloat(income.estimated || 0);
                totals.income.actual += parseFloat(income.actual || 0);
            });
        } else if (monthData.income) {
            totals.income.estimated = 
                parseFloat(monthData.income.nicholasIncome?.estimated || 0) +
                parseFloat(monthData.income.laraIncome?.estimated || 0) +
                parseFloat(monthData.income.otherIncome?.estimated || 0);
            
            totals.income.actual = 
                parseFloat(monthData.income.nicholasIncome?.actual || 0) +
                parseFloat(monthData.income.laraIncome?.actual || 0) +
                parseFloat(monthData.income.otherIncome?.actual || 0);
        }

        if (monthData.pots) {
            monthData.pots.forEach(pot => {
                totals.pots.estimated += parseFloat(pot.estimatedAmount || 0);
                totals.pots.actual += parseFloat(pot.actualAmount || 0);
            });
        }

        totals.expenses.estimated = totals.fixedCosts.estimated + totals.variableCosts.estimated;
        totals.expenses.actual = totals.fixedCosts.actual + totals.variableCosts.actual + totals.unplannedExpenses.actual;

        totals.savings.estimated = totals.income.estimated - totals.expenses.estimated - totals.pots.estimated;
        totals.savings.actual = totals.income.actual - totals.expenses.actual - totals.pots.actual;

        return totals;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    DataManager.initializeSettings();
    window.DataManager = DataManager;
}

