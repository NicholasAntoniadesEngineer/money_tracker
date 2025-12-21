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
            `${this.EXAMPLE_YEAR}-01`,
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
            this.getExampleJanuary(),
            this.getExampleSeptember(),
            this.getExampleOctober(),
            this.getExampleNovember()
        ];
    },

    /**
     * January - Test month identical to reference/2026-01.json
     * Shows: Exact same structure as working imported file
     */
    getExampleJanuary() {
        const exampleYear = this.EXAMPLE_YEAR;
        return {
            "key": `${exampleYear}-01`,
            "year": exampleYear,
            "month": 1,
            "monthName": "January",
            "dateRange": {
                "start": `${exampleYear-1}-12-31`,
                "end": `${exampleYear}-01-30`
            },
            "weeklyBreakdown": [
                {
                    "dateRange": "1-5",
                    "weekRange": "1-5",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 22,
                    "weekly-variable-food": "Estimate: £2.80\n= 10",
                    "Food": "Estimate: £2.80\n= 10",
                    "weekly-variable-travel": "Estimate: £2.80\n=",
                    "Travel": "Estimate: £2.80\n=",
                    "weekly-variable-activities": "Estimate: £2.80\n=12",
                    "Activities": "Estimate: £2.80\n=12"
                },
                {
                    "dateRange": "6-12",
                    "weekRange": "6-12",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 30,
                    "weekly-variable-food": "Estimate: £2.80\n=",
                    "Food": "Estimate: £2.80\n=",
                    "weekly-variable-travel": "Estimate: £2.80\n=",
                    "Travel": "Estimate: £2.80\n=",
                    "weekly-variable-activities": "Estimate: £2.80\n=20 + 10",
                    "Activities": "Estimate: £2.80\n=20 + 10"
                },
                {
                    "dateRange": "13-19",
                    "weekRange": "13-19",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 0,
                    "weekly-variable-food": "Estimate: £2.80\n=",
                    "Food": "Estimate: £2.80\n=",
                    "weekly-variable-travel": "Estimate: £2.80\n=",
                    "Travel": "Estimate: £2.80\n=",
                    "weekly-variable-activities": "Estimate: £2.80\n=",
                    "Activities": "Estimate: £2.80\n="
                },
                {
                    "dateRange": "20-26",
                    "weekRange": "20-26",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 0,
                    "weekly-variable-food": "Estimate: £2.80\n=",
                    "Food": "Estimate: £2.80\n=",
                    "weekly-variable-travel": "Estimate: £2.80\n=",
                    "Travel": "Estimate: £2.80\n=",
                    "weekly-variable-activities": "Estimate: £2.80\n=",
                    "Activities": "Estimate: £2.80\n="
                },
                {
                    "dateRange": "27-31",
                    "weekRange": "27-31",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 0,
                    "weekly-variable-food": "Estimate: £2.80\n=",
                    "Food": "Estimate: £2.80\n=",
                    "weekly-variable-travel": "Estimate: £2.80\n=",
                    "Travel": "Estimate: £2.80\n=",
                    "weekly-variable-activities": "Estimate: £2.80\n=",
                    "Activities": "Estimate: £2.80\n="
                }
            ],
            "fixedCosts": [
                {
                    "category": "",
                    "estimatedAmount": 0,
                    "actualAmount": 0,
                    "date": "",
                    "card": "",
                    "paid": false,
                    "comments": ""
                }
            ],
            "variableCosts": [
                {
                    "category": "Food",
                    "estimatedAmount": 14,
                    "actualAmount": 0,
                    "comments": ""
                },
                {
                    "category": "Travel",
                    "estimatedAmount": 14,
                    "actualAmount": 0,
                    "comments": ""
                },
                {
                    "category": "Activities",
                    "estimatedAmount": 14,
                    "actualAmount": 0,
                    "comments": ""
                },
                {
                    "category": "",
                    "estimatedAmount": 0,
                    "actualAmount": 0,
                    "comments": ""
                }
            ],
            "unplannedExpenses": [
                {
                    "name": "",
                    "amount": 0,
                    "date": "",
                    "card": "",
                    "paid": false,
                    "comments": ""
                }
            ],
            "incomeSources": [
                {
                    "source": "",
                    "estimated": 0,
                    "actual": 0,
                    "date": "",
                    "description": "",
                    "comments": ""
                },
                {
                    "source": "",
                    "estimated": 0,
                    "actual": 0,
                    "date": "",
                    "description": "",
                    "comments": ""
                }
            ],
            "pots": [],
            "createdAt": new Date().toISOString(),
            "updatedAt": new Date().toISOString()
        };
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
                "end": `${exampleYear}-09-30`
            },
            "weeklyBreakdown": [
                {
                    "dateRange": "1-4",
                    "weekRange": "1-4",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 22,
                    "weekly-variable-food": "Estimate: £2.80\n= 10",
                    "Food": "Estimate: £2.80\n= 10",
                    "weekly-variable-travel": "Estimate: £2.80\n=12",
                    "Travel": "Estimate: £2.80\n=12",
                    "weekly-variable-activities": "Estimate: £2.80\n=12",
                    "Activities": "Estimate: £2.80\n=12"
                },
                {
                    "dateRange": "5-11",
                    "weekRange": "5-11",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 30,
                    "weekly-variable-food": "Estimate: £2.80\n=",
                    "Food": "Estimate: £2.80\n=",
                    "weekly-variable-travel": "Estimate: £2.80\n=",
                    "Travel": "Estimate: £2.80\n=",
                    "weekly-variable-activities": "Estimate: £2.80\n=20 + 10",
                    "Activities": "Estimate: £2.80\n=20 + 10"
                },
                {
                    "dateRange": "12-18",
                    "weekRange": "12-18",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 0,
                    "weekly-variable-food": "Estimate: £2.80\n=",
                    "Food": "Estimate: £2.80\n=",
                    "weekly-variable-travel": "Estimate: £2.80\n=",
                    "Travel": "Estimate: £2.80\n=",
                    "weekly-variable-activities": "Estimate: £2.80\n=",
                    "Activities": "Estimate: £2.80\n="
                },
                {
                    "dateRange": "19-25",
                    "weekRange": "19-25",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 0,
                    "weekly-variable-food": "Estimate: £2.80\n=",
                    "Food": "Estimate: £2.80\n=",
                    "weekly-variable-travel": "Estimate: £2.80\n=",
                    "Travel": "Estimate: £2.80\n=",
                    "weekly-variable-activities": "Estimate: £2.80\n=",
                    "Activities": "Estimate: £2.80\n="
                },
                {
                    "dateRange": "26-30",
                    "weekRange": "26-30",
                    "paymentsDue": "",
                    "estimate": 5.6,
                    "weeklyEstimate": 5.6,
                    "actual": 0,
                    "weekly-variable-food": "Estimate: £2.80\n=",
                    "Food": "Estimate: £2.80\n=",
                    "weekly-variable-travel": "Estimate: £2.80\n=",
                    "Travel": "Estimate: £2.80\n=",
                    "weekly-variable-activities": "Estimate: £2.80\n=",
                    "Activities": "Estimate: £2.80\n="
                }
            ],
            "fixedCosts": [
                {
                    "category": "",
                    "estimatedAmount": 0,
                    "actualAmount": 0,
                    "date": "",
                    "card": "",
                    "paid": false,
                    "comments": ""
                }
            ],
            "variableCosts": [
                {
                    "category": "Food",
                    "estimatedAmount": 14,
                    "actualAmount": 0,
                    "comments": ""
                },
                {
                    "category": "Travel",
                    "estimatedAmount": 14,
                    "actualAmount": 0,
                    "comments": ""
                },
                {
                    "category": "Activities",
                    "estimatedAmount": 14,
                    "actualAmount": 0,
                    "comments": ""
                },
                {
                    "category": "",
                    "estimatedAmount": 0,
                    "actualAmount": 0,
                    "comments": ""
                }
            ],
            "unplannedExpenses": [
                {
                    "name": "",
                    "amount": 0,
                    "date": "",
                    "card": "",
                    "paid": false,
                    "comments": ""
                }
            ],
            "incomeSources": [
                {
                    "source": "",
                    "estimated": 0,
                    "actual": 0,
                    "date": "",
                    "description": "",
                    "comments": ""
                },
                {
                    "source": "",
                    "estimated": 0,
                    "actual": 0,
                    "date": "",
                    "description": "",
                    "comments": ""
                }
            ],
            "pots": [],
            "createdAt": "2025-12-20T17:23:10.982Z",
            "updatedAt": "2025-12-20T17:24:56.414Z"
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
                    "paymentsDue": "Rent/Mortgage: £1,200.00 (Bank Transfer) ✓\nGym Membership: £40.00 (Credit Card) ✓\nSpotify Premium: £12.00 (Credit Card) ✓\nNetflix: £15.00 (Credit Card) ✓",
                    "weekly-variable-food": "Estimate: £85.00\n= 25+30+18+27",
                    "Food": "Estimate: £85.00\n= 25+30+18+27",
                    "weekly-variable-travel": "Estimate: £40.00\n= 42",
                    "Travel": "Estimate: £40.00\n= 42",
                    "weekly-variable-activities": "Estimate: £50.00\n= 20+35+15",
                    "Activities": "Estimate: £50.00\n= 20+35+15",
                    "estimate": 1492,
                    "weeklyEstimate": 1492,
                    "actual": 1437
                },
                {
                    "dateRange": "8-14",
                    "weekRange": "8-14",
                    "paymentsDue": "Electricity: £72.00 (Debit Card) ✓\nWater Bill: £28.00 (Debit Card) ✓\nCloud Storage: £10.00 (Credit Card) ✓",
                    "weekly-variable-food": "Estimate: £85.00\n= 45+22+33",
                    "Food": "Estimate: £85.00\n= 45+22+33",
                    "weekly-variable-travel": "Estimate: £40.00\n= 65",
                    "Travel": "Estimate: £40.00\n= 65",
                    "weekly-variable-activities": "Estimate: £50.00\n= 45",
                    "Activities": "Estimate: £50.00\n= 45",
                    "estimate": 335,
                    "weeklyEstimate": 335,
                    "actual": 320
                },
                {
                    "dateRange": "15-21",
                    "weekRange": "15-21",
                    "paymentsDue": "Phone Plan: £45.00 (Debit Card) ✓\nHealth Insurance: £85.00 (Bank Transfer) ✓\nApp Subscriptions: £25.00 (Credit Card) ✓",
                    "weekly-variable-food": "Estimate: £85.00\n= 28+42+15+20",
                    "Food": "Estimate: £85.00\n= 28+42+15+20",
                    "weekly-variable-travel": "Estimate: £40.00\n= 38",
                    "Travel": "Estimate: £40.00\n= 38",
                    "weekly-variable-activities": "Estimate: £50.00\n= 60+15",
                    "Activities": "Estimate: £50.00\n= 60+15",
                    "estimate": 380,
                    "weeklyEstimate": 380,
                    "actual": 358
                },
                {
                    "dateRange": "22-31",
                    "weekRange": "22-31",
                    "paymentsDue": "Internet: £55.00 (Debit Card) ✓\nCar Payment: £250.00 (Bank Transfer) ✓",
                    "weekly-variable-food": "Estimate: £85.00\n= 35+28+40",
                    "Food": "Estimate: £85.00\n= 35+28+40",
                    "weekly-variable-travel": "Estimate: £40.00\n= 55",
                    "Travel": "Estimate: £40.00\n= 55",
                    "weekly-variable-activities": "Estimate: £50.00\n= 40+25+15",
                    "Activities": "Estimate: £50.00\n= 40+25+15",
                    "estimate": 530,
                    "weeklyEstimate": 530,
                    "actual": 528
                }
            ],
            "incomeSources": [
                { "source": "Primary Job", "estimated": 3200, "actual": 3250, "date": "1st", "description": "Monthly salary after tax" },
                { "source": "Freelance Work", "estimated": 400, "actual": 550, "date": "15th", "description": "Web design project" },
                { "source": "Dividend Income", "estimated": 50, "actual": 48, "date": "20th", "description": "Quarterly dividend" }
            ],
            "fixedCosts": [
                { "category": "Rent/Mortgage", "estimatedAmount": 1200, "actualAmount": 1200, "date": "1", "card": "Bank Transfer", "paid": true },
                { "category": "Gym Membership", "estimatedAmount": 40, "actualAmount": 40, "date": "1", "card": "Credit Card", "paid": true },
                { "category": "Spotify Premium", "estimatedAmount": 12, "actualAmount": 12, "date": "3", "card": "Credit Card", "paid": true },
                { "category": "Netflix", "estimatedAmount": 15, "actualAmount": 15, "date": "5", "card": "Credit Card", "paid": true },
                { "category": "Electricity", "estimatedAmount": 70, "actualAmount": 72, "date": "8", "card": "Debit Card", "paid": true },
                { "category": "Water Bill", "estimatedAmount": 30, "actualAmount": 28, "date": "10", "card": "Debit Card", "paid": true },
                { "category": "Cloud Storage", "estimatedAmount": 10, "actualAmount": 10, "date": "12", "card": "Credit Card", "paid": true },
                { "category": "Phone Plan", "estimatedAmount": 45, "actualAmount": 45, "date": "15", "card": "Debit Card", "paid": true },
                { "category": "Health Insurance", "estimatedAmount": 85, "actualAmount": 85, "date": "18", "card": "Bank Transfer", "paid": true },
                { "category": "App Subscriptions", "estimatedAmount": 25, "actualAmount": 25, "date": "20", "card": "Credit Card", "paid": true },
                { "category": "Internet", "estimatedAmount": 55, "actualAmount": 55, "date": "22", "card": "Debit Card", "paid": true },
                { "category": "Car Payment", "estimatedAmount": 250, "actualAmount": 250, "date": "28", "card": "Bank Transfer", "paid": true }
            ],
            "variableCosts": [
                { "category": "Food", "estimatedAmount": 400, "actualAmount": 381 },
                { "category": "Travel", "estimatedAmount": 200, "actualAmount": 200 },
                { "category": "Activities", "estimatedAmount": 300, "actualAmount": 225 }
            ],
            "unplannedExpenses": [
                { "name": "Car Service", "amount": 180, "date": "12", "card": "Credit Card", "paid": true },
                { "name": "Birthday Gift", "amount": 45, "date": "18", "card": "Debit Card", "paid": true },
                { "name": "Urgent Plumber", "amount": 120, "date": "25", "card": "Debit Card", "paid": true }
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
                    "paymentsDue": "Rent: £1,200.00 (Bank Transfer) ✓\nGym Membership: £40.00 (Credit Card) ✓\nStreaming Services: £35.00 (Credit Card) ✓",
                    "weekly-variable-food": "Estimate: £68.00\n= 22+35+28",
                    "Food": "Estimate: £68.00\n= 22+35+28",
                    "weekly-variable-travel": "Estimate: £32.00\n= 38",
                    "Travel": "Estimate: £32.00\n= 38",
                    "weekly-variable-activities": "Estimate: £40.00\n= 45+20",
                    "Activities": "Estimate: £40.00\n= 45+20",
                    "estimate": 1410,
                    "weeklyEstimate": 1410,
                    "actual": 1388
                },
                {
                    "dateRange": "8-14",
                    "weekRange": "8-14",
                    "paymentsDue": "Electricity: £68.00 (Debit Card) ✓\nWater: £25.00 (Debit Card) ✓",
                    "weekly-variable-food": "Estimate: £68.00\n= 30+25+18+22",
                    "Food": "Estimate: £68.00\n= 30+25+18+22",
                    "weekly-variable-travel": "Estimate: £32.00\n= 45",
                    "Travel": "Estimate: £32.00\n= 45",
                    "weekly-variable-activities": "Estimate: £40.00\n= 30",
                    "Activities": "Estimate: £40.00\n= 30",
                    "estimate": 268,
                    "weeklyEstimate": 268,
                    "actual": 263
                },
                {
                    "dateRange": "15-21",
                    "weekRange": "15-21",
                    "paymentsDue": "Phone Plan: £42.00 (Debit Card) ✓\nHealth Insurance: £85.00 (Bank Transfer) ✓",
                    "weekly-variable-food": "Estimate: £68.00\n= 28+35+20",
                    "Food": "Estimate: £68.00\n= 28+35+20",
                    "weekly-variable-travel": "Estimate: £32.00\n=35",
                    "Travel": "Estimate: £32.00\n=35",
                    "weekly-variable-activities": "Estimate: £40.00\n= 65+25",
                    "Activities": "Estimate: £40.00\n= 65+25",
                    "estimate": 337,
                    "weeklyEstimate": 337,
                    "actual": 335
                },
                {
                    "dateRange": "22-28",
                    "weekRange": "22-28",
                    "paymentsDue": "Internet: £50.00 (Debit Card)\nCar Insurance: £75.00 (Bank Transfer)",
                    "weekly-variable-food": "Estimate: £68.00\n= 35+28+22",
                    "Food": "Estimate: £68.00\n= 35+28+22",
                    "weekly-variable-travel": "Estimate: £32.00\n= 35",
                    "Travel": "Estimate: £32.00\n= 35",
                    "weekly-variable-activities": "Estimate: £40.00\n= 40+25",
                    "Activities": "Estimate: £40.00\n= 40+25",
                    "estimate": 300,
                    "weeklyEstimate": 300,
                    "actual": 275
                },
                {
                    "dateRange": "29-30",
                    "weekRange": "29-30",
                    "paymentsDue": "",
                    "weekly-variable-food": "Estimate: £68.00\n=",
                    "Food": "Estimate: £68.00\n=",
                    "weekly-variable-travel": "Estimate: £32.00\n=",
                    "Travel": "Estimate: £32.00\n=",
                    "weekly-variable-activities": "Estimate: £40.00\n=",
                    "Activities": "Estimate: £40.00\n=",
                    "estimate": 85,
                    "weeklyEstimate": 85,
                    "actual": 0
                }
            ],
            "incomeSources": [
                { "source": "Salary", "estimated": 3100, "actual": 3100, "date": "1st", "description": "Monthly salary" },
                { "source": "Side Project", "estimated": 200, "actual": 175, "date": "20th", "description": "Consulting work" }
            ],
            "fixedCosts": [
                { "category": "Rent", "estimatedAmount": 1200, "actualAmount": 1200, "date": "1", "card": "Bank Transfer", "paid": true },
                { "category": "Gym Membership", "estimatedAmount": 40, "actualAmount": 40, "date": "1", "card": "Credit Card", "paid": true },
                { "category": "Streaming Services", "estimatedAmount": 35, "actualAmount": 35, "date": "5", "card": "Credit Card", "paid": true },
                { "category": "Electricity", "estimatedAmount": 70, "actualAmount": 68, "date": "8", "card": "Debit Card", "paid": true },
                { "category": "Water", "estimatedAmount": 25, "actualAmount": 25, "date": "10", "card": "Debit Card", "paid": true },
                { "category": "Phone Plan", "estimatedAmount": 42, "actualAmount": 42, "date": "15", "card": "Debit Card", "paid": true },
                { "category": "Health Insurance", "estimatedAmount": 85, "actualAmount": 85, "date": "18", "card": "Bank Transfer", "paid": true },
                { "category": "Internet", "estimatedAmount": 50, "actualAmount": 50, "date": "22", "card": "Debit Card", "paid": false },
                { "category": "Car Insurance", "estimatedAmount": 75, "actualAmount": 75, "date": "25", "card": "Bank Transfer", "paid": false }
            ],
            "variableCosts": [
                { "category": "Food", "estimatedAmount": 340, "actualAmount": 265 },
                { "category": "Travel", "estimatedAmount": 160, "actualAmount": 118 },
                { "category": "Activities", "estimatedAmount": 200, "actualAmount": 185 }
            ],
            "unplannedExpenses": [
                { "name": "Black Friday Deals", "amount": 150, "date": "25", "card": "Credit Card", "paid": true, "comments": "Holiday shopping" },
                { "name": "Thanksgiving Dinner", "amount": 85, "date": "28", "card": "Debit Card", "paid": true }
            ],
            "pots": [
                { "category": "Emergency Fund", "estimatedAmount": 500, "actualAmount": 500 },
                { "category": "Christmas Savings", "estimatedAmount": 400, "actualAmount": 400 },
                { "category": "Travel Fund", "estimatedAmount": 200, "actualAmount": 200 }
            ],
            "createdAt": new Date().toISOString(),
            "updatedAt": new Date().toISOString()
        };
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.ExampleData = ExampleData;
}
