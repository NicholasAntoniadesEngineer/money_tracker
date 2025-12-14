/**
 * Monthly Budget Controller
 * Handles the monthly budget view logic
 */

const MonthlyBudgetController = {
    currentMonthData: null,
    currentMonthKey: null,

    /**
     * Calculate the number of weeks in a month
     * Returns an array of week objects with start and end dates
     * Weeks run Monday to Sunday
     */
    calculateWeeksInMonth(year, month) {
        const weeks = [];
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const daysInMonth = lastDay.getDate();
        
        // Find the Monday of the week containing the first day of the month
        const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToMonday = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek;
        
        let weekStartDay = 1 + daysToMonday;
        let weekEndDay = weekStartDay + 6;
        
        // Adjust if week starts before month
        if (weekStartDay < 1) {
            weekStartDay = 1;
        }
        
        // Continue until we've covered all days in the month
        while (weekStartDay <= daysInMonth) {
            // Ensure week end doesn't exceed month end
            if (weekEndDay > daysInMonth) {
                weekEndDay = daysInMonth;
            }
            
            weeks.push({
                startDate: weekStartDay,
                endDate: weekEndDay,
                startFullDate: new Date(year, month - 1, weekStartDay),
                endFullDate: new Date(year, month - 1, weekEndDay),
                weekNumber: weeks.length + 1
            });
            
            // Move to next week
            weekStartDay = weekEndDay + 1;
            weekEndDay = weekStartDay + 6;
        }
        
        return weeks;
    },

    /**
     * Get week number for a given date in the month
     */
    getWeekForDate(year, month, day) {
        const weeks = this.calculateWeeksInMonth(year, month);
        for (let i = 0; i < weeks.length; i++) {
            if (day >= weeks[i].startDate && day <= weeks[i].endDate) {
                return i;
            }
        }
        return 0; // Default to first week
    },

    /**
     * Format date range for week display
     */
    formatWeekDateRange(week) {
        return `${week.startDate}-${week.endDate}`;
    },

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
        const selectorInitial = document.getElementById('month-selector-initial');

        const allMonths = DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths).sort().reverse();

        const optionsHtml = monthKeys.length > 0 
            ? monthKeys.map(key => {
                const monthData = allMonths[key];
                const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                return `<option value="${key}">${monthName} ${monthData.year}</option>`;
            }).join('')
            : '<option value="">No months available</option>';

        if (selector) selector.innerHTML = optionsHtml;
        if (selectorInitial) selectorInitial.innerHTML = optionsHtml;
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const createMonthBtn = document.getElementById('create-month-button');
        const saveMonthBtn = document.getElementById('save-month-button');
        const addIncomeBtn = document.getElementById('add-income-button');
        const addFixedCostBtn = document.getElementById('add-fixed-cost-button');
        const addVariableCostBtn = document.getElementById('add-variable-cost-button');
        const addUnplannedBtn = document.getElementById('add-unplanned-expense-button');
        const addPotBtn = document.getElementById('add-pot-button');
        const addWeeklyBreakdownBtn = document.getElementById('add-weekly-breakdown-button');

        if (createMonthBtn) createMonthBtn.addEventListener('click', () => this.createNewMonth());
        if (saveMonthBtn) saveMonthBtn.addEventListener('click', () => this.saveMonthData());
        if (addIncomeBtn) addIncomeBtn.addEventListener('click', () => this.addIncomeRow());
        if (addFixedCostBtn) addFixedCostBtn.addEventListener('click', () => this.addFixedCostRow());
        if (addVariableCostBtn) addVariableCostBtn.addEventListener('click', () => this.addVariableCostRow());
        if (addUnplannedBtn) addUnplannedBtn.addEventListener('click', () => this.addUnplannedExpenseRow());
        if (addPotBtn) addPotBtn.addEventListener('click', () => this.addPotRow());
        if (addWeeklyBreakdownBtn) addWeeklyBreakdownBtn.addEventListener('click', () => this.addWeeklyBreakdownRow());
        
        // Copy from month event listeners
        const copyIncomeBtn = document.getElementById('copy-income-button');
        const copyFixedCostsBtn = document.getElementById('copy-fixed-costs-button');
        const copyVariableCostsBtn = document.getElementById('copy-variable-costs-button');
        const copyUnplannedBtn = document.getElementById('copy-unplanned-button');

        if (copyIncomeBtn) copyIncomeBtn.addEventListener('click', () => this.copyIncomeFromMonth());
        if (copyFixedCostsBtn) copyFixedCostsBtn.addEventListener('click', () => this.copyFixedCostsFromMonth());
        if (copyVariableCostsBtn) copyVariableCostsBtn.addEventListener('click', () => this.copyVariableCostsFromMonth());
        if (copyUnplannedBtn) copyUnplannedBtn.addEventListener('click', () => this.copyUnplannedExpensesFromMonth());

        // Month selector event listeners
        const selector = document.getElementById('month-selector');
        const selectorInitial = document.getElementById('month-selector-initial');
        
        const handleMonthChange = (value) => {
            if (value) {
                this.loadMonth(value);
            }
        };
        
        if (selector) {
            selector.addEventListener('change', () => handleMonthChange(selector.value));
        }
        if (selectorInitial) {
            selectorInitial.addEventListener('change', () => handleMonthChange(selectorInitial.value));
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
        const selectorInitial = document.getElementById('month-selector-initial');
        const monthTitle = document.getElementById('month-title');
        const monthTitleWrapper = document.getElementById('month-title-wrapper');
        const monthSelectorWrapper = document.getElementById('month-selector-wrapper');

        // Update both selectors
        if (selector) selector.value = monthKey;
        if (selectorInitial) selectorInitial.value = monthKey;
        
        // Show month title with compact selector, hide initial selector
        if (monthTitle) {
            monthTitle.textContent = `${monthData.monthName} ${monthData.year}`;
        }
        if (monthTitleWrapper) monthTitleWrapper.style.display = 'flex';
        if (monthSelectorWrapper) monthSelectorWrapper.style.display = 'none';

        this.loadIncomeSources(monthData.income || monthData.incomeSources || []);
        this.loadFixedCosts(monthData.fixedCosts || []);
        this.loadVariableCosts(monthData.variableCosts || []);
        this.loadUnplannedExpenses(monthData.unplannedExpenses || []);
        this.loadPots(monthData.pots || []);
        
        // Rebuild table structure based on variable costs
        this.rebuildWorkingSectionTable();
        
        // Load weekly breakdown after costs are loaded so we can populate them
        this.loadWeeklyBreakdown(monthData.weeklyBreakdown || []);

        const monthContent = document.getElementById('month-content');
        const noMonthMessage = document.getElementById('no-month-message');
        if (monthContent) monthContent.style.display = 'block';
        if (noMonthMessage) noMonthMessage.style.display = 'none';

        // Populate copy month selectors
        this.populateCopyMonthSelectors();

        this.updateCalculations();
    },

    /**
     * Get variable cost categories (excluding transport which is in fixed costs)
     */
    getVariableCostCategories() {
        if (!this.currentMonthData) return [];
        const variableCosts = this.currentMonthData.variableCosts || [];
        const categories = new Set();
        
        variableCosts.forEach(cost => {
            const category = (cost.category || '').trim();
            if (category) {
                const categoryLower = category.toLowerCase();
                // Exclude transport/travel as it's in fixed costs
                if (!categoryLower.includes('transport') && !categoryLower.includes('travel')) {
                    categories.add(category);
                }
            }
        });
        
        return Array.from(categories).sort();
    },

    /**
     * Rebuild the working section table structure based on variable costs
     */
    rebuildWorkingSectionTable() {
        const thead = document.getElementById('weekly-breakdown-thead');
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!thead || !tbody) return;
        
        const categories = this.getVariableCostCategories();
        const headerRow = thead.querySelector('tr');
        if (!headerRow) return;
        
        // Build header: Date, Payments Due, [Variable Cost Categories], Estimate, Actual, Delete
        const existingHeaders = headerRow.innerHTML;
        let newHeaderHTML = '<th>Date</th><th>Payments Due (added from tables below)</th>';
        
        // Add variable cost category columns
        categories.forEach(category => {
            newHeaderHTML += `<th>${category}</th>`;
        });
        
        newHeaderHTML += '<th>Estimate</th><th>Actual</th><th class="delete-column-header"></th>';
        headerRow.innerHTML = newHeaderHTML;
        
        // Update total row
        const totalRow = tbody.querySelector('.total-row');
        if (totalRow) {
            let totalRowHTML = '<td><strong>TOTALS</strong></td><td id="weekly-breakdown-total-payments"></td>';
            
            // Add total cells for each variable cost category
            categories.forEach(category => {
                const categoryId = 'weekly-breakdown-total-' + this.sanitizeCategoryId(category);
                totalRowHTML += `<td id="${categoryId}"></td>`;
            });
            
            totalRowHTML += '<td id="weekly-breakdown-total-estimate"><strong>£0.00</strong></td><td id="weekly-breakdown-total-actual"><strong>£0.00</strong></td><td></td>';
            totalRow.innerHTML = totalRowHTML;
        }
    },

    /**
     * Sanitize category name for use as ID
     */
    sanitizeCategoryId(category) {
        return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    },

    /**
     * Load weekly breakdown
     */
    loadWeeklyBreakdown(weeklyBreakdown, forceRepopulate = false) {
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!this.currentMonthData) return;
        
        const year = this.currentMonthData.year;
        const month = this.currentMonthData.month;
        const weeks = this.calculateWeeksInMonth(year, month);
        
        // If weekly breakdown exists and has data, use it but ensure we have the right number of weeks
        if (weeklyBreakdown && weeklyBreakdown.length > 0) {
            // Create a map of existing weeks by date range
            const existingWeeksMap = new Map();
            weeklyBreakdown.forEach(week => {
                const dateRange = week.dateRange || week.weekRange || '';
                existingWeeksMap.set(dateRange, week);
            });
            
            // Generate weeks, preserving existing data where possible
            weeks.forEach((week, index) => {
                const dateRange = this.formatWeekDateRange(week);
                const existingWeek = existingWeeksMap.get(dateRange);
                if (existingWeek) {
                    this.addWeeklyBreakdownRow(existingWeek);
        } else {
                    // Create new week with date range
                    this.addWeeklyBreakdownRow({
                        dateRange: dateRange,
                        weekRange: dateRange
                    });
                }
            });
        } else {
            // Auto-generate weeks based on calendar
            weeks.forEach(week => {
                const dateRange = this.formatWeekDateRange(week);
                this.addWeeklyBreakdownRow({
                    dateRange: dateRange,
                    weekRange: dateRange
                });
            });
        }

        // Always add the total row at the end
        this.addWeeklyBreakdownTotalRow();
        
        // Populate fixed costs and variable costs into working section
        this.populateWorkingSectionFromCosts(forceRepopulate);
        
        // Auto-size all textareas after loading
        setTimeout(() => {
            const textareas = document.querySelectorAll('#weekly-breakdown-tbody textarea');
            textareas.forEach(textarea => {
                this.autoSizeTextarea(textarea);
            });
        }, 100);
    },

    /**
     * Add weekly breakdown row
     */
    addWeeklyBreakdownRow(weekData = null) {
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!tbody) return;

        const categories = this.getVariableCostCategories();
        let rowHTML = `
            <td><input type="text" class="weekly-date-range" value="${weekData?.dateRange || weekData?.weekRange || ''}" placeholder="e.g., 30-9 or 1-7"></td>
            <td><textarea class="weekly-payments-due" placeholder="Payments Due" rows="4">${weekData?.paymentsDue || ''}</textarea></td>
        `;
        
        // Add textarea for each variable cost category
        categories.forEach(category => {
            const categoryId = this.sanitizeCategoryId(category);
            const categoryClass = 'weekly-variable-' + categoryId;
            const existingValue = weekData && weekData[categoryClass] ? weekData[categoryClass] : (weekData && weekData[category] ? weekData[category] : '');
            rowHTML += `<td><textarea class="${categoryClass}" placeholder="${category} (with calculations)" rows="4">${existingValue}</textarea></td>`;
        });
        
        rowHTML += `
            <td><input type="number" class="weekly-estimate" value="${weekData?.estimate || weekData?.weeklyEstimate || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="weekly-actual" value="${weekData?.actual || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const row = document.createElement('tr');
        row.innerHTML = rowHTML;

        row.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', () => {
                // Check if this is a variable cost textarea (class starts with 'weekly-variable-')
                const isVariableCost = Array.from(input.classList).some(cls => cls.startsWith('weekly-variable-'));
                
                // Auto-update estimate and actual when textareas change
                if (input.classList.contains('weekly-payments-due') || isVariableCost) {
                    this.autoSizeTextarea(input);
                    // Update total line for variable cost textareas (must happen before updateCalculations)
                    if (isVariableCost) {
                        // Use requestAnimationFrame to ensure DOM is ready
                        requestAnimationFrame(() => {
                            this.updateVariableCostTotal(input);
                            // Then update calculations
                            this.updateCalculations();
                        });
                        return; // Don't call updateCalculations again below
                    }
                    // Trigger calculation update to recalculate estimate/actual
                    setTimeout(() => this.updateCalculations(), 0);
                } else {
                    this.updateCalculations();
                }
            });
        });
        
        // Make estimate and actual read-only (auto-calculated)
        const estimateInput = row.querySelector('.weekly-estimate');
        const actualInput = row.querySelector('.weekly-actual');
        if (estimateInput) {
            estimateInput.readOnly = true;
            estimateInput.style.backgroundColor = 'var(--bg-secondary)';
        }
        if (actualInput) {
            actualInput.readOnly = true;
            actualInput.style.backgroundColor = 'var(--bg-secondary)';
        }
        
        // Auto-size all textareas on load
        const textareas = row.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            this.autoSizeTextarea(textarea);
        });

        // Add delete handler
        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                row.remove();
                this.updateCalculations();
            });
        }

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
    },

    /**
     * Populate working section from fixed costs and variable costs
     * @param {boolean} forceUpdate - If true, force update even if textareas have data
     */
    populateWorkingSectionFromCosts(forceUpdate = false) {
        if (!this.currentMonthData) return;
        
        const year = this.currentMonthData.year;
        const month = this.currentMonthData.month;
        const weeks = this.calculateWeeksInMonth(year, month);
        const fixedCosts = this.currentMonthData.fixedCosts || [];
        const variableCosts = this.currentMonthData.variableCosts || [];
        
        // Get all weekly rows (excluding total row)
        const weeklyRows = Array.from(document.querySelectorAll('#weekly-breakdown-tbody tr:not(.total-row)'));
        
        // Distribute variable costs across weeks (same for all weeks)
        const numWeeks = weeks.length;
        const weeklyVariableCosts = {};
        const categories = this.getVariableCostCategories();
        
        variableCosts.forEach(cost => {
            const category = (cost.category || '').trim();
            if (!category) return;
            
            const categoryLower = category.toLowerCase();
            // Skip transport/travel as it's in fixed costs
            if (categoryLower.includes('transport') || categoryLower.includes('travel')) {
                return;
            }
            
            const monthlyBudget = Formatters.parseNumber(cost.estimatedAmount || 0);
            if (monthlyBudget <= 0) return;
            
            const weeklyBudget = monthlyBudget / numWeeks;
            
            if (!weeklyVariableCosts[category]) {
                weeklyVariableCosts[category] = [];
            }
            weeklyVariableCosts[category].push({
                category: category,
                weeklyBudget: weeklyBudget,
                monthlyBudget: monthlyBudget,
                calculation: weeklyBudget.toFixed(2)
            });
        });
        
        // Process each week
        weeklyRows.forEach((row, weekIndex) => {
            if (weekIndex >= weeks.length) return;
            
            const paymentsDueTextarea = row.querySelector('.weekly-payments-due');
            
            // Collect fixed costs for this week
            const week = weeks[weekIndex];
            const weekFixedCosts = [];
            
            fixedCosts.forEach(cost => {
                if (!cost.date) return;
                
                // Parse date - could be in various formats (DD, DD-MM, DD/MM, etc.)
                const dateMatch = cost.date.toString().match(/(\d+)/);
                if (dateMatch) {
                    const day = parseInt(dateMatch[1], 10);
                    if (day >= week.startDate && day <= week.endDate) {
                        const amount = Formatters.parseNumber(cost.estimatedAmount || cost.actualAmount || 0);
                        const category = cost.category || 'Fixed Cost';
                        weekFixedCosts.push({
                            category: category,
                            amount: amount,
                            date: day,
                            card: cost.card || '',
                            paid: cost.paid || false
                        });
                    }
                }
            });
            
            // Build payments due text (only if field is empty or contains auto-generated content)
            const currentPayments = paymentsDueTextarea?.value || '';
            const hasAutoGeneratedPayments = currentPayments.includes('Auto-generated');
            
            if (weekFixedCosts.length > 0 && (!currentPayments.trim() || hasAutoGeneratedPayments)) {
                const paymentsText = weekFixedCosts.map(cost => {
                    const paidStatus = cost.paid ? ' ✓' : '';
                    const cardInfo = cost.card ? ` (${cost.card})` : '';
                    // Format: Category: £Amount (Card) ✓
                    // Amount is formatted with currency symbol for easy parsing
                    return `${cost.category}: ${Formatters.formatCurrency(cost.amount)}${cardInfo}${paidStatus}`;
                }).join('\n');
                
                if (hasAutoGeneratedPayments) {
                    // Replace existing auto-generated content, remove any "---" separators
                    const beforeAuto = currentPayments.split('Auto-generated')[0].trim();
                    const cleanedBeforeAuto = beforeAuto.replace(/---+/g, '').trim();
                    paymentsDueTextarea.value = cleanedBeforeAuto ? cleanedBeforeAuto + '\n' + paymentsText : paymentsText;
                } else {
                    paymentsDueTextarea.value = paymentsText;
                }
                
                // Auto-size the textarea
                this.autoSizeTextarea(paymentsDueTextarea);
                
                // Update calculations to show totals
                this.updateCalculations();
            }
            
            // Populate each variable cost category column
            categories.forEach(category => {
                const categoryId = this.sanitizeCategoryId(category);
                const categoryClass = 'weekly-variable-' + categoryId;
                const categoryTextarea = row.querySelector('.' + categoryClass);
                
                if (!categoryTextarea) return;
                
                const currentValue = categoryTextarea.value || '';
                const hasAutoGenerated = currentValue.includes('Auto-generated');
                const hasEstimate = currentValue.includes('Estimate:');
                const hasEquals = currentValue.includes('=');
                
                // Update if: force update, empty, has auto-generated, or has estimate (to update with new category data)
                if (weeklyVariableCosts[category] && weeklyVariableCosts[category].length > 0 && (forceUpdate || !currentValue.trim() || hasAutoGenerated || hasEstimate)) {
                    // Calculate total estimate for this category (sum of all variable costs in this category)
                    const totalEstimate = weeklyVariableCosts[category].reduce((sum, cost) => sum + cost.weeklyBudget, 0);
                    const baseEstimate = totalEstimate.toFixed(2);
                    
                    if (hasAutoGenerated || hasEstimate || !currentValue.trim()) {
                        // Replace old format with new format - preserve user adjustments
                        const lines = currentValue.split('\n');
                        const adjustments = lines.filter(line => {
                            const trimmed = line.trim();
                            return trimmed && 
                                   !trimmed.startsWith('Estimate:') && 
                                   !trimmed.startsWith('Auto-generated') &&
                                   !trimmed.startsWith('=') &&
                                   (trimmed.startsWith('+') || trimmed.startsWith('-') || /^[\d.]+$/.test(trimmed));
                        });
                        
                        // Build new content: base estimate, then adjustments
                        let newContent = baseEstimate;
                        if (adjustments.length > 0) {
                            newContent += '\n' + adjustments.join('\n');
                        }
                        categoryTextarea.value = newContent;
                        // Always calculate and add the total line
                        this.updateVariableCostTotal(categoryTextarea);
                    } else {
                        // Preserve existing content but update base estimate if it's just a number
                        const lines = currentValue.split('\n');
                        const firstLine = lines[0]?.trim() || '';
                        if (/^[\d.]+$/.test(firstLine)) {
                            // First line is just a number, replace it with new estimate
                            lines[0] = baseEstimate;
                            categoryTextarea.value = lines.join('\n');
                            // Always calculate and add the total line
                            this.updateVariableCostTotal(categoryTextarea);
                        } else {
                            // Keep existing content, just update total
                            this.updateVariableCostTotal(categoryTextarea);
                        }
                    }
                    
                    // Auto-size the textarea
                    this.autoSizeTextarea(categoryTextarea);
                } else {
                    // Always ensure total line exists and is calculated, even if content hasn't changed
                    if (!hasEquals || currentValue.trim()) {
                        this.updateVariableCostTotal(categoryTextarea);
                    }
                }
            });
        });
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

        // Get dynamic categories to match the table structure
        const categories = this.getVariableCostCategories();
        let totalRowHTML = '<td><strong>TOTALS</strong></td><td id="weekly-breakdown-total-payments"></td>';
        
        // Add total cells for each variable cost category
        categories.forEach(category => {
            const categoryId = 'weekly-breakdown-total-' + this.sanitizeCategoryId(category);
            totalRowHTML += `<td id="${categoryId}"></td>`;
        });
        
        totalRowHTML += '<td id="weekly-breakdown-total-estimate"><strong>£0.00</strong></td><td id="weekly-breakdown-total-actual"><strong>£0.00</strong></td><td></td>';

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = totalRowHTML;

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
                    description: '',
                    comments: incomeData.nicholasIncome.comments || ''
                });
            }
            if (incomeData.laraIncome) {
                incomeSources.push({
                    source: 'Lara Income',
                    estimated: incomeData.laraIncome.estimated || 0,
                    actual: incomeData.laraIncome.actual || 0,
                    date: incomeData.laraIncome.date || '',
                    description: '',
                    comments: incomeData.laraIncome.comments || ''
                });
            }
            if (incomeData.otherIncome) {
                incomeSources.push({
                    source: 'Other Income',
                    estimated: incomeData.otherIncome.estimated || 0,
                    actual: incomeData.otherIncome.actual || 0,
                    date: '',
                    description: incomeData.otherIncome.description || '',
                    comments: incomeData.otherIncome.comments || ''
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
            <td><input type="text" class="income-comments" value="${incomeData?.comments || ''}" placeholder="Comments"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
                // Repopulate working section when unplanned expense is deleted
                this.populateWorkingSectionFromCosts();
        });
        }

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                this.updateCalculations();
                // Repopulate working section when unplanned expense changes
                this.populateWorkingSectionFromCosts();
            });
        });

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
        
        // Repopulate working section when income is added
        this.populateWorkingSectionFromCosts();
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
            <td><input type="text" class="fixed-cost-comments" value="${costData?.comments || ''}" placeholder="Comments"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
                // Repopulate working section when fixed cost is deleted
                this.populateWorkingSectionFromCosts();
        });
        }

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                this.updateCalculations();
                // Repopulate working section when fixed cost changes
                this.populateWorkingSectionFromCosts();
            });
            input.addEventListener('change', () => {
                this.updateCalculations();
                // Repopulate working section when fixed cost changes
                this.populateWorkingSectionFromCosts();
            });
        });

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
        
        // Update current month data and repopulate working section when fixed cost is added
        if (this.currentMonthData) {
            const fixedCosts = Array.from(document.querySelectorAll('#fixed-costs-tbody tr:not(.total-row)')).map(row => ({
                category: row.querySelector('.fixed-cost-category')?.value || '',
                estimatedAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-estimated')?.value),
                actualAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-actual')?.value),
                date: row.querySelector('.fixed-cost-date')?.value || '',
                card: row.querySelector('.fixed-cost-card')?.value || '',
                paid: row.querySelector('.fixed-cost-paid')?.checked || false,
                comments: row.querySelector('.fixed-cost-comments')?.value || ''
            }));
            this.currentMonthData.fixedCosts = fixedCosts;
        }
        this.populateWorkingSectionFromCosts();
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
        
        // Rebuild working section table structure when variable costs change
        if (this.currentMonthData) {
            this.currentMonthData.variableCosts = costs;
            this.rebuildWorkingSectionTable();
            // Reload weekly breakdown to update columns
            if (this.currentMonthData.weeklyBreakdown) {
                this.loadWeeklyBreakdown(this.currentMonthData.weeklyBreakdown);
            }
        }
    },

    /**
     * Add variable cost row
     */
    addVariableCostRow(costData = null) {
        const tbody = document.getElementById('variable-costs-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        const estimated = Formatters.parseNumber(costData?.estimatedAmount || 0);
        const actual = Formatters.parseNumber(costData?.actualAmount || 0);
        const remaining = estimated - actual;

        row.innerHTML = `
            <td><input type="text" class="variable-cost-category" value="${costData?.category || ''}" placeholder="Expense Category"></td>
            <td><input type="number" class="variable-cost-estimated" value="${costData?.estimatedAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="variable-cost-actual" value="${costData?.actualAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td class="variable-cost-remaining">${Formatters.formatCurrency(remaining)}</td>
            <td><input type="text" class="variable-cost-comments" value="${costData?.comments || ''}" placeholder="Comments"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
            row.remove();
                // Update current month data
                if (this.currentMonthData) {
                    const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)')).map(row => ({
                        category: row.querySelector('.variable-cost-category')?.value || '',
                        estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
                        actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
                        comments: row.querySelector('.variable-cost-comments')?.value || ''
                    }));
                    this.currentMonthData.variableCosts = variableCosts;
                }
            this.updateCalculations();
                // Rebuild table structure when variable cost is deleted
                this.rebuildWorkingSectionTable();
                if (this.currentMonthData && this.currentMonthData.weeklyBreakdown) {
                    this.loadWeeklyBreakdown(this.currentMonthData.weeklyBreakdown);
                }
        });
        }

        // Update remaining calculation when estimated or actual changes
        const updateRemaining = () => {
            const estimatedInput = row.querySelector('.variable-cost-estimated');
            const actualInput = row.querySelector('.variable-cost-actual');
            const remainingCell = row.querySelector('.variable-cost-remaining');

            const estimated = Formatters.parseNumber(estimatedInput?.value || 0);
            const actual = Formatters.parseNumber(actualInput?.value || 0);
            const remaining = estimated - actual;

            if (remainingCell) {
                remainingCell.textContent = Formatters.formatCurrency(remaining);
            }

            this.updateCalculations();
        };

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                // Update current month data
                if (this.currentMonthData) {
                    const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)')).map(row => ({
                        category: row.querySelector('.variable-cost-category')?.value || '',
                        estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
                        actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
                        comments: row.querySelector('.variable-cost-comments')?.value || ''
                    }));
                    this.currentMonthData.variableCosts = variableCosts;
                }

                updateRemaining();
                
                // Rebuild table structure if category changed
                if (input.classList.contains('variable-cost-category')) {
                    this.rebuildWorkingSectionTable();
                    // Reload weekly breakdown to update columns, force repopulate to update category columns
                    if (this.currentMonthData && this.currentMonthData.weeklyBreakdown) {
                        this.loadWeeklyBreakdown(this.currentMonthData.weeklyBreakdown, true);
                    } else {
                        // If no weekly breakdown exists yet, just repopulate with force update
                        this.populateWorkingSectionFromCosts(true);
                    }
                } else if (input.classList.contains('variable-cost-estimated') || input.classList.contains('variable-cost-actual')) {
                    // Repopulate working section when amount changes
                    this.populateWorkingSectionFromCosts();
                }
            });
        });

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
        
        // Update current month data and rebuild table structure when variable cost is added
        if (this.currentMonthData) {
            const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)')).map(row => ({
                category: row.querySelector('.variable-cost-category')?.value || '',
                estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
                actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
                comments: row.querySelector('.variable-cost-comments')?.value || ''
            }));
            this.currentMonthData.variableCosts = variableCosts;
        }
        const updateWorkingSection = () => {
            this.rebuildWorkingSectionTable();
            if (this.currentMonthData && this.currentMonthData.weeklyBreakdown) {
                this.loadWeeklyBreakdown(this.currentMonthData.weeklyBreakdown);
            }
        };
        updateWorkingSection();
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
            <td></td>
            <td></td>
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
            <td><input type="text" class="unplanned-comments" value="${expenseData?.comments || ''}" placeholder="Comments"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
                // Repopulate working section when unplanned expense is deleted
                this.populateWorkingSectionFromCosts();
        });
        }

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                this.updateCalculations();
                // Repopulate working section when unplanned expense changes
                this.populateWorkingSectionFromCosts();
            });
        });

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
        
        // Repopulate working section when unplanned expense is added
        this.populateWorkingSectionFromCosts();
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

        // Update weekly breakdown totals - simple sums of each column
        const weeklyBreakdownRows = Array.from(document.querySelectorAll('#weekly-breakdown-tbody tr:not(.total-row)'));
        const categories = this.getVariableCostCategories();
        let weeklyEstimateTotal = 0;
        let weeklyActualTotal = 0;
        let weeklyPaymentsTotal = 0;
        const weeklyVariableCostsTotal = {};
        
        // Initialize totals for each category
        categories.forEach(category => {
            weeklyVariableCostsTotal[category] = 0;
        });
        
        weeklyBreakdownRows.forEach(row => {
            const estimateInput = row.querySelector('.weekly-estimate');
            const actualInput = row.querySelector('.weekly-actual');
            const paymentsDueText = row.querySelector('.weekly-payments-due')?.value || '';
            
            // Calculate payments due totals (estimated and actual)
            const paymentsEstimated = this.calculatePaymentsDueTotal(paymentsDueText, true);
            const paymentsActual = this.calculatePaymentsDueTotal(paymentsDueText, false);
            weeklyPaymentsTotal += paymentsEstimated;
            
            // Calculate variable cost totals for each category
            // For estimate column: use only base estimate (from tables, not user adjustments)
            // For actual column: use total from "=" line in textarea
            // For variable cost column totals: sum the "=" values (base + adjustments) from each row
            let rowVariableEstimated = 0;
            let rowVariableActual = 0;
            categories.forEach(category => {
                const categoryId = this.sanitizeCategoryId(category);
                const categoryClass = 'weekly-variable-' + categoryId;
                const categoryText = row.querySelector('.' + categoryClass)?.value || '';
                // For estimate: use only base estimate (first number, no adjustments)
                const categoryEstimated = this.calculateVariableCostBaseEstimate(categoryText);
                // For actual: use total from "=" line if available
                const categoryActual = this.calculateVariableCostTotal(categoryText, false);
                // For variable cost column totals: sum the total from "=" line (includes adjustments)
                const categoryTotal = this.calculateVariableCostTotal(categoryText, true);
                weeklyVariableCostsTotal[category] += categoryTotal;
                rowVariableEstimated += categoryEstimated;
                rowVariableActual += categoryActual;
            });
            
            // Calculate estimate (payments due estimated + all variable costs base estimates from tables)
            const rowEstimate = paymentsEstimated + rowVariableEstimated;
            if (estimateInput) {
                estimateInput.value = rowEstimate.toFixed(2);
            }
            // Calculate total directly from source data (more accurate than reading rounded input values)
            weeklyEstimateTotal += rowEstimate;
            
            // Calculate actual (payments due actual + all variable costs actual)
            const rowActual = paymentsActual + rowVariableActual;
            if (actualInput) {
                actualInput.value = rowActual.toFixed(2);
            }
            // Calculate total directly from source data (more accurate than reading rounded input values)
            weeklyActualTotal += rowActual;
        });
        
        // Set calculated totals - simple sums (one number per column)
        this.setElementHTML('weekly-breakdown-total-estimate', '<strong>' + Formatters.formatCurrency(weeklyEstimateTotal) + '</strong>');
        this.setElementHTML('weekly-breakdown-total-actual', '<strong>' + Formatters.formatCurrency(weeklyActualTotal) + '</strong>');
        this.setElementHTML('weekly-breakdown-total-payments', '<strong>' + Formatters.formatCurrency(weeklyPaymentsTotal) + '</strong>');
        
        // Set variable cost totals - simple sums (one number per column)
        categories.forEach(category => {
            const categoryId = 'weekly-breakdown-total-' + this.sanitizeCategoryId(category);
            const total = weeklyVariableCostsTotal[category];
            this.setElementHTML(categoryId, '<strong>' + Formatters.formatCurrency(total) + '</strong>');
        });
    },

    /**
     * Get current month data from form
     */
    getCurrentMonthDataFromForm() {
        const categories = this.getVariableCostCategories();
        const weeklyBreakdown = Array.from(document.querySelectorAll('#weekly-breakdown-tbody tr:not(.total-row)')).map(row => {
            const weekData = {
            dateRange: row.querySelector('.weekly-date-range')?.value || '',
            weekRange: row.querySelector('.weekly-date-range')?.value || '',
            paymentsDue: row.querySelector('.weekly-payments-due')?.value || '',
            estimate: Formatters.parseNumber(row.querySelector('.weekly-estimate')?.value),
            weeklyEstimate: Formatters.parseNumber(row.querySelector('.weekly-estimate')?.value),
            actual: Formatters.parseNumber(row.querySelector('.weekly-actual')?.value)
            };
            
            // Add dynamic variable cost columns
            categories.forEach(category => {
                const categoryId = this.sanitizeCategoryId(category);
                const categoryClass = 'weekly-variable-' + categoryId;
                const categoryValue = row.querySelector('.' + categoryClass)?.value || '';
                weekData[categoryClass] = categoryValue;
                weekData[category] = categoryValue; // Also store by category name for backwards compatibility
            });
            
            return weekData;
        });

        const fixedCosts = Array.from(document.querySelectorAll('#fixed-costs-tbody tr')).map(row => ({
            category: row.querySelector('.fixed-cost-category')?.value || '',
            estimatedAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-estimated')?.value),
            actualAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-actual')?.value),
            date: row.querySelector('.fixed-cost-date')?.value || '',
            card: row.querySelector('.fixed-cost-card')?.value || '',
            paid: row.querySelector('.fixed-cost-paid')?.checked || false,
            comments: row.querySelector('.fixed-cost-comments')?.value || ''
        }));

        const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr')).map(row => ({
            category: row.querySelector('.variable-cost-category')?.value || '',
            estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
            actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
            comments: row.querySelector('.variable-cost-comments')?.value || ''
        }));

        const unplannedExpenses = Array.from(document.querySelectorAll('#unplanned-expenses-tbody tr')).map(row => ({
            name: row.querySelector('.unplanned-name')?.value || '',
            amount: Formatters.parseNumber(row.querySelector('.unplanned-amount')?.value),
            date: row.querySelector('.unplanned-date')?.value || '',
            card: row.querySelector('.unplanned-card')?.value || '',
            status: row.querySelector('.unplanned-status')?.value || '',
            comments: row.querySelector('.unplanned-comments')?.value || ''
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
            description: row.querySelector('.income-description')?.value || '',
            comments: row.querySelector('.income-comments')?.value || ''
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
            const monthTitleWrapper = document.getElementById('month-title-wrapper');
            const monthSelectorWrapper = document.getElementById('month-selector-wrapper');
            if (monthContent) monthContent.style.display = 'none';
            if (noMonthMessage) noMonthMessage.style.display = 'block';
            if (monthTitleWrapper) monthTitleWrapper.style.display = 'none';
            if (monthSelectorWrapper) monthSelectorWrapper.style.display = 'block';

            this.loadMonthSelector();

            const allMonths = DataManager.getAllMonths();
            const monthKeys = Object.keys(allMonths).sort().reverse();
            if (monthKeys.length > 0) {
                this.loadMonth(monthKeys[0]);
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
     * Populate copy month selectors with all available months (excluding current)
     */
    populateCopyMonthSelectors() {
        if (!this.currentMonthKey) return;

        const allMonths = DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths)
            .filter(key => key !== this.currentMonthKey)
            .sort()
            .reverse();

        const optionsHtml = monthKeys.length > 0 
            ? monthKeys.map(key => {
                const monthData = allMonths[key];
                const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                return `<option value="${key}">${monthName} ${monthData.year}</option>`;
            }).join('')
            : '<option value="">No other months available</option>';

        // Populate all copy selectors
        const selectors = [
            'copy-income-from-month',
            'copy-fixed-costs-from-month',
            'copy-variable-costs-from-month',
            'copy-unplanned-from-month'
        ];

        selectors.forEach(selectorId => {
            const selector = document.getElementById(selectorId);
            if (selector) {
                selector.innerHTML = '<option value="">Select month to copy...</option>' + optionsHtml;
            }
        });
    },

    /**
     * Copy income data from selected month
     */
    copyIncomeFromMonth() {
        const selector = document.getElementById('copy-income-from-month');
        if (!selector || !selector.value) {
            alert('Please select a month to copy from');
            return;
        }

        const sourceMonthKey = selector.value;
        const sourceMonthData = DataManager.getMonth(sourceMonthKey);
        
        if (!sourceMonthData) {
            alert('Source month not found');
            return;
        }

        const sourceIncome = sourceMonthData.income || sourceMonthData.incomeSources || [];
        
        if (sourceIncome.length === 0) {
            alert('No income data found in the selected month');
            return;
        }

        // Clear current income
        const tbody = document.getElementById('income-tbody');
        if (tbody) tbody.innerHTML = '';

        // Load source income
        this.loadIncomeSources(sourceIncome);
        
        // Update current month data
        if (!this.currentMonthData.income) {
            this.currentMonthData.income = {};
        }
        this.currentMonthData.incomeSources = sourceIncome;
        
        alert(`Copied ${sourceIncome.length} income source(s) from ${sourceMonthData.monthName} ${sourceMonthData.year}`);
        this.updateCalculations();
    },

    /**
     * Copy fixed costs from selected month
     */
    copyFixedCostsFromMonth() {
        const selector = document.getElementById('copy-fixed-costs-from-month');
        if (!selector || !selector.value) {
            alert('Please select a month to copy from');
            return;
        }

        const sourceMonthKey = selector.value;
        const sourceMonthData = DataManager.getMonth(sourceMonthKey);
        
        if (!sourceMonthData) {
            alert('Source month not found');
            return;
        }

        const sourceFixedCosts = sourceMonthData.fixedCosts || [];
        
        if (sourceFixedCosts.length === 0) {
            alert('No fixed costs found in the selected month');
            return;
        }

        // Clear current fixed costs
        const tbody = document.getElementById('fixed-costs-tbody');
        if (tbody) tbody.innerHTML = '';

        // Load source fixed costs
        this.loadFixedCosts(sourceFixedCosts);
        
        // Update current month data
        this.currentMonthData.fixedCosts = sourceFixedCosts;
        
        // Repopulate working section with new fixed costs
        this.populateWorkingSectionFromCosts();
        
        alert(`Copied ${sourceFixedCosts.length} fixed cost(s) from ${sourceMonthData.monthName} ${sourceMonthData.year}`);
        this.updateCalculations();
    },

    /**
     * Copy variable costs from selected month
     */
    copyVariableCostsFromMonth() {
        const selector = document.getElementById('copy-variable-costs-from-month');
        if (!selector || !selector.value) {
            alert('Please select a month to copy from');
            return;
        }

        const sourceMonthKey = selector.value;
        const sourceMonthData = DataManager.getMonth(sourceMonthKey);
        
        if (!sourceMonthData) {
            alert('Source month not found');
            return;
        }

        const sourceVariableCosts = sourceMonthData.variableCosts || [];
        
        if (sourceVariableCosts.length === 0) {
            alert('No variable costs found in the selected month');
            return;
        }

        // Clear current variable costs
        const tbody = document.getElementById('variable-costs-tbody');
        if (tbody) tbody.innerHTML = '';

        // Load source variable costs
        this.loadVariableCosts(sourceVariableCosts);
        
        // Update current month data
        this.currentMonthData.variableCosts = sourceVariableCosts;
        
        // Repopulate working section with new variable costs
        this.populateWorkingSectionFromCosts();
        
        alert(`Copied ${sourceVariableCosts.length} variable cost(s) from ${sourceMonthData.monthName} ${sourceMonthData.year}`);
        this.updateCalculations();
    },

    /**
     * Copy unplanned expenses from selected month
     */
    copyUnplannedExpensesFromMonth() {
        const selector = document.getElementById('copy-unplanned-from-month');
        if (!selector || !selector.value) {
            alert('Please select a month to copy from');
            return;
        }

        const sourceMonthKey = selector.value;
        const sourceMonthData = DataManager.getMonth(sourceMonthKey);
        
        if (!sourceMonthData) {
            alert('Source month not found');
            return;
        }

        const sourceUnplanned = sourceMonthData.unplannedExpenses || [];
        
        if (sourceUnplanned.length === 0) {
            alert('No unplanned expenses found in the selected month');
            return;
        }

        // Clear current unplanned expenses
        const tbody = document.getElementById('unplanned-expenses-tbody');
        if (tbody) tbody.innerHTML = '';

        // Load source unplanned expenses
        this.loadUnplannedExpenses(sourceUnplanned);
        
        // Update current month data
        this.currentMonthData.unplannedExpenses = sourceUnplanned;
        
        alert(`Copied ${sourceUnplanned.length} unplanned expense(s) from ${sourceMonthData.monthName} ${sourceMonthData.year}`);
        this.updateCalculations();
    },

    /**
     * Calculate total from payments due textarea
     * Parses amounts from format: "Category: £Amount (Card) ✓"
     */
    /**
     * Calculate total from payments due textarea
     * Parses amounts from format: "Category: £Amount (Card) ✓" or "Category: £Amount [Actual: £Amount]"
     * @param {boolean} estimatedOnly - If true, only count estimated amounts. If false, only count actual amounts.
     */
    calculatePaymentsDueTotal(paymentsDueText, estimatedOnly = true) {
        if (!paymentsDueText || !paymentsDueText.trim()) return 0;
        
        let total = 0;
        const lines = paymentsDueText.split('\n');
        const currencySymbol = Formatters.formatCurrency(0).charAt(0); // Get currency symbol (usually £)
        const escapedSymbol = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        lines.forEach(line => {
            if (!line.trim()) return;
            
            // Remove any "---" separators from the line
            const cleanedLine = line.replace(/---+/g, '').trim();
            if (!cleanedLine) return;
            
            // Check if line has actual amount in format: "Category: £Amount [Actual: £Amount]"
            const actualMatch = cleanedLine.match(/\[Actual:\s*([^\]]+)\]/i);
            
            if (estimatedOnly) {
                // Extract estimated amount (first amount, or amount before [Actual:])
                const beforeActual = actualMatch ? cleanedLine.split('[')[0] : cleanedLine;
                const amountRegex = new RegExp(`${escapedSymbol}([\\d,]+(?:\\.\\d{2})?)`, 'g');
                const matches = beforeActual.match(amountRegex);
                
                if (matches && matches.length > 0) {
                    const amountStr = matches[0].replace(currencySymbol, '').replace(/,/g, '');
                    const amount = parseFloat(amountStr);
                    if (!isNaN(amount) && amount > 0) {
                        total += amount;
                    }
                }
            } else {
                // Extract actual amount if present
                if (actualMatch) {
                    const actualText = actualMatch[1];
                    const amountRegex = new RegExp(`${escapedSymbol}([\\d,]+(?:\\.\\d{2})?)`, 'g');
                    const matches = actualText.match(amountRegex);
                    
                    if (matches && matches.length > 0) {
                        const amountStr = matches[0].replace(currencySymbol, '').replace(/,/g, '');
                        const amount = parseFloat(amountStr);
                        if (!isNaN(amount) && amount > 0) {
                            total += amount;
                        }
                    }
                }
            }
        });
        
        return total;
    },

    /**
     * Calculate base estimate from variable cost textarea (for estimate column)
     * Returns only the base estimate value, ignoring user adjustments
     * This ensures the estimate column always uses values from the tables, not user adjustments
     */
    calculateVariableCostBaseEstimate(variableCostText) {
        if (!variableCostText || !variableCostText.trim()) return 0;
        
        const lines = variableCostText.split('\n');
        const contentLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('=');
        });
        
        if (contentLines.length === 0) return 0;
        
        // Parse first line - extract only the base number (before any + or -)
        const firstLine = contentLines[0]?.trim() || '0';
        const baseMatch = firstLine.match(/^([\d.]+)/);
        if (baseMatch) {
            return Formatters.parseNumber(baseMatch[1]);
        }
        
        return Formatters.parseNumber(firstLine);
    },

    /**
     * Calculate total from variable cost textarea
     * Parses amounts from format: "Estimate: £Amount" or "Estimate: £Amount [Actual: £Amount]"
     * @param {boolean} estimatedOnly - If true, only count estimated amounts. If false, only count actual amounts.
     */
    calculateVariableCostTotal(variableCostText, estimatedOnly = true) {
        if (!variableCostText || !variableCostText.trim()) return 0;
        
        const lines = variableCostText.split('\n');
        const contentLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('=');
        });
        
        if (contentLines.length === 0) return 0;
        
        // Parse first line - may contain base estimate and inline adjustments (e.g., "40.00+5-10")
        const firstLine = contentLines[0]?.trim() || '0';
        let baseEstimate = 0;
        let adjustmentsTotal = 0;
        
        // Check if first line contains inline adjustments (has + or - after a number)
        const inlineAdjustmentMatch = firstLine.match(/^([\d.]+)([+\-].*)$/);
        if (inlineAdjustmentMatch) {
            // First line has inline adjustments
            baseEstimate = Formatters.parseNumber(inlineAdjustmentMatch[1]);
            const adjustmentsStr = inlineAdjustmentMatch[2];
            
            // Parse all inline adjustments (e.g., "+5-10+3" -> [+5, -10, +3])
            const adjustmentMatches = adjustmentsStr.match(/[+\-][\d.]+/g);
            if (adjustmentMatches) {
                adjustmentMatches.forEach(match => {
                    if (match.startsWith('+')) {
                        adjustmentsTotal += Formatters.parseNumber(match.substring(1));
                    } else if (match.startsWith('-')) {
                        adjustmentsTotal -= Formatters.parseNumber(match.substring(1));
                    }
                });
            }
        } else {
            // First line is just a number (base estimate)
            baseEstimate = Formatters.parseNumber(firstLine);
        }
        
        // For estimated, return base estimate + adjustments
        // For actual, we'll use the total from the "=" line if it exists, otherwise base + adjustments
        if (estimatedOnly) {
            let total = baseEstimate + adjustmentsTotal;
            
            // Parse adjustments on separate lines (lines starting with + or -)
            for (let i = 1; i < contentLines.length; i++) {
                const line = contentLines[i].trim();
                if (line.startsWith('+')) {
                    const value = Formatters.parseNumber(line.substring(1));
                    total += value;
                } else if (line.startsWith('-')) {
                    const value = Formatters.parseNumber(line.substring(1));
                    total -= value;
                } else if (/^[\d.]+$/.test(line)) {
                    // Also handle plain numbers as adjustments
                    const value = Formatters.parseNumber(line);
                    total += value;
                }
            }
            
            return total;
        } else {
            // For actual, check if there's a total line with "="
            const totalLine = lines.find(line => line.trim().startsWith('='));
            if (totalLine) {
                // Extract amount from "= £Amount" format
                const currencySymbol = Formatters.formatCurrency(0).charAt(0);
                const escapedSymbol = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const amountRegex = new RegExp(`${escapedSymbol}([\\d,]+(?:\\.\\d{2})?)`, 'g');
                const matches = totalLine.match(amountRegex);
                if (matches && matches.length > 0) {
                    const amountStr = matches[0].replace(currencySymbol, '').replace(/,/g, '');
                    const amount = parseFloat(amountStr);
                    if (!isNaN(amount)) {
                        return amount;
                    }
                }
            }
            
            // Fallback: calculate from base + adjustments (same as estimated)
            let total = baseEstimate + adjustmentsTotal;
            for (let i = 1; i < contentLines.length; i++) {
                const line = contentLines[i].trim();
                if (line.startsWith('+')) {
                    const value = Formatters.parseNumber(line.substring(1));
                    total += value;
                } else if (line.startsWith('-')) {
                    const value = Formatters.parseNumber(line.substring(1));
                    total -= value;
                } else if (/^[\d.]+$/.test(line)) {
                    const value = Formatters.parseNumber(line);
                    total += value;
                }
            }
            
            return total;
        }
    },

    /**
     * Update the total line at the bottom of a variable cost textarea
     * Format: base estimate + adjustments = total
     */
    updateVariableCostTotal(textarea) {
        if (!textarea) return;
        
        const content = textarea.value || '';
        const lines = content.split('\n');
        
        // Remove existing total line (lines starting with "=")
        const contentLines = lines.filter(line => !line.trim().startsWith('='));
        
        if (contentLines.length === 0) return;
        
        // Parse first line - may contain base estimate and inline adjustments (e.g., "40.00+5-10")
        const firstLine = contentLines[0]?.trim() || '0';
        let baseEstimate = 0;
        let adjustmentsTotal = 0;
        
        // Check if first line contains inline adjustments (has + or - after a number)
        const inlineAdjustmentMatch = firstLine.match(/^([\d.]+)([+\-].*)$/);
        if (inlineAdjustmentMatch) {
            // First line has inline adjustments
            baseEstimate = Formatters.parseNumber(inlineAdjustmentMatch[1]);
            const adjustmentsStr = inlineAdjustmentMatch[2];
            
            // Parse all inline adjustments (e.g., "+5-10+3" -> [+5, -10, +3])
            const adjustmentMatches = adjustmentsStr.match(/[+\-][\d.]+/g);
            if (adjustmentMatches) {
                adjustmentMatches.forEach(match => {
                    if (match.startsWith('+')) {
                        adjustmentsTotal += Formatters.parseNumber(match.substring(1));
                    } else if (match.startsWith('-')) {
                        adjustmentsTotal -= Formatters.parseNumber(match.substring(1));
                    }
                });
            }
        } else {
            // First line is just a number (base estimate)
            baseEstimate = Formatters.parseNumber(firstLine);
        }
        
        // Parse adjustments on separate lines (lines starting with + or -)
        for (let i = 1; i < contentLines.length; i++) {
            const line = contentLines[i].trim();
            if (line.startsWith('+')) {
                const value = Formatters.parseNumber(line.substring(1));
                adjustmentsTotal += value;
            } else if (line.startsWith('-')) {
                const value = Formatters.parseNumber(line.substring(1));
                adjustmentsTotal -= value;
            } else if (/^[\d.]+$/.test(line)) {
                // Also handle plain numbers as adjustments
                const value = Formatters.parseNumber(line);
                adjustmentsTotal += value;
            }
        }
        
        // Calculate total: base estimate + all adjustments
        const total = baseEstimate + adjustmentsTotal;
        
        // Build new content with calculated total line
        let newContent = contentLines.join('\n');
        const totalLine = '= ' + Formatters.formatCurrency(total);
        newContent += '\n' + totalLine;
        
        // Check if total has changed
        const currentTotalLine = lines.find(line => line.trim().startsWith('='));
        const newTotalLine = totalLine.trim();
        const totalChanged = !currentTotalLine || currentTotalLine.trim() !== newTotalLine;
        
        // Always update to ensure total is correct, but only if it changed to avoid unnecessary DOM updates
        if (totalChanged || !currentTotalLine) {
            // Save cursor position before updating
            const wasFocused = document.activeElement === textarea;
            const cursorPos = textarea.selectionStart;
            const oldContent = textarea.value;
            const contentBeforeTotal = contentLines.join('\n');
            
            // Calculate where cursor should be after update
            // If cursor was in the content (not in total line), preserve position
            const oldContentBeforeTotal = oldContent.split('\n').filter(l => !l.trim().startsWith('=')).join('\n');
            const cursorInContent = cursorPos <= oldContentBeforeTotal.length;
            
            // Update textarea
            textarea.value = newContent;
            
            // Restore cursor position if textarea was focused and cursor was in content (not in total line)
            if (wasFocused && cursorInContent) {
                // Use requestAnimationFrame for smoother cursor restoration
                requestAnimationFrame(() => {
                    if (document.activeElement === textarea || wasFocused) {
                        textarea.focus();
                        // Try to preserve cursor position relative to content
                        const newPos = Math.min(cursorPos, contentBeforeTotal.length);
                        if (newPos >= 0 && newPos <= textarea.value.length) {
                            textarea.setSelectionRange(newPos, newPos);
                        }
                    }
                });
            }
        }
    },

    /**
     * Auto-size textarea based on content
     * Sets width to longest line and height to number of rows
     */
    autoSizeTextarea(textarea) {
        if (!textarea) return;
        
        // Get the content
        const content = textarea.value || '';
        if (!content.trim()) {
            // Reset to default if empty
            textarea.style.width = '';
            textarea.style.height = '';
            textarea.rows = 4;
            return;
        }
        
        const lines = content.split('\n');
        
        // Create a temporary element to measure text width
        const temp = document.createElement('div');
        const computedStyle = window.getComputedStyle(textarea);
        temp.style.visibility = 'hidden';
        temp.style.position = 'absolute';
        temp.style.whiteSpace = 'pre';
        temp.style.font = computedStyle.font;
        temp.style.fontSize = computedStyle.fontSize;
        temp.style.fontFamily = computedStyle.fontFamily;
        temp.style.fontWeight = computedStyle.fontWeight;
        temp.style.padding = computedStyle.padding;
        temp.style.border = computedStyle.border;
        temp.style.boxSizing = computedStyle.boxSizing;
        document.body.appendChild(temp);
        
        // Find the longest line
        let maxWidth = 0;
        lines.forEach(line => {
            temp.textContent = line || ' ';
            const width = temp.offsetWidth;
            maxWidth = Math.max(maxWidth, width);
        });
        
        document.body.removeChild(temp);
        
        // Set width to longest line + some padding (no wrapping)
        const padding = 30; // Extra padding for scrollbar and comfort
        const minWidth = 200;
        const maxWidthLimit = textarea.parentElement ? textarea.parentElement.offsetWidth - 20 : 800;
        const calculatedWidth = Math.min(Math.max(maxWidth + padding, minWidth), maxWidthLimit);
        textarea.style.width = calculatedWidth + 'px';
        textarea.style.whiteSpace = 'pre'; // Preserve formatting, prevent wrapping
        textarea.style.overflowX = 'auto'; // Allow horizontal scroll if needed
        textarea.style.overflowY = 'auto'; // Allow vertical scroll if needed
        textarea.style.wordWrap = 'normal'; // Prevent word wrapping
        textarea.style.overflowWrap = 'normal'; // Prevent overflow wrapping
        
        // Set height based on number of lines
        const lineHeight = parseInt(computedStyle.lineHeight) || 20;
        const paddingTop = parseInt(computedStyle.paddingTop) || 0;
        const paddingBottom = parseInt(computedStyle.paddingBottom) || 0;
        const borderTop = parseInt(computedStyle.borderTopWidth) || 0;
        const borderBottom = parseInt(computedStyle.borderBottomWidth) || 0;
        const minRows = 1;
        const rows = Math.max(minRows, lines.length);
        const totalHeight = (rows * lineHeight) + paddingTop + paddingBottom + borderTop + borderBottom;
        textarea.style.height = totalHeight + 'px';
        textarea.rows = rows;
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

