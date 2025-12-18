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
        await DataManager.loadMonthsFromFiles();
        this.loadOverviewData();
        this.setupEventListeners();
    },

    /**
     * Load and display overview data including summary cards, comparison table, and trends
     * @returns {void}
     */
    loadOverviewData() {
        const allMonths = DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths).sort();

        if (monthKeys.length === 0) {
            this.renderEmptyState();
            return;
        }

        let overallIncomeTotal = 0;
        let overallExpensesTotal = 0;
        let overallSavingsTotal = 0;
        let overallPotsTotal = 0;

        const tableBody = document.getElementById('months-comparison-tbody');
        if (tableBody) {
            tableBody.innerHTML = '';

            monthKeys.forEach(monthKey => {
                const monthData = allMonths[monthKey];
                const totals = DataManager.calculateMonthTotals(monthData);
                
                overallIncomeTotal += totals.income.actual;
                overallExpensesTotal += totals.expenses.actual;
                overallSavingsTotal += totals.savings.actual;
                overallPotsTotal += totals.pots.actual;

                const monthDisplayName = monthData.monthName || DataManager.getMonthName(monthData.month);
                const tableRow = document.createElement('tr');
                
                tableRow.innerHTML = `
                    <td><strong>${monthDisplayName} ${monthData.year}</strong></td>
                    <td>${Formatters.formatCurrency(totals.income.actual)}</td>
                    <td>${Formatters.formatCurrency(totals.fixedCosts.actual)}</td>
                    <td>${Formatters.formatCurrency(totals.variableCosts.actual)}</td>
                    <td>${Formatters.formatCurrency(totals.unplannedExpenses.actual)}</td>
                    <td><strong>${Formatters.formatCurrency(totals.expenses.actual)}</strong></td>
                    <td>${Formatters.formatCurrency(totals.pots.actual)}</td>
                    <td class="${totals.savings.actual >= 0 ? 'positive' : 'negative'}"><strong>${Formatters.formatCurrency(totals.savings.actual)}</strong></td>
                    <td>
                        <a href="views/monthly-budget.html?month=${monthKey}" class="btn btn-action btn-sm">View</a>
                        <button type="button" class="delete-row-x" aria-label="Delete month" data-month-key="${monthKey}" data-month-name="${monthDisplayName} ${monthData.year}">x</button>
                    </td>
                `;

                const deleteButton = tableRow.querySelector('.delete-row-x');
                if (deleteButton) {
                    deleteButton.addEventListener('click', () => {
                        this.deleteMonth(monthKey, deleteButton.dataset.monthName);
                    });
                }

                tableBody.appendChild(tableRow);
            });
        }

        this.setElementText('overall-income', Formatters.formatCurrency(overallIncomeTotal));
        this.setElementText('overall-expenses', Formatters.formatCurrency(overallExpensesTotal));
        this.setElementText('overall-savings', Formatters.formatCurrency(overallSavingsTotal));
        this.setElementText('overall-pots', Formatters.formatCurrency(overallPotsTotal));

        const savingsElement = document.getElementById('overall-savings');
        if (savingsElement) {
            savingsElement.className = 'summary-card-value ' + (overallSavingsTotal >= 0 ? 'positive' : 'negative');
        }

        this.renderTrends(monthKeys, allMonths);
    },

    /**
     * Render empty state when no months exist
     * @returns {void}
     */
    renderEmptyState() {
        const tableBody = document.getElementById('months-comparison-tbody');
        const trendsContainer = document.getElementById('trends-container');
        
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="9" class="empty-message">No monthly data available. Create a month to get started.</td></tr>';
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
        const allMonths = DataManager.getAllMonths();
        const existingMonth = allMonths[monthKey];

        if (existingMonth) {
            if (confirm('A month for this period already exists. Do you want to open it instead?')) {
                window.location.href = `views/monthly-budget.html?month=${monthKey}`;
            }
            return;
        }

        await DataManager.createNewMonth(year, month);
        window.location.href = `views/monthly-budget.html?month=${monthKey}`;
    },

    /**
     * Delete a month
     * @param {string} monthKey - Month key to delete
     * @param {string} monthDisplayName - Display name of the month
     * @returns {void}
     */
    deleteMonth(monthKey, monthDisplayName) {
        const confirmMessage = `Are you sure you want to delete ${monthDisplayName}? This action cannot be undone.`;
        if (!confirm(confirmMessage)) {
            return;
        }

        const deletionSuccess = DataManager.deleteMonth(monthKey);

        if (deletionSuccess) {
            alert(`${monthDisplayName} has been deleted.`);
            this.loadOverviewData();
        } else {
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

