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
        
        try {
            await this.loadSubscriptionStatus();
            console.log('[SettingsController] Subscription status loaded');
        } catch (error) {
            console.error('[SettingsController] Error loading subscription status:', error);
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
            // Update localStorage cache for immediate application on next page load
            localStorage.setItem('money_tracker_fontSize', fontSize);
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
        
        // Subscription buttons
        const startSubscriptionBtn = document.getElementById('start-subscription-button');
        const refreshSubscriptionBtn = document.getElementById('refresh-subscription-button');
        const updatePaymentBtn = document.getElementById('update-payment-button');
        
        if (startSubscriptionBtn) {
            startSubscriptionBtn.addEventListener('click', () => this.handleStartSubscription());
        }
        
        if (refreshSubscriptionBtn) {
            refreshSubscriptionBtn.addEventListener('click', () => this.loadSubscriptionStatus());
        }
        
        if (updatePaymentBtn) {
            updatePaymentBtn.addEventListener('click', () => this.handleUpdatePayment());
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
    },
    
    /**
     * Handle recurring billing toggle
     */
    async handleRecurringBillingToggle(enabled) {
        console.log('[SettingsController] ========== handleRecurringBillingToggle() STARTED ==========');
        console.log('[SettingsController] Recurring billing enabled:', enabled);
        
        try {
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                throw new Error('User not authenticated');
            }
            
            const currentUser = window.AuthService.getCurrentUser();
            if (!currentUser || !currentUser.id) {
                throw new Error('User ID not available');
            }
            
            if (!window.SubscriptionService) {
                throw new Error('SubscriptionService not available');
            }
            
            // Show loading state
            const toggle = document.getElementById('recurring-billing-toggle');
            if (toggle) {
                toggle.disabled = true;
            }
            
            let result;
            if (enabled) {
                result = await window.SubscriptionService.enableRecurringBilling(currentUser.id);
            } else {
                result = await window.SubscriptionService.disableRecurringBilling(currentUser.id);
            }
            
            if (result.success) {
                // Reload subscription status to show updated state
                await this.loadSubscriptionStatus();
                
                const message = enabled 
                    ? 'Auto-renewal enabled. Your subscription will automatically renew at the end of each billing period.'
                    : 'Auto-renewal disabled. Your subscription will cancel at the end of the current billing period, but you will continue to have access until then.';
                
                alert(message);
            } else {
                throw new Error(result.error || 'Failed to update recurring billing');
            }
        } catch (error) {
            console.error('[SettingsController] Error toggling recurring billing:', error);
            alert(`Error: ${error.message || 'Failed to update recurring billing. Please try again.'}`);
            
            // Reload subscription status to reset toggle state
            await this.loadSubscriptionStatus();
        } finally {
            // Re-enable toggle
            const toggle = document.getElementById('recurring-billing-toggle');
            if (toggle) {
                toggle.disabled = false;
            }
        }
    },
    
    /**
     * Handle recurring billing toggle
     */
    async handleRecurringBillingToggle(enabled) {
        console.log('[SettingsController] ========== handleRecurringBillingToggle() STARTED ==========');
        console.log('[SettingsController] Recurring billing enabled:', enabled);
        
        try {
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                throw new Error('User not authenticated');
            }
            
            const currentUser = window.AuthService.getCurrentUser();
            if (!currentUser || !currentUser.id) {
                throw new Error('User ID not available');
            }
            
            if (!window.SubscriptionService) {
                throw new Error('SubscriptionService not available');
            }
            
            // Show loading state
            const toggle = document.getElementById('recurring-billing-toggle');
            if (toggle) {
                toggle.disabled = true;
            }
            
            let result;
            if (enabled) {
                result = await window.SubscriptionService.enableRecurringBilling(currentUser.id);
            } else {
                result = await window.SubscriptionService.disableRecurringBilling(currentUser.id);
            }
            
            if (result.success) {
                // Reload subscription status to show updated state
                await this.loadSubscriptionStatus();
                
                const message = enabled 
                    ? 'Auto-renewal enabled. Your subscription will automatically renew at the end of each billing period.'
                    : 'Auto-renewal disabled. Your subscription will cancel at the end of the current billing period, but you will continue to have access until then.';
                
                alert(message);
            } else {
                throw new Error(result.error || 'Failed to update recurring billing');
            }
        } catch (error) {
            console.error('[SettingsController] Error toggling recurring billing:', error);
            alert(`Error: ${error.message || 'Failed to update recurring billing. Please try again.'}`);
            
            // Reload subscription status to reset toggle state
            await this.loadSubscriptionStatus();
        } finally {
            // Re-enable toggle
            const toggle = document.getElementById('recurring-billing-toggle');
            if (toggle) {
                toggle.disabled = false;
            }
        }
    },
    
    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) {
            return 'N/A';
        }
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-GB', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (error) {
            return dateString;
        }
    },
    
    /**
     * Format currency amount
     */
    formatCurrency(amount, currency = 'EUR') {
        if (amount === null || amount === undefined) {
            return 'N/A';
        }
        const currencySymbols = {
            'EUR': '€',
            'GBP': '£',
            'USD': '$'
        };
        const symbol = currencySymbols[currency.toUpperCase()] || currency;
        return `${symbol}${parseFloat(amount).toFixed(2)}`;
    },
    
    /**
     * Load and display subscription status with detailed information from database
     */
    async loadSubscriptionStatus() {
        const statusContainer = document.getElementById('subscription-status-container');
        const statusMessage = document.getElementById('subscription-status-message');
        const subscriptionSection = statusContainer ? statusContainer.closest('.settings-section') : null;
        const subscriptionHeading = subscriptionSection ? subscriptionSection.querySelector('h2.section-title') : null;
        const startSubscriptionBtn = document.getElementById('start-subscription-button');
        const statusDiv = document.getElementById('subscription-status');
        const subscriptionDetailsContainer = document.getElementById('subscription-details');
        const subscriptionDetailsContent = document.getElementById('subscription-details-content');
        
        if (!statusContainer || !statusMessage) {
            return;
        }
        
        try {
            if (!window.SubscriptionService) {
                throw new Error('SubscriptionService not available');
            }
            
            const result = await window.SubscriptionService.getCurrentUserSubscription();
            
            if (!result.success || !result.subscription) {
                statusMessage.textContent = 'No subscription found. Please subscribe to access the application.';
                statusMessage.className = 'subscription-message subscription-message-error';
                statusMessage.style.backgroundColor = 'rgba(181, 138, 138, 0.2)';
                statusMessage.style.border = 'var(--border-width-standard) solid var(--danger-color)';
                if (startSubscriptionBtn) {
                    startSubscriptionBtn.style.display = 'block';
                }
                if (subscriptionDetailsContainer) {
                    subscriptionDetailsContainer.style.display = 'none';
                }
                return;
            }
            
            const subscription = result.subscription;
            const plan = result.plan;
            const isActive = window.SubscriptionService.isSubscriptionActive(subscription);
            
            const planName = plan ? (plan.plan_name || 'Standard') : 'Standard';
            
            if (subscriptionHeading) {
                subscriptionHeading.textContent = 'Subscription';
            }
            
            let statusText = '';
            let statusClass = '';
            let statusBgColor = '';
            let statusBorderColor = '';
            
            if (subscription.status === 'trial') {
                const daysRemaining = window.SubscriptionService.getTrialDaysRemaining(subscription);
                const isExpired = window.SubscriptionService.isTrialExpired(subscription);
                
                if (isExpired) {
                    statusText = 'Your trial has expired. Please subscribe to continue using the application.';
                    statusClass = 'subscription-message-error';
                    statusBgColor = 'rgba(181, 138, 138, 0.2)';
                    statusBorderColor = 'var(--danger-color)';
                    if (startSubscriptionBtn) {
                        startSubscriptionBtn.style.display = 'block';
                    }
                } else {
                    // Hide status message when subscription details are shown (details table has all info)
                    statusText = '';
                    statusClass = '';
                    statusBgColor = 'transparent';
                    statusBorderColor = 'transparent';
                    if (startSubscriptionBtn) {
                        startSubscriptionBtn.style.display = 'none';
                    }
                }
            } else if (subscription.status === 'active') {
                const daysRemaining = window.SubscriptionService.getSubscriptionDaysRemaining(subscription);
                const planName = plan ? (plan.plan_name || 'Standard') : 'Standard';
                
                if (daysRemaining !== null && daysRemaining !== undefined) {
                    if (daysRemaining === 0) {
                        statusText = `Your ${planName} subscription has expired. Please renew to continue.`;
                        statusClass = 'subscription-message-error';
                        statusBgColor = 'rgba(181, 138, 138, 0.2)';
                        statusBorderColor = 'var(--danger-color)';
                        if (startSubscriptionBtn) {
                            startSubscriptionBtn.style.display = 'block';
                        }
                    } else {
                        // Hide status message when subscription details are shown (details table has all info)
                        statusText = '';
                        statusClass = '';
                        statusBgColor = 'transparent';
                        statusBorderColor = 'transparent';
                    }
                } else {
                    // Hide status message when subscription details are shown (details table has all info)
                    statusText = '';
                    statusClass = '';
                    statusBgColor = 'transparent';
                    statusBorderColor = 'transparent';
                }
                
                if (startSubscriptionBtn) {
                    startSubscriptionBtn.style.display = 'none';
                }
            } else {
                statusText = `Your subscription status: ${subscription.status}. Please subscribe to continue.`;
                statusClass = 'subscription-message-error';
                statusBgColor = 'rgba(181, 138, 138, 0.2)';
                statusBorderColor = 'var(--danger-color)';
                if (startSubscriptionBtn) {
                    startSubscriptionBtn.style.display = 'block';
                }
            }
            
            // Only show status message if there's actual text (hide when details table shows all info)
            if (statusText) {
                statusMessage.textContent = statusText;
                statusMessage.className = `subscription-message ${statusClass}`;
                statusMessage.style.backgroundColor = statusBgColor;
                statusMessage.style.border = `var(--border-width-standard) solid ${statusBorderColor}`;
                statusMessage.style.display = 'block';
            } else {
                // Hide status message when subscription details table is shown
                statusMessage.style.display = 'none';
            }
            
            if (subscriptionDetailsContainer && subscriptionDetailsContent) {
                const detailsHtml = [];
                
                // Subscription Type (always show - clearly distinguishes trial vs paid)
                const subscriptionType = window.SubscriptionService ? window.SubscriptionService.getSubscriptionTypeDescription(subscription) : (subscription.subscription_type ? subscription.subscription_type.charAt(0).toUpperCase() + subscription.subscription_type.slice(1) : 'Unknown');
                detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Type:</strong><span>${subscriptionType}</span></div>`);
                
                // Days Remaining (calculate and show)
                let daysRemaining = null;
                if (subscription.status === 'trial') {
                    daysRemaining = window.SubscriptionService.getTrialDaysRemaining(subscription);
                } else if (subscription.status === 'active') {
                    daysRemaining = window.SubscriptionService.getSubscriptionDaysRemaining(subscription);
                }
                
                if (daysRemaining !== null && daysRemaining !== undefined) {
                    const daysText = daysRemaining === 0 ? 'Expired' : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
                    detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Days Remaining:</strong><span>${daysText}</span></div>`);
                }
                
                // Subscription Start (show if available - prefer subscription_start_date, fallback to trial_start_date)
                const subscriptionStartDate = subscription.subscription_start_date || subscription.trial_start_date;
                if (subscriptionStartDate) {
                    detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Subscription Start:</strong><span>${this.formatDate(subscriptionStartDate)}</span></div>`);
                }
                
                // Subscription End (show if available - prefer subscription_end_date, fallback to trial_end_date)
                const subscriptionEndDate = subscription.subscription_end_date || subscription.trial_end_date;
                if (subscriptionEndDate) {
                    detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Subscription End:</strong><span>${this.formatDate(subscriptionEndDate)}</span></div>`);
                }
                
                // Recurring Billing Toggle (only for paid subscriptions)
                if (subscription.subscription_type === 'paid' && subscription.stripe_subscription_id) {
                    const recurringBillingEnabled = subscription.recurring_billing_enabled !== false; // Default to true if not set
                    const toggleId = 'recurring-billing-toggle';
                    detailsHtml.push(`
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));">
                            <strong>Auto-Renewal:</strong>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input type="checkbox" id="${toggleId}" ${recurringBillingEnabled ? 'checked' : ''} style="cursor: pointer;">
                                <span>${recurringBillingEnabled ? 'Enabled' : 'Disabled'}</span>
                            </label>
                        </div>
                    `);
                }
                
                // Always show the details box if we have a subscription
                if (detailsHtml.length > 0) {
                    subscriptionDetailsContent.innerHTML = detailsHtml.join('');
                    subscriptionDetailsContainer.style.display = 'block';
                    
                    // Set up recurring billing toggle event listener
                    const toggle = document.getElementById('recurring-billing-toggle');
                    if (toggle) {
                        toggle.addEventListener('change', async (e) => {
                            await this.handleRecurringBillingToggle(e.target.checked);
                        });
                    }
                } else {
                    subscriptionDetailsContainer.style.display = 'none';
                }
            }
            
            // Display Account Created date in separate section outside the details box
            // Get account created date from user object (not subscription) - this is the actual account creation date
            const accountCreatedContainer = document.getElementById('account-created-container');
            const accountCreatedDate = document.getElementById('account-created-date');
            
            // Set up recurring billing toggle event listener (if toggle exists)
            const toggle = document.getElementById('recurring-billing-toggle');
            if (toggle) {
                // Remove existing listeners to prevent duplicates
                const newToggle = toggle.cloneNode(true);
                toggle.parentNode.replaceChild(newToggle, toggle);
                newToggle.addEventListener('change', async (e) => {
                    await this.handleRecurringBillingToggle(e.target.checked);
                });
            }
            
            if (accountCreatedContainer && accountCreatedDate) {
                // Get user account created date from AuthService (Supabase auth.users table)
                const currentUser = window.AuthService ? window.AuthService.getCurrentUser() : null;
                if (currentUser && currentUser.created_at) {
                    accountCreatedDate.textContent = this.formatDate(currentUser.created_at);
                    accountCreatedContainer.style.display = 'block';
                } else {
                    // Fallback: try to get from session if currentUser doesn't have it
                    const session = window.AuthService ? window.AuthService.getSession() : null;
                    if (session && session.user && session.user.created_at) {
                        accountCreatedDate.textContent = this.formatDate(session.user.created_at);
                        accountCreatedContainer.style.display = 'block';
                    } else {
                        accountCreatedContainer.style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('[SettingsController] Error loading subscription status:', error);
            statusMessage.textContent = `Error loading subscription status: ${error.message}`;
            statusMessage.className = 'subscription-message subscription-message-error';
            statusMessage.style.backgroundColor = 'rgba(181, 138, 138, 0.2)';
            statusMessage.style.border = 'var(--border-width-standard) solid var(--danger-color)';
            if (subscriptionDetailsContainer) {
                subscriptionDetailsContainer.style.display = 'none';
            }
        }
    },
    
    /**
     * Handle start subscription button click
     */
    async handleStartSubscription() {
        try {
            const button = document.getElementById('start-subscription-button');
            const statusDiv = document.getElementById('subscription-status');
            
            if (button) {
                button.disabled = true;
                button.textContent = 'Processing...';
            }
            
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                throw new Error('User not authenticated');
            }
            
            const currentUser = window.AuthService.getCurrentUser();
            if (!currentUser || !currentUser.email) {
                throw new Error('User email not available');
            }
            
            const currentUrl = window.location.href.split('?')[0];
            const successUrl = `${currentUrl}?payment=success`;
            const cancelUrl = `${currentUrl}?payment=cancelled`;
            
            if (!window.StripeService) {
                throw new Error('StripeService not available');
            }
            
            await window.StripeService.initialize();
            
            const supabaseProjectUrl = 'https://ofutzrxfbrgtbkyafndv.supabase.co';
            const backendEndpoint = `${supabaseProjectUrl}/functions/v1/create-checkout-session`;
            
            const result = await window.StripeService.createCheckoutSession(
                currentUser.email,
                currentUser.id,
                successUrl,
                cancelUrl,
                backendEndpoint
            );
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to create checkout session');
            }
            
            if (result.sessionId) {
                const redirectResult = await window.StripeService.redirectToCheckout(result.sessionId);
                if (!redirectResult.success) {
                    throw new Error(redirectResult.error || 'Failed to redirect to checkout');
                }
            } else {
                throw new Error('Checkout session requires backend implementation. Please set up a server endpoint to create Stripe checkout sessions.');
            }
        } catch (error) {
            console.error('[SettingsController] Error starting subscription:', error);
            const statusDiv = document.getElementById('subscription-status');
            if (statusDiv) {
                statusDiv.innerHTML = `<p style="color: var(--danger-color);">Error: ${error.message || 'Failed to start subscription. Please try again.'}</p>`;
            }
            
            const button = document.getElementById('start-subscription-button');
            if (button) {
                button.disabled = false;
                button.textContent = 'Start Subscription (€5/month)';
            }
        }
    },
    
    /**
     * Handle update payment button click
     * Opens Stripe Customer Portal for updating payment method
     * For trial users without customer ID, creates a customer first
     */
    async handleUpdatePayment() {
        console.log('[SettingsController] ========== handleUpdatePayment() STARTED ==========');
        const startTime = Date.now();
        
        try {
            console.log('[SettingsController] Step 1: Getting button element...');
            const button = document.getElementById('update-payment-button');
            if (button) {
                button.disabled = true;
                button.textContent = 'Loading...';
                console.log('[SettingsController] ✅ Button found and disabled');
            } else {
                console.warn('[SettingsController] ⚠️ Button element not found');
            }
            
            console.log('[SettingsController] Step 2: Checking authentication...');
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                console.error('[SettingsController] ❌ User not authenticated');
                throw new Error('User not authenticated');
            }
            console.log('[SettingsController] ✅ User authenticated');
            
            console.log('[SettingsController] Step 3: Getting current user...');
            const currentUser = window.AuthService.getCurrentUser();
            if (!currentUser || !currentUser.email) {
                console.error('[SettingsController] ❌ User email not available:', { hasUser: !!currentUser, hasEmail: !!currentUser?.email });
                throw new Error('User email not available');
            }
            console.log('[SettingsController] ✅ Current user:', { userId: currentUser.id, email: currentUser.email });
            
            console.log('[SettingsController] Step 4: Loading subscription state...');
            let subscription = null;
            if (window.SubscriptionService) {
                const subscriptionResult = await window.SubscriptionService.getCurrentUserSubscription();
                if (subscriptionResult.success && subscriptionResult.subscription) {
                    subscription = subscriptionResult.subscription;
                }
            }
            const existingCustomerId = subscription?.stripe_customer_id;
            console.log('[SettingsController] Subscription state:', {
                hasSubscription: !!subscription,
                subscriptionType: subscription?.subscription_type,
                subscriptionStatus: subscription?.status,
                hasCustomerId: !!existingCustomerId,
                customerId: existingCustomerId || 'none'
            });
            
            console.log('[SettingsController] Step 5: Checking StripeService availability...');
            if (!window.StripeService) {
                console.error('[SettingsController] ❌ StripeService not available');
                throw new Error('StripeService not available');
            }
            console.log('[SettingsController] ✅ StripeService available');
            
            console.log('[SettingsController] Step 6: Initializing Stripe...');
            await window.StripeService.initialize();
            console.log('[SettingsController] ✅ Stripe initialized');
            
            let customerId = existingCustomerId;
            
            // If no customer ID, create one first (for trial users)
            if (!customerId) {
                console.log('[SettingsController] Step 7: No customer ID found, creating customer...');
                console.log('[SettingsController] Customer creation details:', {
                    email: currentUser.email,
                    userId: currentUser.id
                });
                
                const supabaseProjectUrl = 'https://ofutzrxfbrgtbkyafndv.supabase.co';
                const createCustomerEndpoint = `${supabaseProjectUrl}/functions/v1/create-customer`;
                console.log('[SettingsController] Customer creation endpoint:', createCustomerEndpoint);
                
                const customerStartTime = Date.now();
                const customerResult = await window.StripeService.createCustomer(
                    currentUser.email,
                    currentUser.id,
                    createCustomerEndpoint
                );
                const customerElapsed = Date.now() - customerStartTime;
                
                console.log('[SettingsController] Customer creation result:', {
                    success: customerResult.success,
                    hasCustomerId: !!customerResult.customerId,
                    customerId: customerResult.customerId || 'none',
                    error: customerResult.error || 'none',
                    elapsed: `${customerElapsed}ms`
                });
                
                if (!customerResult.success || !customerResult.customerId) {
                    console.error('[SettingsController] ❌ Customer creation failed:', customerResult.error);
                    throw new Error(customerResult.error || 'Failed to create customer');
                }
                
                customerId = customerResult.customerId;
                console.log('[SettingsController] ✅ Customer created successfully:', customerId);
                
                // Store customer ID in database (non-blocking)
                if (window.SubscriptionService && subscription) {
                    console.log('[SettingsController] Step 8: Storing customer ID in database...');
                    window.SubscriptionService.updateSubscription(currentUser.id, {
                        stripe_customer_id: customerId
                    }).then(() => {
                        console.log('[SettingsController] ✅ Customer ID stored in database');
                    }).catch(err => {
                        console.warn('[SettingsController] ⚠️ Failed to store customer ID in database:', err);
                    });
                } else {
                    console.log('[SettingsController] Step 8: Skipping database update (no subscription or SubscriptionService)');
                }
            } else {
                console.log('[SettingsController] Step 7: Using existing customer ID:', customerId);
            }
            
            console.log('[SettingsController] Step 9: Preparing portal session...');
            const currentUrl = window.location.href.split('?')[0];
            const returnUrl = currentUrl;
            console.log('[SettingsController] Portal session details:', {
                customerId: customerId,
                returnUrl: returnUrl
            });
            
            const supabaseProjectUrl = 'https://ofutzrxfbrgtbkyafndv.supabase.co';
            const backendEndpoint = `${supabaseProjectUrl}/functions/v1/create-portal-session`;
            console.log('[SettingsController] Portal session endpoint:', backendEndpoint);
            
            console.log('[SettingsController] Step 10: Creating portal session...');
            const portalStartTime = Date.now();
            const result = await window.StripeService.createPortalSession(
                customerId,
                returnUrl,
                backendEndpoint
            );
            const portalElapsed = Date.now() - portalStartTime;
            
            console.log('[SettingsController] Portal session result:', {
                success: result.success,
                hasUrl: !!result.url,
                url: result.url || 'none',
                error: result.error || 'none',
                elapsed: `${portalElapsed}ms`
            });
            
            if (!result.success) {
                console.error('[SettingsController] ❌ Portal session creation failed:', result.error);
                throw new Error(result.error || 'Failed to create portal session');
            }
            
            if (result.url) {
                console.log('[SettingsController] Step 11: Redirecting to Stripe Customer Portal...');
                console.log('[SettingsController] Portal URL:', result.url);
                const totalElapsed = Date.now() - startTime;
                console.log('[SettingsController] ========== handleUpdatePayment() SUCCESS ==========');
                console.log('[SettingsController] Total time:', `${totalElapsed}ms`);
                // Redirect to Stripe Customer Portal
                window.location.href = result.url;
            } else {
                console.error('[SettingsController] ❌ No portal URL returned');
                throw new Error('No portal URL returned');
            }
        } catch (error) {
            const totalElapsed = Date.now() - startTime;
            console.error('[SettingsController] ========== handleUpdatePayment() ERROR ==========');
            console.error('[SettingsController] Error details:', {
                message: error.message,
                stack: error.stack,
                elapsed: `${totalElapsed}ms`
            });
            console.error('[SettingsController] Error opening payment portal:', error);
            
            const statusDiv = document.getElementById('subscription-status');
            if (statusDiv) {
                statusDiv.innerHTML = `<p style="color: var(--danger-color);">Error: ${error.message || 'Failed to open payment portal. Please try again.'}</p>`;
            }
            
            const button = document.getElementById('update-payment-button');
            if (button) {
                button.disabled = false;
                button.textContent = 'Update Payment';
                console.log('[SettingsController] Button re-enabled');
            }
        }
    }
};

// Make available globally
window.SettingsController = SettingsController;

