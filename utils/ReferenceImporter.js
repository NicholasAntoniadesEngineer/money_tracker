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
        
        const fixedCosts = this.extractFixedCosts(doc);
        const monthData = {
            year: year,
            month: this.getMonthNumber(monthName),
            monthName: monthName,
            weeklyBreakdown: this.extractWeeklyBreakdown(doc, fixedCosts),
            income: this.extractIncome(doc),
            fixedCosts: fixedCosts,
            variableCosts: this.extractVariableCosts(doc),
            unplannedExpenses: this.extractUnplannedExpenses(doc),
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
     * Extract weekly breakdown table and map to 4 fixed weekly blocks (1-7, 8-16, 17-23, 24-30)
     */
    extractWeeklyBreakdown(doc, fixedCosts = []) {
        const weeklyBreakdown = [];
        const tables = doc.querySelectorAll('table.simple-table');
        
        if (tables.length === 0) {
            return this.createEmptyWeeklyBreakdown();
        }

        let weeklyTable = null;
        for (let i = 0; i < tables.length; i++) {
            const table = tables[i];
            const headerRow = table.querySelector('thead tr');
            if (!headerRow) continue;

            const headers = Array.from(headerRow.querySelectorAll('th')).map(th => th.textContent.trim());
            const hasDate = headers.some(h => h === 'Date' || h.includes('Date'));
            const hasPaymentsDue = headers.some(h => h.includes('Payments Due') || h.includes('Payments'));
            const hasGroceries = headers.some(h => h.includes('Groceries') || h.includes('Grocer'));
            const hasEstimate = headers.some(h => h.includes('Estimate') || h.includes('Est'));
            const hasActual = headers.some(h => h === 'Actual' || h.includes('Actual'));

            if (hasDate && hasPaymentsDue && hasGroceries && hasEstimate && hasActual) {
                weeklyTable = table;
                break;
            }
        }

        const weekRanges = [
            { range: '1-7', start: 1, end: 7 },
            { range: '8-16', start: 8, end: 16 },
            { range: '17-23', start: 17, end: 23 },
            { range: '24-30', start: 24, end: 30 }
        ];

        if (weeklyTable) {
            const rows = weeklyTable.querySelectorAll('tbody tr');
            const extractedWeeks = new Map();

            rows.forEach(row => {
                const cells = Array.from(row.querySelectorAll('th, td'));
                if (cells.length >= 5) {
                    const dateRange = cells[0].textContent.trim();
                    if (dateRange && !dateRange.includes('TOTALS') && dateRange !== '' && !dateRange.match(/^\s*$/)) {
                        const paymentsDue = cells[1] ? cells[1].textContent.trim() : '';
                        const unplanned = cells.length > 2 && cells[2].textContent.includes('Unplanned') ? cells[2].textContent.trim() : '';
                        const groceries = cells[2] ? cells[2].textContent.trim() : (cells[3] ? cells[3].textContent.trim() : '');
                        const activities = cells[3] ? cells[3].textContent.trim() : (cells[4] ? cells[4].textContent.trim() : '');
                        const estimate = cells.length > 5 ? this.parseAmount(cells[cells.length - 2]?.textContent || '') : 0;

                        extractedWeeks.set(dateRange, {
                            paymentsDue: paymentsDue,
                            unplanned: unplanned,
                            groceries: groceries,
                            activities: activities,
                            weeklyEstimate: estimate
                        });
                    }
                }
            });

            weekRanges.forEach(weekRange => {
                const matchingWeek = Array.from(extractedWeeks.keys()).find(key => {
                    const keyLower = key.toLowerCase();
                    return keyLower.includes(weekRange.range) || 
                           keyLower.includes(`${weekRange.start}-${weekRange.end}`) ||
                           keyLower.includes(`${weekRange.start}st`) ||
                           keyLower.includes(`${weekRange.start}th`);
                });

                if (matchingWeek) {
                    const weekData = extractedWeeks.get(matchingWeek);
                    weeklyBreakdown.push({
                        weekRange: weekRange.range,
                        paymentsDue: weekData.paymentsDue || '',
                        unplanned: weekData.unplanned || '',
                        groceries: weekData.groceries || '',
                        activities: weekData.activities || '',
                        weeklyEstimate: weekData.weeklyEstimate || 0
                    });
                } else {
                    weeklyBreakdown.push({
                        weekRange: weekRange.range,
                        paymentsDue: '',
                        unplanned: '',
                        groceries: '',
                        activities: '',
                        weeklyEstimate: 0
                    });
                }
            });
        } else {
            return this.createEmptyWeeklyBreakdown();
        }

        return weeklyBreakdown;
    },

    /**
     * Create empty weekly breakdown structure
     */
    createEmptyWeeklyBreakdown() {
        return [
            { weekRange: '1-7', paymentsDue: '', unplanned: '', groceries: '', activities: '', weeklyEstimate: 0 },
            { weekRange: '8-16', paymentsDue: '', unplanned: '', groceries: '', activities: '', weeklyEstimate: 0 },
            { weekRange: '17-23', paymentsDue: '', unplanned: '', groceries: '', activities: '', weeklyEstimate: 0 },
            { weekRange: '24-30', paymentsDue: '', unplanned: '', groceries: '', activities: '', weeklyEstimate: 0 }
        ];
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
                            const card = cells.length > 4 ? cells[4].textContent.trim() : '';
                            const paid = cells[1]?.textContent.includes('✓') || cells[2]?.textContent.includes('✓') || false;

                            if (category) {
                                fixedCosts.push({
                                    category: category,
                                    estimatedAmount: estimated,
                                    actualAmount: actual,
                                    date: date,
                                    card: card,
                                    paid: paid
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
     * Extract variable costs - only Food and Activities
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
                    if (cells.length >= 2) {
                        const category = cells[0].textContent.trim();
                        if (category && !category.includes('Total') && (category === 'Food' || category === 'Activities' || category.includes('Food') || category.includes('Activities'))) {
                            const monthlyBudget = this.parseAmount(cells[1].textContent);
                            const actualSpent = cells.length > 2 ? this.parseAmount(cells[2].textContent) : 0;

                            const normalizedCategory = category.includes('Food') ? 'Food' : (category.includes('Activities') ? 'Activities' : category);

                            if (normalizedCategory === 'Food' || normalizedCategory === 'Activities') {
                                variableCosts.push({
                                    category: normalizedCategory,
                                    monthlyBudget: monthlyBudget,
                                    actualSpent: actualSpent
                                });
                            }
                        }
                    }
                });
            }
        });

        if (variableCosts.length === 0) {
            variableCosts.push({ category: 'Food', monthlyBudget: 0, actualSpent: 0 });
            variableCosts.push({ category: 'Activities', monthlyBudget: 0, actualSpent: 0 });
        }

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
                            const date = cells.length > 2 ? cells[2].textContent.trim() : '';
                            const card = cells.length > 3 ? cells[3].textContent.trim() : '';

                            if (name) {
                                unplannedExpenses.push({
                                    name: name,
                                    amount: amount,
                                    date: date,
                                    card: card
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
                    const parsedData = this.parseReferenceHTML(htmlContent, monthName, year);
                    
                    const monthKey = DataManager.generateMonthKey(year, parsedData.month);
                    
                    const monthData = {
                        key: monthKey,
                        year: parsedData.year,
                        month: parsedData.month,
                        monthName: parsedData.monthName,
                        dateRange: parsedData.dateRange,
                        weeklyBreakdown: parsedData.weeklyBreakdown || this.createEmptyWeeklyBreakdown(),
                        incomeSources: this.convertIncomeToArray(parsedData.income),
                        fixedCosts: parsedData.fixedCosts || [],
                        variableCosts: parsedData.variableCosts || [
                            { category: 'Food', monthlyBudget: 0, actualSpent: 0 },
                            { category: 'Activities', monthlyBudget: 0, actualSpent: 0 }
                        ],
                        unplannedExpenses: parsedData.unplannedExpenses || [],
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    };

                    DataManager.saveMonth(monthKey, monthData);
                    resolve(monthData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    /**
     * Convert old income format to new array format
     */
    convertIncomeToArray(income) {
        const incomeSources = [];
        
        if (income && typeof income === 'object') {
            if (income.nicholasIncome) {
                incomeSources.push({
                    source: 'Nicholas Income',
                    estimated: income.nicholasIncome.estimated || 0,
                    actual: income.nicholasIncome.actual || 0,
                    date: income.nicholasIncome.date || '',
                    description: ''
                });
            }
            if (income.laraIncome) {
                incomeSources.push({
                    source: 'Lara Income',
                    estimated: income.laraIncome.estimated || 0,
                    actual: income.laraIncome.actual || 0,
                    date: income.laraIncome.date || '',
                    description: ''
                });
            }
            if (income.otherIncome) {
                incomeSources.push({
                    source: 'Other Income',
                    estimated: income.otherIncome.estimated || 0,
                    actual: income.otherIncome.actual || 0,
                    date: '',
                    description: income.otherIncome.description || 'e.g., sales of cloths, household'
                });
            }
        }
        
        return incomeSources;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.ReferenceImporter = ReferenceImporter;
}

