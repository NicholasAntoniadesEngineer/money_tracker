/**
 * Example Data Library
 * Contains example month data for demonstration purposes
 * Uses base year 2045 to avoid mixing with current data
 */

const ExampleData = {
    // Base year for example data (20+ years from now)
    EXAMPLE_YEAR: 2045,

    /**
     * Check if a month key belongs to example data
     * @param {string} monthKey - Month key to check
     * @returns {boolean} True if it's example data
     */
    isExampleMonth(monthKey) {
        return monthKey && monthKey.startsWith(String(this.EXAMPLE_YEAR));
    },

    /**
     * Get all example month keys
     * @returns {Array} Array of example month keys
     */
    getExampleMonthKeys() {
        return [
            `${this.EXAMPLE_YEAR}-09`,
            `${this.EXAMPLE_YEAR}-10`,
            `${this.EXAMPLE_YEAR}-11`
        ];
    },

    /**
     * Get all example months data
     * @returns {Array} Array of example month data objects
     */
    getAllExampleMonths() {
        return [
            this.getExampleSeptember(),
            this.getExampleOctober(),
            this.getExampleNovember()
        ];
    },

    /**
     * September - Minimal month (just started tracking, few entries)
     * Shows: Basic setup with minimal data
     */
    getExampleSeptember() {
        const exampleYear = this.EXAMPLE_YEAR;
        return {
            "key": `${exampleYear}-09`,
            "year": exampleYear,
            "month": 9,
            "monthName": "September",
            "dateRange": {
                "start": `${exampleYear}-08-31`,
                "end": `${exampleYear}-09-29`
            },
            "weeklyBreakdown": [
                {
                    "dateRange": "1-7",
                    "weekRange": "1-7",
                    "paymentsDue": "Rent 1200 ✓",
                    "groceries": "80= 45",
                    "transport": "",
                    "activities": "40= 25",
                    "estimate": 1320,
                    "weeklyEstimate": 1320,
                    "actual": 1270
                },
                {
                    "dateRange": "8-14",
                    "weekRange": "8-14",
                    "paymentsDue": "Electricity 65",
                    "groceries": "80= 78",
                    "transport": "",
                    "activities": "40= 0",
                    "estimate": 185,
                    "weeklyEstimate": 185,
                    "actual": 143
                },
                {
                    "dateRange": "15-21",
                    "weekRange": "15-21",
                    "paymentsDue": "Phone 35",
                    "groceries": "80= 92",
                    "transport": "",
                    "activities": "40= 55",
                    "estimate": 155,
                    "weeklyEstimate": 155,
                    "actual": 182
                },
                {
                    "dateRange": "22-30",
                    "weekRange": "22-30",
                    "paymentsDue": "Internet 45",
                    "groceries": "80= 68",
                    "transport": "",
                    "activities": "40= 30",
                    "estimate": 165,
                    "weeklyEstimate": 165,
                    "actual": 143
                },
                {
                    "dateRange": "Totals",
                    "weekRange": "Totals",
                    "paymentsDue": "",
                    "groceries": "",
                    "transport": "",
                    "activities": "",
                    "estimate": 0,
                    "weeklyEstimate": 0,
                    "actual": 0
                }
            ],
            "incomeSources": [
                { "source": "Salary", "estimated": 2800, "actual": 2800, "date": "1st", "description": "Monthly salary" }
            ],
            "fixedCosts": [
                { "category": "Rent", "estimatedAmount": 1200, "actualAmount": 1200, "date": "1st", "card": "Bank Transfer", "paid": true },
                { "category": "Electricity", "estimatedAmount": 65, "actualAmount": 62, "date": "10th", "card": "Debit Card", "paid": true },
                { "category": "Phone Plan", "estimatedAmount": 35, "actualAmount": 35, "date": "15th", "card": "Debit Card", "paid": true },
                { "category": "Internet", "estimatedAmount": 45, "actualAmount": 45, "date": "25th", "card": "Debit Card", "paid": true }
            ],
            "variableCosts": [
                { "category": "Groceries", "estimatedAmount": 320, "actualAmount": 283 },
                { "category": "Entertainment", "estimatedAmount": 160, "actualAmount": 110 }
            ],
            "unplannedExpenses": [],
            "pots": [
                { "category": "Emergency Fund", "estimatedAmount": 500, "actualAmount": 500 }
            ],
            "createdAt": new Date().toISOString(),
            "updatedAt": new Date().toISOString()
        };
    },

    /**
     * October - Busy month with lots of activity
     * Shows: Multiple income sources, many fixed costs, unplanned expenses, multiple pots
     */
    getExampleOctober() {
        const exampleYear = this.EXAMPLE_YEAR;
        return {
            "key": `${exampleYear}-10`,
            "year": exampleYear,
            "month": 10,
            "monthName": "October",
            "dateRange": {
                "start": `${exampleYear}-09-30`,
                "end": `${exampleYear}-10-30`
            },
            "weeklyBreakdown": [
                {
                    "dateRange": "1-7",
                    "weekRange": "1-7",
                    "paymentsDue": "Rent 1200 ✓ Gym 40 ✓ Spotify 12 ✓ Netflix 15 ✓",
                    "groceries": "100-25-30-18= 73",
                    "transport": "50= 42",
                    "activities": "75-20-35= 55",
                    "estimate": 1492,
                    "weeklyEstimate": 1492,
                    "actual": 1437
                },
                {
                    "dateRange": "8-14",
                    "weekRange": "8-14",
                    "paymentsDue": "Electricity 72 ✓ Water 28 ✓ Cloud Storage 10 ✓",
                    "groceries": "100-45-22-33= 100",
                    "transport": "50= 65",
                    "activities": "75= 45",
                    "estimate": 335,
                    "weeklyEstimate": 335,
                    "actual": 320
                },
                {
                    "dateRange": "15-21",
                    "weekRange": "15-21",
                    "paymentsDue": "Phone 45 ✓ Insurance 85 ✓ Subscriptions 25 ✓",
                    "groceries": "100-28-42-15-20= 105",
                    "transport": "50= 38",
                    "activities": "75-60= 60",
                    "estimate": 380,
                    "weeklyEstimate": 380,
                    "actual": 358
                },
                {
                    "dateRange": "22-31",
                    "weekRange": "22-31",
                    "paymentsDue": "Internet 55 ✓ Car Payment 250 ✓",
                    "groceries": "100-35-28-40= 103",
                    "transport": "50= 55",
                    "activities": "75-40-25= 65",
                    "estimate": 530,
                    "weeklyEstimate": 530,
                    "actual": 528
                },
                {
                    "dateRange": "Totals",
                    "weekRange": "Totals",
                    "paymentsDue": "",
                    "groceries": "",
                    "transport": "",
                    "activities": "",
                    "estimate": 0,
                    "weeklyEstimate": 0,
                    "actual": 0
                }
            ],
            "incomeSources": [
                { "source": "Primary Job", "estimated": 3200, "actual": 3250, "date": "1st", "description": "Monthly salary after tax" },
                { "source": "Freelance Work", "estimated": 400, "actual": 550, "date": "15th", "description": "Web design project" },
                { "source": "Dividend Income", "estimated": 50, "actual": 48, "date": "20th", "description": "Quarterly dividend" }
            ],
            "fixedCosts": [
                { "category": "Rent/Mortgage", "estimatedAmount": 1200, "actualAmount": 1200, "date": "1st", "card": "Bank Transfer", "paid": true },
                { "category": "Gym Membership", "estimatedAmount": 40, "actualAmount": 40, "date": "1st", "card": "Credit Card", "paid": true },
                { "category": "Spotify Premium", "estimatedAmount": 12, "actualAmount": 12, "date": "3rd", "card": "Credit Card", "paid": true },
                { "category": "Netflix", "estimatedAmount": 15, "actualAmount": 15, "date": "5th", "card": "Credit Card", "paid": true },
                { "category": "Electricity", "estimatedAmount": 70, "actualAmount": 72, "date": "8th", "card": "Debit Card", "paid": true },
                { "category": "Water Bill", "estimatedAmount": 30, "actualAmount": 28, "date": "10th", "card": "Debit Card", "paid": true },
                { "category": "Cloud Storage", "estimatedAmount": 10, "actualAmount": 10, "date": "12th", "card": "Credit Card", "paid": true },
                { "category": "Phone Plan", "estimatedAmount": 45, "actualAmount": 45, "date": "15th", "card": "Debit Card", "paid": true },
                { "category": "Health Insurance", "estimatedAmount": 85, "actualAmount": 85, "date": "18th", "card": "Bank Transfer", "paid": true },
                { "category": "App Subscriptions", "estimatedAmount": 25, "actualAmount": 25, "date": "20th", "card": "Credit Card", "paid": true },
                { "category": "Internet", "estimatedAmount": 55, "actualAmount": 55, "date": "22nd", "card": "Debit Card", "paid": true },
                { "category": "Car Payment", "estimatedAmount": 250, "actualAmount": 250, "date": "28th", "card": "Bank Transfer", "paid": true }
            ],
            "variableCosts": [
                { "category": "Groceries", "estimatedAmount": 400, "actualAmount": 381 },
                { "category": "Transport/Fuel", "estimatedAmount": 200, "actualAmount": 200 },
                { "category": "Entertainment", "estimatedAmount": 300, "actualAmount": 225 }
            ],
            "unplannedExpenses": [
                { "name": "Car Service", "amount": 180, "date": "12th", "card": "Credit Card", "paid": true },
                { "name": "Birthday Gift", "amount": 45, "date": "18th", "card": "Debit Card", "paid": true },
                { "name": "Urgent Plumber", "amount": 120, "date": "25th", "card": "Debit Card", "paid": true }
            ],
            "pots": [
                { "category": "Emergency Fund", "estimatedAmount": 3000, "actualAmount": 3200 },
                { "category": "Holiday Savings", "estimatedAmount": 1500, "actualAmount": 1650 },
                { "category": "New Laptop Fund", "estimatedAmount": 800, "actualAmount": 850 },
                { "category": "Investment Account", "estimatedAmount": 2000, "actualAmount": 2100 }
            ],
            "createdAt": new Date().toISOString(),
            "updatedAt": new Date().toISOString()
        };
    },

    /**
     * November - Moderate month with some variation
     * Shows: Mixed paid/unpaid status, partial tracking, holiday expenses
     */
    getExampleNovember() {
        const exampleYear = this.EXAMPLE_YEAR;
        return {
            "key": `${exampleYear}-11`,
            "year": exampleYear,
            "month": 11,
            "monthName": "November",
            "dateRange": {
                "start": `${exampleYear}-10-31`,
                "end": `${exampleYear}-11-29`
            },
            "weeklyBreakdown": [
                {
                    "dateRange": "1-7",
                    "weekRange": "1-7",
                    "paymentsDue": "Rent 1200 ✓ Gym 40 ✓ Streaming Services 35 ✓",
                    "groceries": "90-22-35-28= 85",
                    "transport": "40= 38",
                    "activities": "60-45= 45",
                    "estimate": 1465,
                    "weeklyEstimate": 1465,
                    "actual": 1443
                },
                {
                    "dateRange": "8-14",
                    "weekRange": "8-14",
                    "paymentsDue": "Utilities 95 ✓ Phone 45",
                    "groceries": "90-40-25-30= 95",
                    "transport": "40= 52",
                    "activities": "60= 35",
                    "estimate": 330,
                    "weeklyEstimate": 330,
                    "actual": 322
                },
                {
                    "dateRange": "15-21",
                    "weekRange": "15-21",
                    "paymentsDue": "Insurance 85 ✓ Subscriptions 20",
                    "groceries": "90-55-20-40-15= 130",
                    "transport": "40= 28",
                    "activities": "60-80-45= 125",
                    "estimate": 295,
                    "weeklyEstimate": 295,
                    "actual": 388
                },
                {
                    "dateRange": "22-30",
                    "weekRange": "22-30",
                    "paymentsDue": "Internet 55 Car 250",
                    "groceries": "90-65-45-30= 140",
                    "transport": "40= 45",
                    "activities": "60-35-20= 55",
                    "estimate": 495,
                    "weeklyEstimate": 495,
                    "actual": 545
                },
                {
                    "dateRange": "Totals",
                    "weekRange": "Totals",
                    "paymentsDue": "",
                    "groceries": "",
                    "transport": "",
                    "activities": "",
                    "estimate": 0,
                    "weeklyEstimate": 0,
                    "actual": 0
                }
            ],
            "incomeSources": [
                { "source": "Salary", "estimated": 3200, "actual": 3200, "date": "1st", "description": "Monthly salary" },
                { "source": "Side Project", "estimated": 200, "actual": 0, "date": "", "description": "Pending payment" }
            ],
            "fixedCosts": [
                { "category": "Rent", "estimatedAmount": 1200, "actualAmount": 1200, "date": "1st", "card": "Bank Transfer", "paid": true },
                { "category": "Gym", "estimatedAmount": 40, "actualAmount": 40, "date": "1st", "card": "Credit Card", "paid": true },
                { "category": "Streaming Bundle", "estimatedAmount": 35, "actualAmount": 35, "date": "5th", "card": "Credit Card", "paid": true },
                { "category": "Electricity & Gas", "estimatedAmount": 95, "actualAmount": 98, "date": "10th", "card": "Debit Card", "paid": true },
                { "category": "Phone", "estimatedAmount": 45, "actualAmount": 45, "date": "15th", "card": "Debit Card", "paid": false },
                { "category": "Health Insurance", "estimatedAmount": 85, "actualAmount": 85, "date": "18th", "card": "Bank Transfer", "paid": true },
                { "category": "App Subscriptions", "estimatedAmount": 20, "actualAmount": 20, "date": "20th", "card": "Credit Card", "paid": false },
                { "category": "Internet", "estimatedAmount": 55, "actualAmount": 55, "date": "25th", "card": "Debit Card", "paid": false },
                { "category": "Car Payment", "estimatedAmount": 250, "actualAmount": 250, "date": "28th", "card": "Bank Transfer", "paid": false }
            ],
            "variableCosts": [
                { "category": "Groceries", "estimatedAmount": 360, "actualAmount": 450 },
                { "category": "Transport", "estimatedAmount": 160, "actualAmount": 163 },
                { "category": "Entertainment", "estimatedAmount": 240, "actualAmount": 260 }
            ],
            "unplannedExpenses": [
                { "name": "Black Friday Deals", "amount": 185, "date": "24th", "card": "Credit Card", "paid": true },
                { "name": "Winter Coat", "amount": 95, "date": "15th", "card": "Debit Card", "paid": true }
            ],
            "pots": [
                { "category": "Emergency Fund", "estimatedAmount": 3500, "actualAmount": 3400 },
                { "category": "Holiday Savings", "estimatedAmount": 2000, "actualAmount": 1850 },
                { "category": "Christmas Budget", "estimatedAmount": 500, "actualAmount": 320 }
            ],
            "createdAt": new Date().toISOString(),
            "updatedAt": new Date().toISOString()
        };
    },

    /**
     * Legacy method for backward compatibility
     */
    getExampleMonth() {
        return this.getExampleNovember();
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.ExampleData = ExampleData;
}
