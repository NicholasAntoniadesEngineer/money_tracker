/**
 * CSV Handler Utility
 * Handles conversion between month data and CSV format
 */

const CSVHandler = {
    /**
     * Convert month data to CSV format
     */
    monthDataToCSV(monthData) {
        const lines = [];
        
        // Header line
        lines.push('Section,Category,Field,Value,Date,Card,Paid,Description');
        
        // Weekly Breakdown
        if (monthData.weeklyBreakdown && monthData.weeklyBreakdown.length > 0) {
            monthData.weeklyBreakdown.forEach((week, index) => {
                lines.push(`Weekly Breakdown,Week ${index + 1},Date Range,"${week.dateRange || week.weekRange || ''}",,,,`);
                lines.push(`Weekly Breakdown,Week ${index + 1},Payments Due,"${(week.paymentsDue || '').replace(/"/g, '""')}",,,,`);
                lines.push(`Weekly Breakdown,Week ${index + 1},Groceries,"${(week.groceries || '').replace(/"/g, '""')}",,,,`);
                lines.push(`Weekly Breakdown,Week ${index + 1},Transport,"${(week.transport || '').replace(/"/g, '""')}",,,,`);
                lines.push(`Weekly Breakdown,Week ${index + 1},Activities,"${(week.activities || '').replace(/"/g, '""')}",,,,`);
                lines.push(`Weekly Breakdown,Week ${index + 1},Estimate,${week.estimate || week.weeklyEstimate || 0},,,,`);
                lines.push(`Weekly Breakdown,Week ${index + 1},Actual,${week.actual || 0},,,,`);
            });
        }
        
        // Income
        if (monthData.income && monthData.income.length > 0) {
            monthData.income.forEach((income, index) => {
                lines.push(`Income,Income ${index + 1},Source,"${(income.source || '').replace(/"/g, '""')}",${income.date || ''},,,"${(income.description || '').replace(/"/g, '""')}"`);
                lines.push(`Income,Income ${index + 1},Estimated,${income.estimated || 0},${income.date || ''},,,`);
                lines.push(`Income,Income ${index + 1},Actual,${income.actual || 0},${income.date || ''},,,`);
            });
        }
        
        // Fixed Costs
        if (monthData.fixedCosts && monthData.fixedCosts.length > 0) {
            monthData.fixedCosts.forEach((cost) => {
                lines.push(`Fixed Costs,"${(cost.category || '').replace(/"/g, '""')}",Estimated,${cost.estimatedAmount || 0},${cost.date || ''},${cost.card || ''},${cost.paid ? 'Yes' : 'No'},`);
                lines.push(`Fixed Costs,"${(cost.category || '').replace(/"/g, '""')}",Actual,${cost.actualAmount || 0},${cost.date || ''},${cost.card || ''},${cost.paid ? 'Yes' : 'No'},`);
            });
        }
        
        // Variable Costs
        if (monthData.variableCosts && monthData.variableCosts.length > 0) {
            monthData.variableCosts.forEach((cost) => {
                lines.push(`Variable Costs,"${(cost.category || '').replace(/"/g, '""')}",Monthly Budget,${cost.monthlyBudget || 0},,,,`);
                lines.push(`Variable Costs,"${(cost.category || '').replace(/"/g, '""')}",Actual Spent,${cost.actualSpent || 0},,,,`);
            });
        }
        
        // Unplanned Expenses
        if (monthData.unplannedExpenses && monthData.unplannedExpenses.length > 0) {
            monthData.unplannedExpenses.forEach((expense) => {
                lines.push(`Unplanned Expenses,"${(expense.name || '').replace(/"/g, '""')}",Amount,${expense.amount || 0},${expense.date || ''},${expense.card || ''},,${expense.status || ''}`);
            });
        }
        
        // Pots
        if (monthData.pots && monthData.pots.length > 0) {
            monthData.pots.forEach((pot) => {
                lines.push(`Pots,"${(pot.category || '').replace(/"/g, '""')}",Estimated,${pot.estimatedAmount || 0},,,,`);
                lines.push(`Pots,"${(pot.category || '').replace(/"/g, '""')}",Actual,${pot.actualAmount || 0},,,,`);
            });
        }
        
        return lines.join('\n');
    },

    /**
     * Parse CSV and convert to month data structure
     */
    csvToMonthData(csvText, monthName, year) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
            throw new Error('CSV file is empty or invalid');
        }
        
        // Skip header line
        const dataLines = lines.slice(1);
        
        const monthData = {
            key: `${monthName.toLowerCase()}-${year}`,
            monthName: monthName,
            year: year,
            weeklyBreakdown: [],
            income: [],
            fixedCosts: [],
            variableCosts: [],
            unplannedExpenses: [],
            pots: []
        };
        
        // Parse CSV lines
        const weeklyBreakdownMap = new Map();
        const incomeMap = new Map();
        const fixedCostsMap = new Map();
        const variableCostsMap = new Map();
        const unplannedExpensesMap = new Map();
        const potsMap = new Map();
        
        dataLines.forEach(line => {
            // Parse CSV line (handle quoted fields)
            const fields = this.parseCSVLine(line);
            if (fields.length < 4) return;
            
            const section = fields[0] || '';
            const category = fields[1] || '';
            const field = fields[2] || '';
            const value = fields[3] || '';
            const date = fields[4] || '';
            const card = fields[5] || '';
            const paid = fields[6] || '';
            const description = fields[7] || '';
            
            if (section === 'Weekly Breakdown') {
                const weekKey = category;
                if (!weeklyBreakdownMap.has(weekKey)) {
                    weeklyBreakdownMap.set(weekKey, {
                        dateRange: '',
                        paymentsDue: '',
                        groceries: '',
                        transport: '',
                        activities: '',
                        estimate: 0,
                        actual: 0
                    });
                }
                const week = weeklyBreakdownMap.get(weekKey);
                
                if (field === 'Date Range') week.dateRange = value;
                else if (field === 'Payments Due') week.paymentsDue = value;
                else if (field === 'Groceries') week.groceries = value;
                else if (field === 'Transport') week.transport = value;
                else if (field === 'Activities') week.activities = value;
                else if (field === 'Estimate') week.estimate = parseFloat(value) || 0;
                else if (field === 'Actual') week.actual = parseFloat(value) || 0;
            }
            else if (section === 'Income') {
                const incomeKey = category;
                if (!incomeMap.has(incomeKey)) {
                    incomeMap.set(incomeKey, {
                        source: '',
                        estimated: 0,
                        actual: 0,
                        date: '',
                        description: ''
                    });
                }
                const income = incomeMap.get(incomeKey);
                
                if (field === 'Source') income.source = value;
                else if (field === 'Estimated') income.estimated = parseFloat(value) || 0;
                else if (field === 'Actual') income.actual = parseFloat(value) || 0;
                if (date) income.date = date;
                if (description) income.description = description;
            }
            else if (section === 'Fixed Costs') {
                if (!fixedCostsMap.has(category)) {
                    fixedCostsMap.set(category, {
                        category: category,
                        estimatedAmount: 0,
                        actualAmount: 0,
                        date: '',
                        card: '',
                        paid: false
                    });
                }
                const cost = fixedCostsMap.get(category);
                
                if (field === 'Estimated') cost.estimatedAmount = parseFloat(value) || 0;
                else if (field === 'Actual') cost.actualAmount = parseFloat(value) || 0;
                if (date) cost.date = date;
                if (card) cost.card = card;
                if (paid.toLowerCase() === 'yes') cost.paid = true;
            }
            else if (section === 'Variable Costs') {
                if (!variableCostsMap.has(category)) {
                    variableCostsMap.set(category, {
                        category: category,
                        monthlyBudget: 0,
                        actualSpent: 0
                    });
                }
                const cost = variableCostsMap.get(category);
                
                if (field === 'Monthly Budget') cost.monthlyBudget = parseFloat(value) || 0;
                else if (field === 'Actual Spent') cost.actualSpent = parseFloat(value) || 0;
            }
            else if (section === 'Unplanned Expenses') {
                if (!unplannedExpensesMap.has(category)) {
                    unplannedExpensesMap.set(category, {
                        name: category,
                        amount: 0,
                        date: '',
                        card: '',
                        status: ''
                    });
                }
                const expense = unplannedExpensesMap.get(category);
                
                if (field === 'Amount') expense.amount = parseFloat(value) || 0;
                if (date) expense.date = date;
                if (card) expense.card = card;
                if (description) expense.status = description;
            }
            else if (section === 'Pots') {
                if (!potsMap.has(category)) {
                    potsMap.set(category, {
                        category: category,
                        estimatedAmount: 0,
                        actualAmount: 0
                    });
                }
                const pot = potsMap.get(category);
                
                if (field === 'Estimated') pot.estimatedAmount = parseFloat(value) || 0;
                else if (field === 'Actual') pot.actualAmount = parseFloat(value) || 0;
            }
        });
        
        // Convert maps to arrays
        monthData.weeklyBreakdown = Array.from(weeklyBreakdownMap.values());
        monthData.income = Array.from(incomeMap.values());
        monthData.fixedCosts = Array.from(fixedCostsMap.values());
        monthData.variableCosts = Array.from(variableCostsMap.values());
        monthData.unplannedExpenses = Array.from(unplannedExpensesMap.values());
        monthData.pots = Array.from(potsMap.values());
        
        return monthData;
    },

    /**
     * Parse a CSV line handling quoted fields
     */
    parseCSVLine(line) {
        const fields = [];
        let currentField = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                if (inQuotes && line[i + 1] === '"') {
                    // Escaped quote
                    currentField += '"';
                    i++;
                } else {
                    // Toggle quote state
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // Field separator
                fields.push(currentField);
                currentField = '';
            } else {
                currentField += char;
            }
        }
        
        // Add last field
        fields.push(currentField);
        
        return fields;
    }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CSVHandler;
}
