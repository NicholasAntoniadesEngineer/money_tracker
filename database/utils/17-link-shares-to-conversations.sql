-- Link Data Shares to Conversations
-- This script adds conversation_id to data_shares table to link share requests to conversations
-- Run this AFTER 12-add-messaging-and-payment-notifications.sql
-- 
-- SETUP ORDER:
-- 1. Run 01-schema-fresh-install.sql first
-- 2. Run other schema migrations (02-16)
-- 3. Run this script (17-link-shares-to-conversations.sql)

-- Add conversation_id column to data_shares table
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS conversation_id BIGINT;

-- Add foreign key constraint to conversations table
DO $$
BEGIN
    -- Check if foreign key constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'data_shares_conversation_id_fkey' 
        AND conrelid = 'data_shares'::regclass
    ) THEN
        -- Add foreign key constraint
        ALTER TABLE data_shares 
        ADD CONSTRAINT data_shares_conversation_id_fkey 
        FOREIGN KEY (conversation_id) 
        REFERENCES conversations(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_data_shares_conversation_id ON data_shares(conversation_id);

-- Add comment to document the column
COMMENT ON COLUMN data_shares.conversation_id IS 'Links the share request to a conversation between the owner and recipient for messaging context';

