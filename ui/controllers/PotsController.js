/**
 * Pots & Investments Controller
 * Handles the pots and investments view logic
 */

const PotsController = {
    potsData: {},

    /**
     * Initialize the pots page
     */
    async init() {
        await this.loadPotsData();
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

        const monthSelector = document.getElementById('month-selector-pots');
        if (monthSelector) {
            monthSelector.addEventListener('change', async (e) => {
                await this.renderSelectedMonthPots(e.target.value);
            });
        }
    },

    /**
     * Load pots data from all months
     */
    async loadPotsData() {
        const allMonths = await window.DataManager.getAllMonths();
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
                        monthName: monthData.monthName || window.DataManager.getMonthName(monthData.month),
                        year: monthData.year,
                        estimatedAmount: Formatters.parseNumber(pot.estimatedAmount),
                        actualAmount: Formatters.parseNumber(pot.actualAmount)
                    });
                });
            }
        });

        this.potsData = potsMap;
        this.renderPotsTable();
        await this.renderPotsByMonth();
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
                <td><button type="button" class="delete-row-x" aria-label="Delete row" data-category="${category}">×</button></td>
            `;

            const deleteBtn = row.querySelector('.delete-row-x');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                if (confirm(`Are you sure you want to remove all entries for "${category}"? This will remove it from all months.`)) {
                    this.removePotFromAllMonths(category);
                }
            });
            }

            tbody.appendChild(row);
        });

        // Add total row
        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total</strong></td>
            <td id="pots-total-estimated"><strong>${Formatters.formatCurrency(0)}</strong></td>
            <td id="pots-total-actual"><strong>${Formatters.formatCurrency(0)}</strong></td>
            <td></td>
        `;
        tbody.appendChild(totalRow);
    },

    /**
     * Render pots by month - populates dropdown and shows selected month
     */
    async renderPotsByMonth() {
        const monthSelector = document.getElementById('month-selector-pots');
        const container = document.getElementById('pots-by-month-container');
        
        if (!monthSelector || !container) return;

        const allMonths = await window.DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths).sort().reverse();

        if (monthKeys.length === 0) {
            monthSelector.innerHTML = '<option value="">No monthly data available</option>';
            container.innerHTML = '<p class="empty-message">No monthly data available.</p>';
            return;
        }

        // Populate dropdown
        monthSelector.innerHTML = '<option value="">Select a month...</option>' + 
            monthKeys.map(monthKey => {
                const monthData = allMonths[monthKey];
                const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                return `<option value="${monthKey}">${monthName} ${monthData.year}</option>`;
            }).join('');

        // Show initial message
        container.innerHTML = '<p class="empty-message">Please select a month to view pots.</p>';
    },

    /**
     * Render pots for selected month
     */
    async renderSelectedMonthPots(monthKey) {
        const container = document.getElementById('pots-by-month-container');
        if (!container) return;

        if (!monthKey || monthKey === '') {
            container.innerHTML = '<p class="empty-message">Please select a month to view pots.</p>';
            return;
        }

        const allMonths = await window.DataManager.getAllMonths();
        const monthData = allMonths[monthKey];

        if (!monthData) {
            container.innerHTML = '<p class="empty-message">Month data not found.</p>';
            return;
        }

        const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
        const pots = monthData.pots || [];

        if (pots.length === 0) {
            container.innerHTML = `
                <div class="form-section" style="margin-bottom: 1rem;">
                    <h3>${monthName} ${monthData.year}</h3>
                    <p class="empty-message">No pots for this month.</p>
                    <a href="monthly-budget.html?month=${monthKey}" class="btn btn-action">Edit Month</a>
                </div>
            `;
            return;
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

        container.innerHTML = `
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
                        <tr class="total-row">
                            <td><strong>Total</strong></td>
                            <td><strong>${Formatters.formatCurrency(totals.estimated)}</strong></td>
                            <td><strong>${Formatters.formatCurrency(totals.actual)}</strong></td>
                        </tr>
                    </tbody>
                </table>
                <a href="monthly-budget.html?month=${monthKey}" class="btn btn-action" style="margin-top: 1rem;">Edit Month</a>
            </div>
        `;
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
    async removePotFromAllMonths(category) {
        const allMonths = await window.DataManager.getAllMonths();
        let modified = false;

        const monthKeys = Object.keys(allMonths);
        for (const monthKey of monthKeys) {
            const monthData = allMonths[monthKey];
            if (monthData.pots && Array.isArray(monthData.pots)) {
                const originalLength = monthData.pots.length;
                monthData.pots = monthData.pots.filter(pot => (pot.category || '') !== category);
                if (monthData.pots.length !== originalLength) {
                    monthData.updatedAt = new Date().toISOString();
                    await window.DataManager.saveMonth(monthKey, monthData);
                    modified = true;
                }
            }
        }

        if (modified) {
            await this.loadPotsData();
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

