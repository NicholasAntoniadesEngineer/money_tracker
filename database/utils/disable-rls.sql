-- Disable Row Level Security (Alternative Solution)
-- Run this script in Supabase SQL Editor if you want to disable RLS entirely
-- WARNING: This makes all data publicly accessible without any restrictions
-- Only use this if you're comfortable with completely public access

-- Disable RLS on all tables
ALTER TABLE user_months DISABLE ROW LEVEL SECURITY;
ALTER TABLE example_months DISABLE ROW LEVEL SECURITY;
ALTER TABLE pots DISABLE ROW LEVEL SECURITY;
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('user_months', 'example_months', 'pots', 'settings');

