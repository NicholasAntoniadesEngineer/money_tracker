-- =====================================================
-- E2E Encryption: Full Migration to Encrypted-Only Messages
-- Created: 2026-01-07
-- Description: Completes the migration to E2E encryption by removing plain-text support
-- =====================================================

-- WARNING: This migration is IRREVERSIBLE and will DELETE all existing plain-text messages
-- Ensure all users have been notified and have set up encryption before running this

BEGIN;

-- =====================================================
-- 1. Backup existing messages (recommended)
-- =====================================================

-- Create backup table if it doesn't exist
CREATE TABLE IF NOT EXISTS messages_backup AS
SELECT * FROM messages WHERE false; -- Create empty table with same structure

-- Backup ALL existing messages before deletion
INSERT INTO messages_backup
SELECT * FROM messages;

-- Log backup count
DO $$
DECLARE
    backup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO backup_count FROM messages_backup;
    RAISE NOTICE 'Backed up % messages to messages_backup table', backup_count;
END $$;

-- =====================================================
-- 2. DELETE ALL EXISTING MESSAGES (IRREVERSIBLE)
-- =====================================================

-- Delete all messages (plain-text and any early encrypted messages)
DELETE FROM messages;

RAISE NOTICE 'All messages deleted. Starting fresh with encryption-only.';

-- =====================================================
-- 3. Drop old content column and make encryption columns required
-- =====================================================

-- Drop the old plain-text content column
ALTER TABLE messages DROP COLUMN IF EXISTS content;

-- Make encryption columns NOT NULL (required for all messages)
ALTER TABLE messages ALTER COLUMN encrypted_content SET NOT NULL;
ALTER TABLE messages ALTER COLUMN encryption_nonce SET NOT NULL;
ALTER TABLE messages ALTER COLUMN message_counter SET NOT NULL;
ALTER TABLE messages ALTER COLUMN is_encrypted SET DEFAULT true;
ALTER TABLE messages ALTER COLUMN is_encrypted SET NOT NULL;

-- Add check constraint to ensure is_encrypted is always true
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_must_be_encrypted;
ALTER TABLE messages ADD CONSTRAINT messages_must_be_encrypted
    CHECK (is_encrypted = true);

RAISE NOTICE 'Messages table updated: content column dropped, encryption columns now required';

-- =====================================================
-- 4. Update table comments
-- =====================================================

COMMENT ON TABLE messages IS 'End-to-end encrypted messages (encryption required for all messages)';
COMMENT ON COLUMN messages.encrypted_content IS 'Base64-encoded encrypted message content (required)';
COMMENT ON COLUMN messages.encryption_nonce IS 'Base64-encoded encryption nonce - 24 bytes (required)';
COMMENT ON COLUMN messages.message_counter IS 'Message counter for forward secrecy (required)';
COMMENT ON COLUMN messages.is_encrypted IS 'Always true - all messages must be encrypted';

-- =====================================================
-- 5. Verification
-- =====================================================

-- Verify content column is gone
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages' AND column_name = 'content'
    ) THEN
        RAISE EXCEPTION 'Migration failed: content column still exists';
    END IF;
    RAISE NOTICE '✓ Content column successfully dropped';
END $$;

-- Verify encryption columns are NOT NULL
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'messages'
        AND column_name IN ('encrypted_content', 'encryption_nonce', 'message_counter', 'is_encrypted')
        AND is_nullable = 'YES'
    ) THEN
        RAISE EXCEPTION 'Migration failed: encryption columns are still nullable';
    END IF;
    RAISE NOTICE '✓ All encryption columns are now NOT NULL';
END $$;

-- Show final schema
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;

COMMIT;

-- =====================================================
-- Completion Message
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'E2E Encryption migration completed successfully!';
    RAISE NOTICE '==============================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Changes:';
    RAISE NOTICE '  ✓ All old messages backed up to messages_backup table';
    RAISE NOTICE '  ✓ All messages deleted';
    RAISE NOTICE '  ✓ Plain-text content column dropped';
    RAISE NOTICE '  ✓ Encryption columns now required (NOT NULL)';
    RAISE NOTICE '  ✓ All new messages MUST be encrypted';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Update application code to remove content field';
    RAISE NOTICE '  2. Ensure all users have set up encryption keys';
    RAISE NOTICE '  3. Test messaging functionality';
    RAISE NOTICE '';
END $$;
