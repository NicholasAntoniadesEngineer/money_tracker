/**
 * Monthly Budget Controller
 * Handles the monthly budget view logic
 */

const MonthlyBudgetController = {
    currentMonthData: null,
    currentMonthKey: null,

    /**
     * Initialize the monthly budget page
     */
    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        const monthParam = urlParams.get('month');

        // Ensure months are loaded before proceeding
        await DataManager.loadMonthsFromFiles();
        
        // Try to initialize with initial data if localStorage is empty
        if (window.InitialData) {
            await InitialData.initializeIfEmpty();
        }

        this.loadMonthSelector();

        if (monthParam) {
            this.loadMonth(monthParam);
        } else {
            const allMonths = DataManager.getAllMonths();
            const monthKeys = Object.keys(allMonths).sort().reverse();
            if (monthKeys.length > 0) {
                this.loadMonth(monthKeys[0]);
            }
        }

        this.setupEventListeners();
    },

    /**
     * Load month selector dropdown
     */
    loadMonthSelector() {
        const selector = document.getElementById('month-selector');
        if (!selector) return;

        const allMonths = DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths).sort().reverse();

        selector.innerHTML = monthKeys.length > 0 
            ? monthKeys.map(key => {
                const monthData = allMonths[key];
                const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                return `<option value="${key}">${monthName} ${monthData.year}</option>`;
            }).join('')
            : '<option value="">No months available</option>';

        selector.addEventListener('change', () => {
            if (selector.value) {
                this.loadMonth(selector.value);
            }
        });
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const createMonthBtn = document.getElementById('create-month-button');
        const deleteMonthBtn = document.getElementById('delete-month-button');
        const saveMonthBtn = document.getElementById('save-month-button');
        const addIncomeBtn = document.getElementById('add-income-button');
        const addFixedCostBtn = document.getElementById('add-fixed-cost-button');
        const addVariableCostBtn = document.getElementById('add-variable-cost-button');
        const addUnplannedBtn = document.getElementById('add-unplanned-expense-button');
        const addPotBtn = document.getElementById('add-pot-button');
        const addWeeklyBreakdownBtn = document.getElementById('add-weekly-breakdown-button');
        const loadMonthsBtn = document.getElementById('load-months-button');
        const exportCurrentMonthBtn = document.getElementById('export-current-month-button');
        const exportAllMonthsBtn = document.getElementById('export-all-months-button');
        const exportFormatSelect = document.getElementById('export-format-select');
        const fileInput = document.getElementById('file-input');
        const fileOperationsStatus = document.getElementById('file-operations-status');

        if (createMonthBtn) createMonthBtn.addEventListener('click', () => this.createNewMonth());
        if (deleteMonthBtn) deleteMonthBtn.addEventListener('click', () => this.deleteCurrentMonth());
        if (saveMonthBtn) saveMonthBtn.addEventListener('click', () => this.saveMonthData());
        if (addIncomeBtn) addIncomeBtn.addEventListener('click', () => this.addIncomeRow());
        if (addFixedCostBtn) addFixedCostBtn.addEventListener('click', () => this.addFixedCostRow());
        if (addVariableCostBtn) addVariableCostBtn.addEventListener('click', () => this.addVariableCostRow());
        if (addUnplannedBtn) addUnplannedBtn.addEventListener('click', () => this.addUnplannedExpenseRow());
        if (addPotBtn) addPotBtn.addEventListener('click', () => this.addPotRow());
        if (addWeeklyBreakdownBtn) addWeeklyBreakdownBtn.addEventListener('click', () => this.addWeeklyBreakdownRow());
        
        // Export Current Month button
        if (exportCurrentMonthBtn && exportFormatSelect) {
            exportCurrentMonthBtn.addEventListener('click', async () => {
                if (!this.currentMonthKey) {
                    fileOperationsStatus.innerHTML = '<p style="color: var(--warning-color);">Please select a month first.</p>';
                    return;
                }
                
                const format = exportFormatSelect.value || 'json';
                
                if (format === 'csv' && !window.CSVHandler) {
                    fileOperationsStatus.innerHTML = '<p style="color: var(--danger-color);">CSVHandler not loaded. Cannot export CSV.</p>';
                    return;
                }
                
                exportCurrentMonthBtn.disabled = true;
                const formatUpper = format.toUpperCase();
                fileOperationsStatus.innerHTML = '<p style="color: var(--text-secondary);">Exporting month as ' + formatUpper + '...</p>';
                
                try {
                    const monthData = DataManager.getMonth(this.currentMonthKey);
                    if (!monthData) {
                        throw new Error('Month data not found');
                    }
                    
                    const success = await DataManager.exportMonthToFile(this.currentMonthKey, monthData, format);
                    if (success) {
                        fileOperationsStatus.innerHTML = '<p style="color: var(--success-color);">Month exported as ' + formatUpper + ' successfully!</p>';
                    } else {
                        fileOperationsStatus.innerHTML = '<p style="color: var(--warning-color);">' + formatUpper + ' export cancelled or failed.</p>';
                    }
                } catch (error) {
                    console.error('Error exporting ' + formatUpper + ':', error);
                    fileOperationsStatus.innerHTML = '<p style="color: var(--danger-color);">Error exporting ' + formatUpper + ': ' + error.message + '</p>';
                } finally {
                    exportCurrentMonthBtn.disabled = false;
                }
            });
        }
        
        // File operations
        if (loadMonthsBtn) {
            loadMonthsBtn.addEventListener('click', async () => {
                loadMonthsBtn.disabled = true;
                fileOperationsStatus.innerHTML = '<p style="color: var(--text-secondary);">Loading months from files...</p>';
                
                try {
                    const result = await DataManager.loadMonthsFromFilePicker();
                    if (result.success) {
                        fileOperationsStatus.innerHTML = '<p style="color: var(--success-color);">Successfully loaded ' + result.count + ' months!</p>';
                        this.loadMonthSelector();
                        if (this.currentMonthKey && result.months[this.currentMonthKey]) {
                            this.loadMonth(this.currentMonthKey);
                        }
                    } else if (result.useFileInput && fileInput) {
                        // Automatically trigger file input if API not available
                        fileOperationsStatus.innerHTML = '<p style="color: var(--text-secondary);">Please select JSON or HTML files to load...</p>';
                        fileInput.click();
                    } else {
                        fileOperationsStatus.innerHTML = '<p style="color: var(--danger-color);">' + result.message + '</p>';
                    }
                } catch (error) {
                    fileOperationsStatus.innerHTML = `<p style="color: var(--danger-color);">✗ Error: ${error.message}</p>`;
                    console.error('Error loading months:', error);
                } finally {
                    loadMonthsBtn.disabled = false;
                }
            });
        }
        
        // Export All Months button
        if (exportAllMonthsBtn && exportFormatSelect) {
            exportAllMonthsBtn.addEventListener('click', async () => {
                const format = exportFormatSelect.value || 'json';
                
                if (format === 'csv' && !window.CSVHandler) {
                    fileOperationsStatus.innerHTML = '<p style="color: var(--danger-color);">CSVHandler not loaded. Cannot export CSV.</p>';
                    return;
                }
                
                exportAllMonthsBtn.disabled = true;
                const formatUpper = format.toUpperCase();
                fileOperationsStatus.innerHTML = '<p style="color: var(--text-secondary);">Exporting all months as ' + formatUpper + '...</p>';
                
                try {
                    const allMonths = DataManager.getAllMonths();
                    const monthKeys = Object.keys(allMonths);
                    
                    if (monthKeys.length === 0) {
                        fileOperationsStatus.innerHTML = '<p style="color: var(--warning-color);">No months to export.</p>';
                        exportAllMonthsBtn.disabled = false;
                        return;
                    }
                    
                    let exportedCount = 0;
                    let errorCount = 0;
                    
                    for (const monthKey of monthKeys) {
                        try {
                            const monthData = allMonths[monthKey];
                            const success = await DataManager.exportMonthToFile(monthKey, monthData, format);
                            if (success) {
                                exportedCount++;
                            } else {
                                errorCount++;
                            }
                            // Small delay to avoid browser blocking multiple downloads
                            await new Promise(resolve => setTimeout(resolve, 200));
                        } catch (error) {
                            console.error('Error exporting ' + monthKey + ':', error);
                            errorCount++;
                        }
                    }
                    
                    if (exportedCount > 0) {
                        const monthText = exportedCount !== 1 ? 'months' : 'month';
                        let message = 'Successfully exported ' + exportedCount + ' ' + monthText + ' as ' + formatUpper + '!';
                        if (errorCount > 0) {
                            const errorText = errorCount !== 1 ? 'errors' : 'error';
                            message += '<br/><span style="color: var(--warning-color);">' + errorCount + ' ' + errorText + ' occurred</span>';
                        }
                        fileOperationsStatus.innerHTML = '<p style="color: var(--success-color);">' + message + '</p>';
                    } else {
                        fileOperationsStatus.innerHTML = '<p style="color: var(--danger-color);">Failed to export any months.</p>';
                    }
                } catch (error) {
                    console.error('Error exporting all months:', error);
                    fileOperationsStatus.innerHTML = '<p style="color: var(--danger-color);">Error exporting all months: ' + error.message + '</p>';
                } finally {
                    exportAllMonthsBtn.disabled = false;
                }
            });
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', async (e) => {
                const files = Array.from(e.target.files);
                if (files.length === 0) return;
                
                fileOperationsStatus.innerHTML = '<p style="color: var(--text-secondary);">Loading months from selected files...</p>';
                
                // Disable buttons during loading
                if (loadMonthsBtn) loadMonthsBtn.disabled = true;
                if (exportAllMonthsBtn) exportAllMonthsBtn.disabled = true;
                if (exportCurrentMonthBtn) exportCurrentMonthBtn.disabled = true;
                
                try {
                    const result = await DataManager.loadMonthsFromFileInput(files);
                    if (result.success) {
                        const htmlCount = files.filter(f => f.name.endsWith('.html')).length;
                        const jsonCount = files.filter(f => f.name.endsWith('.json')).length;
                        const csvCount = files.filter(f => f.name.endsWith('.csv')).length;
                        const monthText = result.count !== 1 ? 'months' : 'month';
                        let message = 'Successfully loaded ' + result.count + ' ' + monthText + '!';
                        const fileTypes = [];
                        if (htmlCount > 0) {
                            const fileText = htmlCount !== 1 ? 'files' : 'file';
                            fileTypes.push(htmlCount + ' HTML ' + fileText);
                        }
                        if (jsonCount > 0) {
                            const fileText = jsonCount !== 1 ? 'files' : 'file';
                            fileTypes.push(jsonCount + ' JSON ' + fileText);
                        }
                        if (csvCount > 0) {
                            const fileText = csvCount !== 1 ? 'files' : 'file';
                            fileTypes.push(csvCount + ' CSV ' + fileText);
                        }
                        if (fileTypes.length > 0) {
                            message += ' (' + fileTypes.join(', ') + ')';
                        }
                        if (result.errors > 0) {
                            const errorText = result.errors !== 1 ? 'files' : 'file';
                            message += '<br/><span style="color: var(--warning-color);">' + result.errors + ' ' + errorText + ' had errors</span>';
                        }
                        fileOperationsStatus.innerHTML = '<p style="color: var(--success-color);">' + message + '</p>';
                        this.loadMonthSelector();
                        if (this.currentMonthKey && result.months[this.currentMonthKey]) {
                            this.loadMonth(this.currentMonthKey);
                        }
                    } else {
                        fileOperationsStatus.innerHTML = '<p style="color: var(--danger-color);">No valid month files found. Please select JSON or HTML files.</p>';
                    }
                } catch (error) {
                    fileOperationsStatus.innerHTML = '<p style="color: var(--danger-color);">Error: ' + error.message + '</p>';
                    console.error('Error loading files:', error);
                    if (error.stack) {
                        console.error('Stack trace:', error.stack);
                    }
                } finally {
                    fileInput.value = '';
                    if (loadMonthsBtn) loadMonthsBtn.disabled = false;
                    if (exportAllMonthsBtn) exportAllMonthsBtn.disabled = false;
                    if (exportCurrentMonthBtn) exportCurrentMonthBtn.disabled = false;
                }
            });
        }

        const incomeInputs = ['nicholas-income-estimated', 'nicholas-income-actual', 
                             'lara-income-estimated', 'lara-income-actual',
                             'other-income-estimated', 'other-income-actual'];
        incomeInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.addEventListener('input', () => this.updateCalculations());
        });
    },

    /**
     * Create a new month
     */
    createNewMonth() {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        const yearInput = prompt('Enter year:', currentYear);
        if (!yearInput) return;

        if (!Formatters.validateYear(yearInput)) {
            alert('Please enter a valid year between 2000 and 2100');
            return;
        }

        const year = parseInt(yearInput, 10);
        const monthInput = prompt('Enter month (1-12):', currentMonth);
        if (!monthInput) return;

        if (!Formatters.validateMonth(monthInput)) {
            alert('Please enter a valid month between 1 and 12');
            return;
        }

        const month = parseInt(monthInput, 10);
        const monthKey = DataManager.generateMonthKey(year, month);
        DataManager.createNewMonth(year, month);
        window.location.href = `monthly-budget.html?month=${monthKey}`;
    },

    /**
     * Load a specific month
     */
    loadMonth(monthKey) {
        const monthData = DataManager.getMonth(monthKey);
        
        if (!monthData) {
            alert('Month not found');
            return;
        }

        this.currentMonthData = monthData;
        this.currentMonthKey = monthKey;

        const selector = document.getElementById('month-selector');
        const monthTitle = document.getElementById('month-title');
        const deleteBtn = document.getElementById('delete-month-button');

        if (selector) selector.value = monthKey;
        if (monthTitle) monthTitle.textContent = `${monthData.monthName} ${monthData.year}`;
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        this.loadWeeklyBreakdown(monthData.weeklyBreakdown || []);
        this.loadIncomeSources(monthData.income || monthData.incomeSources || []);
        this.loadFixedCosts(monthData.fixedCosts || []);
        this.loadVariableCosts(monthData.variableCosts || []);
        this.loadUnplannedExpenses(monthData.unplannedExpenses || []);
        this.loadPots(monthData.pots || []);

        const monthContent = document.getElementById('month-content');
        const noMonthMessage = document.getElementById('no-month-message');
        if (monthContent) monthContent.style.display = 'block';
        if (noMonthMessage) noMonthMessage.style.display = 'none';

        this.updateCalculations();
    },

    /**
     * Load weekly breakdown
     */
    loadWeeklyBreakdown(weeklyBreakdown) {
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (weeklyBreakdown && weeklyBreakdown.length > 0) {
        weeklyBreakdown.forEach(week => this.addWeeklyBreakdownRow(week));
        } else {
            // If no weekly breakdown exists, add at least one empty row
            this.addWeeklyBreakdownRow();
        }

        // Always add the total row at the end
        this.addWeeklyBreakdownTotalRow();
    },

    /**
     * Add weekly breakdown row
     */
    addWeeklyBreakdownRow(weekData = null) {
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="weekly-date-range" value="${weekData?.dateRange || weekData?.weekRange || ''}" placeholder="e.g., 30-9 or 1-7"></td>
            <td><textarea class="weekly-payments-due" placeholder="Payments Due" rows="4">${weekData?.paymentsDue || ''}</textarea></td>
            <td><textarea class="weekly-groceries" placeholder="Groceries (with calculations)" rows="4">${weekData?.groceries || ''}</textarea></td>
            <td><textarea class="weekly-transport" placeholder="Transport (with calculations)" rows="4">${weekData?.transport || ''}</textarea></td>
            <td><textarea class="weekly-activities" placeholder="Activities (with calculations)" rows="4">${weekData?.activities || ''}</textarea></td>
            <td><input type="number" class="weekly-estimate" value="${weekData?.estimate || weekData?.weeklyEstimate || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="weekly-actual" value="${weekData?.actual || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td>
                <button type="button" class="btn-delete-week btn btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.875rem;">Remove</button>
            </td>
        `;

        row.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', () => this.updateCalculations());
        });

        // Add delete button handler
        const deleteBtn = row.querySelector('.btn-delete-week');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                row.remove();
                this.updateCalculations();
            });
        }

        tbody.appendChild(row);
    },

    /**
     * Add weekly breakdown total row
     */
    addWeeklyBreakdownTotalRow() {
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>TOTALS</strong></td>
            <td id="weekly-breakdown-total-payments"></td>
            <td id="weekly-breakdown-total-groceries"></td>
            <td id="weekly-breakdown-total-transport"></td>
            <td id="weekly-breakdown-total-activities"></td>
            <td id="weekly-breakdown-total-estimate"><strong>£0.00</strong></td>
            <td id="weekly-breakdown-total-actual"><strong>£0.00</strong></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Load income sources (supports both old format and new array format)
     */
    loadIncomeSources(incomeData) {
        const tbody = document.getElementById('income-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        let incomeSources = [];

        if (Array.isArray(incomeData)) {
            incomeSources = incomeData;
        } else if (incomeData && typeof incomeData === 'object') {
            if (incomeData.nicholasIncome) {
                incomeSources.push({
                    source: 'Nicholas Income',
                    estimated: incomeData.nicholasIncome.estimated || 0,
                    actual: incomeData.nicholasIncome.actual || 0,
                    date: incomeData.nicholasIncome.date || '',
                    description: ''
                });
            }
            if (incomeData.laraIncome) {
                incomeSources.push({
                    source: 'Lara Income',
                    estimated: incomeData.laraIncome.estimated || 0,
                    actual: incomeData.laraIncome.actual || 0,
                    date: incomeData.laraIncome.date || '',
                    description: ''
                });
            }
            if (incomeData.otherIncome) {
                incomeSources.push({
                    source: 'Other Income',
                    estimated: incomeData.otherIncome.estimated || 0,
                    actual: incomeData.otherIncome.actual || 0,
                    date: '',
                    description: incomeData.otherIncome.description || ''
                });
            }
        }

        if (incomeSources.length === 0) {
            this.addIncomeRow();
        } else {
            incomeSources.forEach(income => this.addIncomeRow(income));
        }

        // Always add the total row at the end
        this.addIncomeTotalRow();
    },

    /**
     * Add income row
     */
    addIncomeRow(incomeData = null) {
        const tbody = document.getElementById('income-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="income-source" value="${incomeData?.source || ''}" placeholder="Revenue Source"></td>
            <td><input type="number" class="income-estimated" value="${incomeData?.estimated || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="income-actual" value="${incomeData?.actual || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="text" class="income-date" value="${incomeData?.date || ''}" placeholder="Date"></td>
            <td><input type="text" class="income-description" value="${incomeData?.description || ''}" placeholder="Description"></td>
            <td><button class="btn btn-danger btn-sm remove-row">Remove</button></td>
        `;

        row.querySelector('.remove-row').addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
        });

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.updateCalculations());
        });

        tbody.appendChild(row);
    },

    /**
     * Add income total row
     */
    addIncomeTotalRow() {
        const tbody = document.getElementById('income-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Income</strong></td>
            <td id="income-total-estimated"><strong>£0.00</strong></td>
            <td id="income-total-actual"><strong>£0.00</strong></td>
            <td></td>
            <td></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Load fixed costs
     */
    loadFixedCosts(costs) {
        const tbody = document.getElementById('fixed-costs-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        costs.forEach(cost => this.addFixedCostRow(cost));
        this.addFixedCostsTotalRow();
    },

    /**
     * Add fixed cost row
     */
    addFixedCostRow(costData = null) {
        const tbody = document.getElementById('fixed-costs-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="fixed-cost-category" value="${costData?.category || ''}" placeholder="Expense Category"></td>
            <td><input type="number" class="fixed-cost-estimated" value="${costData?.estimatedAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="fixed-cost-actual" value="${costData?.actualAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="text" class="fixed-cost-date" value="${costData?.date || ''}" placeholder="Date"></td>
            <td><input type="text" class="fixed-cost-card" value="${costData?.card || ''}" placeholder="Card"></td>
            <td><input type="checkbox" class="fixed-cost-paid" ${costData?.paid ? 'checked' : ''}></td>
            <td><button class="btn btn-danger btn-sm remove-row">Remove</button></td>
        `;

        row.querySelector('.remove-row').addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
        });

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.updateCalculations());
            input.addEventListener('change', () => this.updateCalculations());
        });

        tbody.appendChild(row);
    },

    /**
     * Add fixed costs total row
     */
    addFixedCostsTotalRow() {
        const tbody = document.getElementById('fixed-costs-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Fixed Costs</strong></td>
            <td id="fixed-costs-total-estimated"><strong>£0.00</strong></td>
            <td id="fixed-costs-total-actual"><strong>£0.00</strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Load variable costs
     */
    loadVariableCosts(costs) {
        const tbody = document.getElementById('variable-costs-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        costs.forEach(cost => this.addVariableCostRow(cost));
        this.addVariableCostsTotalRow();
    },

    /**
     * Add variable cost row
     */
    addVariableCostRow(costData = null) {
        const tbody = document.getElementById('variable-costs-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="variable-cost-category" value="${costData?.category || ''}" placeholder="Expense Category"></td>
            <td><input type="number" class="variable-cost-estimated" value="${costData?.estimatedAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="variable-cost-actual" value="${costData?.actualAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><button class="btn btn-danger btn-sm remove-row">Remove</button></td>
        `;

        row.querySelector('.remove-row').addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
        });

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.updateCalculations());
        });

        tbody.appendChild(row);
    },

    /**
     * Add variable costs total row
     */
    addVariableCostsTotalRow() {
        const tbody = document.getElementById('variable-costs-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Variable Costs</strong></td>
            <td id="variable-costs-total-budget"><strong>£0.00</strong></td>
            <td id="variable-costs-total-actual"><strong>£0.00</strong></td>
            <td id="variable-costs-total-remaining"><strong>£0.00</strong></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Load unplanned expenses
     */
    loadUnplannedExpenses(expenses) {
        const tbody = document.getElementById('unplanned-expenses-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        expenses.forEach(expense => this.addUnplannedExpenseRow(expense));
        this.addUnplannedExpensesTotalRow();
    },

    /**
     * Add unplanned expense row
     */
    addUnplannedExpenseRow(expenseData = null) {
        const tbody = document.getElementById('unplanned-expenses-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="unplanned-name" value="${expenseData?.name || ''}" placeholder="Name"></td>
            <td><input type="number" class="unplanned-amount" value="${expenseData?.amount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="text" class="unplanned-date" value="${expenseData?.date || ''}" placeholder="Date"></td>
            <td><input type="text" class="unplanned-card" value="${expenseData?.card || ''}" placeholder="Card"></td>
            <td><input type="text" class="unplanned-status" value="${expenseData?.status || ''}" placeholder="Status"></td>
            <td><button class="btn btn-danger btn-sm remove-row">Remove</button></td>
        `;

        row.querySelector('.remove-row').addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
        });

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.updateCalculations());
        });

        tbody.appendChild(row);
    },

    /**
     * Add unplanned expenses total row
     */
    addUnplannedExpensesTotalRow() {
        const tbody = document.getElementById('unplanned-expenses-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Unplanned Expenses</strong></td>
            <td id="unplanned-expenses-total"><strong>£0.00</strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Load pots
     */
    loadPots(pots) {
        const tbody = document.getElementById('pots-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        pots.forEach(pot => this.addPotRow(pot));
        this.addPotsTotalRow();
    },

    /**
     * Add pot row
     */
    addPotRow(potData = null) {
        const tbody = document.getElementById('pots-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="pot-category" value="${potData?.category || ''}" placeholder="Category"></td>
            <td><input type="number" class="pot-estimated" value="${potData?.estimatedAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="pot-actual" value="${potData?.actualAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><button class="btn btn-danger btn-sm remove-row">Remove</button></td>
        `;

        row.querySelector('.remove-row').addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
        });

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.updateCalculations());
        });

        tbody.appendChild(row);
    },

    /**
     * Add pots total row
     */
    addPotsTotalRow() {
        const tbody = document.getElementById('pots-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Savings/Investments</strong></td>
            <td id="pots-total-estimated"><strong>£0.00</strong></td>
            <td id="pots-total-actual"><strong>£0.00</strong></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Update all calculations
     */
    updateCalculations() {
        if (!this.currentMonthData) return;

        const totals = DataManager.calculateMonthTotals(this.getCurrentMonthDataFromForm());

        // Update income totals
        this.setElementHTML('income-total-estimated', '<strong>' + Formatters.formatCurrency(totals.income.estimated) + '</strong>');
        this.setElementHTML('income-total-actual', '<strong>' + Formatters.formatCurrency(totals.income.actual) + '</strong>');
        
        // Update fixed costs totals
        this.setElementHTML('fixed-costs-total-estimated', '<strong>' + Formatters.formatCurrency(totals.fixedCosts.estimated) + '</strong>');
        this.setElementHTML('fixed-costs-total-actual', '<strong>' + Formatters.formatCurrency(totals.fixedCosts.actual) + '</strong>');
        
        // Update variable costs totals
        this.setElementHTML('variable-costs-total-budget', '<strong>' + Formatters.formatCurrency(totals.variableCosts.estimated) + '</strong>');
        this.setElementHTML('variable-costs-total-actual', '<strong>' + Formatters.formatCurrency(totals.variableCosts.actual) + '</strong>');
        const variableRemaining = totals.variableCosts.estimated - totals.variableCosts.actual;
        this.setElementHTML('variable-costs-total-remaining', '<strong>' + Formatters.formatCurrency(variableRemaining) + '</strong>');
        
        // Update unplanned expenses totals
        this.setElementHTML('unplanned-expenses-total', '<strong>' + Formatters.formatCurrency(totals.unplannedExpenses.actual) + '</strong>');

        // Update summary section
        this.setElementHTML('summary-income-estimated', '<strong>' + Formatters.formatCurrency(totals.income.estimated) + '</strong>');
        this.setElementHTML('summary-income-actual', '<strong>' + Formatters.formatCurrency(totals.income.actual) + '</strong>');
        this.setElementHTML('summary-fixed-costs-estimated', Formatters.formatCurrency(totals.fixedCosts.estimated));
        this.setElementHTML('summary-fixed-costs-actual', Formatters.formatCurrency(totals.fixedCosts.actual));
        this.setElementHTML('summary-variable-costs-estimated', Formatters.formatCurrency(totals.variableCosts.estimated));
        this.setElementHTML('summary-variable-costs-actual', Formatters.formatCurrency(totals.variableCosts.actual));
        this.setElementHTML('summary-expenses-estimated', '<strong>' + Formatters.formatCurrency(totals.expenses.estimated) + '</strong>');
        this.setElementHTML('summary-expenses-actual', '<strong>' + Formatters.formatCurrency(totals.expenses.actual) + '</strong>');
        this.setElementHTML('summary-unplanned-actual', Formatters.formatCurrency(totals.unplannedExpenses.actual));
        
        // Grand Savings Total = Income - Expenses - Pots
        // Note: totals.expenses.actual already includes unplanned expenses
        const grandSavingsEstimated = totals.income.estimated - totals.expenses.estimated - totals.pots.estimated;
        const grandSavingsActual = totals.income.actual - totals.expenses.actual - totals.pots.actual;
        this.setElementHTML('summary-savings-estimated', '<strong><em>' + Formatters.formatCurrency(grandSavingsEstimated) + '</em></strong>');
        this.setElementHTML('summary-savings-actual', '<strong><em>' + Formatters.formatCurrency(grandSavingsActual) + '</em></strong>');

        // Update weekly breakdown totals
        const weeklyBreakdownRows = Array.from(document.querySelectorAll('#weekly-breakdown-tbody tr'));
        let weeklyEstimateTotal = 0;
        let weeklyActualTotal = 0;
        weeklyBreakdownRows.forEach(row => {
            const estimate = Formatters.parseNumber(row.querySelector('.weekly-estimate')?.value);
            const actual = Formatters.parseNumber(row.querySelector('.weekly-actual')?.value);
            weeklyEstimateTotal += estimate;
            weeklyActualTotal += actual;
        });
        
        // Set totals - Payments Due, Groceries, Transport, Activities are blank (can't be calculated)
        this.setElementHTML('weekly-breakdown-total-payments', '');
        this.setElementHTML('weekly-breakdown-total-groceries', '');
        this.setElementHTML('weekly-breakdown-total-transport', '');
        this.setElementHTML('weekly-breakdown-total-activities', '');
        
        // Set calculated totals for Estimate and Actual
        this.setElementHTML('weekly-breakdown-total-estimate', '<strong>' + Formatters.formatCurrency(weeklyEstimateTotal) + '</strong>');
        this.setElementHTML('weekly-breakdown-total-actual', '<strong>' + Formatters.formatCurrency(weeklyActualTotal) + '</strong>');
    },

    /**
     * Get current month data from form
     */
    getCurrentMonthDataFromForm() {
        const weeklyBreakdown = Array.from(document.querySelectorAll('#weekly-breakdown-tbody tr')).map(row => ({
            dateRange: row.querySelector('.weekly-date-range')?.value || '',
            weekRange: row.querySelector('.weekly-date-range')?.value || '',
            paymentsDue: row.querySelector('.weekly-payments-due')?.value || '',
            groceries: row.querySelector('.weekly-groceries')?.value || '',
            transport: row.querySelector('.weekly-transport')?.value || '',
            activities: row.querySelector('.weekly-activities')?.value || '',
            estimate: Formatters.parseNumber(row.querySelector('.weekly-estimate')?.value),
            weeklyEstimate: Formatters.parseNumber(row.querySelector('.weekly-estimate')?.value),
            actual: Formatters.parseNumber(row.querySelector('.weekly-actual')?.value)
        }));

        const fixedCosts = Array.from(document.querySelectorAll('#fixed-costs-tbody tr')).map(row => ({
            category: row.querySelector('.fixed-cost-category')?.value || '',
            estimatedAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-estimated')?.value),
            actualAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-actual')?.value),
            date: row.querySelector('.fixed-cost-date')?.value || '',
            card: row.querySelector('.fixed-cost-card')?.value || '',
            paid: row.querySelector('.fixed-cost-paid')?.checked || false
        }));

        const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr')).map(row => ({
            category: row.querySelector('.variable-cost-category')?.value || '',
            estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
            actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value)
        }));

        const unplannedExpenses = Array.from(document.querySelectorAll('#unplanned-expenses-tbody tr')).map(row => ({
            name: row.querySelector('.unplanned-name')?.value || '',
            amount: Formatters.parseNumber(row.querySelector('.unplanned-amount')?.value),
            date: row.querySelector('.unplanned-date')?.value || '',
            card: row.querySelector('.unplanned-card')?.value || '',
            status: row.querySelector('.unplanned-status')?.value || ''
        }));

        const pots = Array.from(document.querySelectorAll('#pots-tbody tr')).map(row => ({
            category: row.querySelector('.pot-category')?.value || '',
            estimatedAmount: Formatters.parseNumber(row.querySelector('.pot-estimated')?.value),
            actualAmount: Formatters.parseNumber(row.querySelector('.pot-actual')?.value)
        }));

        const incomeSources = Array.from(document.querySelectorAll('#income-tbody tr')).map(row => ({
            source: row.querySelector('.income-source')?.value || '',
            estimated: Formatters.parseNumber(row.querySelector('.income-estimated')?.value),
            actual: Formatters.parseNumber(row.querySelector('.income-actual')?.value),
            date: row.querySelector('.income-date')?.value || '',
            description: row.querySelector('.income-description')?.value || ''
        }));

        return {
            ...this.currentMonthData,
            weeklyBreakdown: weeklyBreakdown,
            incomeSources: incomeSources,
            fixedCosts: fixedCosts,
            variableCosts: variableCosts,
            unplannedExpenses: unplannedExpenses,
            pots: pots,
            updatedAt: new Date().toISOString()
        };
    },

    /**
     * Save month data
     */
    saveMonthData() {
        if (!this.currentMonthKey) {
            alert('No month selected');
            return;
        }

        const monthData = this.getCurrentMonthDataFromForm();
        const isNewMonth = !this.currentMonthData || !this.currentMonthData.createdAt;
        
        // Always export to file - files are the source of truth
        const success = DataManager.saveMonth(this.currentMonthKey, monthData, true);

        if (success) {
            let message = 'Month data saved successfully!\n\n';
            
            // Check if File System Access API is available
            if ('showSaveFilePicker' in window) {
                message += 'File saved directly to your selected location.';
            } else {
                message += 'A JSON file has been downloaded. ';
                message += 'Please save it to the data/months/ folder.';
            }
            
            if (isNewMonth) {
                message = 'New month created and saved!\n\n' + message;
            }
            
            alert(message);
            this.currentMonthData = monthData;
            this.loadMonthSelector();
        } else {
            alert('Error saving month data. Please try again.');
        }
    },

    /**
     * Delete current month
     */
    deleteCurrentMonth() {
        if (!this.currentMonthKey) {
            alert('No month selected');
            return;
        }

        const monthData = this.currentMonthData;
        const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
        const year = monthData.year;

        const confirmMessage = `Are you sure you want to delete ${monthName} ${year}? This action cannot be undone.`;
        if (!confirm(confirmMessage)) {
            return;
        }

        const success = DataManager.deleteMonth(this.currentMonthKey);

        if (success) {
            alert(`${monthName} ${year} has been deleted.`);
            this.currentMonthKey = null;
            this.currentMonthData = null;

            const monthContent = document.getElementById('month-content');
            const noMonthMessage = document.getElementById('no-month-message');
            if (monthContent) monthContent.style.display = 'none';
            if (noMonthMessage) noMonthMessage.style.display = 'block';

            this.loadMonthSelector();

            const allMonths = DataManager.getAllMonths();
            const monthKeys = Object.keys(allMonths).sort().reverse();
            if (monthKeys.length > 0) {
                this.loadMonth(monthKeys[0]);
            } else {
                const deleteBtn = document.getElementById('delete-month-button');
                if (deleteBtn) deleteBtn.style.display = 'none';
            }
        } else {
            alert('Error deleting month. Please try again.');
        }
    },

    /**
     * Helper: Set element text content
     */
    setElementText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    },

    /**
     * Helper: Set element HTML content
     */
    setElementHTML(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    }
};

// Initialize when DOM is ready
// Make available globally
window.MonthlyBudgetController = MonthlyBudgetController;

