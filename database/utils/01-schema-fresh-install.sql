-- Money Tracker Database Schema - Fresh Install
-- Supabase PostgreSQL Schema
-- Run this script ONCE in Supabase SQL Editor for a fresh installation
-- This creates separate tables for example months and user months
-- 
-- SETUP ORDER:
-- 1. Run this script first (01-schema-fresh-install.sql)
-- 2. Optionally run 02-populate-example-data.sql for example data
-- 3. Optionally run 03-enable-public-access.sql if not using authentication

-- User months table (for user-created months)
CREATE TABLE IF NOT EXISTS user_months (
    user_id UUID NOT NULL,
    id BIGSERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    month_name TEXT NOT NULL,
    date_range JSONB DEFAULT '{}',
    weekly_breakdown JSONB DEFAULT '[]',
    fixed_costs JSONB DEFAULT '[]',
    variable_costs JSONB DEFAULT '[]',
    unplanned_expenses JSONB DEFAULT '[]',
    income_sources JSONB DEFAULT '[]',
    pots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, year, month)
);

-- Example months table (for protected example data)
CREATE TABLE IF NOT EXISTS example_months (
    id BIGSERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    month_name TEXT NOT NULL,
    date_range JSONB DEFAULT '{}',
    weekly_breakdown JSONB DEFAULT '[]',
    fixed_costs JSONB DEFAULT '[]',
    variable_costs JSONB DEFAULT '[]',
    unplanned_expenses JSONB DEFAULT '[]',
    income_sources JSONB DEFAULT '[]',
    pots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(year, month)
);

-- Pots table (user-specific savings pots)
CREATE TABLE IF NOT EXISTS pots (
    user_id UUID NOT NULL,
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    estimated_amount NUMERIC(12, 2) DEFAULT 0,
    actual_amount NUMERIC(12, 2) DEFAULT 0,
    comments TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings table (one row per user)
CREATE TABLE IF NOT EXISTS settings (
    user_id UUID NOT NULL,
    id BIGSERIAL PRIMARY KEY,
    currency TEXT DEFAULT '£',
    font_size TEXT DEFAULT '16',
    default_fixed_costs JSONB DEFAULT '[]',
    default_variable_categories JSONB DEFAULT '["Food", "Travel/Transport", "Activities"]',
    default_pots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_months_user_id ON user_months(user_id);
CREATE INDEX IF NOT EXISTS idx_user_months_year_month ON user_months(year, month);
CREATE INDEX IF NOT EXISTS idx_user_months_user_year_month ON user_months(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_user_months_created_at ON user_months(created_at);
CREATE INDEX IF NOT EXISTS idx_example_months_year_month ON example_months(year, month);
CREATE INDEX IF NOT EXISTS idx_example_months_created_at ON example_months(created_at);
CREATE INDEX IF NOT EXISTS idx_pots_user_id ON pots(user_id);
CREATE INDEX IF NOT EXISTS idx_pots_created_at ON pots(created_at);
CREATE INDEX IF NOT EXISTS idx_settings_user_id ON settings(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers to auto-update updated_at
CREATE TRIGGER update_user_months_updated_at BEFORE UPDATE ON user_months
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_example_months_updated_at BEFORE UPDATE ON example_months
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pots_updated_at BEFORE UPDATE ON pots
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE user_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE example_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE pots ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for authenticated users
-- Note: Adjust these policies based on your authentication requirements
CREATE POLICY "Allow all operations for authenticated users" ON user_months
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON example_months
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON pots
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for authenticated users" ON settings
    FOR ALL USING (true) WITH CHECK (true);

-- For public access (if needed), use:
-- DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON user_months;
-- DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON example_months;
-- DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON pots;
-- DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON settings;
-- CREATE POLICY "Allow public access" ON user_months FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public access" ON example_months FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public access" ON pots FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow public access" ON settings FOR ALL USING (true) WITH CHECK (true);

