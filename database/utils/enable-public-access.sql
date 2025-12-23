-- Enable Public Access for Money Tracker Tables
-- Run this script in Supabase SQL Editor to allow anonymous access
-- This is needed if you're not using authentication

-- Drop ALL existing policies first (to avoid conflicts)
-- Use CASCADE to drop dependent policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON user_months CASCADE;
DROP POLICY IF EXISTS "Allow public access" ON user_months CASCADE;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON example_months CASCADE;
DROP POLICY IF EXISTS "Allow public access" ON example_months CASCADE;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON pots CASCADE;
DROP POLICY IF EXISTS "Allow public access" ON pots CASCADE;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON settings CASCADE;
DROP POLICY IF EXISTS "Allow public access" ON settings CASCADE;

-- Alternative: Disable RLS entirely (simpler, but less secure)
-- Uncomment the following lines if policies don't work:
-- ALTER TABLE user_months DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE example_months DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE pots DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- Create public access policies (allow anonymous access)
-- These policies allow all operations (SELECT, INSERT, UPDATE, DELETE) for everyone
CREATE POLICY "Allow public access" ON user_months 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Allow public access" ON example_months 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Allow public access" ON pots 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Allow public access" ON settings 
    FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('user_months', 'example_months', 'pots', 'settings')
ORDER BY tablename, policyname;

