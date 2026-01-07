-- =====================================================
-- E2E Encryption Schema for Messenger
-- Created: 2026-01-04
-- Description: Adds end-to-end encryption support to the messaging system
-- =====================================================

-- =====================================================
-- 1. Identity Keys Table
-- Stores public keys for all users (needed for key exchange)
-- =====================================================

CREATE TABLE IF NOT EXISTS identity_keys (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_identity_keys_user_id ON identity_keys(user_id);

COMMENT ON TABLE identity_keys IS 'Public keys for E2E encryption key exchange';
COMMENT ON COLUMN identity_keys.public_key IS 'Base64-encoded X25519 public key';

-- =====================================================
-- 2. Device Keys Table
-- Supports multi-device encryption with QR code pairing
-- =====================================================

CREATE TABLE IF NOT EXISTS device_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT,
    public_key TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    paired_at TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, device_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_keys_user_id ON device_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_device_keys_device_id ON device_keys(device_id);

COMMENT ON TABLE device_keys IS 'Device keys for multi-device E2E encryption';
COMMENT ON COLUMN device_keys.device_name IS 'Human-readable device name (e.g., Chrome on macOS)';
COMMENT ON COLUMN device_keys.is_primary IS 'Whether this is the primary device';

-- =====================================================
-- 3. Update Messages Table
-- Add encryption columns while preserving existing data
-- =====================================================

-- Add new columns for encrypted content
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS encrypted_content TEXT,
ADD COLUMN IF NOT EXISTS encryption_nonce TEXT,
ADD COLUMN IF NOT EXISTS message_counter BIGINT,
ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN DEFAULT false;

-- Add index for encrypted messages
CREATE INDEX IF NOT EXISTS idx_messages_encrypted ON messages(is_encrypted) WHERE is_encrypted = true;

COMMENT ON COLUMN messages.encrypted_content IS 'Base64-encoded encrypted message content';
COMMENT ON COLUMN messages.encryption_nonce IS 'Base64-encoded encryption nonce (24 bytes)';
COMMENT ON COLUMN messages.message_counter IS 'Message counter for forward secrecy';
COMMENT ON COLUMN messages.is_encrypted IS 'Whether this message is encrypted';

-- =====================================================
-- 4. Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on identity_keys table
ALTER TABLE identity_keys ENABLE ROW LEVEL SECURITY;

-- Anyone can read public keys (needed for key exchange)
DROP POLICY IF EXISTS identity_keys_select_all ON identity_keys;
CREATE POLICY identity_keys_select_all ON identity_keys
    FOR SELECT
    USING (true);

-- Users can only insert/update their own keys
DROP POLICY IF EXISTS identity_keys_insert_own ON identity_keys;
CREATE POLICY identity_keys_insert_own ON identity_keys
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS identity_keys_update_own ON identity_keys;
CREATE POLICY identity_keys_update_own ON identity_keys
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own keys
DROP POLICY IF EXISTS identity_keys_delete_own ON identity_keys;
CREATE POLICY identity_keys_delete_own ON identity_keys
    FOR DELETE
    USING (auth.uid() = user_id);

-- Enable RLS on device_keys table
ALTER TABLE device_keys ENABLE ROW LEVEL SECURITY;

-- Users can only view their own devices
DROP POLICY IF EXISTS device_keys_select_own ON device_keys;
CREATE POLICY device_keys_select_own ON device_keys
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own devices
DROP POLICY IF EXISTS device_keys_insert_own ON device_keys;
CREATE POLICY device_keys_insert_own ON device_keys
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own devices
DROP POLICY IF EXISTS device_keys_update_own ON device_keys;
CREATE POLICY device_keys_update_own ON device_keys
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can delete their own devices
DROP POLICY IF EXISTS device_keys_delete_own ON device_keys;
CREATE POLICY device_keys_delete_own ON device_keys
    FOR DELETE
    USING (auth.uid() = user_id);

-- =====================================================
-- 5. Optional: Migration Script (Run Separately After Announcement)
-- =====================================================

-- IMPORTANT: Only run this section AFTER announcing to users
-- This will DELETE all existing plain-text messages
-- Uncomment the lines below when ready to migrate

/*
-- Backup existing messages (recommended)
CREATE TABLE IF NOT EXISTS messages_backup AS
SELECT * FROM messages;

-- DELETE ALL EXISTING MESSAGES (IRREVERSIBLE)
DELETE FROM messages;

-- Make encrypted columns required (no more plain-text)
ALTER TABLE messages DROP COLUMN IF EXISTS content;
ALTER TABLE messages ALTER COLUMN encrypted_content SET NOT NULL;
ALTER TABLE messages ALTER COLUMN encryption_nonce SET NOT NULL;
ALTER TABLE messages ALTER COLUMN message_counter SET NOT NULL;
ALTER TABLE messages ALTER COLUMN is_encrypted SET DEFAULT true;
*/

-- =====================================================
-- 6. Verification Queries
-- =====================================================

-- Check that tables exist
SELECT
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'identity_keys') as identity_keys_exists,
    EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'device_keys') as device_keys_exists;

-- Check that messages table has encryption columns
SELECT
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'messages'
  AND column_name IN ('encrypted_content', 'encryption_nonce', 'message_counter', 'is_encrypted')
ORDER BY column_name;

-- Check RLS policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename IN ('identity_keys', 'device_keys')
ORDER BY tablename, policyname;

-- =====================================================
-- 7. Grant Permissions
-- =====================================================

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON identity_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON device_keys TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE device_keys_id_seq TO authenticated;

-- =====================================================
-- 8. Functions for Key Management
-- =====================================================

-- Function to update last_active timestamp on device_keys
CREATE OR REPLACE FUNCTION update_device_last_active()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_active = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update last_active
DROP TRIGGER IF EXISTS trigger_update_device_last_active ON device_keys;
CREATE TRIGGER trigger_update_device_last_active
    BEFORE UPDATE ON device_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_device_last_active();

-- Function to update updated_at timestamp on identity_keys
CREATE OR REPLACE FUNCTION update_identity_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS trigger_update_identity_keys_updated_at ON identity_keys;
CREATE TRIGGER trigger_update_identity_keys_updated_at
    BEFORE UPDATE ON identity_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_identity_keys_updated_at();

-- =====================================================
-- Completion Message
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE 'E2E Encryption schema installed successfully!';
    RAISE NOTICE 'Tables created: identity_keys, device_keys';
    RAISE NOTICE 'Messages table updated with encryption columns';
    RAISE NOTICE 'RLS policies enabled';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: To complete migration, uncomment section 5 after user announcement';
END $$;
