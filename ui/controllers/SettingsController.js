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
        await this.loadCurrencySetting();
        await this.loadFontSizeSetting();
        await this.loadMonthSelector();
        this.setupEventListeners();
    },

    /**
     * Load and display current currency setting
     */
    async loadCurrencySetting() {
        const currencySelect = document.getElementById('currency-select');
        if (!currencySelect) return;

        const settings = await DataManager.getSettings();
        const currentCurrency = settings && settings.currency ? settings.currency : '£';
        
        currencySelect.value = currentCurrency;
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
        const currentFontSize = settings && settings.fontSize ? settings.fontSize : '16';
        
        fontSizeSelect.value = currentFontSize;
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
        const loadExampleDataBtn = document.getElementById('load-example-data-button');
        const removeExampleDataBtn = document.getElementById('remove-example-data-button');

        // Load example data button
        if (loadExampleDataBtn) {
            loadExampleDataBtn.addEventListener('click', () => {
                this.loadExampleData();
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
                const confirmMessage = 'Are you sure you want to clear all cached data? This will remove all months, pots, and settings data stored in your browser. The original data files will not be affected, but you\'ll need to re-import them to view the data again.\n\nThis action cannot be undone.';
                if (!confirm(confirmMessage)) {
                    return;
                }

                const fileOperationsStatus = document.getElementById('file-operations-status');
                if (fileOperationsStatus) {
                    fileOperationsStatus.innerHTML = '<p style="color: var(--text-secondary);">Clearing all cached data...</p>';
                }

                try {
                    // Set flag to prevent auto-reload from files after page reload (set first)
                    sessionStorage.setItem('skipFileLoadAfterClear', 'true');

                    // Get all months and delete them individually to ensure proper cleanup
                    const allMonths = await DataManager.getAllMonths();
                    const monthKeys = Object.keys(allMonths);
                    let deletedCount = 0;

                    for (const monthKey of monthKeys) {
                        // Skip example data - it's protected
                        if (window.DatabaseService && window.DatabaseService.isExampleData(monthKey)) {
                            continue;
                        }
                        try {
                            const deleted = await DataManager.deleteMonth(monthKey);
                            if (deleted) {
                                deletedCount++;
                            }
                        } catch (error) {
                            // Skip protected example data
                            console.warn(`Skipped protected month: ${monthKey}`);
                        }
                    }

                    // Clear all localStorage data to ensure everything is removed
                    localStorage.removeItem(DataManager.STORAGE_KEY_MONTHS);
                    localStorage.removeItem(DataManager.STORAGE_KEY_POTS);
                    localStorage.removeItem(DataManager.STORAGE_KEY_SETTINGS);

                    // Clear all remaining localStorage to ensure no cached data remains
                    localStorage.clear();

                    // Reset to default settings (after clearing, so it creates fresh defaults)
                    await DataManager.initializeSettings();

                    // Clear any cached data
                    if (DataManager._monthsCache !== undefined) {
                        DataManager._monthsCache = null;
                    }

                    // Verify deletion by checking localStorage directly
                    const remainingMonths = localStorage.getItem(DataManager.STORAGE_KEY_MONTHS);
                    if (remainingMonths) {
                        console.warn('Months still exist in localStorage after clear, forcing removal');
                        localStorage.removeItem(DataManager.STORAGE_KEY_MONTHS);
                    }

                    // Double-check: verify all months are actually gone
                    const finalCheck = await DataManager.getAllMonths();
                    const remainingCount = Object.keys(finalCheck).length;
                    if (remainingCount > 0) {
                        console.warn(`Warning: ${remainingCount} months still exist after clear operation`);
                        localStorage.removeItem(DataManager.STORAGE_KEY_MONTHS);
                    }

                    // Reload month selector to show empty state
                    await this.loadMonthSelector();

                    if (fileOperationsStatus) {
                        fileOperationsStatus.innerHTML = `<p style="color: var(--success-color);">✓ All cached data has been cleared. ${deletedCount} month(s) deleted. Settings have been reset to defaults.</p>`;
                    }

                    // Clear the skip flag after page reloads and initializes (give it time for all controllers to check)
                    setTimeout(() => {
                        sessionStorage.removeItem('skipFileLoadAfterClear');
                    }, 5000);

                    // Reload the page to ensure clean state
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);

                } catch (error) {
                    console.error('Error clearing cached data:', error);
                    if (fileOperationsStatus) {
                        fileOperationsStatus.innerHTML = `<p style="color: var(--danger-color);">Error clearing cached data: ${error.message}. Please try again.</p>`;
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
                if (window.DatabaseService && window.DatabaseService.isExampleData(selectedMonthKey)) {
                    alert('Example data (year 2045) cannot be deleted. This data is protected and locked.');
                    return;
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

                // Save to DataManager
                DataManager.saveMonth(monthData.key, monthData);
                results.push(`<p style="color: var(--success-color);">✓ Imported ${monthName} ${fileYear}</p>`);
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
            const allMonths = await DataManager.getAllMonths();
            
            // Check which example months exist in Supabase
            const existingExampleMonths = [];
            const missingExampleMonths = [];
            
            for (const monthKey of exampleMonthKeys) {
                if (allMonths[monthKey]) {
                    existingExampleMonths.push(allMonths[monthKey]);
                } else {
                    const monthNum = monthKey.split('-')[1];
                    const monthName = exampleMonthNames[monthNum];
                    missingExampleMonths.push({
                        key: monthKey,
                        monthName: monthName,
                        year: EXAMPLE_YEAR
                    });
                }
            }

            await this.loadMonthSelector();

            if (importStatus) {
                let message = '';
                
                if (existingExampleMonths.length > 0) {
                    message = `<p style="color: var(--success-color);">Found ${existingExampleMonths.length} example month(s) in Supabase database (Year ${EXAMPLE_YEAR}).</p>`;
                    message += '<p style="margin-top: 0.5rem;">View months:</p><ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
                    for (const monthData of existingExampleMonths) {
                        if (monthData && monthData.key) {
                            message += `<li><a href="monthly-budget.html?month=${monthData.key}" style="color: var(--primary-color);">${monthData.monthName} ${monthData.year}</a></li>`;
                        }
                    }
                    message += '</ul>';
                }
                
                if (missingExampleMonths.length > 0) {
                    if (message) message += '<hr style="margin: 1rem 0;">';
                    message += `<p style="color: var(--warning-color);">${missingExampleMonths.length} example month(s) not found in Supabase:</p>`;
                    message += '<ul style="margin: 0.5rem 0; padding-left: 1.5rem;">';
                    for (const monthData of missingExampleMonths) {
                        message += `<li>${monthData.monthName} ${monthData.year} (${monthData.key})</li>`;
                    }
                    message += '</ul>';
                    message += '<p style="margin-top: 0.5rem; color: var(--text-secondary);">';
                    message += 'To add example data to Supabase, run the SQL script from <code>database/utils/populate-example-data.sql</code> in Supabase SQL Editor.';
                    message += '</p>';
                }
                
                if (existingExampleMonths.length === 0 && missingExampleMonths.length === 0) {
                    message = '<p style="color: var(--warning-color);">No example data found.</p>';
                }
                
                importStatus.innerHTML = message;
            }

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
     * Remove all example data from Supabase
     * Example data uses year 2045
     */
    async removeExampleData() {
        const importStatus = document.getElementById('import-status');
        const removeExampleDataBtn = document.getElementById('remove-example-data-button');

        // Example data is protected and cannot be deleted
        if (importStatus) {
            importStatus.innerHTML = '<p style="color: var(--warning-color);">Example data (year 2045) is protected and cannot be deleted. This data is locked to preserve the example functionality.</p>';
        }
        
        // Disable the button to make it clear it's not available
        if (removeExampleDataBtn) {
            removeExampleDataBtn.disabled = true;
            removeExampleDataBtn.textContent = 'Example Data Protected';
            removeExampleDataBtn.title = 'Example data cannot be deleted - it is protected';
        }
    }
};

// Make available globally
window.SettingsController = SettingsController;

