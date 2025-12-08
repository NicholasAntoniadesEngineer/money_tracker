/**
 * Overview Controller
 * Handles the overview/dashboard view logic
 */

const OverviewController = {
    /**
     * Initialize the overview page
     */
    init() {
        this.loadOverviewData();
    },

    /**
     * Load and display overview data
     */
    loadOverviewData() {
        const allMonths = DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths).sort();

        if (monthKeys.length === 0) {
            const tbody = document.getElementById('months-comparison-tbody');
            const trendsContainer = document.getElementById('trends-container');
            
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="9" class="empty-message">No monthly data available. Create a month to get started.</td></tr>';
            }
            if (trendsContainer) {
                trendsContainer.innerHTML = '<p class="empty-message">No data available for trends analysis.</p>';
            }
            return;
        }

        let overallIncome = 0;
        let overallExpenses = 0;
        let overallSavings = 0;
        let overallPots = 0;

        const tbody = document.getElementById('months-comparison-tbody');
        if (tbody) {
            tbody.innerHTML = '';

            monthKeys.forEach(monthKey => {
                const monthData = allMonths[monthKey];
                const totals = DataManager.calculateMonthTotals(monthData);
                
                overallIncome += totals.income.actual;
                overallExpenses += totals.expenses.actual;
                overallSavings += totals.savings.actual;
                overallPots += totals.pots.actual;

                const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                const row = document.createElement('tr');
                
                row.innerHTML = `
                    <td><strong>${monthName} ${monthData.year}</strong></td>
                    <td>${Formatters.formatCurrency(totals.income.actual)}</td>
                    <td>${Formatters.formatCurrency(totals.fixedCosts.actual)}</td>
                    <td>${Formatters.formatCurrency(totals.variableCosts.actual)}</td>
                    <td>${Formatters.formatCurrency(totals.unplannedExpenses.actual)}</td>
                    <td><strong>${Formatters.formatCurrency(totals.expenses.actual)}</strong></td>
                    <td>${Formatters.formatCurrency(totals.pots.actual)}</td>
                    <td class="${totals.savings.actual >= 0 ? 'positive' : 'negative'}"><strong>${Formatters.formatCurrency(totals.savings.actual)}</strong></td>
                    <td>
                        <a href="monthly-budget.html?month=${monthKey}" class="btn btn-action btn-sm">View</a>
                        <button class="btn btn-danger btn-sm delete-month-btn" data-month-key="${monthKey}" data-month-name="${monthName} ${monthData.year}" style="margin-left: 0.5rem;">Delete</button>
                    </td>
                `;

                const deleteBtn = row.querySelector('.delete-month-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                        this.deleteMonth(monthKey, deleteBtn.dataset.monthName);
                    });
                }

                tbody.appendChild(row);
            });
        }

        this.setElementText('overall-income', Formatters.formatCurrency(overallIncome));
        this.setElementText('overall-expenses', Formatters.formatCurrency(overallExpenses));
        this.setElementText('overall-savings', Formatters.formatCurrency(overallSavings));
        this.setElementText('overall-pots', Formatters.formatCurrency(overallPots));

        const savingsEl = document.getElementById('overall-savings');
        if (savingsEl) {
            savingsEl.className = 'summary-card-value ' + (overallSavings >= 0 ? 'positive' : 'negative');
        }

        this.renderTrends(monthKeys, allMonths);
    },

    /**
     * Render trends analysis
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
     */
    calculateTrend(monthKeys, allMonths, type) {
        const values = monthKeys.map(key => {
            const totals = DataManager.calculateMonthTotals(allMonths[key]);
            switch(type) {
                case 'income': return totals.income.actual;
                case 'expenses': return totals.expenses.actual;
                case 'savings': return totals.savings.actual;
                default: return 0;
            }
        });

        const average = values.reduce((a, b) => a + b, 0) / values.length;
        
        const firstHalf = values.slice(0, Math.floor(values.length / 2));
        const secondHalf = values.slice(Math.floor(values.length / 2));
        
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        const percentage = firstAvg !== 0 ? ((secondAvg - firstAvg) / Math.abs(firstAvg)) * 100 : 0;
        const direction = percentage > 0 ? '↑ Increasing' : percentage < 0 ? '↓ Decreasing' : '→ Stable';

        return { average, percentage, direction };
    },

    /**
     * Delete a month
     */
    deleteMonth(monthKey, monthName) {
        const confirmMessage = `Are you sure you want to delete ${monthName}? This action cannot be undone.`;
        if (!confirm(confirmMessage)) {
            return;
        }

        const success = DataManager.deleteMonth(monthKey);

        if (success) {
            alert(`${monthName} has been deleted.`);
            this.loadOverviewData();
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
    }
};

// Make available globally
window.OverviewController = OverviewController;

