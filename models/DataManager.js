/**
 * Data Manager Model
 * Handles all data persistence using localStorage and individual JSON files
 */

const DataManager = {
    STORAGE_KEY_MONTHS: 'money_tracker_months',
    STORAGE_KEY_POTS: 'money_tracker_pots',
    STORAGE_KEY_SETTINGS: 'money_tracker_settings',
    MONTHS_DIR: '/data/months/',
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
     * Files are the source of truth - always try to load from files first
     */
    async loadMonthFromFile(monthKey) {
        try {
            // Check if we're using file:// protocol (fetch won't work)
            if (window.location.protocol === 'file:') {
                // With file://, we can't fetch files directly
                // User must run sync script: node scripts/sync-data.js load
                console.log(`Using file:// protocol - cannot load ${monthKey}.json directly.`);
                console.log('Run: node scripts/sync-data.js load');
                return null;
            }
            
            const response = await fetch(`${this.MONTHS_DIR}${monthKey}.json`);
            if (!response.ok) {
                return null;
            }
            const monthData = await response.json();
            console.log(`✓ Loaded ${monthKey}.json from files`);
            return monthData;
        } catch (error) {
            // File doesn't exist or can't be loaded
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
     * This is the primary data source - files are the source of truth
     */
    async loadMonthsFromFiles() {
        // If using file:// protocol, we can't fetch files directly
        // User must run the sync script first: node scripts/sync-data.js load
        if (window.location.protocol === 'file:') {
            console.log('Using file:// protocol - loading from localStorage.');
            console.log('To load from files, run: node scripts/sync-data.js load');
            return this.getAllMonths();
        }
        
        // Try to discover all month files by attempting to load common month keys
        // In a real implementation, you'd need a directory listing API or known list
        const allMonths = {};
        const currentYear = new Date().getFullYear();
        const years = [currentYear - 1, currentYear, currentYear + 1];
        let loadedCount = 0;

        // Try loading months for the last 2 years and next year
        for (const year of years) {
            for (let month = 1; month <= 12; month++) {
                const monthKey = this.generateMonthKey(year, month);
                try {
                    const monthData = await this.loadMonthFromFile(monthKey);
                    if (monthData) {
                        allMonths[monthKey] = monthData;
                        loadedCount++;
                    }
                } catch (error) {
                    // File doesn't exist, skip
                }
            }
        }

        // Also check localStorage for any months not in files
        const localStorageMonths = this.getAllMonths();
        Object.keys(localStorageMonths).forEach(key => {
            if (!allMonths[key]) {
                allMonths[key] = localStorageMonths[key];
            }
        });

        if (loadedCount > 0) {
            this.saveAllMonths(allMonths);
            console.log(`✓ Loaded ${loadedCount} months from files`);
        } else {
            console.log('No month files found. Using localStorage data.');
            console.log('To sync files, run: node scripts/sync-data.js load');
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
     * Save a specific month's data to localStorage and always export as file
     * Files are the source of truth - always export when saving
     */
    saveMonth(monthKey, monthData, exportFile = true) {
        monthData.updatedAt = new Date().toISOString();
        if (!monthData.createdAt) {
            monthData.createdAt = new Date().toISOString();
        }
        
        const allMonths = this.getAllMonths();
        allMonths[monthKey] = monthData;
        const saved = this.saveAllMonths(allMonths);
        
        // Always export to file - files are the source of truth
        if (saved && exportFile) {
            this.exportMonthToFile(monthKey, monthData, 'json').catch(error => {
                console.error('Error exporting month file:', error);
            });
            // Message is handled by the UI
        }
        
        return saved;
    },

    /**
     * Export month data to file using File System Access API or download
     * Supports both JSON and CSV formats
     */
    async exportMonthToFile(monthKey, monthData, format = 'json') {
        try {
            let blob;
            let filename;
            let mimeType;
            let fileExtension;
            
            if (format === 'csv') {
                if (!window.CSVHandler) {
                    console.error('CSVHandler not available. Cannot export CSV.');
                    return false;
                }
                const csvString = CSVHandler.monthDataToCSV(monthData);
                blob = new Blob([csvString], { type: 'text/csv' });
                filename = `${monthKey}.csv`;
                mimeType = 'text/csv';
                fileExtension = '.csv';
            } else if (format === 'html') {
                const htmlString = this.monthDataToHTML(monthData, monthKey);
                blob = new Blob([htmlString], { type: 'text/html' });
                filename = `${monthKey}.html`;
                mimeType = 'text/html';
                fileExtension = '.html';
            } else {
                const jsonString = JSON.stringify(monthData, null, 2);
                blob = new Blob([jsonString], { type: 'application/json' });
                filename = `${monthKey}.json`;
                mimeType = 'application/json';
                fileExtension = '.json';
            }
            
            // Try File System Access API (modern browsers)
            if ('showSaveFilePicker' in window) {
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{
                            description: format === 'csv' ? 'CSV files' : format === 'html' ? 'HTML files' : 'JSON files',
                            accept: { [mimeType]: [fileExtension] }
                        }],
                        startIn: 'downloads'
                    });
                    
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    
                    console.log(`✓ Month ${monthKey} saved as ${format.toUpperCase()} directly to file system`);
                    return true;
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.warn('File System Access API failed, falling back to download:', error);
                    } else {
                        // User cancelled
                        return false;
                    }
                }
            }
            
            // Fallback to download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
            
            console.log(`✓ Month ${monthKey} downloaded as ${format.toUpperCase()}. Save it to data/months/ folder.`);
            return true;
        } catch (error) {
            console.error('Error exporting month file:', error);
            return false;
        }
    },

    /**
     * Load months from files using File System Access API or file input
     */
    async loadMonthsFromFilePicker() {
        try {
            // Check if we're using file:// protocol (File System Access API won't work)
            const isFileProtocol = window.location.protocol === 'file:';
            
            // Try File System Access API (modern browsers, not file://)
            if ('showDirectoryPicker' in window && !isFileProtocol) {
                try {
                    const directoryHandle = await window.showDirectoryPicker();
                    const months = {};
                    let loadedCount = 0;
                    
                    // Read all JSON, CSV, and HTML files from the selected directory
                    const htmlFiles = [];
                    const csvFiles = [];
                    for await (const entry of directoryHandle.values()) {
                        if (entry.kind === 'file') {
                            if (entry.name.endsWith('.json')) {
                                try {
                                    const file = await entry.getFile();
                                    const content = await file.text();
                                    const monthData = JSON.parse(content);
                                    const monthKey = entry.name.replace('.json', '');
                                    months[monthKey] = monthData;
                                    loadedCount++;
                                    console.log(`✓ Loaded ${monthKey}.json`);
                                } catch (error) {
                                    console.error(`Error loading ${entry.name}:`, error);
                                }
                            } else if (entry.name.endsWith('.csv')) {
                                csvFiles.push(entry);
                            } else if (entry.name.endsWith('.html')) {
                                htmlFiles.push(entry);
                            }
                        }
                    }
                    
                    // Process CSV files if CSVHandler is available
                    if (csvFiles.length > 0 && window.CSVHandler) {
                        for (const entry of csvFiles) {
                            try {
                                const file = await entry.getFile();
                                const csvText = await file.text();
                                const fileName = entry.name.toLowerCase();
                                const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                                                  'july', 'august', 'september', 'october', 'november', 'december'];
                                
                                let monthName = null;
                                let year = new Date().getFullYear();
                                
                                for (const month of monthNames) {
                                    if (fileName.includes(month)) {
                                        monthName = month.charAt(0).toUpperCase() + month.slice(1);
                                        break;
                                    }
                                }
                                
                                const yearMatch = fileName.match(/\b(20\d{2})\b/);
                                if (yearMatch) {
                                    year = parseInt(yearMatch[1], 10);
                                }
                                
                                if (!monthName) {
                                    // Try to extract from filename pattern like "april-2025.csv"
                                    const nameMatch = entry.name.match(/^([a-z]+)-(\d{4})\.csv$/i);
                                    if (nameMatch) {
                                        monthName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
                                        year = parseInt(nameMatch[2], 10);
                                    } else {
                                        console.warn(`Could not determine month from CSV filename: ${entry.name}`);
                                        continue;
                                    }
                                }
                                
                                const monthData = CSVHandler.csvToMonthData(csvText, monthName, year);
                                const monthKey = monthData.key;
                                months[monthKey] = monthData;
                                loadedCount++;
                                console.log(`✓ Imported ${monthKey} from ${entry.name}`);
                            } catch (error) {
                                console.error(`Error importing CSV ${entry.name}:`, error);
                            }
                        }
                    }
                    
                    // Process HTML files if ReferenceImporter is available
                    if (htmlFiles.length > 0 && window.ReferenceImporter) {
                        for (const entry of htmlFiles) {
                            try {
                                const file = await entry.getFile();
                                const fileName = entry.name.toLowerCase();
                                const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                                                  'july', 'august', 'september', 'october', 'november', 'december'];
                                
                                let monthName = null;
                                let year = new Date().getFullYear();
                                
                                for (const month of monthNames) {
                                    if (fileName.includes(month)) {
                                        monthName = month.charAt(0).toUpperCase() + month.slice(1);
                                        break;
                                    }
                                }
                                
                                const yearMatch = fileName.match(/\b(20\d{2})\b/);
                                if (yearMatch) {
                                    year = parseInt(yearMatch[1], 10);
                                }
                                
                                if (monthName) {
                                    const monthData = await ReferenceImporter.importMonthFromFile(file, monthName, year);
                                    const monthKey = monthData.key;
                                    months[monthKey] = monthData;
                                    loadedCount++;
                                    console.log(`✓ Imported ${monthKey} from ${entry.name}`);
                                }
                            } catch (error) {
                                console.error(`Error importing ${entry.name}:`, error);
                            }
                        }
                    }
                    
                    if (loadedCount > 0) {
                        this.saveAllMonths(months);
                        console.log(`✓ Loaded ${loadedCount} months from directory`);
                        return { success: true, count: loadedCount, months: months };
                    } else {
                        return { success: false, message: 'No valid month files found in directory' };
                    }
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.warn('Directory picker failed:', error);
                        return { success: false, message: error.message, useFileInput: true };
                    } else {
                        // User cancelled
                        return { success: false, message: 'User cancelled' };
                    }
                }
            }
            
            // Fallback: Trigger file input
            return { success: false, message: 'File System Access API not available. Please use the file input button.', useFileInput: true };
        } catch (error) {
            console.error('Error loading months from files:', error);
            return { success: false, message: error.message, useFileInput: true };
        }
    },

    /**
     * Load months from file input (multiple files) - supports both JSON and HTML files
     */
    async loadMonthsFromFileInput(files) {
        const months = {};
        let loadedCount = 0;
        let errorCount = 0;
        const htmlFiles = [];
        const csvFiles = [];
        
        // First pass: Load JSON files and collect HTML/CSV files
        for (const file of files) {
            if (file.name.endsWith('.json')) {
                try {
                    const content = await file.text();
                    const monthData = JSON.parse(content);
                    const monthKey = file.name.replace('.json', '');
                    months[monthKey] = monthData;
                    loadedCount++;
                    console.log(`✓ Loaded ${monthKey}.json`);
                } catch (error) {
                    console.error(`Error loading ${file.name}:`, error);
                    errorCount++;
                }
            } else if (file.name.endsWith('.csv')) {
                csvFiles.push(file);
            } else if (file.name.endsWith('.html')) {
                htmlFiles.push(file);
            }
        }
        
        // Process CSV files if CSVHandler is available
        if (csvFiles.length > 0) {
            if (!window.CSVHandler) {
                console.error('CSVHandler not available. Cannot import CSV files.');
                errorCount += csvFiles.length;
            } else {
                console.log(`Processing ${csvFiles.length} CSV file(s)...`);
                for (const file of csvFiles) {
                    try {
                        const csvText = await file.text();
                        const fileName = file.name.toLowerCase();
                        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                                          'july', 'august', 'september', 'october', 'november', 'december'];
                        
                        let monthName = null;
                        let year = new Date().getFullYear();
                        
                        // Find month name in filename
                        for (const month of monthNames) {
                            if (fileName.includes(month)) {
                                monthName = month.charAt(0).toUpperCase() + month.slice(1);
                                break;
                            }
                        }
                        
                        // Try to extract year from filename
                        const yearMatch = fileName.match(/\b(20\d{2})\b/);
                        if (yearMatch) {
                            year = parseInt(yearMatch[1], 10);
                        }
                        
                        // Try pattern like "april-2025.csv"
                        if (!monthName) {
                            const nameMatch = file.name.match(/^([a-z]+)-(\d{4})\.csv$/i);
                            if (nameMatch) {
                                monthName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
                                year = parseInt(nameMatch[2], 10);
                            }
                        }
                        
                        if (!monthName) {
                            const errorMsg = 'Could not determine month from CSV filename: ' + file.name;
                            console.warn(errorMsg);
                            errorCount++;
                            continue;
                        }
                        
                        console.log('Importing CSV file: ' + file.name + ' as ' + monthName + ' ' + year);
                        
                        const monthData = CSVHandler.csvToMonthData(csvText, monthName, year);
                        if (!monthData || !monthData.key) {
                            throw new Error('CSV import returned invalid data');
                        }
                        
                        const monthKey = monthData.key;
                        months[monthKey] = monthData;
                        loadedCount++;
                        console.log('  Added month: ' + monthKey);
                    } catch (error) {
                        console.error('Error importing CSV ' + file.name + ':', error);
                        errorCount++;
                    }
                }
            }
        }
        
        // Second pass: Process HTML files (need ReferenceImporter)
        if (htmlFiles.length > 0) {
            if (!window.ReferenceImporter) {
                console.error('ReferenceImporter not available. Cannot import HTML files.');
                console.error('Make sure ReferenceImporter.js is loaded before DataManager.js');
                errorCount += htmlFiles.length;
            } else {
                console.log(`Processing ${htmlFiles.length} HTML file(s)...`);
                for (const file of htmlFiles) {
                    try {
                        // Extract month name and year from filename
                        const fileName = file.name.toLowerCase();
                        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                                          'july', 'august', 'september', 'october', 'november', 'december'];
                        
                        let monthName = null;
                        let year = new Date().getFullYear(); // Default to current year
                        
                        // Find month name in filename
                        for (const month of monthNames) {
                            if (fileName.includes(month)) {
                                monthName = month.charAt(0).toUpperCase() + month.slice(1);
                                break;
                            }
                        }
                        
                        // Try to extract year from filename (look for 4-digit year)
                        const yearMatch = fileName.match(/\b(20\d{2})\b/);
                        if (yearMatch) {
                            year = parseInt(yearMatch[1], 10);
                        }
                        
                        if (!monthName) {
                            const errorMsg = 'Could not determine month from filename: ' + file.name;
                            console.warn(errorMsg);
                            console.warn('  File name: ' + file.name);
                            console.warn('  Lowercase: ' + fileName);
                            console.warn('  Please ensure the filename contains a month name (e.g., February, March, etc.)');
                            errorCount++;
                            continue;
                        }
                        
                        console.log('Importing HTML file: ' + file.name + ' as ' + monthName + ' ' + year);
                        
                        // Import HTML file
                        const monthData = await ReferenceImporter.importMonthFromFile(file, monthName, year);
                        if (!monthData) {
                            throw new Error('Import returned null or undefined');
                        }
                        if (!monthData.key) {
                            throw new Error('Import returned data without a key');
                        }
                        
                        const monthKey = monthData.key;
                        months[monthKey] = monthData;
                        loadedCount++;
                        console.log('Imported ' + monthKey + ' from ' + file.name);
                        console.log('  Fixed costs: ' + (monthData.fixedCosts ? monthData.fixedCosts.length : 0));
                        console.log('  Variable costs: ' + (monthData.variableCosts ? monthData.variableCosts.length : 0));
                        console.log('  Weekly breakdown: ' + (monthData.weeklyBreakdown ? monthData.weeklyBreakdown.length : 0));
                    } catch (error) {
                        console.error('Error importing ' + file.name + ':', error);
                        console.error('Error message: ' + error.message);
                        if (error.stack) {
                            console.error('Stack trace:', error.stack);
                        }
                        errorCount++;
                    }
                }
            }
        }
        
        if (loadedCount > 0) {
            this.saveAllMonths(months);
            console.log(`✓ Loaded ${loadedCount} months from files`);
        }
        
        return { success: loadedCount > 0, count: loadedCount, errors: errorCount, months: months };
    },

    /**
     * Save all months to files using File System Access API or downloads
     */
    async saveAllMonthsToFiles() {
        const allMonths = this.getAllMonths();
        const monthKeys = Object.keys(allMonths);
        
        if (monthKeys.length === 0) {
            return { success: false, message: 'No months to save' };
        }
        
        try {
            // Check if we're using file:// protocol
            const isFileProtocol = window.location.protocol === 'file:';
            
            // Try File System Access API (modern browsers, not file://)
            if ('showDirectoryPicker' in window && !isFileProtocol) {
                try {
                    const directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                    let savedCount = 0;
                    let errorCount = 0;
                    
                    for (const monthKey of monthKeys) {
                        try {
                            const monthData = allMonths[monthKey];
                            
                            // Save as JSON
                            const jsonString = JSON.stringify(monthData, null, 2);
                            const jsonBlob = new Blob([jsonString], { type: 'application/json' });
                            const jsonFileHandle = await directoryHandle.getFileHandle(`${monthKey}.json`, { create: true });
                            const jsonWritable = await jsonFileHandle.createWritable();
                            await jsonWritable.write(jsonBlob);
                            await jsonWritable.close();
                            
                            // Save as CSV if CSVHandler is available
                            if (window.CSVHandler) {
                                try {
                                    const csvString = CSVHandler.monthDataToCSV(monthData);
                                    const csvBlob = new Blob([csvString], { type: 'text/csv' });
                                    const csvFileHandle = await directoryHandle.getFileHandle(`${monthKey}.csv`, { create: true });
                                    const csvWritable = await csvFileHandle.createWritable();
                                    await csvWritable.write(csvBlob);
                                    await csvWritable.close();
                                    console.log(`✓ Saved ${monthKey}.csv`);
                                } catch (csvError) {
                                    console.warn(`Could not save ${monthKey}.csv:`, csvError);
                                }
                            }
                            
                            savedCount++;
                            console.log(`✓ Saved ${monthKey}.json`);
                        } catch (error) {
                            console.error(`Error saving ${monthKey}:`, error);
                            errorCount++;
                        }
                    }
                    
                    return { 
                        success: savedCount > 0, 
                        count: savedCount, 
                        errors: errorCount,
                        message: `Saved ${savedCount} months to directory${errorCount > 0 ? ` (${errorCount} errors)` : ''}` 
                    };
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.warn('Directory picker failed, falling back to downloads:', error);
                    } else {
                        return { success: false, message: 'User cancelled' };
                    }
                }
            }
            
            // Fallback: Download all files individually (both JSON and CSV)
            let downloadedCount = 0;
            const downloadPromises = [];
            
            for (const monthKey of monthKeys) {
                const monthData = allMonths[monthKey];
                // Download JSON
                downloadPromises.push(
                    this.exportMonthToFile(monthKey, monthData, 'json').then(() => {
                        downloadedCount++;
                    }).catch(error => {
                        console.error(`Error downloading ${monthKey}.json:`, error);
                    })
                );
                // Small delay to avoid browser blocking multiple downloads
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // Download CSV if CSVHandler is available
                if (window.CSVHandler) {
                    downloadPromises.push(
                        this.exportMonthToFile(monthKey, monthData, 'csv').then(() => {
                            // CSV download doesn't count separately, it's part of the same month
                        }).catch(error => {
                            console.warn(`Could not download ${monthKey}.csv:`, error);
                        })
                    );
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            await Promise.all(downloadPromises);
            
            const fileTypeText = window.CSVHandler ? 'JSON and CSV files' : 'JSON files';
            return { 
                success: downloadedCount > 0, 
                count: downloadedCount,
                message: `Downloaded ${downloadedCount} month ${fileTypeText}${downloadedCount !== 1 ? 's' : ''}. Save ${downloadedCount === 1 ? 'it' : 'them'} to data/months/ folder.` 
            };
        } catch (error) {
            console.error('Error saving all months:', error);
            return { success: false, message: error.message };
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

        // Initialize variable costs with default categories from settings
        const variableCosts = (settings.defaultVariableCategories || []).map(category => ({
            category: category,
            estimatedAmount: 0,
            actualAmount: 0,
            comments: ''
        }));

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
            variableCosts: variableCosts,
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
    },

    /**
     * Generate HTML representation of month data
     */
    monthDataToHTML(monthData, monthKey) {
        const formatCurrency = (amount) => {
            if (!amount && amount !== 0) return Formatters.formatCurrency(0);
            return Formatters.formatCurrency(amount);
        };

        const formatDate = (dateString) => {
            if (!dateString) return '';
            try {
                return new Date(dateString).toLocaleDateString('en-GB');
            } catch {
                return dateString;
            }
        };

        const monthName = monthData.monthName || this.getMonthName(monthData.month);
        const year = monthData.year;

        // Helper to render table rows
        const renderTableRows = (items, columns) => {
            if (!items || items.length === 0) {
                return `<tr><td colspan="${columns.length}" style="text-align: center; font-style: italic; color: #666;">No data</td></tr>`;
            }

            return items.map(item => {
                return '<tr>' + columns.map(col => {
                    let value = item[col.key];
                    if (col.type === 'currency') {
                        value = formatCurrency(value);
                    } else if (col.type === 'date') {
                        value = formatDate(value);
                    } else if (col.type === 'boolean') {
                        value = value ? '✓' : '';
                    }
                    return `<td>${value || ''}</td>`;
                }).join('') + '</tr>';
            }).join('');
        };

        // Calculate totals
        const totals = this.calculateMonthTotals(monthData);

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${monthName} ${year} - Monthly Budget</title>
    <style>
        /* cspell:disable-file */
        /* webkit printing magic: print all background colors */
        html {
            -webkit-print-color-adjust: exact;
        }
        * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact;
        }

        html, body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.5;
            color: #333;
        }

        @media only screen {
            body {
                margin: 2em auto;
                max-width: 900px;
                background-color: #f8f9fa;
            }
        }

        body {
            white-space: pre-wrap;
            background-color: white;
        }

        .header {
            text-align: center;
            padding: 2rem 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin-bottom: 2rem;
        }

        .header h1 {
            margin: 0;
            font-size: 2.5rem;
            font-weight: 300;
        }

        .header p {
            margin: 0.5rem 0 0 0;
            opacity: 0.9;
        }

        .section {
            margin-bottom: 2rem;
            background: white;
            border-radius: 0px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .section-header {
            background: #f8f9fa;
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #e9ecef;
        }

        .section-title {
            margin: 0;
            font-size: 1.5rem;
            font-weight: 600;
            color: #495057;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
        }

        th, td {
            padding: 0.75rem 1rem;
            text-align: left;
            border-bottom: 1px solid #e9ecef;
        }

        th {
            background-color: #f8f9fa;
            font-weight: 600;
            color: #495057;
            border-bottom: 2px solid #dee2e6;
        }

        .total-row {
            background-color: #fff3cd;
            font-weight: 600;
        }

        .total-row td {
            border-top: 2px solid #ffc107;
        }

        .summary-section {
            background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
            color: white;
        }

        .summary-section .section-title {
            color: white;
        }

        .summary-section table {
            color: #333;
        }

        .summary-section .total-row {
            background-color: rgba(255,255,255,0.2);
            color: white;
        }

        .summary-section .total-row td {
            border-top: 2px solid rgba(255,255,255,0.5);
        }

        .export-info {
            background: #e9ecef;
            padding: 1rem;
            margin-top: 2rem;
            border-radius: 0px;
            font-size: 0.875rem;
            color: #6c757d;
        }

        .export-info strong {
            color: #495057;
        }

        @media print {
            body {
                background: white !important;
                margin: 0 !important;
                max-width: none !important;
            }

            .section {
                box-shadow: none !important;
                border: 1px solid #ddd !important;
            }

            .export-info {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>${monthName} ${year}</h1>
        <p>Monthly Budget Report</p>
    </div>

    ${monthData.weeklyBreakdown && monthData.weeklyBreakdown.length > 0 ? `
    <div class="section">
        <div class="section-header">
            <h2 class="section-title">Weekly Breakdown</h2>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Date Range</th>
                    <th>Payments Due</th>
                    <th>Groceries</th>
                    <th>Transport</th>
                    <th>Activities</th>
                    <th>Estimate</th>
                    <th>Actual</th>
                </tr>
            </thead>
            <tbody>
                ${monthData.weeklyBreakdown.map(week => `
                <tr>
                    <td>${week.dateRange || week.weekRange || ''}</td>
                    <td>${week.paymentsDue || ''}</td>
                    <td>${week.groceries || ''}</td>
                    <td>${week.transport || ''}</td>
                    <td>${week.activities || ''}</td>
                    <td>${formatCurrency(week.estimate || week.weeklyEstimate)}</td>
                    <td>${formatCurrency(week.actual)}</td>
                </tr>
                `).join('')}
                <tr class="total-row">
                    <td><strong>TOTALS</strong></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td><strong>${formatCurrency(monthData.weeklyBreakdown.reduce((sum, week) => sum + (week.estimate || week.weeklyEstimate || 0), 0))}</strong></td>
                    <td><strong>${formatCurrency(monthData.weeklyBreakdown.reduce((sum, week) => sum + (week.actual || 0), 0))}</strong></td>
                </tr>
            </tbody>
        </table>
    </div>
    ` : ''}

    <div class="section">
        <div class="section-header">
            <h2 class="section-title">Income Sources</h2>
        </div>
        <table>
                        <thead>
                            <tr>
                                <th>Source</th>
                                <th>Estimated</th>
                                <th>Actual</th>
                                <th>Date</th>
                                <th>Description</th>
                                <th>Comments</th>
                            </tr>
                        </thead>
            <tbody>
                ${(monthData.incomeSources || []).map(income => `
                <tr>
                    <td>${income.source || ''}</td>
                    <td>${formatCurrency(income.estimated)}</td>
                    <td>${formatCurrency(income.actual)}</td>
                    <td>${formatDate(income.date)}</td>
                    <td>${income.description || ''}</td>
                    <td>${income.comments || ''}</td>
                </tr>
                `).join('')}
                <tr class="total-row">
                    <td><strong>Total Income</strong></td>
                    <td><strong>${formatCurrency(totals.income.estimated)}</strong></td>
                    <td><strong>${formatCurrency(totals.income.actual)}</strong></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="section">
        <div class="section-header">
            <h2 class="section-title">Fixed Costs</h2>
        </div>
        <table>
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Estimated</th>
                                <th>Actual</th>
                                <th>Date</th>
                                <th>Card</th>
                                <th>Paid</th>
                                <th>Comments</th>
                            </tr>
                        </thead>
            <tbody>
                ${(monthData.fixedCosts || []).map(cost => `
                <tr>
                    <td>${cost.category || ''}</td>
                    <td>${formatCurrency(cost.estimatedAmount)}</td>
                    <td>${formatCurrency(cost.actualAmount)}</td>
                    <td>${formatDate(cost.date)}</td>
                    <td>${cost.card || ''}</td>
                    <td>${cost.paid ? '✓' : ''}</td>
                    <td>${cost.comments || ''}</td>
                </tr>
                `).join('')}
                <tr class="total-row">
                    <td><strong>Total Fixed Costs</strong></td>
                    <td><strong>${formatCurrency(totals.fixedCosts.estimated)}</strong></td>
                    <td><strong>${formatCurrency(totals.fixedCosts.actual)}</strong></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="section">
        <div class="section-header">
            <h2 class="section-title">Variable Costs</h2>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Budget</th>
                    <th>Actual</th>
                    <th>Remaining</th>
                    <th>Comments</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${(monthData.variableCosts || []).map(cost => `
                <tr>
                    <td>${cost.category || ''}</td>
                    <td>${formatCurrency(cost.estimatedAmount || cost.monthlyBudget)}</td>
                    <td>${formatCurrency(cost.actualAmount || cost.actualSpent)}</td>
                    <td>${formatCurrency((cost.estimatedAmount || cost.monthlyBudget || 0) - (cost.actualAmount || cost.actualSpent || 0))}</td>
                    <td>${cost.comments || ''}</td>
                </tr>
                `).join('')}
                <tr class="total-row">
                    <td><strong>Total Variable Costs</strong></td>
                    <td><strong>${formatCurrency(totals.variableCosts.estimated)}</strong></td>
                    <td><strong>${formatCurrency(totals.variableCosts.actual)}</strong></td>
                    <td><strong>${formatCurrency(totals.variableCosts.estimated - totals.variableCosts.actual)}</strong></td>
                    <td></td>
                    <td></td>
                </tr>
            </tbody>
        </table>
    </div>

    ${monthData.unplannedExpenses && monthData.unplannedExpenses.length > 0 ? `
    <div class="section">
        <div class="section-header">
            <h2 class="section-title">Unplanned Expenses</h2>
        </div>
        <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Amount</th>
                                <th>Date</th>
                                <th>Card</th>
                                <th>Status</th>
                                <th>Comments</th>
                            </tr>
                        </thead>
            <tbody>
                ${monthData.unplannedExpenses.map(expense => `
                <tr>
                    <td>${expense.name || ''}</td>
                    <td>${formatCurrency(expense.amount)}</td>
                    <td>${formatDate(expense.date)}</td>
                    <td>${expense.card || ''}</td>
                    <td>${expense.status || ''}</td>
                    <td>${expense.comments || ''}</td>
                </tr>
                `).join('')}
                <tr class="total-row">
                    <td><strong>Total Unplanned Expenses</strong></td>
                    <td><strong>${formatCurrency(totals.unplannedExpenses.actual)}</strong></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                </tr>
            </tbody>
        </table>
    </div>
    ` : ''}

    ${monthData.pots && monthData.pots.length > 0 ? `
    <div class="section">
        <div class="section-header">
            <h2 class="section-title">Savings & Investments</h2>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Estimated</th>
                    <th>Actual</th>
                </tr>
            </thead>
            <tbody>
                ${monthData.pots.map(pot => `
                <tr>
                    <td>${pot.category || ''}</td>
                    <td>${formatCurrency(pot.estimatedAmount)}</td>
                    <td>${formatCurrency(pot.actualAmount)}</td>
                </tr>
                `).join('')}
                <tr class="total-row">
                    <td><strong>Total Savings/Investments</strong></td>
                    <td><strong>${formatCurrency(totals.pots.estimated)}</strong></td>
                    <td><strong>${formatCurrency(totals.pots.actual)}</strong></td>
                </tr>
            </tbody>
        </table>
    </div>
    ` : ''}

    <div class="section summary-section">
        <div class="section-header">
            <h2 class="section-title">Monthly Summary</h2>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Estimated</th>
                    <th>Actual</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>Total Income</strong></td>
                    <td><strong>${formatCurrency(totals.income.estimated)}</strong></td>
                    <td><strong>${formatCurrency(totals.income.actual)}</strong></td>
                </tr>
                <tr>
                    <td>Total Fixed Costs</td>
                    <td>${formatCurrency(totals.fixedCosts.estimated)}</td>
                    <td>${formatCurrency(totals.fixedCosts.actual)}</td>
                </tr>
                <tr>
                    <td>Total Variable Costs</td>
                    <td>${formatCurrency(totals.variableCosts.estimated)}</td>
                    <td>${formatCurrency(totals.variableCosts.actual)}</td>
                </tr>
                <tr>
                    <td><strong>Total Expenses</strong></td>
                    <td><strong>${formatCurrency(totals.expenses.estimated)}</strong></td>
                    <td><strong>${formatCurrency(totals.expenses.actual)}</strong></td>
                </tr>
                <tr>
                    <td>Total Unplanned Expenses</td>
                    <td>—</td>
                    <td>${formatCurrency(totals.unplannedExpenses.actual)}</td>
                </tr>
                <tr class="total-row">
                    <td><strong>Grand Savings Total</strong></td>
                    <td><strong>${formatCurrency(totals.savings.estimated)}</strong></td>
                    <td><strong>${formatCurrency(totals.savings.actual)}</strong></td>
                </tr>
            </tbody>
        </table>
    </div>

    <div class="export-info">
        <strong>Export Details:</strong><br>
        Generated on ${new Date().toLocaleString()}<br>
        Format: HTML Report<br>
        Source: Money Tracker Application
    </div>
</body>
</html>`;

        return html;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    DataManager.initializeSettings();
    window.DataManager = DataManager;
}

