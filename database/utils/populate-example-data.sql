-- Populate Example Data into Supabase
-- Run this ONCE in Supabase SQL Editor to add example months
-- Example data uses year 2045 to avoid conflicts with real data

-- Insert example months (January, September, October, November 2045)
-- Note: Adjust the JSONB data as needed based on your ExampleData.js structure

INSERT INTO months (year, month, month_name, date_range, weekly_breakdown, fixed_costs, variable_costs, unplanned_expenses, income_sources, pots, created_at, updated_at)
VALUES 
-- January 2045
(2045, 1, 'January', 
 '{"start": "2045-01-01", "end": "2045-01-31"}'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 '[{"category": "Food", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}, {"category": "Travel/Transport", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}, {"category": "Activities", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}]'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 NOW(), NOW()),

-- September 2045
(2045, 9, 'September',
 '{"start": "2045-09-01", "end": "2045-09-30"}'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 '[{"category": "Food", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}, {"category": "Travel/Transport", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}, {"category": "Activities", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}]'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 NOW(), NOW()),

-- October 2045
(2045, 10, 'October',
 '{"start": "2045-10-01", "end": "2045-10-31"}'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 '[{"category": "Food", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}, {"category": "Travel/Transport", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}, {"category": "Activities", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}]'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 NOW(), NOW()),

-- November 2045
(2045, 11, 'November',
 '{"start": "2045-11-01", "end": "2045-11-30"}'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 '[{"category": "Food", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}, {"category": "Travel/Transport", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}, {"category": "Activities", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}]'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 '[]'::jsonb,
 NOW(), NOW())

ON CONFLICT (year, month) DO NOTHING;

-- Verify the data was inserted
SELECT year, month, month_name, created_at 
FROM months 
WHERE year = 2045 
ORDER BY month;

