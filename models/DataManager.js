/**
 * Data Manager Model
 * Core data operations using localStorage and file services
 * @module models/DataManager
 */

const DataManager = {
    STORAGE_KEY_MONTHS: 'money_tracker_months',
    STORAGE_KEY_POTS: 'money_tracker_pots',
    STORAGE_KEY_SETTINGS: 'money_tracker_settings',

    /**
     * Initialize default settings if they don't exist
     * @returns {Object} Settings object
     */
    initializeSettings() {
        const existingSettings = this.getSettings();
        if (!existingSettings) {
            const defaultSettings = {
                currency: '£',
                fontSize: '16',
                defaultFixedCosts: [],
                defaultVariableCategories: ['Food', 'Travel/Transport', 'Activities'],
                defaultPots: []
            };
            this.saveSettings(defaultSettings);
            return defaultSettings;
        }
        // Ensure fontSize exists for existing settings
        if (!existingSettings.fontSize) {
            existingSettings.fontSize = '16';
            this.saveSettings(existingSettings);
        }
        return existingSettings;
    },

    /**
     * Get all months data from localStorage
     * @returns {Object} Object with all months keyed by monthKey
     */
    getAllMonths() {
        return window.StorageService.get(this.STORAGE_KEY_MONTHS) || {};
    },

    /**
     * Save all months data to localStorage
     * @param {Object} monthsData - Object with all months
     * @returns {boolean} Success status
     */
    saveAllMonths(monthsData) {
        return window.StorageService.set(this.STORAGE_KEY_MONTHS, monthsData);
    },

    /**
     * Get a specific month's data from localStorage
     * @param {string} monthKey - Month key (e.g., "2025-11")
     * @returns {Object|null} Month data or null
     */
    getMonth(monthKey) {
        const allMonths = this.getAllMonths();
        return allMonths[monthKey] || null;
    },

    /**
     * Save a specific month's data to localStorage and export as file
     * @param {string} monthKey - Month key
     * @param {Object} monthData - Month data object
     * @param {boolean} exportFile - Whether to export to file
     * @returns {boolean} Success status
     */
    saveMonth(monthKey, monthData, exportFile = true) {
        if (!monthKey || !monthData) {
            throw new Error('Month key and data are required');
        }

        monthData.updatedAt = new Date().toISOString();
        if (!monthData.createdAt) {
            monthData.createdAt = new Date().toISOString();
        }
        
        const allMonths = this.getAllMonths();
        allMonths[monthKey] = monthData;
        const saved = this.saveAllMonths(allMonths);
        
        if (saved && exportFile && window.ExportService) {
            window.ExportService.exportMonthToFile(monthKey, monthData, 'json').catch(error => {
                console.error('Error exporting month file:', error);
            });
        }
        
        return saved;
    },

    /**
     * Delete a month from localStorage
     * @param {string} monthKey - Month key
     * @returns {boolean} Success status
     */
    deleteMonth(monthKey) {
        const allMonths = this.getAllMonths();
        delete allMonths[monthKey];
        return this.saveAllMonths(allMonths);
    },

    /**
     * Load all months from individual JSON files into localStorage
     * @returns {Promise<Object>} Object with all months
     */
    async loadMonthsFromFiles() {
        if (!window.FileService) {
            console.error('FileService not available');
            return this.getAllMonths();
        }

        const fileMonths = await window.FileService.loadAllMonthsFromFiles();
        const localStorageMonths = this.getAllMonths();
        
        const allMonths = { ...fileMonths };
        Object.keys(localStorageMonths).forEach(key => {
            if (!allMonths[key]) {
                allMonths[key] = localStorageMonths[key];
            }
        });

        if (Object.keys(fileMonths).length > 0) {
            this.saveAllMonths(allMonths);
        }

        return allMonths;
    },

    /**
     * Load months from file picker
     * @returns {Promise<Object>} Result object
     */
    async loadMonthsFromFilePicker() {
        if (!window.FileService) {
            return { success: false, message: 'FileService not available', useFileInput: true };
        }
        return await window.FileService.loadMonthsFromFilePicker();
    },

    /**
     * Load months from file input
     * @param {FileList} files - File list
     * @returns {Promise<Object>} Result object
     */
    async loadMonthsFromFileInput(files) {
        if (!window.FileService) {
            return { success: false, count: 0, errors: files.length, months: {} };
        }
        const result = await window.FileService.loadMonthsFromFileInput(files);
        if (result.success && result.months) {
            const allMonths = this.getAllMonths();
            Object.assign(allMonths, result.months);
            this.saveAllMonths(allMonths);
        }
        return result;
    },

    /**
     * Save all months to files
     * @returns {Promise<Object>} Result object
     */
    async saveAllMonthsToFiles() {
        if (!window.ExportService) {
            return { success: false, message: 'ExportService not available' };
        }
        const allMonths = this.getAllMonths();
        return await window.ExportService.saveAllMonthsToFiles(allMonths);
    },

    /**
     * Export month to file
     * @param {string} monthKey - Month key
     * @param {Object} monthData - Month data
     * @param {string} format - Format ('json', 'csv', 'html')
     * @returns {Promise<boolean>} Success status
     */
    async exportMonthToFile(monthKey, monthData, format = 'json') {
        if (!window.ExportService) {
            console.error('ExportService not available');
            return false;
        }
        return await window.ExportService.exportMonthToFile(monthKey, monthData, format);
    },

    /**
     * Get all pots data
     * @returns {Object} Pots data object
     */
    getAllPots() {
        return window.StorageService.get(this.STORAGE_KEY_POTS) || {};
    },

    /**
     * Save all pots data
     * @param {Object} potsData - Pots data object
     * @returns {boolean} Success status
     */
    saveAllPots(potsData) {
        return window.StorageService.set(this.STORAGE_KEY_POTS, potsData);
    },

    /**
     * Get settings
     * @returns {Object|null} Settings object or null
     */
    getSettings() {
        return window.StorageService.get(this.STORAGE_KEY_SETTINGS);
    },

    /**
     * Save settings
     * @param {Object} settings - Settings object
     * @returns {boolean} Success status
     */
    saveSettings(settings) {
        return window.StorageService.set(this.STORAGE_KEY_SETTINGS, settings);
    },

    /**
     * Apply font size setting to the document
     */
    applyFontSize() {
        const settings = this.getSettings();
        const fontSize = settings && settings.fontSize ? settings.fontSize : '16';
        document.documentElement.style.fontSize = fontSize + 'px';
    },

    /**
     * Generate a month key from year and month
     * @param {number} year - Year
     * @param {number} month - Month (1-12)
     * @returns {string} Month key
     */
    generateMonthKey(year, month) {
        return window.MonthFactory.generateMonthKey(year, month);
    },

    /**
     * Parse month key to year and month
     * @param {string} monthKey - Month key
     * @returns {Object} Object with year and month
     */
    parseMonthKey(monthKey) {
        return window.MonthFactory.parseMonthKey(monthKey);
    },

    /**
     * Get month name from month number
     * @param {number} monthNumber - Month number (1-12)
     * @returns {string} Month name
     */
    getMonthName(monthNumber) {
        return window.MonthFactory.getMonthName(monthNumber);
    },

    /**
     * Create a new month with default structure
     * @param {number} year - Year
     * @param {number} month - Month (1-12)
     * @returns {Object} New month data object
     */
    createNewMonth(year, month) {
        const settings = this.getSettings() || this.initializeSettings();
        const newMonth = window.MonthFactory.createNewMonth(year, month, settings);
        const monthKey = newMonth.key;
        this.saveMonth(monthKey, newMonth, true);
        return newMonth;
    },

    /**
     * Calculate totals for a month
     * @param {Object} monthData - Month data object
     * @returns {Object} Totals object
     */
    calculateMonthTotals(monthData) {
        if (!window.CalculationService) {
            throw new Error('CalculationService not available');
        }
        return window.CalculationService.calculateMonthTotals(monthData);
    },

    /**
     * Generate HTML representation of month data
     * @param {Object} monthData - Month data object
     * @param {string} monthKey - Month key
     * @returns {string} HTML string
     */
    monthDataToHTML(monthData, monthKey) {
        if (!window.ExportService) {
            throw new Error('ExportService not available');
        }
        return window.ExportService.monthDataToHTML(monthData, monthKey);
    }
};

if (typeof window !== 'undefined') {
    DataManager.initializeSettings();
    DataManager.applyFontSize();
    window.DataManager = DataManager;
}
