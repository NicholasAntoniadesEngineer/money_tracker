/**
 * Pots & Investments Controller
 * Handles the pots and investments view logic
 */

const PotsController = {
    potsData: {},

    /**
     * Initialize the pots page
     */
    init() {
        this.loadPotsData();
        this.setupEventListeners();
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const addPotBtn = document.getElementById('add-pot-button');
        if (addPotBtn) {
            addPotBtn.addEventListener('click', () => this.addPotRow());
        }
    },

    /**
     * Load pots data from all months
     */
    loadPotsData() {
        const allMonths = DataManager.getAllMonths();
        const potsMap = {};

        Object.keys(allMonths).forEach(monthKey => {
            const monthData = allMonths[monthKey];
            if (monthData.pots && Array.isArray(monthData.pots)) {
                monthData.pots.forEach(pot => {
                    const category = pot.category || 'Unnamed';
                    if (!potsMap[category]) {
                        potsMap[category] = {
                            category: category,
                            estimatedAmount: 0,
                            actualAmount: 0,
                            months: []
                        };
                    }
                    potsMap[category].estimatedAmount += Formatters.parseNumber(pot.estimatedAmount);
                    potsMap[category].actualAmount += Formatters.parseNumber(pot.actualAmount);
                    potsMap[category].months.push({
                        monthKey: monthKey,
                        monthName: monthData.monthName || DataManager.getMonthName(monthData.month),
                        year: monthData.year,
                        estimatedAmount: Formatters.parseNumber(pot.estimatedAmount),
                        actualAmount: Formatters.parseNumber(pot.actualAmount)
                    });
                });
            }
        });

        this.potsData = potsMap;
        this.renderPotsTable();
        this.renderPotsByMonth();
        this.updateTotals();
    },

    /**
     * Render pots table
     */
    renderPotsTable() {
        const tbody = document.getElementById('pots-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const categories = Object.keys(this.potsData).sort();

        categories.forEach(category => {
            const pot = this.potsData[category];
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td><strong>${category}</strong></td>
                <td>${Formatters.formatCurrency(pot.estimatedAmount)}</td>
                <td>${Formatters.formatCurrency(pot.actualAmount)}</td>
                <td>
                    <button class="btn btn-danger btn-sm remove-pot" data-category="${category}">Remove</button>
                </td>
            `;

            row.querySelector('.remove-pot').addEventListener('click', () => {
                if (confirm(`Are you sure you want to remove all entries for "${category}"? This will remove it from all months.`)) {
                    this.removePotFromAllMonths(category);
                }
            });

            tbody.appendChild(row);
        });
    },

    /**
     * Render pots by month
     */
    renderPotsByMonth() {
        const container = document.getElementById('pots-by-month-container');
        if (!container) return;

        const allMonths = DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths).sort().reverse();

        if (monthKeys.length === 0) {
            container.innerHTML = '<p class="empty-message">No monthly data available.</p>';
            return;
        }

        container.innerHTML = monthKeys.map(monthKey => {
            const monthData = allMonths[monthKey];
            const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
            const pots = monthData.pots || [];

            if (pots.length === 0) {
                return `
                    <div class="form-section" style="margin-bottom: 1rem;">
                        <h3>${monthName} ${monthData.year}</h3>
                        <p class="empty-message">No pots for this month.</p>
                        <a href="monthly-budget.html?month=${monthKey}" class="btn btn-secondary">Edit Month</a>
                    </div>
                `;
            }

            const potsHtml = pots.map(pot => `
                <tr>
                    <td>${pot.category || 'Unnamed'}</td>
                    <td>${Formatters.formatCurrency(pot.estimatedAmount || 0)}</td>
                    <td>${Formatters.formatCurrency(pot.actualAmount || 0)}</td>
                </tr>
            `).join('');

            const totals = pots.reduce((acc, pot) => {
                acc.estimated += Formatters.parseNumber(pot.estimatedAmount);
                acc.actual += Formatters.parseNumber(pot.actualAmount);
                return acc;
            }, { estimated: 0, actual: 0 });

            return `
                <div class="form-section" style="margin-bottom: 1rem;">
                    <h3>${monthName} ${monthData.year}</h3>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Estimated Amount</th>
                                <th>Actual Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${potsHtml}
                        </tbody>
                        <tfoot>
                            <tr class="total-row">
                                <td><strong>Total</strong></td>
                                <td><strong>${Formatters.formatCurrency(totals.estimated)}</strong></td>
                                <td><strong>${Formatters.formatCurrency(totals.actual)}</strong></td>
                            </tr>
                        </tfoot>
                    </table>
                    <a href="monthly-budget.html?month=${monthKey}" class="btn btn-secondary" style="margin-top: 1rem;">Edit Month</a>
                </div>
            `;
        }).join('');
    },

    /**
     * Add pot row (creates a new pot category)
     */
    addPotRow() {
        const category = prompt('Enter pot category name:');
        if (!category || category.trim() === '') return;

        const categoryKey = category.trim();
        
        if (this.potsData[categoryKey]) {
            alert('This pot category already exists. You can add it to a specific month from the Monthly Budget page.');
            return;
        }

        this.potsData[categoryKey] = {
            category: categoryKey,
            estimatedAmount: 0,
            actualAmount: 0,
            months: []
        };

        this.renderPotsTable();
        this.updateTotals();
    },

    /**
     * Remove pot from all months
     */
    removePotFromAllMonths(category) {
        const allMonths = DataManager.getAllMonths();
        let modified = false;

        Object.keys(allMonths).forEach(monthKey => {
            const monthData = allMonths[monthKey];
            if (monthData.pots && Array.isArray(monthData.pots)) {
                const originalLength = monthData.pots.length;
                monthData.pots = monthData.pots.filter(pot => (pot.category || '') !== category);
                if (monthData.pots.length !== originalLength) {
                    monthData.updatedAt = new Date().toISOString();
                    DataManager.saveMonth(monthKey, monthData);
                    modified = true;
                }
            }
        });

        if (modified) {
            this.loadPotsData();
            alert('Pot removed from all months.');
        }
    },

    /**
     * Update totals display
     */
    updateTotals() {
        const totals = Object.values(this.potsData).reduce((acc, pot) => {
            acc.estimated += pot.estimatedAmount;
            acc.actual += pot.actualAmount;
            return acc;
        }, { estimated: 0, actual: 0 });

        const estimatedEl = document.getElementById('total-pots-estimated');
        const actualEl = document.getElementById('total-pots-actual');
        const totalEstimatedEl = document.getElementById('pots-total-estimated');
        const totalActualEl = document.getElementById('pots-total-actual');

        if (estimatedEl) estimatedEl.textContent = Formatters.formatCurrency(totals.estimated);
        if (actualEl) actualEl.textContent = Formatters.formatCurrency(totals.actual);
        if (totalEstimatedEl) totalEstimatedEl.innerHTML = '<strong>' + Formatters.formatCurrency(totals.estimated) + '</strong>';
        if (totalActualEl) totalActualEl.innerHTML = '<strong>' + Formatters.formatCurrency(totals.actual) + '</strong>';
    }
};

// Initialize when DOM is ready
// Make available globally
window.PotsController = PotsController;

