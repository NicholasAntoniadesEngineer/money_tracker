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
        await this.loadOverviewData();
        this.setupEventListeners();
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

        let overallIncomeTotal = 0;
        let overallExpensesTotal = 0;
        let overallSavingsTotal = 0;
        let overallPotsTotal = 0;

        // Collect expense categories across all months
        const categoryTotals = {};

        // Collect month data for rendering
        const monthsData = [];

        monthKeys.forEach(monthKey => {
            const monthData = allMonths[monthKey];
            const totals = DataManager.calculateMonthTotals(monthData);

            overallIncomeTotal += totals.income.actual;
            overallExpensesTotal += totals.expenses.actual;
            overallSavingsTotal += totals.savings.actual;
            overallPotsTotal += totals.pots.actual;

            // Aggregate expense categories
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

        // Render expense breakdown pie chart with specific categories
        this.renderExpensePieChart(categoryTotals);

        this.renderTrends(monthKeys, allMonths);
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

            row.innerHTML = `
                <td><strong>${data.monthDisplayName} ${data.year}</strong></td>
                <td>${Formatters.formatCurrency(data.savingsEstimate)}</td>
                <td class="${isPositive ? 'text-positive' : 'text-negative'}">${Formatters.formatCurrency(data.savingsActual)}</td>
            `;

            tbody.appendChild(row);
        });

        console.log('[Landing] Savings table rendered with', monthsData.length, 'months');
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

        // Sort categories by amount and take top categories
        const sortedCategories = Object.entries(categoryTotals)
            .filter(([_, amount]) => amount > 0)
            .sort((a, b) => b[1] - a[1]);

        const total = sortedCategories.reduce((sum, [_, amount]) => sum + amount, 0);

        if (!svg || !legend || total === 0 || sortedCategories.length === 0) {
            if (legend) {
                legend.innerHTML = '<p class="text-muted">No expense data available</p>';
            }
            return;
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
        const createNewMonthButton = document.getElementById('create-new-month-button');

        if (createNewMonthButton) {
            createNewMonthButton.addEventListener('click', () => this.handleCreateNewMonth());
        }
    },

    /**
     * Handle create new month action
     * @returns {Promise<void>}
     */
    async handleCreateNewMonth() {
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
        const allMonths = await DataManager.getAllMonths();
        const existingMonth = allMonths[monthKey];

        if (existingMonth) {
            if (confirm('A month for this period already exists. Do you want to open it instead?')) {
                window.location.href = `${window.Header.getModulePath('monthlyBudget')}monthlyBudget.html?month=${monthKey}`;
            }
            return;
        }

        await DataManager.createNewMonth(year, month);
        window.location.href = `${window.Header.getModulePath('monthlyBudget')}monthlyBudget.html?month=${monthKey}`;
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

