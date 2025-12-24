/**
 * Settings Controller
 * Handles all file operations: import, export, load, delete
 * Also handles currency settings
 */

const SettingsController = {
    /**
     * Initialize the settings page
     */
    async init() {
        console.log('[SettingsController] init() called');
        
        // Set up event listeners first so buttons are functional even if settings loading fails
        this.setupEventListeners();
        console.log('[SettingsController] Event listeners set up');
        
        // Load settings (with error handling to prevent blocking)
        try {
            await this.loadCurrencySetting();
            console.log('[SettingsController] Currency setting loaded');
        } catch (error) {
            console.error('[SettingsController] Error loading currency setting:', error);
        }
        
        try {
            await this.loadFontSizeSetting();
            console.log('[SettingsController] Font size setting loaded');
        } catch (error) {
            console.error('[SettingsController] Error loading font size setting:', error);
        }
        
        try {
            await this.loadMonthSelector();
            console.log('[SettingsController] Month selector loaded');
        } catch (error) {
            console.error('[SettingsController] Error loading month selector:', error);
        }
        
        console.log('[SettingsController] init() completed');
    },

    /**
     * Load and display current currency setting
     */
    async loadCurrencySetting() {
        const currencySelect = document.getElementById('currency-select');
        if (!currencySelect) return;

        const settings = await DataManager.getSettings();
        if (settings && settings.currency) {
            currencySelect.value = settings.currency;
        } else {
            currencySelect.value = '';
        }
    },

    /**
     * Save currency setting
     */
    async saveCurrencySetting(currency) {
        const settings = await DataManager.getSettings() || await DataManager.initializeSettings();
        settings.currency = currency;
        const success = await DataManager.saveSettings(settings);
        
        if (success) {
            // Reload page to update all currency displays
            window.location.reload();
        }
        
        return success;
    },

    /**
     * Load and display current font size setting
     */
    async loadFontSizeSetting() {
        const fontSizeSelect = document.getElementById('font-size-select');
        if (!fontSizeSelect) return;

        const settings = await DataManager.getSettings();
        if (settings && settings.fontSize) {
            fontSizeSelect.value = settings.fontSize;
        } else {
            fontSizeSelect.value = '';
        }
    },

    /**
     * Save font size setting and apply to page
     */
    async saveFontSizeSetting(fontSize) {
        const settings = await DataManager.getSettings() || await DataManager.initializeSettings();
        settings.fontSize = fontSize;
        const success = await DataManager.saveSettings(settings);
        
        if (success) {
            // Apply font size immediately
            document.documentElement.style.fontSize = fontSize + 'px';
        }
        
        return success;
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Currency selector
        const currencySelect = document.getElementById('currency-select');
        if (currencySelect) {
            currencySelect.addEventListener('change', () => {
                const selectedCurrency = currencySelect.value;
                const currencyStatus = document.getElementById('currency-status');
                
                if (currencyStatus) {
                    currencyStatus.innerHTML = '<p style="color: var(--text-secondary);">Saving currency setting...</p>';
                }
                
                const success = this.saveCurrencySetting(selectedCurrency);
                
                if (!success && currencyStatus) {
                    currencyStatus.innerHTML = '<p style="color: var(--danger-color);">Error saving currency setting. Please try again.</p>';
                }
            });
        }

        // Font size selector
        const fontSizeSelect = document.getElementById('font-size-select');
        if (fontSizeSelect) {
            fontSizeSelect.addEventListener('change', () => {
                const selectedFontSize = fontSizeSelect.value;
                this.saveFontSizeSetting(selectedFontSize);
            });
        }

        const importButton = document.getElementById('import-button');
        const fileInput = document.getElementById('file-input');
        const exportButton = document.getElementById('export-button');
        const exportFormatSelect = document.getElementById('export-format-select');
        const monthSelector = document.getElementById('month-selector');
        const deleteMonthBtn = document.getElementById('delete-month-button');
        const importStatus = document.getElementById('import-status');
        const fileOperationsStatus = document.getElementById('file-operations-status');
        const yearInputGroup = document.getElementById('year-input-group');
        const importYear = document.getElementById('import-year');
        const clearAllDataBtn = document.getElementById('clear-all-data-button');
        const deleteAllUserDataBtn = document.getElementById('delete-all-user-data-button');
        const loadExampleDataBtn = document.getElementById('load-example-data-button');
        const removeExampleDataBtn = document.getElementById('remove-example-data-button');

        // Load example data button
        if (loadExampleDataBtn) {
            loadExampleDataBtn.addEventListener('click', async () => {
                await this.loadExampleData();
            });
        }

        // Remove example data button
        if (removeExampleDataBtn) {
            removeExampleDataBtn.addEventListener('click', async () => {
                await this.removeExampleData();
            });
        }

        // Clear all cached data button
        if (clearAllDataBtn) {
            clearAllDataBtn.addEventListener('click', async () => {
                const confirmMessage = 'Are you sure you want to clear all cached data? This will clear the local browser cache only. Data in Supabase will remain intact and will be reloaded when you refresh the page.\n\nThis action cannot be undone.';
                if (!confirm(confirmMessage)) {
                    return;
                }

                const fileOperationsStatus = document.getElementById('file-operations-status');
                if (fileOperationsStatus) {
                    fileOperationsStatus.innerHTML = '<p style="color: var(--text-secondary);">Clearing all cached data...</p>';
                }

                try {
                    // Clear DatabaseService in-memory cache (local cache only, not database)
                    if (window.DatabaseService) {
                        window.DatabaseService.clearCache();
                        // Also clear the in-memory cache explicitly
                        window.DatabaseService.monthsCache = null;
                        window.DatabaseService.cacheTimestamp = null;
                    }

                    // Clear all localStorage cache data (for example data clearing functionality)
                    localStorage.removeItem('money_tracker_months_cache');
                    localStorage.removeItem('money_tracker_cache_timestamp');
                    
                    // Clear any other localStorage items related to caching
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith('money_tracker_')) {
                            keysToRemove.push(key);
                        }
                    }
                    keysToRemove.forEach(key => localStorage.removeItem(key));

                    // Reload month selector to refresh from database (always fetches fresh)
                    await this.loadMonthSelector();

                    if (fileOperationsStatus) {
                        fileOperationsStatus.innerHTML = '<p style="color: var(--success-color);">✓ All cached data has been cleared. Data in Supabase remains intact. Refresh the page to reload data from database.</p>';
                    }

                    // Reload the page to refresh data from database
                    // Use a longer delay to ensure cache is fully cleared
                    setTimeout(() => {
                        window.location.reload();
                    }, 1000);

                } catch (error) {
                    console.error('Error clearing cached data:', error);
                    if (fileOperationsStatus) {
                        fileOperationsStatus.innerHTML = `<p style="color: var(--danger-color);">Error clearing cached data: ${error.message}. Please try again.</p>`;
                    }
                }
            });
        }

        // Delete all user data from Supabase button
        if (deleteAllUserDataBtn) {
            deleteAllUserDataBtn.addEventListener('click', async () => {
                const confirmMessage = 'WARNING: This will PERMANENTLY DELETE all YOUR user data from Supabase!\n\n' +
                    'This includes:\n' +
                    '- All your user months (user_months table)\n' +
                    '- All your pots (pots table)\n\n' +
                    'This will NOT delete:\n' +
                    '- Example months (example_months table)\n' +
                    '- Settings (settings table)\n' +
                    '- Other users\' data\n' +
                    '- Database tables themselves\n\n' +
                    'This action CANNOT be undone. Are you absolutely sure?';
                
                if (!confirm(confirmMessage)) {
                    return;
                }

                const fileOperationsStatus = document.getElementById('file-operations-status');
                if (fileOperationsStatus) {
                    fileOperationsStatus.innerHTML = '<p style="color: var(--text-secondary);">Deleting all user data from Supabase...</p>';
                }

                try {
                    if (!window.DatabaseService) {
                        throw new Error('DatabaseService not available');
                    }

                    const result = await window.DatabaseService.clearAllUserTables();

                    if (result.success) {
                        if (fileOperationsStatus) {
                            let message = '<p style="color: var(--success-color);">✓ Successfully deleted all user data from Supabase:</p>';
                            message += `<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">`;
                            message += `<li>Deleted ${result.userMonthsDeleted} user month(s)</li>`;
                            message += `<li>Deleted ${result.potsDeleted} pot(s)</li>`;
                            message += `</ul>`;
                            message += '<p style="margin-top: 0.5rem;">The page will reload to refresh the data.</p>';
                            fileOperationsStatus.innerHTML = message;
                        }

                        // Reload the page after a short delay
                        setTimeout(() => {
                            window.location.reload();
                        }, 2000);
                    } else {
                        let errorMessage = '<p style="color: var(--danger-color);">Error deleting user data:</p>';
                        errorMessage += '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
                        result.errors.forEach(error => {
                            errorMessage += `<li>${error}</li>`;
                        });
                        errorMessage += '</ul>';
                        if (fileOperationsStatus) {
                            fileOperationsStatus.innerHTML = errorMessage;
                        }
                    }
                } catch (error) {
                    console.error('Error deleting user data:', error);
                    if (fileOperationsStatus) {
                        fileOperationsStatus.innerHTML = `<p style="color: var(--danger-color);">Error deleting user data: ${error.message}. Please try again.</p>`;
                    }
                }
            });
        }

        // File input change handler - handle year input if needed
        if (fileInput && yearInputGroup && importYear) {
            fileInput.addEventListener('change', () => {
                const files = fileInput.files;
                if (files && files.length > 0) {
                    this.handleFileInputChange(fileInput, yearInputGroup, importYear);
                } else {
                    yearInputGroup.style.display = 'none';
                }
            });
        }

        // Import button handler - for manually selected files
        if (importButton && fileInput) {
            importButton.addEventListener('click', () => {
                this.handleImportFiles(fileInput, importYear, yearInputGroup, importStatus, importButton);
            });
        }


        // Export button - handles selected month or all months
        if (exportButton && exportFormatSelect && monthSelector) {
            exportButton.addEventListener('click', async () => {
                const selectedValue = monthSelector.value;
                
                if (!selectedValue) {
                    const statusElement = fileOperationsStatus || importStatus;
                    if (statusElement) {
                        statusElement.innerHTML = '<p style="color: var(--warning-color);">Please select a month to export.</p>';
                    }
                    return;
                }
                
                const format = exportFormatSelect.value || 'json';
                
                if (format === 'csv' && !window.CSVHandler) {
                    const statusElement = fileOperationsStatus || importStatus;
                    if (statusElement) {
                        statusElement.innerHTML = '<p style="color: var(--danger-color);">CSVHandler not loaded. Cannot export CSV.</p>';
                    }
                    return;
                }
                
                exportButton.disabled = true;
                const formatUpper = format.toUpperCase();
                const statusElement = fileOperationsStatus || importStatus;
                
                try {
                    if (selectedValue === 'all') {
                        // Export all months
                        const allMonths = await DataManager.getAllMonths();
                        const monthKeys = Object.keys(allMonths);
                        
                        if (monthKeys.length === 0) {
                            if (statusElement) {
                                statusElement.innerHTML = '<p style="color: var(--warning-color);">No months to export.</p>';
                            }
                            return;
                        }
                        
                        if (statusElement) {
                            statusElement.innerHTML = '<p style="color: var(--text-secondary);">Exporting ' + monthKeys.length + ' months as ' + formatUpper + '...</p>';
                        }
                        
                        let exportedCount = 0;
                        for (const monthKey of monthKeys) {
                            const monthData = allMonths[monthKey];
                            const success = await DataManager.exportMonthToFile(monthKey, monthData, format);
                            if (success) exportedCount++;
                            await new Promise(resolve => setTimeout(resolve, 200));
                        }
                        
                        if (statusElement) {
                            statusElement.innerHTML = '<p style="color: var(--success-color);">Successfully exported ' + exportedCount + ' months as ' + formatUpper + '!</p>';
                        }
                    } else {
                        // Export single month
                        if (statusElement) {
                            statusElement.innerHTML = '<p style="color: var(--text-secondary);">Exporting as ' + formatUpper + '...</p>';
                        }
                        
                        const monthData = await DataManager.getMonth(selectedValue);
                        if (!monthData) {
                            throw new Error('Month data not found');
                        }
                        
                        const success = await DataManager.exportMonthToFile(selectedValue, monthData, format);
                        
                        if (success) {
                            const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                            if (statusElement) {
                                statusElement.innerHTML = '<p style="color: var(--success-color);">Successfully exported ' + monthName + ' ' + monthData.year + ' as ' + formatUpper + '!</p>';
                            }
                        } else {
                            if (statusElement) {
                                statusElement.innerHTML = '<p style="color: var(--danger-color);">Failed to export month.</p>';
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error exporting:', error);
                    if (statusElement) {
                        statusElement.innerHTML = '<p style="color: var(--danger-color);">Error exporting: ' + error.message + '</p>';
                    }
                } finally {
                    exportButton.disabled = false;
                }
            });
        }

        // Delete month button
        if (deleteMonthBtn && monthSelector) {
            deleteMonthBtn.addEventListener('click', async () => {
                const selectedMonthKey = monthSelector.value;
                
                if (!selectedMonthKey) {
                    alert('No month selected');
                    return;
                }
                
                const monthData = await DataManager.getMonth(selectedMonthKey);
                if (!monthData) {
                    alert('Month not found');
                    return;
                }

                const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                const year = monthData.year;

                // Check if this is example data before attempting deletion
                if (window.DatabaseService) {
                    const isExample = await window.DatabaseService.isExampleData(selectedMonthKey);
                    if (isExample) {
                        alert('Example data cannot be deleted. This data is protected and locked.');
                        return;
                    }
                }

                const confirmMessage = `Are you sure you want to delete ${monthName} ${year}? This action cannot be undone.`;
                if (!confirm(confirmMessage)) {
                    return;
                }

                try {
                    const success = await DataManager.deleteMonth(selectedMonthKey);

                    if (success) {
                        alert(`${monthName} ${year} has been deleted.`);
                        await this.loadMonthSelector();
                        if (deleteMonthBtn) deleteMonthBtn.style.display = 'none';
                    } else {
                        alert('Error deleting month. Please try again.');
                    }
                } catch (error) {
                    alert(error.message || 'Error deleting month. Please try again.');
                }
            });
        }

        // Month selector change handler - show/hide delete button (hide for "all" option)
        if (monthSelector && deleteMonthBtn) {
            monthSelector.addEventListener('change', () => {
                const selectedValue = monthSelector.value;
                const showDelete = selectedValue && selectedValue !== '' && selectedValue !== 'all';
                deleteMonthBtn.style.display = showDelete ? 'inline-block' : 'none';
            });
        }
    },

    /**
     * Handle file input change
     */
    handleFileInputChange(fileInput, yearInputGroup, importYear) {
        const files = fileInput.files;
        if (!files || files.length === 0) {
            if (yearInputGroup) yearInputGroup.style.display = 'none';
            return;
        }

        // Show year input if any selected file is CSV or HTML
        let showYearInput = false;
        for (let i = 0; i < files.length; i++) {
            const fileName = files[i].name.toLowerCase();
            if (fileName.endsWith('.csv') || fileName.endsWith('.html')) {
                showYearInput = true;
                break;
            }
        }
        if (yearInputGroup) {
            yearInputGroup.style.display = showYearInput ? 'block' : 'none';
        }

        // Try to extract year from first CSV/HTML file
        if (showYearInput && importYear) {
            for (let i = 0; i < files.length; i++) {
                const fileName = files[i].name.toLowerCase();
                if (fileName.endsWith('.csv') || fileName.endsWith('.html')) {
                    const yearMatch = fileName.match(/\b(20\d{2})\b/);
                    if (yearMatch) {
                        importYear.value = yearMatch[1];
                        break;
                    }
                }
            }
        }
    },

    /**
     * Handle import files
     */
    async handleImportFiles(fileInput, importYear, yearInputGroup, importStatus, importButton) {
        const files = fileInput.files;
        if (!files || files.length === 0) {
            if (importStatus) {
                importStatus.innerHTML = '<p style="color: var(--danger-color);">Please select at least one file.</p>';
            }
            return;
        }

        // Validate files
        let hasInvalidFile = false;
        for (let i = 0; i < files.length; i++) {
            const fileName = files[i].name.toLowerCase();
            const isJson = fileName.endsWith('.json');
            const isCsv = fileName.endsWith('.csv');
            const isHtml = fileName.endsWith('.html');

            if (!isJson && !isCsv && !isHtml) {
                hasInvalidFile = true;
                break;
            }
        }

        if (hasInvalidFile) {
            if (importStatus) {
                importStatus.innerHTML = '<p style="color: var(--danger-color);">Please select only JSON, CSV, or HTML files.</p>';
            }
            return;
        }

        // Check if year is needed and valid
        const hasCsvOrHtml = Array.from(files).some(file => {
            const fileName = file.name.toLowerCase();
            return fileName.endsWith('.csv') || fileName.endsWith('.html');
        });

        if (hasCsvOrHtml && importYear && !Formatters.validateYear(parseInt(importYear.value, 10))) {
            if (importStatus) {
                importStatus.innerHTML = '<p style="color: var(--danger-color);">Please enter a valid year for CSV/HTML files.</p>';
            }
            return;
        }

        // Check required handlers are loaded
        const hasCsv = Array.from(files).some(file => file.name.toLowerCase().endsWith('.csv'));
        const hasHtml = Array.from(files).some(file => file.name.toLowerCase().endsWith('.html'));

        if (hasCsv && !window.CSVHandler) {
            if (importStatus) {
                importStatus.innerHTML = '<p style="color: var(--danger-color);">CSVHandler not loaded. Cannot import CSV files.</p>';
            }
            return;
        }

        if (hasHtml && !window.ReferenceImporter) {
            if (importStatus) {
                importStatus.innerHTML = '<p style="color: var(--danger-color);">ReferenceImporter not loaded. Cannot import HTML files.</p>';
            }
            return;
        }

        if (importButton) importButton.disabled = true;
        if (importStatus) {
            importStatus.innerHTML = `<p>Importing ${files.length} file${files.length > 1 ? 's' : ''}...</p>`;
        }

        const year = importYear ? parseInt(importYear.value, 10) : new Date().getFullYear();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        // Process each file
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = file.name.toLowerCase();
            const isJson = fileName.endsWith('.json');
            const isCsv = fileName.endsWith('.csv');
            const isHtml = fileName.endsWith('.html');

            try {
                let monthData = null;
                let monthName = null;
                let fileYear = year;

                // Extract month and year from filename
                for (const month of monthNames) {
                    if (fileName.includes(month.toLowerCase())) {
                        monthName = month;
                        break;
                    }
                }

                // Try to extract year from filename
                const yearMatch = fileName.match(/\b(20\d{2})\b/);
                if (yearMatch) {
                    fileYear = parseInt(yearMatch[1], 10);
                }

                // For JSON files, try to get info from file content
                if (isJson && (!monthName || !fileYear)) {
                    try {
                        const text = await file.text();
                        const jsonData = JSON.parse(text);
                        if (jsonData.monthName && jsonData.year) {
                            monthName = jsonData.monthName;
                            fileYear = jsonData.year;
                        } else if (jsonData.key) {
                            // Extract from key like "april-2025"
                            const keyParts = jsonData.key.split('-');
                            if (keyParts.length >= 2) {
                                monthName = keyParts[0].charAt(0).toUpperCase() + keyParts[0].slice(1);
                                fileYear = parseInt(keyParts[1], 10);
                            }
                        }
                    } catch (e) {
                        // Ignore parse errors, will be caught below
                    }
                }

                if (!monthName) {
                    results.push(`<p style="color: var(--warning-color);">Skipped ${file.name}: Could not determine month name</p>`);
                    errorCount++;
                    continue;
                }

                // Import based on file type
                if (isJson) {
                    const text = await file.text();
                    monthData = JSON.parse(text);
                    if (!monthData.key) {
                        monthData.key = `${monthName.toLowerCase()}-${fileYear}`;
                    }
                } else if (isCsv) {
                    const csvText = await file.text();
                    monthData = CSVHandler.csvToMonthData(csvText, monthName, fileYear);
                } else if (isHtml) {
                    monthData = await ReferenceImporter.importMonthFromFile(file, monthName, fileYear);
                }

                if (!monthData || !monthData.key) {
                    throw new Error('Could not parse month data');
                }

                // Save to DataManager - force save to user_months table for imported data
                await DataManager.saveMonth(monthData.key, monthData, true);
                
                // Small delay to ensure Supabase commit completes
                await new Promise(resolve => setTimeout(resolve, 200));
                
                results.push(`<p style="color: var(--success-color);">✓ Imported ${monthName} ${fileYear} to user_months table</p>`);
                successCount++;

            } catch (error) {
                results.push(`<p style="color: var(--danger-color);">✗ Failed to import ${file.name}: ${error.message}</p>`);
                errorCount++;
            }
        }

        // Show results
        if (importStatus) {
            if (files.length === 1 && successCount === 1) {
                const file = files[0];
                const fileName = file.name.toLowerCase();
                const isJson = fileName.endsWith('.json');
                const isCsv = fileName.endsWith('.csv');
                const isHtml = fileName.endsWith('.html');
                const fileType = isJson ? 'JSON' : (isCsv ? 'CSV' : 'HTML');

                let monthName = null;
                let fileYear = null;
                for (const month of monthNames) {
                    if (fileName.includes(month.toLowerCase())) {
                        monthName = month;
                        break;
                    }
                }
                const yearMatch = fileName.match(/\b(20\d{2})\b/);
                if (yearMatch) {
                    fileYear = yearMatch[1];
                }

                if (isJson && (!monthName || !fileYear)) {
                    try {
                        const text = await files[0].text();
                        const jsonData = JSON.parse(text);
                        if (jsonData.monthName) monthName = jsonData.monthName;
                        if (jsonData.year) fileYear = jsonData.year;
                        else if (jsonData.key) {
                            const keyParts = jsonData.key.split('-');
                            if (keyParts.length >= 2) {
                                monthName = keyParts[0].charAt(0).toUpperCase() + keyParts[0].slice(1);
                                fileYear = parseInt(keyParts[1], 10);
                            }
                        }
                    } catch (e) {}
                }

                const monthData = DataManager.getMonth(`${monthName?.toLowerCase()}-${fileYear}`);
                importStatus.innerHTML = `
                    <p style="color: var(--success-color);">
                        ✓ Successfully imported ${monthName || 'month'} ${fileYear || ''} from ${fileType} file!
                    </p>
                    ${monthData ? `<p style="margin-top: 0.5rem;"><a href="monthly-budget.html?month=${monthData.key}" style="color: var(--primary-color);">View Month →</a></p>` : ''}
                `;
            } else {
                importStatus.innerHTML = `
                    <div>
                        <p><strong>Import Complete:</strong> ${successCount} succeeded, ${errorCount} failed</p>
                        ${results.join('')}
                        ${successCount > 0 ? `<p><a href="monthly-budget.html" style="color: var(--primary-color);">View Monthly Budget</a></p>` : ''}
                    </div>
                `;
            }
        }

        if (fileInput) fileInput.value = '';
        if (yearInputGroup) yearInputGroup.style.display = 'none';
        if (importButton) {
            importButton.disabled = false;
        }
            await this.loadMonthSelector();
    },

    /**
     * Load month selector dropdown
     */
    async loadMonthSelector() {
        const selector = document.getElementById('month-selector');
        if (!selector) return;

        const allMonths = await DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths).sort().reverse();

        if (monthKeys.length > 0) {
            selector.innerHTML = '<option value="">Select month...</option>' +
                '<option value="all">Export All Months</option>' + 
                monthKeys.map(key => {
                    const monthData = allMonths[key];
                    const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                    return `<option value="${key}">${monthName} ${monthData.year}</option>`;
                }).join('');
        } else {
            selector.innerHTML = '<option value="">No months available</option>';
        }
    },

    /**
     * Load all example data from Supabase
     * Checks if example data exists in Supabase and displays it
     * Example data uses year 2045 to avoid conflicts with real data
     */
    async loadExampleData() {
        const importStatus = document.getElementById('import-status');
        const loadExampleDataBtn = document.getElementById('load-example-data-button');

        // Example data configuration (year 2045)
        const EXAMPLE_YEAR = 2045;
        const exampleMonthKeys = [
            `${EXAMPLE_YEAR}-01`,
            `${EXAMPLE_YEAR}-09`,
            `${EXAMPLE_YEAR}-10`,
            `${EXAMPLE_YEAR}-11`
        ];
        const exampleMonthNames = {
            '01': 'January',
            '09': 'September',
            '10': 'October',
            '11': 'November'
        };

        if (loadExampleDataBtn) {
            loadExampleDataBtn.disabled = true;
            loadExampleDataBtn.textContent = 'Checking...';
        }

        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }

            // Check which example months exist in Supabase
            const foundExampleMonths = [];
            const missingExampleMonths = [];
            
            for (const monthKey of exampleMonthKeys) {
                try {
                    const monthData = await window.DatabaseService.getMonth(monthKey);
                    if (monthData) {
                        foundExampleMonths.push(monthKey);
                    } else {
                        const monthNum = monthKey.split('-')[1];
                        const monthName = exampleMonthNames[monthNum];
                        missingExampleMonths.push({
                            key: monthKey,
                            monthName: monthName,
                            year: EXAMPLE_YEAR
                        });
                    }
                } catch (err) {
                    // Month doesn't exist in Supabase
                    const monthNum = monthKey.split('-')[1];
                    const monthName = exampleMonthNames[monthNum];
                    missingExampleMonths.push({
                        key: monthKey,
                        monthName: monthName,
                        year: EXAMPLE_YEAR
                    });
                }
            }

            if (foundExampleMonths.length === 0) {
                if (importStatus) {
                    let message = '<p style="color: var(--warning-color);">No example data found in Supabase.</p>';
                    if (missingExampleMonths.length > 0) {
                        message += '<p style="margin-top: 0.5rem;">Missing months:</p>';
                        message += '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
                        for (const monthData of missingExampleMonths) {
                            message += `<li>${monthData.monthName} ${monthData.year}</li>`;
                        }
                        message += '</ul>';
                        message += '<p style="margin-top: 0.5rem; color: var(--text-secondary);">';
                        message += 'To add example data to Supabase, run the SQL script from <code>database/utils/populate-example-data.sql</code> in Supabase SQL Editor.';
                        message += '</p>';
                    }
                    importStatus.innerHTML = message;
                }
                if (loadExampleDataBtn) {
                    loadExampleDataBtn.disabled = false;
                    loadExampleDataBtn.textContent = 'Load Example Data';
                }
                return;
            }

            // Add found example months to the enabled list
            window.DatabaseService.addEnabledExampleMonths(foundExampleMonths);

            if (importStatus) {
                let message = `<p style="color: var(--success-color);">✓ Successfully added ${foundExampleMonths.length} example month(s) to your view:</p>`;
                message += '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
                for (const monthKey of foundExampleMonths) {
                    const monthNum = monthKey.split('-')[1];
                    const monthName = exampleMonthNames[monthNum];
                    message += `<li>${monthName} ${EXAMPLE_YEAR}</li>`;
                }
                message += '</ul>';
                if (missingExampleMonths.length > 0) {
                    message += '<hr style="margin: 1rem 0;">';
                    message += `<p style="color: var(--warning-color);">${missingExampleMonths.length} example month(s) not found in Supabase:</p>`;
                    message += '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
                    for (const monthData of missingExampleMonths) {
                        message += `<li>${monthData.monthName} ${monthData.year}</li>`;
                    }
                    message += '</ul>';
                }
                message += '<p style="margin-top: 0.5rem;">Example data is now visible in your monthly budget. The page will reload.</p>';
                importStatus.innerHTML = message;
            }

            // Reload the page to refresh data
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('Error loading example data:', error);
            if (importStatus) {
                importStatus.innerHTML = `<p style="color: var(--danger-color);">Error checking example data: ${error.message}</p>`;
            }
        } finally {
            if (loadExampleDataBtn) {
                loadExampleDataBtn.disabled = false;
                loadExampleDataBtn.textContent = 'Load Example Data';
            }
        }
    },

    /**
     * Remove example data from user's view
     * This removes example months from the enabled list, but data remains in Supabase
     */
    async removeExampleData() {
        const importStatus = document.getElementById('import-status');
        const removeExampleDataBtn = document.getElementById('remove-example-data-button');

        const confirmMessage = 'This will remove example data from your view. The data in Supabase will remain intact and can be added back anytime using the "Load Example Data" button.\n\nContinue?';
        if (!confirm(confirmMessage)) {
            return;
        }

        if (removeExampleDataBtn) {
            removeExampleDataBtn.disabled = true;
            removeExampleDataBtn.textContent = 'Removing...';
        }

        if (importStatus) {
            importStatus.innerHTML = '<p style="color: var(--text-secondary);">Removing example data from your view...</p>';
        }

        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }

            // Remove all example months from the enabled list
            window.DatabaseService.removeEnabledExampleMonths();

            if (importStatus) {
                importStatus.innerHTML = '<p style="color: var(--success-color);">✓ Example data removed from your view. Data in Supabase remains intact. You can add it back anytime using the "Load Example Data" button. The page will reload.</p>';
            }

            // Reload the page to refresh data
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('Error removing example data from cache:', error);
            if (importStatus) {
                importStatus.innerHTML = `<p style="color: var(--danger-color);">Error clearing example data: ${error.message}. Please try again.</p>`;
            }
            // Re-enable button on error
            if (removeExampleDataBtn) {
                removeExampleDataBtn.disabled = false;
                removeExampleDataBtn.textContent = 'Remove Example Data';
            }
        }
    }
};

// Make available globally
window.SettingsController = SettingsController;

