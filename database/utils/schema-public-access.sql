-- Public Access RLS Policies for GitHub Pages
-- Run this AFTER running the main schema.sql
-- This updates policies to allow public access (no authentication required)

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON months;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON pots;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON settings;

-- Create public access policies (for GitHub Pages deployment)
CREATE POLICY "Allow public access" ON months
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access" ON pots
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow public access" ON settings
    FOR ALL USING (true) WITH CHECK (true);

-- Note: These policies allow ANYONE to read/write your data
-- For production with authentication, use Supabase Auth and update policies accordingly

