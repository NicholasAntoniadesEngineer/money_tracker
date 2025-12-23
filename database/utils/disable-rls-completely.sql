-- Disable RLS Completely for Money Tracker Tables
-- Run this script if RLS policies are causing issues
-- This completely disables Row Level Security (less secure but simpler)

-- Disable RLS on all tables
ALTER TABLE user_months DISABLE ROW LEVEL SECURITY;
ALTER TABLE example_months DISABLE ROW LEVEL SECURITY;
ALTER TABLE pots DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT 
    schemaname, 
    tablename, 
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN ('user_months', 'example_months', 'pots', 'settings')
ORDER BY tablename;

-- Expected result: rls_enabled should be false for all tables

