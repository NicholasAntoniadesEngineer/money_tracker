-- Populate Complete Example Data into Supabase
-- Run this ONCE in Supabase SQL Editor to add example months
-- Example data uses year 2045 to avoid conflicts with real data
-- This includes ALL complete example data (weekly breakdown, income, fixed costs, variable costs, unplanned expenses, pots)
-- NOTE: This script now inserts into the example_months table (separate from user_months)

-- Insert example months (January, September, October, November 2045)
INSERT INTO example_months (year, month, month_name, date_range, weekly_breakdown, fixed_costs, variable_costs, unplanned_expenses, income_sources, pots, created_at, updated_at)
VALUES 
-- January 2045
(2045, 1, 'January', 
 '{"start": "2044-12-31", "end": "2045-01-30"}'::jsonb,
 '[
   {"dateRange": "1-5", "weekRange": "1-5", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 22, "weekly-variable-food": "Estimate: £2.80\n= 10", "Food": "Estimate: £2.80\n= 10", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=12", "Activities": "Estimate: £2.80\n=12"},
   {"dateRange": "6-12", "weekRange": "6-12", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 30, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=20 + 10", "Activities": "Estimate: £2.80\n=20 + 10"},
   {"dateRange": "13-19", "weekRange": "13-19", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="},
   {"dateRange": "20-26", "weekRange": "20-26", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="},
   {"dateRange": "27-31", "weekRange": "27-31", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="}
 ]'::jsonb,
 '[
   {"category": "", "estimatedAmount": 0, "actualAmount": 0, "date": "", "card": "", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Food", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "Travel", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "Activities", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}
 ]'::jsonb,
 '[
   {"name": "", "amount": 0, "date": "", "card": "", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"source": "", "estimated": 0, "actual": 0, "date": "", "description": "", "comments": ""},
   {"source": "", "estimated": 0, "actual": 0, "date": "", "description": "", "comments": ""}
 ]'::jsonb,
 '[]'::jsonb,
 NOW(), NOW()),

-- September 2045
(2045, 9, 'September',
 '{"start": "2045-08-31", "end": "2045-09-30"}'::jsonb,
 '[
   {"dateRange": "1-4", "weekRange": "1-4", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 22, "weekly-variable-food": "Estimate: £2.80\n= 10", "Food": "Estimate: £2.80\n= 10", "weekly-variable-travel": "Estimate: £2.80\n=12", "Travel": "Estimate: £2.80\n=12", "weekly-variable-activities": "Estimate: £2.80\n=12", "Activities": "Estimate: £2.80\n=12"},
   {"dateRange": "5-11", "weekRange": "5-11", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 30, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=20 + 10", "Activities": "Estimate: £2.80\n=20 + 10"},
   {"dateRange": "12-18", "weekRange": "12-18", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="},
   {"dateRange": "19-25", "weekRange": "19-25", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="},
   {"dateRange": "26-30", "weekRange": "26-30", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="}
 ]'::jsonb,
 '[
   {"category": "", "estimatedAmount": 0, "actualAmount": 0, "date": "", "card": "", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Food", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "Travel", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "Activities", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}
 ]'::jsonb,
 '[
   {"name": "", "amount": 0, "date": "", "card": "", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"source": "", "estimated": 0, "actual": 0, "date": "", "description": "", "comments": ""},
   {"source": "", "estimated": 0, "actual": 0, "date": "", "description": "", "comments": ""}
 ]'::jsonb,
 '[]'::jsonb,
 NOW(), NOW()),

-- October 2045 (Busy month with lots of activity)
(2045, 10, 'October',
 '{"start": "2045-09-30", "end": "2045-10-30"}'::jsonb,
 '[
   {"dateRange": "1-7", "weekRange": "1-7", "paymentsDue": "Rent/Mortgage: £1,200.00 (Bank Transfer) ✓\nGym Membership: £40.00 (Credit Card) ✓\nSpotify Premium: £12.00 (Credit Card) ✓\nNetflix: £15.00 (Credit Card) ✓", "weekly-variable-food": "Estimate: £85.00\n= 25+30+18+27", "Food": "Estimate: £85.00\n= 25+30+18+27", "weekly-variable-travel": "Estimate: £40.00\n= 42", "Travel": "Estimate: £40.00\n= 42", "weekly-variable-activities": "Estimate: £50.00\n= 20+35+15", "Activities": "Estimate: £50.00\n= 20+35+15", "estimate": 1492, "weeklyEstimate": 1492, "actual": 1437},
   {"dateRange": "8-14", "weekRange": "8-14", "paymentsDue": "Electricity: £72.00 (Debit Card) ✓\nWater Bill: £28.00 (Debit Card) ✓\nCloud Storage: £10.00 (Credit Card) ✓", "weekly-variable-food": "Estimate: £85.00\n= 45+22+33", "Food": "Estimate: £85.00\n= 45+22+33", "weekly-variable-travel": "Estimate: £40.00\n= 65", "Travel": "Estimate: £40.00\n= 65", "weekly-variable-activities": "Estimate: £50.00\n= 45", "Activities": "Estimate: £50.00\n= 45", "estimate": 335, "weeklyEstimate": 335, "actual": 320},
   {"dateRange": "15-21", "weekRange": "15-21", "paymentsDue": "Phone Plan: £45.00 (Debit Card) ✓\nHealth Insurance: £85.00 (Bank Transfer) ✓\nApp Subscriptions: £25.00 (Credit Card) ✓", "weekly-variable-food": "Estimate: £85.00\n= 28+42+15+20", "Food": "Estimate: £85.00\n= 28+42+15+20", "weekly-variable-travel": "Estimate: £40.00\n= 38", "Travel": "Estimate: £40.00\n= 38", "weekly-variable-activities": "Estimate: £50.00\n= 60+15", "Activities": "Estimate: £50.00\n= 60+15", "estimate": 380, "weeklyEstimate": 380, "actual": 358},
   {"dateRange": "22-31", "weekRange": "22-31", "paymentsDue": "Internet: £55.00 (Debit Card) ✓\nCar Payment: £250.00 (Bank Transfer) ✓", "weekly-variable-food": "Estimate: £85.00\n= 35+28+40", "Food": "Estimate: £85.00\n= 35+28+40", "weekly-variable-travel": "Estimate: £40.00\n= 55", "Travel": "Estimate: £40.00\n= 55", "weekly-variable-activities": "Estimate: £50.00\n= 40+25+15", "Activities": "Estimate: £50.00\n= 40+25+15", "estimate": 530, "weeklyEstimate": 530, "actual": 528}
 ]'::jsonb,
 '[
   {"category": "Rent/Mortgage", "estimatedAmount": 1200, "actualAmount": 1200, "date": "1", "card": "Bank Transfer", "paid": true, "comments": ""},
   {"category": "Gym Membership", "estimatedAmount": 40, "actualAmount": 40, "date": "1", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Spotify Premium", "estimatedAmount": 12, "actualAmount": 12, "date": "3", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Netflix", "estimatedAmount": 15, "actualAmount": 15, "date": "5", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Electricity", "estimatedAmount": 70, "actualAmount": 72, "date": "8", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Water Bill", "estimatedAmount": 30, "actualAmount": 28, "date": "10", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Cloud Storage", "estimatedAmount": 10, "actualAmount": 10, "date": "12", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Phone Plan", "estimatedAmount": 45, "actualAmount": 45, "date": "15", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Health Insurance", "estimatedAmount": 85, "actualAmount": 85, "date": "18", "card": "Bank Transfer", "paid": true, "comments": ""},
   {"category": "App Subscriptions", "estimatedAmount": 25, "actualAmount": 25, "date": "20", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Internet", "estimatedAmount": 55, "actualAmount": 55, "date": "22", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Car Payment", "estimatedAmount": 250, "actualAmount": 250, "date": "28", "card": "Bank Transfer", "paid": true, "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Food", "estimatedAmount": 400, "actualAmount": 381, "comments": ""},
   {"category": "Travel", "estimatedAmount": 200, "actualAmount": 200, "comments": ""},
   {"category": "Activities", "estimatedAmount": 300, "actualAmount": 225, "comments": ""}
 ]'::jsonb,
 '[
   {"name": "Car Service", "amount": 180, "date": "12", "card": "Credit Card", "paid": true, "comments": ""},
   {"name": "Birthday Gift", "amount": 45, "date": "18", "card": "Debit Card", "paid": true, "comments": ""},
   {"name": "Urgent Plumber", "amount": 120, "date": "25", "card": "Debit Card", "paid": true, "comments": ""}
 ]'::jsonb,
 '[
   {"source": "Primary Job", "estimated": 3200, "actual": 3250, "date": "1st", "description": "Monthly salary after tax", "comments": ""},
   {"source": "Freelance Work", "estimated": 400, "actual": 550, "date": "15th", "description": "Web design project", "comments": ""},
   {"source": "Dividend Income", "estimated": 50, "actual": 48, "date": "20th", "description": "Quarterly dividend", "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Emergency Fund", "estimatedAmount": 3000, "actualAmount": 3200, "comments": ""},
   {"category": "Holiday Savings", "estimatedAmount": 1500, "actualAmount": 1650, "comments": ""},
   {"category": "New Laptop Fund", "estimatedAmount": 800, "actualAmount": 850, "comments": ""},
   {"category": "Investment Account", "estimatedAmount": 2000, "actualAmount": 2100, "comments": ""}
 ]'::jsonb,
 NOW(), NOW()),

-- November 2045 (Moderate month with some variation)
(2045, 11, 'November',
 '{"start": "2045-10-31", "end": "2045-11-29"}'::jsonb,
 '[
   {"dateRange": "1-7", "weekRange": "1-7", "paymentsDue": "Rent: £1,200.00 (Bank Transfer) ✓\nGym Membership: £40.00 (Credit Card) ✓\nStreaming Services: £35.00 (Credit Card) ✓", "weekly-variable-food": "Estimate: £68.00\n= 22+35+28", "Food": "Estimate: £68.00\n= 22+35+28", "weekly-variable-travel": "Estimate: £32.00\n= 38", "Travel": "Estimate: £32.00\n= 38", "weekly-variable-activities": "Estimate: £40.00\n= 45+20", "Activities": "Estimate: £40.00\n= 45+20", "estimate": 1410, "weeklyEstimate": 1410, "actual": 1388},
   {"dateRange": "8-14", "weekRange": "8-14", "paymentsDue": "Electricity: £68.00 (Debit Card) ✓\nWater: £25.00 (Debit Card) ✓", "weekly-variable-food": "Estimate: £68.00\n= 30+25+18+22", "Food": "Estimate: £68.00\n= 30+25+18+22", "weekly-variable-travel": "Estimate: £32.00\n= 45", "Travel": "Estimate: £32.00\n= 45", "weekly-variable-activities": "Estimate: £40.00\n= 30", "Activities": "Estimate: £40.00\n= 30", "estimate": 268, "weeklyEstimate": 268, "actual": 263},
   {"dateRange": "15-21", "weekRange": "15-21", "paymentsDue": "Phone Plan: £42.00 (Debit Card) ✓\nHealth Insurance: £85.00 (Bank Transfer) ✓", "weekly-variable-food": "Estimate: £68.00\n= 28+35+20", "Food": "Estimate: £68.00\n= 28+35+20", "weekly-variable-travel": "Estimate: £32.00\n=35", "Travel": "Estimate: £32.00\n=35", "weekly-variable-activities": "Estimate: £40.00\n= 65+25", "Activities": "Estimate: £40.00\n= 65+25", "estimate": 337, "weeklyEstimate": 337, "actual": 335},
   {"dateRange": "22-28", "weekRange": "22-28", "paymentsDue": "Internet: £50.00 (Debit Card)\nCar Insurance: £75.00 (Bank Transfer)", "weekly-variable-food": "Estimate: £68.00\n= 35+28+22", "Food": "Estimate: £68.00\n= 35+28+22", "weekly-variable-travel": "Estimate: £32.00\n= 35", "Travel": "Estimate: £32.00\n= 35", "weekly-variable-activities": "Estimate: £40.00\n= 40+25", "Activities": "Estimate: £40.00\n= 40+25", "estimate": 300, "weeklyEstimate": 300, "actual": 275},
   {"dateRange": "29-30", "weekRange": "29-30", "paymentsDue": "", "weekly-variable-food": "Estimate: £68.00\n=", "Food": "Estimate: £68.00\n=", "weekly-variable-travel": "Estimate: £32.00\n=", "Travel": "Estimate: £32.00\n=", "weekly-variable-activities": "Estimate: £40.00\n=", "Activities": "Estimate: £40.00\n=", "estimate": 85, "weeklyEstimate": 85, "actual": 0}
 ]'::jsonb,
 '[
   {"category": "Rent", "estimatedAmount": 1200, "actualAmount": 1200, "date": "1", "card": "Bank Transfer", "paid": true, "comments": ""},
   {"category": "Gym Membership", "estimatedAmount": 40, "actualAmount": 40, "date": "1", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Streaming Services", "estimatedAmount": 35, "actualAmount": 35, "date": "5", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Electricity", "estimatedAmount": 70, "actualAmount": 68, "date": "8", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Water", "estimatedAmount": 25, "actualAmount": 25, "date": "10", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Phone Plan", "estimatedAmount": 42, "actualAmount": 42, "date": "15", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Health Insurance", "estimatedAmount": 85, "actualAmount": 85, "date": "18", "card": "Bank Transfer", "paid": true, "comments": ""},
   {"category": "Internet", "estimatedAmount": 50, "actualAmount": 50, "date": "22", "card": "Debit Card", "paid": false, "comments": ""},
   {"category": "Car Insurance", "estimatedAmount": 75, "actualAmount": 75, "date": "25", "card": "Bank Transfer", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Food", "estimatedAmount": 340, "actualAmount": 265, "comments": ""},
   {"category": "Travel", "estimatedAmount": 160, "actualAmount": 118, "comments": ""},
   {"category": "Activities", "estimatedAmount": 200, "actualAmount": 185, "comments": ""}
 ]'::jsonb,
 '[
   {"name": "Black Friday Deals", "amount": 150, "date": "25", "card": "Credit Card", "paid": true, "comments": "Holiday shopping"},
   {"name": "Thanksgiving Dinner", "amount": 85, "date": "28", "card": "Debit Card", "paid": true, "comments": ""}
 ]'::jsonb,
 '[
   {"source": "Salary", "estimated": 3100, "actual": 3100, "date": "1st", "description": "Monthly salary", "comments": ""},
   {"source": "Side Project", "estimated": 200, "actual": 175, "date": "20th", "description": "Consulting work", "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Emergency Fund", "estimatedAmount": 500, "actualAmount": 500, "comments": ""},
   {"category": "Christmas Savings", "estimatedAmount": 400, "actualAmount": 400, "comments": ""},
   {"category": "Travel Fund", "estimatedAmount": 200, "actualAmount": 200, "comments": ""}
 ]'::jsonb,
 NOW(), NOW())

ON CONFLICT (year, month) DO UPDATE SET
    month_name = EXCLUDED.month_name,
    date_range = EXCLUDED.date_range,
    weekly_breakdown = EXCLUDED.weekly_breakdown,
    fixed_costs = EXCLUDED.fixed_costs,
    variable_costs = EXCLUDED.variable_costs,
    unplanned_expenses = EXCLUDED.unplanned_expenses,
    income_sources = EXCLUDED.income_sources,
    pots = EXCLUDED.pots,
    updated_at = NOW();

-- Verify the data was inserted
SELECT year, month, month_name, 
       jsonb_array_length(weekly_breakdown) as weeks_count,
       jsonb_array_length(fixed_costs) as fixed_costs_count,
       jsonb_array_length(variable_costs) as variable_costs_count,
       jsonb_array_length(income_sources) as income_sources_count,
       jsonb_array_length(pots) as pots_count,
       created_at 
FROM example_months 
WHERE year = 2045 
ORDER BY month;
