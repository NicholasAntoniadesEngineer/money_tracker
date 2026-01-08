-- Migration 20: Add User Key Backup Table
-- Purpose: Store password-encrypted private keys for E2E encryption recovery
--
-- Security Design:
-- - Private keys are encrypted with a key derived from user's password
-- - Server never sees plaintext private keys (E2E encryption maintained)
-- - Public keys stored plaintext (they're public anyway)
-- - Each user has unique salt for key derivation (prevents rainbow tables)
-- - Uses PBKDF2 with high iteration count (OWASP recommended)
-- - AES-256-GCM for authenticated encryption (prevents tampering)

BEGIN;

-- Create key backups table
CREATE TABLE IF NOT EXISTS user_key_backups (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Keys (public is plaintext, private is encrypted)
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL, -- Base64-encoded encrypted private key

    -- Key Derivation Function (KDF) parameters
    kdf_algorithm TEXT NOT NULL DEFAULT 'PBKDF2-SHA256', -- Algorithm used
    kdf_salt TEXT NOT NULL, -- Base64-encoded salt (unique per user)
    kdf_iterations INTEGER NOT NULL DEFAULT 600000, -- OWASP 2023 recommendation

    -- Encryption parameters
    encryption_algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
    encryption_nonce TEXT NOT NULL, -- Base64-encoded nonce/IV for AES-GCM

    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ, -- Track when key was last restored

    -- Recovery codes (optional backup method)
    recovery_codes JSONB, -- Array of hashed recovery codes
    recovery_codes_used INTEGER DEFAULT 0, -- Count of used recovery codes

    -- Device tracking
    backup_device_info TEXT, -- Device that created the backup

    -- Constraints
    CONSTRAINT valid_kdf CHECK (kdf_algorithm IN ('PBKDF2-SHA256', 'Argon2id')),
    CONSTRAINT valid_encryption CHECK (encryption_algorithm IN ('AES-256-GCM')),
    CONSTRAINT valid_iterations CHECK (kdf_iterations >= 100000), -- Minimum security
    CONSTRAINT valid_recovery_codes_count CHECK (recovery_codes_used >= 0)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_key_backups_user_id ON user_key_backups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_key_backups_created_at ON user_key_backups(created_at);

-- Enable Row Level Security
ALTER TABLE user_key_backups ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own key backups
CREATE POLICY user_key_backups_select_own
    ON user_key_backups
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY user_key_backups_insert_own
    ON user_key_backups
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_key_backups_update_own
    ON user_key_backups
    FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY user_key_backups_delete_own
    ON user_key_backups
    FOR DELETE
    USING (auth.uid() = user_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_key_backups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_key_backups_updated_at
    BEFORE UPDATE ON user_key_backups
    FOR EACH ROW
    EXECUTE FUNCTION update_user_key_backups_updated_at();

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 20: User key backup table created successfully';
    RAISE NOTICE 'Security: Private keys will be encrypted with password-derived keys';
    RAISE NOTICE 'KDF: PBKDF2-SHA256 with 600,000 iterations (OWASP 2023)';
    RAISE NOTICE 'Encryption: AES-256-GCM (authenticated encryption)';
END $$;

COMMIT;
