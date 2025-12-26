-- Data Sharing Feature - Database Schema
-- This script adds data sharing and field-level locking capabilities
-- Run this AFTER 01-schema-fresh-install.sql and other schema migrations
-- 
-- SETUP ORDER:
-- 1. Run 01-schema-fresh-install.sql first
-- 2. Run other schema migrations (02-08)
-- 3. Run this script (09-add-data-sharing.sql)

-- Data shares table (tracks which users have access to which data)
CREATE TABLE IF NOT EXISTS data_shares (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id UUID NOT NULL,
    shared_with_user_id UUID NOT NULL,
    access_level TEXT NOT NULL CHECK (access_level IN ('read', 'read_write', 'read_write_delete')),
    shared_months JSONB DEFAULT '[]',
    shared_pots BOOLEAN DEFAULT false,
    shared_settings BOOLEAN DEFAULT false,
    share_all_data BOOLEAN DEFAULT false, -- If true, shares all data (months, pots, settings) regardless of individual flags
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
    notification_sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_user_id, shared_with_user_id)
);

-- Add comment to document the share_all_data column
COMMENT ON COLUMN data_shares.share_all_data IS 'If true, shares all data (months, pots, settings) regardless of individual flags';

-- Add new columns if they don't exist (for existing tables)
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- Add check constraint for status if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'data_shares_status_check' 
        AND conrelid = 'data_shares'::regclass
    ) THEN
        ALTER TABLE data_shares ADD CONSTRAINT data_shares_status_check 
            CHECK (status IN ('pending', 'accepted', 'declined', 'blocked'));
    END IF;
END $$;

-- Field locks table (prevents concurrent edits to the same field)
CREATE TABLE IF NOT EXISTS field_locks (
    id BIGSERIAL PRIMARY KEY,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('month', 'pot', 'setting')),
    resource_id TEXT NOT NULL,
    field_path TEXT NOT NULL,
    locked_by_user_id UUID NOT NULL,
    owner_user_id UUID NOT NULL,
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE(resource_type, resource_id, field_path)
);

-- Indexes for data_shares table
CREATE INDEX IF NOT EXISTS idx_data_shares_owner_user_id ON data_shares(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_data_shares_shared_with_user_id ON data_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_data_shares_owner_shared ON data_shares(owner_user_id, shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_data_shares_access_level ON data_shares(access_level);
CREATE INDEX IF NOT EXISTS idx_data_shares_created_at ON data_shares(created_at);

-- Indexes for field_locks table
CREATE INDEX IF NOT EXISTS idx_field_locks_resource ON field_locks(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_field_locks_locked_by_user_id ON field_locks(locked_by_user_id);
CREATE INDEX IF NOT EXISTS idx_field_locks_owner_user_id ON field_locks(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_field_locks_expires_at ON field_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_field_locks_resource_field ON field_locks(resource_type, resource_id, field_path);

-- Triggers to auto-update updated_at for data_shares
DROP TRIGGER IF EXISTS update_data_shares_updated_at ON data_shares;
CREATE TRIGGER update_data_shares_updated_at BEFORE UPDATE ON data_shares
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically set expires_at when a lock is created (default 5 minutes)
CREATE OR REPLACE FUNCTION set_field_lock_expiration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at = NOW() + INTERVAL '5 minutes';
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-set expiration time for field locks
DROP TRIGGER IF EXISTS set_field_lock_expiration_trigger ON field_locks;
CREATE TRIGGER set_field_lock_expiration_trigger BEFORE INSERT ON field_locks
    FOR EACH ROW EXECUTE FUNCTION set_field_lock_expiration();

-- Function to clean up expired locks (can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_locks()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM field_locks
    WHERE expires_at < NOW();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Enable Row Level Security
ALTER TABLE data_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_locks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for data_shares
-- Owners can manage their shares (SELECT, INSERT, UPDATE, DELETE)
DROP POLICY IF EXISTS "Owners can manage their shares" ON data_shares;
CREATE POLICY "Owners can manage their shares" ON data_shares
    FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- Shared users can only SELECT shares where they are the shared_with_user_id
-- Only show accepted shares (or pending for the recipient to see their pending requests)
DROP POLICY IF EXISTS "Shared users can view shares" ON data_shares;
CREATE POLICY "Shared users can view shares" ON data_shares
    FOR SELECT USING (
        shared_with_user_id = auth.uid() 
        AND (status = 'accepted' OR status = 'pending')
    );

-- RLS Policies for field_locks
-- Users can see all locks for resources they own or have access to
DROP POLICY IF EXISTS "Users can view relevant locks" ON field_locks;
CREATE POLICY "Users can view relevant locks" ON field_locks
    FOR SELECT USING (
        owner_user_id = auth.uid() OR
        locked_by_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = field_locks.owner_user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND data_shares.access_level IN ('read_write', 'read_write_delete')
        )
    );

-- Users can create locks for fields they have write access to
DROP POLICY IF EXISTS "Users can create locks for accessible fields" ON field_locks;
CREATE POLICY "Users can create locks for accessible fields" ON field_locks
    FOR INSERT WITH CHECK (
        owner_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = field_locks.owner_user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND data_shares.access_level IN ('read_write', 'read_write_delete')
        )
    );

-- Users can only delete their own locks
DROP POLICY IF EXISTS "Users can delete their own locks" ON field_locks;
CREATE POLICY "Users can delete their own locks" ON field_locks
    FOR DELETE USING (locked_by_user_id = auth.uid());

-- Users can update their own locks (to extend expiration)
DROP POLICY IF EXISTS "Users can update their own locks" ON field_locks;
CREATE POLICY "Users can update their own locks" ON field_locks
    FOR UPDATE USING (locked_by_user_id = auth.uid())
    WITH CHECK (locked_by_user_id = auth.uid());

-- Update RLS policies on user_months to allow shared access
-- Note: This extends the existing policy to include shared users
DROP POLICY IF EXISTS "Allow shared users to read months" ON user_months;
CREATE POLICY "Allow shared users to read months" ON user_months
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = user_months.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND (
                data_shares.share_all_data = true OR
                (data_shares.shared_months @> jsonb_build_array(jsonb_build_object('year', user_months.year, 'month', user_months.month)))
                OR
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements(data_shares.shared_months) AS month_range
                    WHERE month_range->>'type' = 'range'
                    AND (month_range->>'startYear')::INTEGER <= user_months.year
                    AND (month_range->>'endYear')::INTEGER >= user_months.year
                    AND (
                        (month_range->>'startYear')::INTEGER < user_months.year OR
                        ((month_range->>'startYear')::INTEGER = user_months.year AND (month_range->>'startMonth')::INTEGER <= user_months.month)
                    )
                    AND (
                        (month_range->>'endYear')::INTEGER > user_months.year OR
                        ((month_range->>'endYear')::INTEGER = user_months.year AND (month_range->>'endMonth')::INTEGER >= user_months.month)
                    )
                )
            )
        )
    );

-- Allow shared users to update months based on access level
DROP POLICY IF EXISTS "Allow shared users to update months" ON user_months;
CREATE POLICY "Allow shared users to update months" ON user_months
    FOR UPDATE USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = user_months.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.access_level IN ('read_write', 'read_write_delete')
            AND (
                data_shares.share_all_data = true OR
                (data_shares.shared_months @> jsonb_build_array(jsonb_build_object('year', user_months.year, 'month', user_months.month)))
                OR
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements(data_shares.shared_months) AS month_range
                    WHERE month_range->>'type' = 'range'
                    AND (month_range->>'startYear')::INTEGER <= user_months.year
                    AND (month_range->>'endYear')::INTEGER >= user_months.year
                    AND (
                        (month_range->>'startYear')::INTEGER < user_months.year OR
                        ((month_range->>'startYear')::INTEGER = user_months.year AND (month_range->>'startMonth')::INTEGER <= user_months.month)
                    )
                    AND (
                        (month_range->>'endYear')::INTEGER > user_months.year OR
                        ((month_range->>'endYear')::INTEGER = user_months.year AND (month_range->>'endMonth')::INTEGER >= user_months.month)
                    )
                )
            )
        )
    )
    WITH CHECK (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = user_months.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.access_level IN ('read_write', 'read_write_delete')
            AND (
                data_shares.share_all_data = true OR
                (data_shares.shared_months @> jsonb_build_array(jsonb_build_object('year', user_months.year, 'month', user_months.month)))
                OR
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements(data_shares.shared_months) AS month_range
                    WHERE month_range->>'type' = 'range'
                    AND (month_range->>'startYear')::INTEGER <= user_months.year
                    AND (month_range->>'endYear')::INTEGER >= user_months.year
                    AND (
                        (month_range->>'startYear')::INTEGER < user_months.year OR
                        ((month_range->>'startYear')::INTEGER = user_months.year AND (month_range->>'startMonth')::INTEGER <= user_months.month)
                    )
                    AND (
                        (month_range->>'endYear')::INTEGER > user_months.year OR
                        ((month_range->>'endYear')::INTEGER = user_months.year AND (month_range->>'endMonth')::INTEGER >= user_months.month)
                    )
                )
            )
        )
    );

-- Allow shared users to delete months based on access level (read_write_delete only)
DROP POLICY IF EXISTS "Allow shared users to delete months" ON user_months;
CREATE POLICY "Allow shared users to delete months" ON user_months
    FOR DELETE USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = user_months.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.access_level = 'read_write_delete'
            AND (
                data_shares.share_all_data = true OR
                (data_shares.shared_months @> jsonb_build_array(jsonb_build_object('year', user_months.year, 'month', user_months.month)))
                OR
                EXISTS (
                    SELECT 1 FROM jsonb_array_elements(data_shares.shared_months) AS month_range
                    WHERE month_range->>'type' = 'range'
                    AND (month_range->>'startYear')::INTEGER <= user_months.year
                    AND (month_range->>'endYear')::INTEGER >= user_months.year
                    AND (
                        (month_range->>'startYear')::INTEGER < user_months.year OR
                        ((month_range->>'startYear')::INTEGER = user_months.year AND (month_range->>'startMonth')::INTEGER <= user_months.month)
                    )
                    AND (
                        (month_range->>'endYear')::INTEGER > user_months.year OR
                        ((month_range->>'endYear')::INTEGER = user_months.year AND (month_range->>'endMonth')::INTEGER >= user_months.month)
                    )
                )
            )
        )
    );

-- Update RLS policies on pots to allow shared access
DROP POLICY IF EXISTS "Allow shared users to read pots" ON pots;
CREATE POLICY "Allow shared users to read pots" ON pots
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = pots.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND (data_shares.share_all_data = true OR data_shares.shared_pots = true)
        )
    );

DROP POLICY IF EXISTS "Allow shared users to update pots" ON pots;
CREATE POLICY "Allow shared users to update pots" ON pots
    FOR UPDATE USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = pots.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND (data_shares.share_all_data = true OR data_shares.shared_pots = true)
            AND data_shares.access_level IN ('read_write', 'read_write_delete')
        )
    )
    WITH CHECK (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = pots.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND (data_shares.share_all_data = true OR data_shares.shared_pots = true)
            AND data_shares.access_level IN ('read_write', 'read_write_delete')
        )
    );

DROP POLICY IF EXISTS "Allow shared users to delete pots" ON pots;
CREATE POLICY "Allow shared users to delete pots" ON pots
    FOR DELETE USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = pots.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND (data_shares.share_all_data = true OR data_shares.shared_pots = true)
            AND data_shares.access_level = 'read_write_delete'
        )
    );

-- Update RLS policies on settings to allow shared access
DROP POLICY IF EXISTS "Allow shared users to read settings" ON settings;
CREATE POLICY "Allow shared users to read settings" ON settings
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = settings.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND (data_shares.share_all_data = true OR data_shares.shared_settings = true)
        )
    );

DROP POLICY IF EXISTS "Allow shared users to update settings" ON settings;
CREATE POLICY "Allow shared users to update settings" ON settings
    FOR UPDATE USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = settings.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND (data_shares.share_all_data = true OR data_shares.shared_settings = true)
            AND data_shares.access_level IN ('read_write', 'read_write_delete')
        )
    )
    WITH CHECK (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = settings.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND (data_shares.share_all_data = true OR data_shares.shared_settings = true)
            AND data_shares.access_level IN ('read_write', 'read_write_delete')
        )
    );

-- Note: Settings deletion is typically not allowed, but if needed, add similar policy for DELETE

