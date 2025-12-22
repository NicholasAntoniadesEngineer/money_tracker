-- Enable Public Access for Money Tracker Tables
-- Run this script in Supabase SQL Editor to allow anonymous access
-- This is needed if you're not using authentication

-- Drop existing authenticated-only policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON user_months;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON example_months;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON pots;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON settings;

-- Create public access policies (allow anonymous access)
CREATE POLICY "Allow public access" ON user_months 
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access" ON example_months 
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access" ON pots 
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access" ON settings 
    FOR ALL USING (true) WITH CHECK (true);

-- Verify policies are created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('user_months', 'example_months', 'pots', 'settings')
ORDER BY tablename, policyname;

