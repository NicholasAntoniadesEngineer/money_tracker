/**
 * Landing Page Controller
 * Handles the landing page view logic including financial overview
 * @module controllers/LandingController
 */

const LandingController = {
    /**
     * Initialize the landing page
     * @returns {Promise<void>}
     */
    async init() {
        await this.ensureCurrentMonthExists();
        await this.loadOverviewData();
        this.setupEventListeners();
    },

    /**
     * Ensure current month exists, create if not
     * Runs silently before loading overview data for seamless user experience
     * @returns {Promise<void>}
     */
    async ensureCurrentMonthExists() {
        try {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth() + 1; // JS months are 0-indexed
            const currentMonthKey = MonthFactory.generateMonthKey(currentYear, currentMonth);

            console.log('[LandingController] Checking if current month exists:', currentMonthKey);

            // Check if month already exists
            const existingMonth = await DataManager.getMonth(currentMonthKey);

            if (!existingMonth) {
                console.log('[LandingController] Current month does not exist, creating:', currentMonthKey);
                await DataManager.createNewMonth(currentYear, currentMonth);
                console.log('[LandingController] Current month created successfully:', currentMonthKey);
            } else {
                console.log('[LandingController] Current month already exists:', currentMonthKey);
            }
        } catch (error) {
            // Log but don't throw - this should not block the page from loading
            console.error('[LandingController] Error ensuring current month exists:', error);
        }
    },

    /**
     * Load and display overview data including summary cards, month cards, and trends
     * @returns {Promise<void>}
     */
    async loadOverviewData() {
        const allMonths = await DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths).sort();

        if (monthKeys.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Store all months data for pie chart selection
        this._allMonthsRaw = allMonths;

        let overallSavingsTotal = 0;

        // Collect month data for rendering
        const monthsData = [];

        monthKeys.forEach(monthKey => {
            const monthData = allMonths[monthKey];
            const totals = DataManager.calculateMonthTotals(monthData);

            overallSavingsTotal += totals.savings.actual;

            const monthDisplayName = monthData.monthName || DataManager.getMonthName(monthData.month);

            monthsData.push({
                monthKey,
                monthDisplayName,
                year: monthData.year,
                savingsEstimate: totals.savings.estimated,
                savingsActual: totals.savings.actual,
                totals
            });
        });

        // Sort months: current month first, then by date descending
        const now = new Date();
        const currentMonthKey = MonthFactory.generateMonthKey(now.getFullYear(), now.getMonth() + 1);

        monthsData.sort((a, b) => {
            // Current month always first
            if (a.monthKey === currentMonthKey) return -1;
            if (b.monthKey === currentMonthKey) return 1;
            // Then by date descending (newest first)
            return b.monthKey.localeCompare(a.monthKey);
        });

        // Store for all savings modal
        this._allMonthsData = monthsData;

        // Set initial selected month to current month (or first available)
        this._selectedMonthKey = monthsData.length > 0 ? monthsData[0].monthKey : null;

        // Render savings by month table
        this.renderSavingsTable(monthsData);

        // Render month cards
        this.renderMonthCards(monthsData);

        // Update prominent savings display
        const totalSavingsDisplay = document.getElementById('total-savings-display');
        if (totalSavingsDisplay) {
            totalSavingsDisplay.textContent = Formatters.formatCurrency(overallSavingsTotal);
            totalSavingsDisplay.className = 'savings-amount' + (overallSavingsTotal < 0 ? ' negative' : '');
        }

        // Render expense breakdown pie chart for selected month
        this.updatePieChartForMonth(this._selectedMonthKey);

        this.renderTrends(monthKeys, allMonths);

        // Render expenses calendar for current month
        const currentMonthData = allMonths[currentMonthKey];

        if (currentMonthData) {
            this.renderExpensesCalendar(currentMonthData);
        } else {
            console.log('[LandingController] No current month data for calendar');
            this.renderCalendarEmptyState();
        }
    },

    /**
     * Get category totals for a specific month
     * @param {string} monthKey - Month key to get categories for
     * @returns {Object} Category totals
     */
    getCategoryTotalsForMonth(monthKey) {
        const categoryTotals = {};
        const monthData = this._allMonthsRaw[monthKey];

        if (!monthData) return categoryTotals;

        if (monthData.fixedCosts && Array.isArray(monthData.fixedCosts)) {
            monthData.fixedCosts.forEach(cost => {
                const category = cost.category || 'Other Fixed';
                const amount = parseFloat(cost.actualAmount || 0);
                categoryTotals[category] = (categoryTotals[category] || 0) + amount;
            });
        }

        if (monthData.variableCosts && Array.isArray(monthData.variableCosts)) {
            monthData.variableCosts.forEach(cost => {
                const category = cost.category || 'Other Variable';
                const amount = parseFloat(cost.actualSpent || cost.actualAmount || 0);
                categoryTotals[category] = (categoryTotals[category] || 0) + amount;
            });
        }

        if (monthData.unplannedExpenses && Array.isArray(monthData.unplannedExpenses)) {
            monthData.unplannedExpenses.forEach(expense => {
                const amount = parseFloat(expense.amount || 0);
                categoryTotals['Unplanned'] = (categoryTotals['Unplanned'] || 0) + amount;
            });
        }

        return categoryTotals;
    },

    /**
     * Update pie chart for a specific month
     * @param {string} monthKey - Month key to display
     */
    updatePieChartForMonth(monthKey) {
        this._selectedMonthKey = monthKey;
        const categoryTotals = this.getCategoryTotalsForMonth(monthKey);
        this.renderExpensePieChart(categoryTotals);

        // Update section title to show selected month
        const monthData = this._allMonthsData.find(m => m.monthKey === monthKey);
        const sectionTitle = document.querySelector('#expense-breakdown-section .section-title');
        if (sectionTitle && monthData) {
            sectionTitle.textContent = `Expense Breakdown - ${monthData.monthDisplayName} ${monthData.year}`;
        }

        // Update table row highlighting
        this.updateSavingsTableSelection();
    },

    /**
     * Update savings table to highlight selected month
     */
    updateSavingsTableSelection() {
        const tbody = document.getElementById('savings-by-month-tbody');
        if (!tbody) return;

        tbody.querySelectorAll('tr').forEach(row => {
            const monthKey = row.dataset.monthKey;
            // When "all" is selected via checkbox, no row should be highlighted
            const isSelected = this._selectedMonthKey !== 'all' && monthKey === this._selectedMonthKey;
            row.classList.toggle('selected', isSelected);
        });
    },

    /**
     * Render savings by month table
     * @param {Array} monthsData - Array of month data objects
     */
    renderSavingsTable(monthsData) {
        const tbody = document.getElementById('savings-by-month-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        monthsData.forEach(data => {
            const row = document.createElement('tr');
            const isPositive = data.savingsActual >= 0;
            row.className = 'savings-row-clickable';
            row.dataset.monthKey = data.monthKey;

            if (data.monthKey === this._selectedMonthKey && this._selectedMonthKey !== 'all') {
                row.classList.add('selected');
            }

            row.innerHTML = `
                <td><strong>${data.monthDisplayName} ${data.year}</strong></td>
                <td>${Formatters.formatCurrency(data.savingsEstimate)}</td>
                <td class="${isPositive ? 'text-positive' : 'text-negative'}">${Formatters.formatCurrency(data.savingsActual)}</td>
            `;

            row.addEventListener('click', () => {
                // Uncheck the "all months" checkbox when selecting a specific month
                const checkbox = document.getElementById('all-months-checkbox');
                if (checkbox) checkbox.checked = false;
                this.updatePieChartForMonth(data.monthKey);
            });
            tbody.appendChild(row);
        });

        // Setup checkbox handler
        this.setupAllMonthsCheckbox();

        console.log('[Landing] Savings table rendered with', monthsData.length, 'months');
    },

    /**
     * Setup the "All Months" checkbox handler
     */
    setupAllMonthsCheckbox() {
        const checkbox = document.getElementById('all-months-checkbox');
        if (!checkbox) return;

        // Set initial state
        checkbox.checked = this._selectedMonthKey === 'all';

        // Remove old listener and add new one
        checkbox.onchange = () => {
            if (checkbox.checked) {
                this.selectAllMonths();
            } else {
                // Select the first month (current month)
                if (this._allMonthsData && this._allMonthsData.length > 0) {
                    this.updatePieChartForMonth(this._allMonthsData[0].monthKey);
                }
            }
        };
    },

    /**
     * Select all months for pie chart display
     */
    selectAllMonths() {
        this._selectedMonthKey = 'all';

        // Check the checkbox
        const checkbox = document.getElementById('all-months-checkbox');
        if (checkbox) checkbox.checked = true;

        // Aggregate all months
        const categoryTotals = {};
        Object.keys(this._allMonthsRaw).forEach(monthKey => {
            const monthTotals = this.getCategoryTotalsForMonth(monthKey);
            Object.entries(monthTotals).forEach(([category, amount]) => {
                categoryTotals[category] = (categoryTotals[category] || 0) + amount;
            });
        });

        this.renderExpensePieChart(categoryTotals);

        // Update section title
        const sectionTitle = document.querySelector('#expense-breakdown-section .section-title');
        if (sectionTitle) {
            sectionTitle.textContent = 'Expense Breakdown - All Months';
        }

        // Update table row highlighting (remove all selections when "all" is selected)
        this.updateSavingsTableSelection();
    },

    /**
     * Render month cards with green/red coloring based on savings
     * @param {Array} monthsData - Array of month data objects
     */
    renderMonthCards(monthsData) {
        const container = document.getElementById('month-cards-container');
        if (!container) return;

        container.innerHTML = '';

        monthsData.forEach(data => {
            const isPositive = data.savingsActual >= 0;
            const card = document.createElement('a');
            card.href = `${window.Header.getModulePath('monthlyBudget')}monthlyBudget.html?month=${data.monthKey}`;
            card.className = `month-savings-card ${isPositive ? 'positive' : 'negative'}`;

            card.innerHTML = `
                <div class="month-card-header">
                    <span class="month-card-name">${data.monthDisplayName}</span>
                    <span class="month-card-year">${data.year}</span>
                </div>
                <div class="month-card-body">
                    <div class="month-card-row">
                        <span class="month-card-label">Estimate</span>
                        <span class="month-card-value">${Formatters.formatCurrency(data.savingsEstimate)}</span>
                    </div>
                    <div class="month-card-row">
                        <span class="month-card-label">Actual</span>
                        <span class="month-card-value month-card-actual">${Formatters.formatCurrency(data.savingsActual)}</span>
                    </div>
                </div>
                <div class="month-card-indicator">
                    <i class="fas fa-${isPositive ? 'arrow-up' : 'arrow-down'}"></i>
                </div>
            `;

            container.appendChild(card);
        });

        console.log('[Landing] Month cards rendered with', monthsData.length, 'cards');
    },

    /**
     * Render expense breakdown pie chart with specific categories
     * @param {Object} categoryTotals - Object with category names as keys and totals as values
     */
    renderExpensePieChart(categoryTotals) {
        const svg = document.getElementById('expense-pie-chart');
        const legend = document.getElementById('expense-legend');
        const section = document.getElementById('expense-breakdown-section');

        // Sort categories by amount and take top categories
        const sortedCategories = Object.entries(categoryTotals)
            .filter(([_, amount]) => amount > 0)
            .sort((a, b) => b[1] - a[1]);

        const total = sortedCategories.reduce((sum, [_, amount]) => sum + amount, 0);

        // Store for modal - keep all categories, not just display categories
        this._expenseCategories = sortedCategories;
        this._expenseTotal = total;

        if (!svg || !legend || total === 0 || sortedCategories.length === 0) {
            if (legend) {
                legend.innerHTML = '<p class="text-muted">No expense data available</p>';
            }
            return;
        }

        // Make the section clickable
        if (section) {
            section.classList.add('expense-section-clickable');
            section.addEventListener('click', () => this.showExpenseBreakdownModal());
        }

        // Color palette for categories
        const colorPalette = [
            '#5B7B9A', // Muted blue (action)
            '#7BAB8A', // Sage green
            '#D4A574', // Warm tan
            '#A67C94', // Dusty rose
            '#8B9DC3', // Periwinkle
            '#C4A35A', // Ochre
            '#6B8E8E', // Teal grey
            '#B88B8B', // Dusty pink
            '#7A9E7A', // Forest green
            '#9B8AA6', // Lavender grey
        ];

        // Group small categories into "Other" if more than 8 categories
        let displayCategories = sortedCategories;
        if (sortedCategories.length > 8) {
            const topCategories = sortedCategories.slice(0, 7);
            const otherTotal = sortedCategories.slice(7).reduce((sum, [_, amount]) => sum + amount, 0);
            displayCategories = [...topCategories, ['Other', otherTotal]];
        }

        // Create pie chart paths using SVG
        let cumulativePercent = 0;
        const radius = 40;
        const centerX = 50;
        const centerY = 50;

        const getCoordinatesForPercent = (percent) => {
            const x = centerX + radius * Math.cos(2 * Math.PI * percent / 100 - Math.PI / 2);
            const y = centerY + radius * Math.sin(2 * Math.PI * percent / 100 - Math.PI / 2);
            return [x, y];
        };

        const createSlice = (startPercent, slicePercent, color) => {
            if (slicePercent <= 0) return '';
            if (slicePercent >= 100) {
                return `<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="${color}" />`;
            }

            const [startX, startY] = getCoordinatesForPercent(startPercent);
            const [endX, endY] = getCoordinatesForPercent(startPercent + slicePercent);
            const largeArcFlag = slicePercent > 50 ? 1 : 0;

            return `<path d="M ${centerX} ${centerY} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z" fill="${color}" />`;
        };

        let svgContent = '';
        let legendContent = '';

        displayCategories.forEach(([category, amount], index) => {
            const percent = (amount / total) * 100;
            const color = colorPalette[index % colorPalette.length];

            if (percent > 0) {
                svgContent += createSlice(cumulativePercent, percent, color);
                cumulativePercent += percent;

                legendContent += `
                    <div class="legend-item">
                        <span class="legend-color" style="background: ${color}"></span>
                        <span class="legend-label">${category}</span>
                        <span class="legend-value">${percent.toFixed(1)}%</span>
                    </div>
                `;
            }
        });

        svg.innerHTML = svgContent || '<circle cx="50" cy="50" r="40" fill="var(--color-bg-surface)" />';
        legend.innerHTML = legendContent;

        console.log('[Landing] Expense pie chart rendered with', displayCategories.length, 'categories');
    },

    /**
     * Render empty state when no months exist
     * @returns {void}
     */
    renderEmptyState() {
        const savingsTableBody = document.getElementById('savings-by-month-tbody');
        const monthCardsContainer = document.getElementById('month-cards-container');
        const trendsContainer = document.getElementById('trends-container');

        if (savingsTableBody) {
            savingsTableBody.innerHTML = '<tr><td colspan="3" class="empty-message text-center">No monthly data available.</td></tr>';
        }
        if (monthCardsContainer) {
            monthCardsContainer.innerHTML = '<p class="empty-message">No monthly data available. Create a month to get started.</p>';
        }
        if (trendsContainer) {
            trendsContainer.innerHTML = '<p class="empty-message">No data available for trends analysis.</p>';
        }
    },

    /**
     * Render trends analysis
     * @param {Array<string>} monthKeys - Sorted array of month keys
     * @param {Object} allMonths - Object containing all month data
     * @returns {void}
     */
    renderTrends(monthKeys, allMonths) {
        const trendsContainer = document.getElementById('trends-container');
        if (!trendsContainer) return;
        
        if (monthKeys.length < 2) {
            trendsContainer.innerHTML = '<p class="empty-message">Need at least 2 months of data to show trends.</p>';
            return;
        }

        const incomeTrend = this.calculateTrend(monthKeys, allMonths, 'income');
        const expensesTrend = this.calculateTrend(monthKeys, allMonths, 'expenses');
        const savingsTrend = this.calculateTrend(monthKeys, allMonths, 'savings');

        trendsContainer.innerHTML = `
            <div class="trend-item">
                <h3>Income Trend</h3>
                <p>Average monthly income: ${Formatters.formatCurrency(incomeTrend.average)}</p>
                <p>Trend: ${incomeTrend.direction} ${incomeTrend.percentage > 0 ? '+' : ''}${incomeTrend.percentage.toFixed(1)}%</p>
            </div>
            <div class="trend-item">
                <h3>Expenses Trend</h3>
                <p>Average monthly expenses: ${Formatters.formatCurrency(expensesTrend.average)}</p>
                <p>Trend: ${expensesTrend.direction} ${expensesTrend.percentage > 0 ? '+' : ''}${expensesTrend.percentage.toFixed(1)}%</p>
            </div>
            <div class="trend-item">
                <h3>Savings Trend</h3>
                <p>Average monthly savings: ${Formatters.formatCurrency(savingsTrend.average)}</p>
                <p>Trend: ${savingsTrend.direction} ${savingsTrend.percentage > 0 ? '+' : ''}${savingsTrend.percentage.toFixed(1)}%</p>
            </div>
        `;
    },

    /**
     * Calculate trend for a specific metric
     * @param {Array<string>} monthKeys - Sorted array of month keys
     * @param {Object} allMonths - Object containing all month data
     * @param {string} metricType - Type of metric ('income', 'expenses', 'savings')
     * @returns {Object} Trend data with average, percentage, and direction
     */
    calculateTrend(monthKeys, allMonths, metricType) {
        if (!window.CalculationService) {
            throw new Error('CalculationService not available');
        }
        return window.CalculationService.calculateTrend(monthKeys, allMonths, metricType);
    },

    /**
     * Setup event listeners
     * @returns {void}
     */
    setupEventListeners() {
        console.log('[LandingController] Setting up event listeners...');
        const addMonthButton = document.getElementById('add-new-month-button');
        console.log('[LandingController] Add month button found:', !!addMonthButton);
        if (addMonthButton) {
            addMonthButton.addEventListener('click', () => {
                console.log('[LandingController] Add month button clicked');
                this.showCreateMonthModal();
            });
        }

        const cancelBtn = document.getElementById('cancel-create-month');
        const overlay = document.getElementById('create-month-overlay');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideCreateMonthModal());
        }
        if (overlay) {
            overlay.addEventListener('click', () => this.hideCreateMonthModal());
        }

        const createForm = document.getElementById('create-month-form');
        if (createForm) {
            createForm.addEventListener('submit', (e) => this.handleCreateMonth(e));
        }

        // Savings table title click handler
        const savingsTitle = document.getElementById('savings-table-title');
        if (savingsTitle) {
            savingsTitle.addEventListener('click', () => this.showAllSavingsModal());
            console.log('[LandingController] Savings title click handler attached');
        }

        // All savings modal close handlers
        const closeAllSavings = document.getElementById('close-all-savings');
        const allSavingsOverlay = document.getElementById('all-savings-overlay');

        if (closeAllSavings) {
            closeAllSavings.addEventListener('click', () => this.hideAllSavingsModal());
        }
        if (allSavingsOverlay) {
            allSavingsOverlay.addEventListener('click', () => this.hideAllSavingsModal());
        }

        // Expense breakdown modal close handlers
        const closeExpenseBreakdown = document.getElementById('close-expense-breakdown');
        const expenseBreakdownOverlay = document.getElementById('expense-breakdown-overlay');

        if (closeExpenseBreakdown) {
            closeExpenseBreakdown.addEventListener('click', () => this.hideExpenseBreakdownModal());
        }
        if (expenseBreakdownOverlay) {
            expenseBreakdownOverlay.addEventListener('click', () => this.hideExpenseBreakdownModal());
        }
    },

    showCreateMonthModal() {
        console.log('[LandingController] showCreateMonthModal called');
        const modal = document.getElementById('create-month-modal');
        console.log('[LandingController] Modal element found:', !!modal);
        if (modal) {
            const currentDate = new Date();
            document.getElementById('new-month-year').value = currentDate.getFullYear();
            document.getElementById('new-month-month').value = currentDate.getMonth() + 1;
            modal.classList.add('modal-open');
            console.log('[LandingController] Modal opened, classes:', modal.className);
        }
    },

    hideCreateMonthModal() {
        const modal = document.getElementById('create-month-modal');
        if (modal) {
            modal.classList.remove('modal-open');
        }
    },

    showAllSavingsModal() {
        console.log('[LandingController] Opening all savings modal');
        const modal = document.getElementById('all-savings-modal');
        if (modal) {
            this.renderAllSavingsTable();
            modal.classList.add('modal-open');
        }
    },

    hideAllSavingsModal() {
        const modal = document.getElementById('all-savings-modal');
        if (modal) {
            modal.classList.remove('modal-open');
        }
    },

    renderAllSavingsTable() {
        const tbody = document.getElementById('all-savings-tbody');
        if (!tbody || !this._allMonthsData) {
            console.log('[LandingController] No data for all savings table');
            return;
        }

        tbody.innerHTML = '';

        this._allMonthsData.forEach(data => {
            const row = document.createElement('tr');
            const isPositive = data.savingsActual >= 0;
            const monthUrl = `${window.Header.getModulePath('monthlyBudget')}monthlyBudget.html?month=${data.monthKey}`;

            row.innerHTML = `
                <td><a href="${monthUrl}" class="savings-month-link"><strong>${data.monthDisplayName} ${data.year}</strong></a></td>
                <td>${Formatters.formatCurrency(data.savingsEstimate)}</td>
                <td class="${isPositive ? 'text-positive' : 'text-negative'}">${Formatters.formatCurrency(data.savingsActual)}</td>
            `;

            tbody.appendChild(row);
        });

        console.log('[LandingController] All savings table rendered with', this._allMonthsData.length, 'months');
    },

    showExpenseBreakdownModal() {
        console.log('[LandingController] Opening expense breakdown modal');
        const modal = document.getElementById('expense-breakdown-modal');
        if (modal) {
            this.renderExpenseBreakdownTable();
            modal.classList.add('modal-open');
        }
    },

    hideExpenseBreakdownModal() {
        const modal = document.getElementById('expense-breakdown-modal');
        if (modal) {
            modal.classList.remove('modal-open');
        }
    },

    renderExpenseBreakdownTable() {
        const tbody = document.getElementById('expense-breakdown-tbody');
        const totalEl = document.getElementById('expense-breakdown-total');

        if (!tbody || !this._expenseCategories) {
            console.log('[LandingController] No data for expense breakdown table');
            return;
        }

        // Show total with improved structure
        if (totalEl) {
            totalEl.innerHTML = `
                <span class="expense-breakdown-total-label">Total Expenses</span>
                <span class="expense-breakdown-total-amount">${Formatters.formatCurrency(this._expenseTotal)}</span>
            `;
        }

        tbody.innerHTML = '';

        // Color palette for categories
        const colorPalette = [
            '#5B7B9A', '#7BAB8A', '#D4A574', '#A67C94', '#8B9DC3',
            '#C4A35A', '#6B8E8E', '#B88B8B', '#7A9E7A', '#9B8AA6',
        ];

        this._expenseCategories.forEach(([category, amount], index) => {
            const percent = this._expenseTotal > 0 ? (amount / this._expenseTotal) * 100 : 0;
            const color = colorPalette[index % colorPalette.length];
            const row = document.createElement('tr');

            row.innerHTML = `
                <td>
                    <div class="expense-category-cell">
                        <span class="expense-category-color" style="background: ${color}"></span>
                        <span class="expense-category-name">${category}</span>
                    </div>
                </td>
                <td>${Formatters.formatCurrency(amount)}</td>
                <td>${percent.toFixed(1)}%</td>
            `;

            tbody.appendChild(row);
        });

        console.log('[LandingController] Expense breakdown table rendered with', this._expenseCategories.length, 'categories');
    },

    async handleCreateMonth(e) {
        e.preventDefault();

        const year = parseInt(document.getElementById('new-month-year').value, 10);
        const month = parseInt(document.getElementById('new-month-month').value, 10);

        if (!Formatters.validateYear(year)) {
            alert('Please enter a valid year between 2000 and 2100');
            return;
        }

        if (!Formatters.validateMonth(month)) {
            alert('Please enter a valid month between 1 and 12');
            return;
        }

        const monthKey = `${year}-${String(month).padStart(2, '0')}`;

        const existingMonth = await DataManager.getMonth(monthKey);
        if (existingMonth) {
            alert(`Month ${monthKey} already exists. Please select a different month.`);
            return;
        }

        await DataManager.createNewMonth(year, month);
        window.location.href = `../monthlyBudget/views/monthlyBudget.html?month=${monthKey}`;
    },


    /**
     * Delete a month
     * @param {string} monthKey - Month key to delete
     * @param {string} monthDisplayName - Display name of the month
     * @returns {Promise<void>}
     */
    async deleteMonth(monthKey, monthDisplayName) {
        // Check if this is example data before attempting deletion
        if (window.DatabaseService) {
            const isExample = await window.DatabaseService.isExampleData(monthKey);
            if (isExample) {
                alert('Example data cannot be deleted. This data is protected and locked.');
                return;
            }
        }

        const confirmMessage = `Are you sure you want to delete ${monthDisplayName}? This action cannot be undone.`;
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            const deletionSuccess = await DataManager.deleteMonth(monthKey);

            if (deletionSuccess) {
                alert(`${monthDisplayName} has been deleted.`);
                await this.loadOverviewData();
            } else {
                alert('Error deleting month. Please try again.');
            }
        } catch (error) {
            console.error('Error deleting month:', error);
            alert('Error deleting month. Please try again.');
        }
    },

    /**
     * Render expenses calendar for current month
     * @param {Object} currentMonthData - Current month's data object
     */
    renderExpensesCalendar(currentMonthData) {
        const grid = document.getElementById('calendar-grid');
        const monthYearLabel = document.getElementById('calendar-month-year');
        const monthLink = document.getElementById('calendar-month-link');

        if (!grid) {
            console.log('[LandingController] Calendar grid not found');
            return;
        }

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-indexed
        const currentDay = now.getDate();
        const currentMonthKey = MonthFactory.generateMonthKey(currentYear, currentMonth + 1);

        // Set month/year label and link
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December'];
        if (monthYearLabel) {
            monthYearLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;
        }

        // Set the link to navigate to the monthly budget page
        if (monthLink) {
            monthLink.href = `${window.Header.getModulePath('monthlyBudget')}monthlyBudget.html?month=${currentMonthKey}`;
        }

        // Calculate calendar layout
        const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();

        // Get day of week for first day (0 = Sunday, adjust for Monday start)
        let startDayOfWeek = firstDayOfMonth.getDay();
        startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1; // Convert to Monday = 0

        // Build expense map by day from fixedCosts
        const expensesByDay = {};
        if (currentMonthData && currentMonthData.fixedCosts) {
            currentMonthData.fixedCosts.forEach(cost => {
                const dayNum = this.parseDateToDay(cost.date);
                if (dayNum && dayNum >= 1 && dayNum <= daysInMonth) {
                    if (!expensesByDay[dayNum]) {
                        expensesByDay[dayNum] = [];
                    }
                    expensesByDay[dayNum].push({
                        category: cost.category || 'Unknown',
                        amount: parseFloat(cost.estimatedAmount) || 0,
                        paid: cost.paid || false
                    });
                }
            });
        }

        // Store for popup access
        this._expensesByDay = expensesByDay;
        this._currentYear = currentYear;
        this._currentMonth = currentMonth;

        // Clear grid and render
        grid.innerHTML = '';

        // Add empty cells for days before first of month
        for (let i = 0; i < startDayOfWeek; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day calendar-day-empty';
            grid.appendChild(emptyCell);
        }

        // Add day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day';

            // Mark today
            if (day === currentDay) {
                dayCell.classList.add('calendar-day-today');
            }

            // Mark past days
            if (day < currentDay) {
                dayCell.classList.add('calendar-day-past');
            }

            // Day number
            const dayNumber = document.createElement('span');
            dayNumber.className = 'calendar-day-number';
            dayNumber.textContent = day;
            dayCell.appendChild(dayNumber);

            // Add expenses for this day
            const dayExpenses = expensesByDay[day];
            if (dayExpenses && dayExpenses.length > 0) {
                dayCell.classList.add('calendar-day-has-expenses');
                dayCell.classList.add('calendar-day-clickable');

                // Store day for click handler
                dayCell.dataset.day = day;
                dayCell.addEventListener('click', (e) => this.showCalendarPopup(day, dayExpenses, e));

                const expensesList = document.createElement('div');
                expensesList.className = 'calendar-expenses';

                // Show up to 2 expenses, then "more" indicator
                const displayExpenses = dayExpenses.slice(0, 2);
                displayExpenses.forEach(expense => {
                    const expenseItem = document.createElement('div');
                    expenseItem.className = 'calendar-expense-item';
                    if (expense.paid) {
                        expenseItem.classList.add('expense-paid');
                    }
                    expenseItem.innerHTML = `
                        <span class="calendar-expense-name">${this.truncateText(expense.category, 12)}</span>
                        <span class="calendar-expense-amount">${Formatters.formatCurrency(expense.amount)}</span>
                    `;
                    expensesList.appendChild(expenseItem);
                });

                // Show "more" indicator if there are additional expenses
                if (dayExpenses.length > 2) {
                    const moreIndicator = document.createElement('div');
                    moreIndicator.className = 'calendar-expense-more';
                    moreIndicator.textContent = `+${dayExpenses.length - 2} more`;
                    expensesList.appendChild(moreIndicator);
                }

                dayCell.appendChild(expensesList);
            }

            grid.appendChild(dayCell);
        }

        // Setup popup event listeners
        this.setupCalendarPopupListeners();

        console.log('[LandingController] Expenses calendar rendered with', Object.keys(expensesByDay).length, 'days with expenses');
    },

    /**
     * Render empty state for calendar
     */
    renderCalendarEmptyState() {
        const grid = document.getElementById('calendar-grid');
        const monthYearLabel = document.getElementById('calendar-month-year');

        if (monthYearLabel) {
            const now = new Date();
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                'July', 'August', 'September', 'October', 'November', 'December'];
            monthYearLabel.textContent = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
        }

        if (grid) {
            grid.innerHTML = '<div class="calendar-empty-state">No expense data available for this month.</div>';
        }
    },

    /**
     * Show calendar popup with expense details
     * @param {number} day - Day of month
     * @param {Array} expenses - Array of expenses for that day
     * @param {Event} event - Click event
     */
    showCalendarPopup(day, expenses, event) {
        const popup = document.getElementById('calendar-popup');
        const overlay = document.getElementById('popup-overlay');
        const dateEl = document.getElementById('popup-date');
        const contentEl = document.getElementById('popup-content');

        if (!popup || !contentEl) {
            console.log('[LandingController] Popup elements not found');
            return;
        }

        // Store current popup context for toggle functionality
        this._popupDay = day;
        this._popupExpenses = expenses;

        // Format date
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                            'July', 'August', 'September', 'October', 'November', 'December'];
        const ordinalSuffix = this.getOrdinalSuffix(day);
        dateEl.textContent = `${day}${ordinalSuffix} ${monthNames[this._currentMonth]} ${this._currentYear}`;

        // Build content with circle checkboxes
        let html = '';
        let total = 0;

        expenses.forEach((expense, index) => {
            const paidClass = expense.paid ? 'expense-paid' : '';
            const checkedClass = expense.paid ? 'checked' : '';
            html += `
                <div class="popup-expense-item ${paidClass}" data-expense-index="${index}">
                    <span class="popup-expense-category">${expense.category}</span>
                    <div class="popup-expense-right">
                        <span class="popup-expense-amount">${Formatters.formatCurrency(expense.amount)}</span>
                        <button class="popup-paid-circle ${checkedClass}" data-index="${index}" data-category="${expense.category}" title="${expense.paid ? 'Mark as unpaid' : 'Mark as paid'}">
                            <i class="fas fa-check"></i>
                        </button>
                    </div>
                </div>
            `;
            total += expense.amount;
        });

        html += `
            <div class="popup-total">
                <span class="popup-total-label">Total</span>
                <span class="popup-total-amount">${Formatters.formatCurrency(total)}</span>
            </div>
        `;

        contentEl.innerHTML = html;

        // Attach click handlers to circle checkboxes
        contentEl.querySelectorAll('.popup-paid-circle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget;
                const index = parseInt(target.dataset.index, 10);
                const category = target.dataset.category;
                this.toggleExpensePaid(day, index, category);
            });
        });

        // Position popup
        const rect = event.target.closest('.calendar-day').getBoundingClientRect();
        const popupWidth = 320;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Calculate position - try to place below and to the right of the day cell
        let left = rect.left;
        let top = rect.bottom + 8;

        // Adjust if popup would go off right edge
        if (left + popupWidth > viewportWidth - 16) {
            left = viewportWidth - popupWidth - 16;
        }

        // Adjust if popup would go off left edge
        if (left < 16) {
            left = 16;
        }

        // Adjust if popup would go off bottom edge
        if (top + 300 > viewportHeight) {
            top = rect.top - 300 - 8;
            if (top < 16) {
                top = 16;
            }
        }

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;

        // Show popup and overlay
        popup.classList.add('popup-open');
        if (overlay) {
            overlay.classList.add('overlay-open');
        }

        console.log('[LandingController] Calendar popup shown for day', day, 'with', expenses.length, 'expenses');
    },

    /**
     * Hide calendar popup
     */
    hideCalendarPopup() {
        const popup = document.getElementById('calendar-popup');
        const overlay = document.getElementById('popup-overlay');

        if (popup) {
            popup.classList.remove('popup-open');
        }
        if (overlay) {
            overlay.classList.remove('overlay-open');
        }
    },

    /**
     * Toggle expense paid status from calendar popup
     * @param {number} day - Day of month
     * @param {number} index - Index of expense in day's expenses array
     * @param {string} category - Category name to find the expense
     */
    async toggleExpensePaid(day, index, category) {
        try {
            console.log('[LandingController] Toggling paid status for expense:', { day, index, category });

            // Get current month key
            const currentMonthKey = MonthFactory.generateMonthKey(this._currentYear, this._currentMonth + 1);

            // Get the month data
            const monthData = await DataManager.getMonth(currentMonthKey);
            if (!monthData || !monthData.fixedCosts) {
                console.error('[LandingController] Could not load month data');
                return;
            }

            // Find the expense by category and day
            const expenseIndex = monthData.fixedCosts.findIndex(cost => {
                const costDay = this.parseDateToDay(cost.date);
                return costDay === day && cost.category === category;
            });

            if (expenseIndex === -1) {
                console.error('[LandingController] Could not find expense to toggle');
                return;
            }

            // Toggle the paid status
            const newPaidStatus = !monthData.fixedCosts[expenseIndex].paid;
            monthData.fixedCosts[expenseIndex].paid = newPaidStatus;

            console.log('[LandingController] Setting paid status to:', newPaidStatus);

            // Save the updated month data
            await DataManager.saveMonth(currentMonthKey, monthData);

            console.log('[LandingController] Expense paid status updated successfully');

            // Update the popup expense in our cached array
            if (this._popupExpenses && this._popupExpenses[index]) {
                this._popupExpenses[index].paid = newPaidStatus;
            }

            // Update the local expenses by day cache
            if (this._expensesByDay && this._expensesByDay[day]) {
                const localExpense = this._expensesByDay[day].find(e => e.category === category);
                if (localExpense) {
                    localExpense.paid = newPaidStatus;
                }
            }

            // Refresh the popup content and calendar
            this.hideCalendarPopup();
            await this.loadOverviewData();

        } catch (error) {
            console.error('[LandingController] Error toggling expense paid status:', error);
            alert('Failed to update expense. Please try again.');
        }
    },

    /**
     * Setup calendar popup event listeners
     */
    setupCalendarPopupListeners() {
        const closeBtn = document.getElementById('popup-close');
        const overlay = document.getElementById('popup-overlay');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideCalendarPopup());
        }

        if (overlay) {
            overlay.addEventListener('click', () => this.hideCalendarPopup());
        }

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideCalendarPopup();
            }
        });
    },

    /**
     * Parse date string like "10th", "3rd", "25" to day number
     * @param {string} dateStr - Date string
     * @returns {number|null} Day number or null
     */
    parseDateToDay(dateStr) {
        if (!dateStr) return null;
        if (typeof dateStr === 'number') return dateStr;
        if (typeof dateStr !== 'string') return null;

        // Handle numeric strings directly
        const directNum = parseInt(dateStr, 10);
        if (!isNaN(directNum) && directNum >= 1 && directNum <= 31) {
            return directNum;
        }

        // Handle strings like "10th", "3rd", "1st", "22nd"
        const match = dateStr.match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    },

    /**
     * Get ordinal suffix for a number
     * @param {number} n - Number
     * @returns {string} Ordinal suffix (st, nd, rd, th)
     */
    getOrdinalSuffix(n) {
        const s = ['th', 'st', 'nd', 'rd'];
        const v = n % 100;
        return s[(v - 20) % 10] || s[v] || s[0];
    },

    /**
     * Truncate text with ellipsis
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @returns {string} Truncated text
     */
    truncateText(text, maxLength) {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength - 1) + '…';
    },

    /**
     * Helper: Set element text content
     * @param {string} elementId - Element ID
     * @param {string} textContent - Text content to set
     * @returns {void}
     */
    setElementText(elementId, textContent) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = textContent;
        }
    }
};

// Make LandingController available globally
window.LandingController = LandingController;

// Initialize when DOM is ready (if not already initialized by index.html)
document.addEventListener('DOMContentLoaded', () => {
    if (!window.landingControllerInitialized) {
        LandingController.init();
    }
});

