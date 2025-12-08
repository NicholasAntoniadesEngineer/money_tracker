/**
 * Reference Importer Utility
 * Parses reference HTML files and imports data into the application
 */

const ReferenceImporter = {
    /**
     * Parse a reference HTML file and extract month data
     */
    parseReferenceHTML(htmlContent, monthName, year) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        const monthData = {
            year: year,
            month: this.getMonthNumber(monthName),
            monthName: monthName,
            income: this.extractIncome(doc),
            fixedCosts: this.extractFixedCosts(doc),
            variableCosts: this.extractVariableCosts(doc),
            unplannedExpenses: this.extractUnplannedExpenses(doc),
            pots: this.extractPots(doc),
            dateRange: this.extractDateRange(doc, year, this.getMonthNumber(monthName))
        };

        return monthData;
    },

    /**
     * Get month number from month name
     */
    getMonthNumber(monthName) {
        const months = {
            'January': 1, 'February': 2, 'March': 3, 'April': 4,
            'May': 5, 'June': 6, 'July': 7, 'August': 8,
            'September': 9, 'October': 10, 'November': 11, 'December': 12
        };
        return months[monthName] || 1;
    },

    /**
     * Extract date range from document
     */
    extractDateRange(doc, year, month) {
        const timeElement = doc.querySelector('time');
        if (timeElement) {
            const dateText = timeElement.textContent;
            const match = dateText.match(/(\w+)\s+(\d+),\s+(\d+)\s+→\s+(\w+)\s+(\d+),\s+(\d+)/);
            if (match) {
                const startDate = new Date(year, month - 1, 1);
                const endDate = new Date(year, month, 0);
                return {
                    start: startDate.toISOString().split('T')[0],
                    end: endDate.toISOString().split('T')[0]
                };
            }
        }
        
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        return {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0]
        };
    },

    /**
     * Extract income data
     */
    extractIncome(doc) {
        const income = {
            nicholasIncome: { estimated: 0, actual: 0, date: '' },
            laraIncome: { estimated: 0, actual: 0, date: '' },
            otherIncome: { estimated: 0, actual: 0, description: '' }
        };

        const tables = doc.querySelectorAll('table.simple-table');
        tables.forEach(table => {
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 3) {
                    const source = cells[0].textContent.trim();
                    const estimated = this.parseAmount(cells[1].textContent);
                    const actual = this.parseAmount(cells[2].textContent);
                    const date = cells[3] ? cells[3].textContent.trim() : '';

                    if (source.includes('Nicholas Income')) {
                        income.nicholasIncome.estimated = estimated;
                        income.nicholasIncome.actual = actual;
                        income.nicholasIncome.date = date;
                    } else if (source.includes('Lara Income')) {
                        income.laraIncome.estimated = estimated;
                        income.laraIncome.actual = actual;
                        income.laraIncome.date = date;
                    } else if (source.includes('Other Income')) {
                        income.otherIncome.estimated = estimated;
                        income.otherIncome.actual = actual;
                        income.otherIncome.description = source;
                    }
                }
            });
        });

        return income;
    },

    /**
     * Extract fixed costs
     */
    extractFixedCosts(doc) {
        const fixedCosts = [];
        const tables = doc.querySelectorAll('table.simple-table');
        
        let inFixedCostsSection = false;
        tables.forEach(table => {
            const prevHeading = table.previousElementSibling;
            if (prevHeading && prevHeading.textContent.includes('Fixed Costs')) {
                inFixedCostsSection = true;
            }

            if (inFixedCostsSection) {
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const category = cells[0].textContent.trim();
                        if (category && !category.includes('Total') && !category.includes('Subscriptions')) {
                            const estimated = this.parseAmount(cells[1].textContent);
                            const actual = this.parseAmount(cells[2].textContent);
                            const date = cells[3] ? cells[3].textContent.trim() : '';

                            if (category) {
                                fixedCosts.push({
                                    category: category,
                                    estimatedAmount: estimated,
                                    actualAmount: actual,
                                    date: date
                                });
                            }
                        }
                    }
                });
            }
        });

        return fixedCosts;
    },

    /**
     * Extract variable costs
     */
    extractVariableCosts(doc) {
        const variableCosts = [];
        const tables = doc.querySelectorAll('table.simple-table');
        
        let inVariableCostsSection = false;
        tables.forEach(table => {
            const prevHeading = table.previousElementSibling;
            if (prevHeading && prevHeading.textContent.includes('Variable Costs')) {
                inVariableCostsSection = true;
            }

            if (inVariableCostsSection) {
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const category = cells[0].textContent.trim();
                        if (category && !category.includes('Total')) {
                            const estimated = this.parseAmount(cells[1].textContent);
                            const actual = this.parseAmount(cells[2].textContent);

                            if (category) {
                                variableCosts.push({
                                    category: category,
                                    estimatedAmount: estimated,
                                    actualAmount: actual
                                });
                            }
                        }
                    }
                });
            }
        });

        return variableCosts;
    },

    /**
     * Extract unplanned expenses
     */
    extractUnplannedExpenses(doc) {
        const unplannedExpenses = [];
        const tables = doc.querySelectorAll('table.simple-table');
        
        let inUnplannedSection = false;
        tables.forEach(table => {
            const prevHeading = table.previousElementSibling;
            if (prevHeading && (prevHeading.textContent.includes('Unplanned') || prevHeading.textContent.includes('Unplanned Expense'))) {
                inUnplannedSection = true;
            }

            if (inUnplannedSection) {
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const name = cells[0].textContent.trim();
                        if (name && !name.includes('Total')) {
                            const amount = this.parseAmount(cells[1].textContent);
                            const date = cells[2] ? cells[2].textContent.trim() : '';
                            const card = cells[3] ? cells[3].textContent.trim() : '';
                            const status = cells[4] ? cells[4].textContent.trim() : '';

                            if (name) {
                                unplannedExpenses.push({
                                    name: name,
                                    amount: amount,
                                    date: date,
                                    card: card,
                                    status: status
                                });
                            }
                        }
                    }
                });
            }
        });

        return unplannedExpenses;
    },

    /**
     * Extract pots
     */
    extractPots(doc) {
        const pots = [];
        const tables = doc.querySelectorAll('table.simple-table');
        
        let inPotsSection = false;
        tables.forEach(table => {
            const prevHeading = table.previousElementSibling;
            if (prevHeading && (prevHeading.textContent.includes('Pots') || prevHeading.textContent.includes('Investments'))) {
                inPotsSection = true;
            }

            if (inPotsSection) {
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 2) {
                        const category = cells[0].textContent.trim();
                        if (category && !category.includes('Total') && !category.includes('Category')) {
                            const estimated = this.parseAmount(cells[1].textContent);
                            const actual = cells[2] ? this.parseAmount(cells[2].textContent) : estimated;

                            if (category) {
                                pots.push({
                                    category: category,
                                    estimatedAmount: estimated,
                                    actualAmount: actual
                                });
                            }
                        }
                    }
                });
            }
        });

        return pots;
    },

    /**
     * Parse amount from text (removes currency symbols and commas)
     */
    parseAmount(text) {
        if (!text) return 0;
        const cleaned = text.replace(/[£€$,\s]/g, '').trim();
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
    },

    /**
     * Import a month from reference HTML file
     */
    async importMonthFromFile(file, monthName, year) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const htmlContent = e.target.result;
                    const monthData = this.parseReferenceHTML(htmlContent, monthName, year);
                    
                    const monthKey = DataManager.generateMonthKey(year, monthData.month);
                    monthData.key = monthKey;
                    monthData.createdAt = new Date().toISOString();
                    monthData.updatedAt = new Date().toISOString();

                    DataManager.saveMonth(monthKey, monthData);
                    resolve(monthData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.ReferenceImporter = ReferenceImporter;
}

