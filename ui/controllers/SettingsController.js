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
        
        try {
            await this.loadDataShares();
            console.log('[SettingsController] Data shares loaded');
            
            // Check if we should auto-open share form with month pre-selected
            const shareMonthYear = sessionStorage.getItem('shareMonthYear');
            const shareMonthMonth = sessionStorage.getItem('shareMonthMonth');
            if (shareMonthYear && shareMonthMonth) {
                sessionStorage.removeItem('shareMonthYear');
                sessionStorage.removeItem('shareMonthMonth');
                // Wait a bit for the page to render
                setTimeout(async () => {
                    await this.showAddShareFormWithMonth(parseInt(shareMonthYear, 10), parseInt(shareMonthMonth, 10));
                }, 500);
            } else if (window.location.hash === '#data-sharing') {
                // Scroll to data sharing section if hash is present
                setTimeout(() => {
                    const dataSharingSection = document.getElementById('data-sharing-section');
                    if (dataSharingSection) {
                        dataSharingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 500);
            }
        } catch (error) {
            console.error('[SettingsController] Error loading data shares:', error);
        }

        try {
            await this.loadNotificationPreferences();
            console.log('[SettingsController] Notification preferences loaded');
        } catch (error) {
            console.error('[SettingsController] Error loading notification preferences:', error);
        }

        try {
            await this.loadBlockedUsers();
            console.log('[SettingsController] Blocked users loaded');
        } catch (error) {
            console.error('[SettingsController] Error loading blocked users:', error);
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
        
        if (startSubscriptionBtn) {
            startSubscriptionBtn.addEventListener('click', () => this.handleStartSubscription());
        }
        
        if (refreshSubscriptionBtn) {
            refreshSubscriptionBtn.addEventListener('click', () => this.loadSubscriptionStatus());
        }
        
        // Data sharing event listeners
        const addShareBtn = document.getElementById('add-share-button');
        if (addShareBtn) {
            addShareBtn.addEventListener('click', () => this.showAddShareForm());
        }
        
        const cancelShareBtn = document.getElementById('cancel-share-button');
        if (cancelShareBtn) {
            cancelShareBtn.addEventListener('click', () => this.hideAddShareForm());
        }
        
        const saveShareBtn = document.getElementById('save-share-button');
        if (saveShareBtn) {
            saveShareBtn.addEventListener('click', () => this.handleAddShare());
        }
        
        const addMonthBtn = document.getElementById('add-month-button');
        if (addMonthBtn) {
            addMonthBtn.addEventListener('click', () => this.addMonthToShare());
        }
        
        const shareAllDataCheckbox = document.getElementById('share-all-data');
        if (shareAllDataCheckbox) {
            shareAllDataCheckbox.addEventListener('change', () => this.handleShareAllDataChange());
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
                    let displayText = `${monthName} ${monthData.year}`;

                    // If this is a shared month, append owner email
                    if (monthData.isShared && monthData.sharedOwnerId) {
                        const ownerEmail = monthData.sharedOwnerEmail || 'Unknown User';
                        displayText += ` (shared:${ownerEmail})`;
                    }
                    // If this is an example month (year 2045), append "Example" label
                    else if (monthData.year === 2045) {
                        displayText += ` (Example)`;
                    }

                    return `<option value="${key}">${displayText}</option>`;
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
                message += '<p style="margin-top: 0.5rem;">Example data is now visible in your monthly budget.</p>';
                importStatus.innerHTML = message;
            }

            // Refresh the month selector dropdown without reloading the page
            await this.loadMonthSelector();
            // Also refresh the user months dropdown in data sharing section if it exists
            await this.loadUserMonthsIntoDropdown();

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
                importStatus.innerHTML = '<p style="color: var(--success-color);">✓ Example data removed from your view. Data in Supabase remains intact. You can add it back anytime using the "Load Example Data" button.</p>';
            }

            // Refresh the month selector dropdown without reloading the page
            await this.loadMonthSelector();
            // Also refresh the user months dropdown in data sharing section if it exists
            await this.loadUserMonthsIntoDropdown();

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
    },
    
    /**
     * ============================================================================
     * DATA SHARING METHODS
     * ============================================================================
     */
    
    /**
     * Load and display data shares
     */
    async loadDataShares() {
        const dataSharingSection = document.getElementById('data-sharing-section');
        if (!dataSharingSection) {
            return;
        }
        
        let hasPremium = false;
        if (window.SubscriptionGuard) {
            try {
                hasPremium = await window.SubscriptionGuard.hasTier('premium');
            } catch (error) {
                console.warn('[SettingsController] Error checking premium status:', error);
            }
        }
        
        const premiumMessage = document.getElementById('premium-required-message');
        if (premiumMessage) {
            premiumMessage.style.display = hasPremium ? 'none' : 'block';
        }
        
        if (!window.DatabaseService) {
            console.error('[SettingsController] DatabaseService not available');
            const list = document.getElementById('data-shares-list');
            if (list) {
                list.innerHTML = '<p>Loading...</p>';
            }
            return;
        }
        
        try {
            const result = await window.DatabaseService.getDataSharesCreatedByMe();
            if (result.success && result.shares) {
                await this.renderDataShares(result.shares);
            } else {
                const list = document.getElementById('data-shares-list');
                if (list) {
                    list.innerHTML = '<p>No shares created yet.</p>';
                }
            }
        } catch (error) {
            console.error('[SettingsController] Error loading data shares:', error);
            const list = document.getElementById('data-shares-list');
            if (list) {
                list.innerHTML = '<p>Error loading shares. Please try again.</p>';
            }
            const status = document.getElementById('data-sharing-status');
            if (status) {
                status.innerHTML = `<p style="color: var(--error-color);">Error loading shares: ${error.message}</p>`;
            }
        }
        
        if (!hasPremium) {
            this.disableDataSharingInteractions();
        } else {
            this.enableDataSharingInteractions();
        }
    },
    
    /**
     * Disable all data sharing interactions for non-premium users
     */
    disableDataSharingInteractions() {
        const addShareBtn = document.getElementById('add-share-button');
        if (addShareBtn) {
            addShareBtn.disabled = true;
            addShareBtn.style.opacity = '0.5';
            addShareBtn.style.cursor = 'not-allowed';
            addShareBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            };
        }
        
        const shareItems = document.querySelectorAll('.share-item button');
        shareItems.forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                return false;
            };
        });
        
        const form = document.getElementById('add-share-form');
        if (form) {
            const formElements = form.querySelectorAll('input, select, button, textarea');
            formElements.forEach(el => {
                el.disabled = true;
                el.style.opacity = '0.5';
                el.style.cursor = 'not-allowed';
                el.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                };
            });
        }
    },
    
    /**
     * Enable all data sharing interactions for premium users
     */
    enableDataSharingInteractions() {
        const addShareBtn = document.getElementById('add-share-button');
        if (addShareBtn) {
            addShareBtn.disabled = false;
            addShareBtn.style.opacity = '';
            addShareBtn.style.cursor = '';
        }
        
        const shareItems = document.querySelectorAll('.share-item button');
        shareItems.forEach(btn => {
            btn.disabled = false;
            btn.style.opacity = '';
            btn.style.cursor = '';
        });
        
        const form = document.getElementById('add-share-form');
        if (form) {
            const formElements = form.querySelectorAll('input, select, button, textarea');
            formElements.forEach(el => {
                el.disabled = false;
                el.style.opacity = '';
                el.style.cursor = '';
            });
        }
    },
    
    /**
     * Render data shares list
     */
    async renderDataShares(shares) {
        const list = document.getElementById('data-shares-list');
        if (!list) {
            return;
        }
        
        let hasPremium = false;
        if (window.SubscriptionGuard) {
            hasPremium = await window.SubscriptionGuard.hasTier('premium');
        }
        
        if (shares.length === 0) {
            list.innerHTML = '<p>No shares created yet.</p>';
            return;
        }
        
        const buttonDisabled = hasPremium ? '' : 'disabled style="opacity: 0.5; cursor: not-allowed;"';
        
        // Look up emails for all shares
        const sharesWithEmails = await Promise.all(shares.map(async (share) => {
            let email = share.shared_with_user_id; // Default to user ID if lookup fails
            if (window.DatabaseService) {
                try {
                    const emailResult = await window.DatabaseService.getUserEmailById(share.shared_with_user_id);
                    if (emailResult.success && emailResult.email) {
                        email = emailResult.email;
                    }
                } catch (error) {
                    console.warn('[SettingsController] Error looking up email for user:', share.shared_with_user_id, error);
                }
            }
            return { ...share, displayEmail: email };
        }));
        
        list.innerHTML = sharesWithEmails.map(share => {
            // Parse shared_months if it's a string
            let sharedMonths = share.shared_months;
            if (typeof sharedMonths === 'string') {
                try {
                    sharedMonths = JSON.parse(sharedMonths);
                } catch (e) {
                    console.warn('[SettingsController] Error parsing shared_months:', e);
                    sharedMonths = [];
                }
            }
            
            const shareAllData = share.share_all_data === true || share.share_all_data === 'true';
            
            // Format months list
            let monthsDisplay = 'None';
            if (shareAllData) {
                monthsDisplay = 'All months';
            } else if (sharedMonths && sharedMonths.length > 0) {
                const monthStrings = sharedMonths.map(monthEntry => {
                    if (monthEntry.type === 'single') {
                        const monthName = window.DataManager ? window.DataManager.getMonthName(monthEntry.month) : `Month ${monthEntry.month}`;
                        return `${monthName} ${monthEntry.year}`;
                    } else if (monthEntry.type === 'range') {
                        const startMonthName = window.DataManager ? window.DataManager.getMonthName(monthEntry.startMonth) : `Month ${monthEntry.startMonth}`;
                        const endMonthName = window.DataManager ? window.DataManager.getMonthName(monthEntry.endMonth) : `Month ${monthEntry.endMonth}`;
                        return `${startMonthName} ${monthEntry.startYear} - ${endMonthName} ${monthEntry.endYear}`;
                    }
                    return '';
                }).filter(s => s);
                monthsDisplay = monthStrings.length > 0 ? monthStrings.join(', ') : 'None';
            }
            
            const potsDisplay = shareAllData || share.shared_pots ? 'Yes' : 'No';
            const settingsDisplay = shareAllData || share.shared_settings ? 'Yes' : 'No';
            
            return `
            <div class="share-item" style="padding: var(--spacing-md); margin-bottom: var(--spacing-sm); background: rgba(213, 213, 213, 0.85); border: var(--border-width-thin) solid var(--border-color-black); border-radius: var(--border-radius);">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="margin-bottom: var(--spacing-sm);">
                            <strong>Shared with:</strong> ${share.displayEmail}
                        </div>
                        <div style="margin-bottom: var(--spacing-sm);">
                            <strong>Access Level:</strong> ${share.access_level.replace('_', '/')}
                        </div>
                        ${shareAllData ? `<div style="margin-bottom: var(--spacing-sm);"><strong>Share All Data:</strong> Yes</div>` : ''}
                        <div style="margin-bottom: var(--spacing-sm);">
                            <strong>Months:</strong> ${shareAllData || (sharedMonths && sharedMonths.length > 0) ? 'Yes' : 'No'}<br>
                            <span style="font-size: 0.9em; color: var(--text-color-secondary); margin-left: 1rem;">${monthsDisplay}</span>
                        </div>
                        <div style="margin-bottom: var(--spacing-sm);">
                            <strong>Pots:</strong> ${potsDisplay}
                        </div>
                        <div>
                            <strong>Settings:</strong> ${settingsDisplay}
                        </div>
                    </div>
                    <div style="display: flex; gap: var(--spacing-sm); margin-left: var(--spacing-md);">
                        <button class="btn btn-action edit-share-btn" data-share-id="${share.id}" ${buttonDisabled}>Edit</button>
                        <button class="btn btn-danger delete-share-btn" data-share-id="${share.id}" ${buttonDisabled}>Delete</button>
                    </div>
                </div>
            </div>
        `;
        }).join('');
        
        list.querySelectorAll('.delete-share-btn').forEach(btn => {
            if (hasPremium) {
                btn.addEventListener('click', () => this.handleDeleteShare(btn.dataset.shareId));
            } else {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                });
            }
        });
        
        list.querySelectorAll('.edit-share-btn').forEach(btn => {
            if (hasPremium) {
                btn.addEventListener('click', () => this.handleEditShare(btn.dataset.shareId));
            } else {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                });
            }
        });
    },
    
    /**
     * Show add share form
     */
    async showAddShareForm() {
        if (!window.SubscriptionGuard) {
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            return;
        }
        
        const form = document.getElementById('add-share-form');
        if (form) {
            form.style.display = 'block';
            this.resetShareForm();
            await this.loadUserMonthsIntoDropdown();
        }
    },
    
    /**
     * Show add share form with a specific month pre-selected
     */
    async showAddShareFormWithMonth(year, month) {
        if (!window.SubscriptionGuard) {
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            return;
        }
        
        const form = document.getElementById('add-share-form');
        if (form) {
            form.style.display = 'block';
            this.resetShareForm();
            await this.loadUserMonthsIntoDropdown();
            
            // Pre-select the month in the dropdown and add it
            const dropdown = document.getElementById('month-selector-dropdown');
            if (dropdown) {
                const monthKey = `${year}-${String(month).padStart(2, '0')}`;
                const option = Array.from(dropdown.options).find(opt => opt.value === monthKey);
                if (option) {
                    dropdown.value = monthKey;
                    // Trigger add month
                    await this.addMonthToShare();
                }
            }
            
            // Scroll to data sharing section
            const dataSharingSection = document.getElementById('data-sharing-section');
            if (dataSharingSection) {
                dataSharingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    },
    
    /**
     * Load user's months into the dropdown
     */
    async loadUserMonthsIntoDropdown() {
        const dropdown = document.getElementById('month-selector-dropdown');
        if (!dropdown) {
            return;
        }
        
        try {
            if (!window.DatabaseService) {
                console.error('[SettingsController] DatabaseService not available');
                return;
            }
            
            const allMonths = await window.DatabaseService.getAllMonths(false, false);
            const monthKeys = Object.keys(allMonths).sort().reverse();
            
            dropdown.innerHTML = '<option value="">Select a month...</option>';
            
            monthKeys.forEach(monthKey => {
                const monthData = allMonths[monthKey];
                if (monthData && !monthData.isShared) {
                    const monthName = monthData.monthName || window.DataManager.getMonthName(monthData.month);
                    let displayText = `${monthName} ${monthData.year}`;

                    // If this is an example month (year 2045), append "Example" label
                    if (monthData.year === 2045) {
                        displayText += ` (Example)`;
                    }

                    const option = document.createElement('option');
                    option.value = monthKey;
                    option.textContent = displayText;
                    option.dataset.year = monthData.year;
                    option.dataset.month = monthData.month;
                    dropdown.appendChild(option);
                }
            });
        } catch (error) {
            console.error('[SettingsController] Error loading user months:', error);
        }
    },
    
    /**
     * Handle share all data checkbox change
     */
    async handleShareAllDataChange() {
        if (!window.SubscriptionGuard) {
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            const checkbox = document.getElementById('share-all-data');
            if (checkbox) {
                checkbox.checked = false;
            }
            return;
        }
        
        const shareAllData = document.getElementById('share-all-data').checked;
        const shareMonthsCheckbox = document.getElementById('share-months');
        const sharePotsCheckbox = document.getElementById('share-pots');
        const shareSettingsCheckbox = document.getElementById('share-settings');
        const monthsContainer = document.getElementById('share-months-container');
        
        if (shareAllData) {
            shareMonthsCheckbox.checked = true;
            sharePotsCheckbox.checked = true;
            shareSettingsCheckbox.checked = true;
            shareMonthsCheckbox.disabled = true;
            sharePotsCheckbox.disabled = true;
            shareSettingsCheckbox.disabled = true;
            if (monthsContainer) {
                monthsContainer.style.display = 'none';
            }
            document.getElementById('selected-months-list').innerHTML = '';
        } else {
            shareMonthsCheckbox.disabled = false;
            sharePotsCheckbox.disabled = false;
            shareSettingsCheckbox.disabled = false;
            if (monthsContainer) {
                monthsContainer.style.display = 'block';
            }
        }
    },
    
    /**
     * Hide add share form
     */
    hideAddShareForm() {
        const form = document.getElementById('add-share-form');
        if (form) {
            form.style.display = 'none';
            this.resetShareForm();
        }
    },
    
    /**
     * Reset share form
     */
    resetShareForm() {
        const emailInput = document.getElementById('share-email');
        emailInput.value = '';
        emailInput.readOnly = false;
        emailInput.title = '';
        document.getElementById('share-access-level').value = 'read';
        document.getElementById('share-all-data').checked = false;
        document.getElementById('share-months').checked = true;
        document.getElementById('share-pots').checked = false;
        document.getElementById('share-settings').checked = false;
        document.getElementById('share-months').disabled = false;
        document.getElementById('share-pots').disabled = false;
        document.getElementById('share-settings').disabled = false;
        document.getElementById('selected-months-list').innerHTML = '';
        document.getElementById('share-form-status').innerHTML = '';
        const monthsContainer = document.getElementById('share-months-container');
        if (monthsContainer) {
            monthsContainer.style.display = 'block';
        }
        this.editingShareId = null;
    },
    
    /**
     * Add month to share from dropdown
     */
    async addMonthToShare() {
        if (!window.SubscriptionGuard) {
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            return;
        }
        
        const dropdown = document.getElementById('month-selector-dropdown');
        if (!dropdown || !dropdown.value) {
            alert('Please select a month from the dropdown');
            return;
        }
        
        const selectedOption = dropdown.options[dropdown.selectedIndex];
        const year = parseInt(selectedOption.dataset.year, 10);
        const month = parseInt(selectedOption.dataset.month, 10);
        
        if (isNaN(year) || isNaN(month)) {
            alert('Invalid month data');
            return;
        }
        
        const list = document.getElementById('selected-months-list');
        const existingEntries = Array.from(list.children);
        const alreadyAdded = existingEntries.some(entry => {
            const entryData = JSON.parse(entry.dataset.monthEntry);
            return entryData.year === year && entryData.month === month;
        });
        
        if (alreadyAdded) {
            alert('This month is already added');
            return;
        }
        
        const monthEntry = { type: 'single', year: year, month: month };
        this.addMonthEntryToList(monthEntry);
        dropdown.value = '';
    },
    
    /**
     * Add month entry to list
     */
    addMonthEntryToList(monthEntry) {
        const list = document.getElementById('selected-months-list');
        const entryId = `month-entry-${Date.now()}-${Math.random()}`;
        
        const monthName = window.DataManager ? window.DataManager.getMonthName(monthEntry.month) : `Month ${monthEntry.month}`;
        const displayText = `${monthName} ${monthEntry.year}`;
        
        const entryDiv = document.createElement('div');
        entryDiv.id = entryId;
        entryDiv.style.display = 'flex';
        entryDiv.style.justifyContent = 'space-between';
        entryDiv.style.alignItems = 'center';
        entryDiv.style.padding = 'var(--spacing-sm)';
        entryDiv.style.background = 'rgba(255, 255, 255, 0.5)';
        entryDiv.style.borderRadius = 'var(--border-radius)';
        entryDiv.innerHTML = `
            <span>${displayText}</span>
            <button type="button" class="btn btn-danger remove-month-btn" data-entry-id="${entryId}">Remove</button>
        `;
        
        entryDiv.querySelector('.remove-month-btn').addEventListener('click', () => {
            entryDiv.remove();
        });
        
        entryDiv.dataset.monthEntry = JSON.stringify(monthEntry);
        list.appendChild(entryDiv);
    },
    
    /**
     * Get selected months from form
     */
    getSelectedMonths() {
        const list = document.getElementById('selected-months-list');
        const entries = Array.from(list.children);
        return entries.map(entry => JSON.parse(entry.dataset.monthEntry));
    },
    
    /**
     * Handle add share
     */
    async handleAddShare() {
        if (!window.SubscriptionGuard) {
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            return;
        }
        
        const email = document.getElementById('share-email').value.trim();
        const accessLevel = document.getElementById('share-access-level').value;
        const shareAllData = document.getElementById('share-all-data').checked;
        const shareMonths = document.getElementById('share-months').checked;
        const sharePots = document.getElementById('share-pots').checked;
        const shareSettings = document.getElementById('share-settings').checked;
        
        if (!email) {
            alert('Please enter an email address');
            return;
        }
        
        if (!shareMonths && !sharePots && !shareSettings) {
            alert('Please select at least one thing to share');
            return;
        }
        
        let selectedMonths = [];
        
        if (shareAllData) {
            if (!window.DatabaseService) {
                alert('DatabaseService not available');
                return;
            }
            
            try {
                const allMonths = await window.DatabaseService.getAllMonths(false, false);
                const monthKeys = Object.keys(allMonths);
                selectedMonths = monthKeys.map(monthKey => {
                    const monthData = allMonths[monthKey];
                    if (monthData && !monthData.isShared) {
                        return { type: 'single', year: monthData.year, month: monthData.month };
                    }
                    return null;
                }).filter(m => m !== null);
            } catch (error) {
                console.error('[SettingsController] Error loading all months:', error);
                alert('Error loading your months. Please try again.');
                return;
            }
        } else if (shareMonths) {
            selectedMonths = this.getSelectedMonths();
            if (selectedMonths.length === 0) {
                alert('Please add at least one month');
                return;
            }
        }
        
        const statusDiv = document.getElementById('share-form-status');
        statusDiv.innerHTML = '<p>Saving share...</p>';
        
        try {
            let result;
            
            if (this.editingShareId) {
                result = await window.DatabaseService.updateDataShare(
                    this.editingShareId,
                    accessLevel,
                    selectedMonths,
                    sharePots,
                    shareSettings
                );
            } else {
                const shareAllData = document.getElementById('share-all-data').checked;
                result = await window.DatabaseService.createDataShare(
                    email,
                    accessLevel,
                    selectedMonths,
                    sharePots,
                    shareSettings,
                    shareAllData
                );
            }
            
            if (result.success) {
                statusDiv.innerHTML = '<p style="color: var(--success-color);">Share saved successfully!</p>';
                this.hideAddShareForm();
                await this.loadDataShares();
            } else {
                statusDiv.innerHTML = `<p style="color: var(--error-color);">Error: ${result.error}</p>`;
            }
        } catch (error) {
            console.error('[SettingsController] Error saving share:', error);
            statusDiv.innerHTML = `<p style="color: var(--error-color);">Error: ${error.message}</p>`;
        }
    },
    
    /**
     * Handle delete share
     */
    async handleDeleteShare(shareId) {
        if (!window.SubscriptionGuard) {
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            return;
        }
        
        if (!confirm('Are you sure you want to delete this share?')) {
            return;
        }
        
        try {
            const result = await window.DatabaseService.deleteDataShare(parseInt(shareId, 10));
            if (result.success) {
                await this.loadDataShares();
            } else {
                alert(`Error deleting share: ${result.error}`);
            }
        } catch (error) {
            console.error('[SettingsController] Error deleting share:', error);
            alert(`Error: ${error.message}`);
        }
    },
    
    /**
     * Handle edit share
     */
    async handleEditShare(shareId) {
        if (!window.SubscriptionGuard) {
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            return;
        }
        
        try {
            const result = await window.DatabaseService.getDataSharesCreatedByMe();
            if (result.success && result.shares) {
                const share = result.shares.find(s => s.id === parseInt(shareId, 10));
                if (share) {
                    this.editingShareId = share.id;
                    const emailInput = document.getElementById('share-email');
                    emailInput.value = share.shared_with_user_id;
                    emailInput.readOnly = true;
                    emailInput.title = 'User ID (email cannot be changed when editing)';
                    document.getElementById('share-access-level').value = share.access_level;
                    
                    const shareMonths = share.shared_months && share.shared_months.length > 0;
                    const sharePots = share.shared_pots;
                    const shareSettings = share.shared_settings;
                    
                    if (!window.DatabaseService) {
                        alert('DatabaseService not available');
                        return;
                    }
                    
                    const allMonths = await window.DatabaseService.getAllMonths(false, false);
                    const userMonthKeys = Object.keys(allMonths).filter(key => {
                        const monthData = allMonths[key];
                        return monthData && !monthData.isShared;
                    });
                    
                    const isAllMonthsShared = shareMonths && userMonthKeys.length > 0 && 
                        share.shared_months.length === userMonthKeys.length;
                    
                    document.getElementById('share-all-data').checked = isAllMonthsShared && sharePots && shareSettings;
                    document.getElementById('share-months').checked = shareMonths;
                    document.getElementById('share-pots').checked = sharePots;
                    document.getElementById('share-settings').checked = shareSettings;
                    
                    if (isAllMonthsShared && sharePots && shareSettings) {
                        this.handleShareAllDataChange();
                    }
                    
                    await this.loadUserMonthsIntoDropdown();
                    
                    const list = document.getElementById('selected-months-list');
                    list.innerHTML = '';
                    if (share.shared_months && !isAllMonthsShared) {
                        share.shared_months.forEach(monthEntry => {
                            this.addMonthEntryToList(monthEntry);
                        });
                    }
                    
                    const form = document.getElementById('add-share-form');
                    if (form) {
                        form.style.display = 'block';
                    }
                }
            }
        } catch (error) {
            console.error('[SettingsController] Error loading share for edit:', error);
            alert(`Error: ${error.message}`);
        }
    },

    /**
     * Load notification preferences
     */
    async loadNotificationPreferences() {
        console.log('[SettingsController] loadNotificationPreferences() called');

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.getNotificationPreferences();
            if (result.success && result.preferences) {
                this.renderNotificationPreferences(result.preferences);
            } else {
                throw new Error(result.error || 'Failed to load notification preferences');
            }
        } catch (error) {
            console.error('[SettingsController] Error loading notification preferences:', error);
            const list = document.getElementById('notification-preferences-list');
            if (list) {
                list.innerHTML = `<p style="color: var(--danger-color);">Error loading preferences: ${error.message}</p>`;
            }
        }
    },

    /**
     * Render notification preferences form
     */
    renderNotificationPreferences(preferences) {
        console.log('[SettingsController] renderNotificationPreferences() called', preferences);

        const list = document.getElementById('notification-preferences-list');
        if (!list) {
            return;
        }

        const defaults = typeof window.NotificationPreferenceService !== 'undefined'
            ? window.NotificationPreferenceService.getDefaultPreferences()
            : {
                share_requests: true,
                share_responses: true,
                in_app_enabled: true,
                email_enabled: false,
                payment_notifications: true,
                message_notifications: true,
                auto_accept_shares: false,
                auto_decline_shares: false,
                quiet_hours_enabled: false,
                quiet_hours_start: '22:00',
                quiet_hours_end: '08:00'
            };

        const prefs = { ...defaults, ...preferences };

        list.innerHTML = `
            <div class="settings-row">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="checkbox" id="pref-in-app-enabled" ${prefs.in_app_enabled ? 'checked' : ''}>
                    <span>Enable in-app notifications</span>
                </label>
            </div>
            
            <div class="settings-row">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="checkbox" id="pref-email-enabled" ${prefs.email_enabled ? 'checked' : ''}>
                    <span>Enable email notifications (future)</span>
                </label>
            </div>
            
            <div class="settings-row">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="checkbox" id="pref-share-requests" ${prefs.share_requests ? 'checked' : ''}>
                    <span>Receive share request notifications</span>
                </label>
            </div>
            
            <div class="settings-row">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="checkbox" id="pref-share-responses" ${prefs.share_responses ? 'checked' : ''}>
                    <span>Receive share response notifications</span>
                </label>
            </div>
            
            <div class="settings-row">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="checkbox" id="pref-payment-notifications" ${prefs.payment_notifications !== false ? 'checked' : ''}>
                    <span>Receive payment and subscription notifications</span>
                </label>
            </div>
            
            <div class="settings-row">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="checkbox" id="pref-message-notifications" ${prefs.message_notifications !== false ? 'checked' : ''}>
                    <span>Receive message notifications</span>
                </label>
            </div>
            
            <div class="settings-row">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="checkbox" id="pref-auto-accept" ${prefs.auto_accept_shares ? 'checked' : ''}>
                    <span>Auto-accept share requests</span>
                </label>
            </div>
            
            <div class="settings-row">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="checkbox" id="pref-auto-decline" ${prefs.auto_decline_shares ? 'checked' : ''}>
                    <span>Auto-decline share requests</span>
                </label>
            </div>
            
            <div class="settings-row">
                <label style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <input type="checkbox" id="pref-quiet-hours-enabled" ${prefs.quiet_hours_enabled ? 'checked' : ''}>
                    <span>Enable quiet hours</span>
                </label>
            </div>
            
            <div id="quiet-hours-container" style="display: ${prefs.quiet_hours_enabled ? 'block' : 'none'}; margin-top: var(--spacing-md); padding-left: var(--spacing-lg);">
                <div class="settings-row">
                    <label for="pref-quiet-hours-start" class="form-label">Quiet Hours Start:</label>
                    <input type="time" id="pref-quiet-hours-start" class="form-input" value="${prefs.quiet_hours_start || '22:00'}" style="width: 150px;">
                </div>
                <div class="settings-row">
                    <label for="pref-quiet-hours-end" class="form-label">Quiet Hours End:</label>
                    <input type="time" id="pref-quiet-hours-end" class="form-input" value="${prefs.quiet_hours_end || '08:00'}" style="width: 150px;">
                </div>
            </div>
        `;

        this.setupNotificationPreferenceListeners();
    },

    /**
     * Setup event listeners for notification preferences
     */
    setupNotificationPreferenceListeners() {
        const quietHoursEnabled = document.getElementById('pref-quiet-hours-enabled');
        const quietHoursContainer = document.getElementById('quiet-hours-container');
        const saveButton = document.getElementById('save-notification-preferences-button');

        if (quietHoursEnabled && quietHoursContainer) {
            quietHoursEnabled.addEventListener('change', (e) => {
                quietHoursContainer.style.display = e.target.checked ? 'block' : 'none';
            });
        }

        if (saveButton) {
            saveButton.addEventListener('click', () => {
                this.saveNotificationPreferences();
            });
        }
    },

    /**
     * Save notification preferences
     */
    async saveNotificationPreferences() {
        console.log('[SettingsController] saveNotificationPreferences() called');

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const preferences = {
                in_app_enabled: document.getElementById('pref-in-app-enabled')?.checked || false,
                email_enabled: document.getElementById('pref-email-enabled')?.checked || false,
                share_requests: document.getElementById('pref-share-requests')?.checked || false,
                share_responses: document.getElementById('pref-share-responses')?.checked || false,
                payment_notifications: document.getElementById('pref-payment-notifications')?.checked !== false,
                message_notifications: document.getElementById('pref-message-notifications')?.checked !== false,
                auto_accept_shares: document.getElementById('pref-auto-accept')?.checked || false,
                auto_decline_shares: document.getElementById('pref-auto-decline')?.checked || false,
                quiet_hours_enabled: document.getElementById('pref-quiet-hours-enabled')?.checked || false,
                quiet_hours_start: document.getElementById('pref-quiet-hours-start')?.value || '22:00',
                quiet_hours_end: document.getElementById('pref-quiet-hours-end')?.value || '08:00'
            };

            const result = await window.DatabaseService.updateNotificationPreferences(preferences);

            if (result.success) {
                const statusDiv = document.getElementById('notification-preferences-status');
                if (statusDiv) {
                    statusDiv.textContent = 'Preferences saved successfully';
                    statusDiv.style.color = 'var(--success-color)';
                    setTimeout(() => {
                        statusDiv.textContent = '';
                    }, 3000);
                }
            } else {
                throw new Error(result.error || 'Failed to save preferences');
            }
        } catch (error) {
            console.error('[SettingsController] Error saving notification preferences:', error);
            const statusDiv = document.getElementById('notification-preferences-status');
            if (statusDiv) {
                statusDiv.textContent = `Error: ${error.message}`;
                statusDiv.style.color = 'var(--danger-color)';
            }
        }
    },

    /**
     * Load blocked users list
     */
    async loadBlockedUsers() {
        console.log('[SettingsController] loadBlockedUsers() called');

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.getBlockedUsers();
            if (result.success) {
                this.renderBlockedUsers(result.blockedUsers || []);
            } else {
                throw new Error(result.error || 'Failed to load blocked users');
            }
        } catch (error) {
            console.error('[SettingsController] Error loading blocked users:', error);
            const list = document.getElementById('blocked-users-list');
            if (list) {
                list.innerHTML = `<p style="color: var(--danger-color);">Error loading blocked users: ${error.message}</p>`;
            }
        }
    },

    /**
     * Render blocked users list
     */
    async renderBlockedUsers(blockedUsers) {
        console.log('[SettingsController] renderBlockedUsers() called', { count: blockedUsers.length });

        const list = document.getElementById('blocked-users-list');
        if (!list) {
            return;
        }

        if (blockedUsers.length === 0) {
            list.innerHTML = '<p>No blocked users.</p>';
            return;
        }

        const usersHtml = await Promise.all(
            blockedUsers.map(async (block) => {
                let userEmail = 'Unknown User';
                if (block.blocked_user_id && typeof window.DatabaseService !== 'undefined') {
                    const emailResult = await window.DatabaseService.getUserEmailById(block.blocked_user_id);
                    if (emailResult.success && emailResult.email) {
                        userEmail = emailResult.email;
                    }
                }

                return `
                    <div class="blocked-user-item" style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-sm); border: var(--border-width-standard) solid var(--border-color); border-radius: var(--border-radius); margin-bottom: var(--spacing-xs);">
                        <span>${userEmail}</span>
                        <button class="btn btn-sm btn-secondary unblock-user-btn" data-user-id="${block.blocked_user_id}" style="padding: 4px 12px;">Unblock</button>
                    </div>
                `;
            })
        );

        list.innerHTML = usersHtml.join('');

        list.addEventListener('click', async (e) => {
            if (e.target.classList.contains('unblock-user-btn')) {
                const userId = e.target.dataset.userId;
                if (userId) {
                    await this.handleUnblockUser(userId);
                }
            }
        });
    },

    /**
     * Handle unblock user
     */
    async handleUnblockUser(userId) {
        console.log('[SettingsController] handleUnblockUser() called', { userId });

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.unblockUser(userId);

            if (result.success) {
                await this.loadBlockedUsers();
                const statusDiv = document.getElementById('blocked-users-status');
                if (statusDiv) {
                    statusDiv.textContent = 'User unblocked successfully';
                    statusDiv.style.color = 'var(--success-color)';
                    setTimeout(() => {
                        statusDiv.textContent = '';
                    }, 3000);
                }
            } else {
                throw new Error(result.error || 'Failed to unblock user');
            }
        } catch (error) {
            console.error('[SettingsController] Error unblocking user:', error);
            const statusDiv = document.getElementById('blocked-users-status');
            if (statusDiv) {
                statusDiv.textContent = `Error: ${error.message}`;
                statusDiv.style.color = 'var(--danger-color)';
            }
        }
    }
};

// Make available globally
window.SettingsController = SettingsController;

