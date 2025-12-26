-- Messaging and Payment Notifications - Database Schema
-- This script adds messaging system and extends notifications for payment events
-- Run this AFTER 11-add-notifications.sql
-- 
-- SETUP ORDER:
-- 1. Run 01-schema-fresh-install.sql first
-- 2. Run other schema migrations (02-11)
-- 3. Run this script (12-add-messaging-and-payment-notifications.sql)

-- Drop existing CHECK constraint on notifications.type if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'notifications_type_check' 
        AND conrelid = 'notifications'::regclass
    ) THEN
        ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
    END IF;
END $$;

-- Add new CHECK constraint with all notification types
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
        'share_request', 'share_accepted', 'share_declined', 'share_blocked',
        'subscription_created', 'subscription_updated', 'subscription_cancelled', 'subscription_expired',
        'payment_succeeded', 'payment_failed', 'invoice_paid', 'checkout_completed',
        'message_received'
    ));

-- Add conversation_id column to notifications table (for message notifications)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS conversation_id BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS payment_id BIGINT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS subscription_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS invoice_id TEXT;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_notifications_conversation_id ON notifications(conversation_id);
CREATE INDEX IF NOT EXISTS idx_notifications_payment_id ON notifications(payment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_subscription_id ON notifications(subscription_id);
CREATE INDEX IF NOT EXISTS idx_notifications_invoice_id ON notifications(invoice_id);

-- Conversations table (tracks conversations between users)
CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Ensure user1_id < user2_id for consistent ordering and unique constraint
    CONSTRAINT conversations_user_order CHECK (user1_id < user2_id),
    UNIQUE(user1_id, user2_id)
);

-- Messages table (stores individual messages in conversations)
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for conversations table
CREATE INDEX IF NOT EXISTS idx_conversations_user1_id ON conversations(user1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user2_id ON conversations(user2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user1_user2 ON conversations(user1_id, user2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);

-- Indexes for messages table
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(read);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_read ON messages(recipient_id, read);

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversations
-- Users can view conversations they are part of
DROP POLICY IF EXISTS "Users can view their conversations" ON conversations;
CREATE POLICY "Users can view their conversations" ON conversations
    FOR SELECT USING (user1_id = auth.uid() OR user2_id = auth.uid());

-- Users can create conversations (system will handle user ordering)
DROP POLICY IF EXISTS "Users can create conversations" ON conversations;
CREATE POLICY "Users can create conversations" ON conversations
    FOR INSERT WITH CHECK (user1_id = auth.uid() OR user2_id = auth.uid());

-- Users can update conversations they are part of (for last_message_at updates)
DROP POLICY IF EXISTS "Users can update their conversations" ON conversations;
CREATE POLICY "Users can update their conversations" ON conversations
    FOR UPDATE USING (user1_id = auth.uid() OR user2_id = auth.uid())
    WITH CHECK (user1_id = auth.uid() OR user2_id = auth.uid());

-- RLS Policies for messages
-- Users can view messages in conversations they are part of
DROP POLICY IF EXISTS "Users can view their messages" ON messages;
CREATE POLICY "Users can view their messages" ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = messages.conversation_id 
            AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
        )
    );

-- Users can send messages (must be sender)
DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages
    FOR INSERT WITH CHECK (
        sender_id = auth.uid() 
        AND EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = messages.conversation_id 
            AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
        )
    );

-- Users can update their own messages or mark received messages as read
DROP POLICY IF EXISTS "Users can update their messages" ON messages;
CREATE POLICY "Users can update their messages" ON messages
    FOR UPDATE USING (
        sender_id = auth.uid() OR recipient_id = auth.uid()
    )
    WITH CHECK (
        sender_id = auth.uid() OR recipient_id = auth.uid()
    );

-- Add updated_at trigger for conversations
CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversations_updated_at();

-- Update notification_preferences default JSONB to include payment and messaging preferences
DO $$
BEGIN
    -- Update existing rows that don't have the new preferences
    UPDATE settings
    SET notification_preferences = notification_preferences || '{
        "payment_notifications": true,
        "message_notifications": true
    }'::jsonb
    WHERE notification_preferences IS NULL 
       OR NOT (notification_preferences ? 'payment_notifications')
       OR NOT (notification_preferences ? 'message_notifications');
END $$;

-- Update the default value for new rows
ALTER TABLE settings ALTER COLUMN notification_preferences SET DEFAULT '{
    "share_requests": true,
    "share_responses": true,
    "in_app_enabled": true,
    "email_enabled": false,
    "auto_accept_shares": false,
    "auto_decline_shares": false,
    "quiet_hours_enabled": false,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "08:00",
    "payment_notifications": true,
    "message_notifications": true
}'::jsonb;

-- Add comments to document the new columns
COMMENT ON COLUMN notifications.conversation_id IS 'Reference to conversation for message_received notifications';
COMMENT ON COLUMN notifications.payment_id IS 'Reference to payment_history for payment-related notifications';
COMMENT ON COLUMN notifications.subscription_id IS 'Reference to subscriptions for subscription-related notifications';
COMMENT ON COLUMN notifications.invoice_id IS 'Stripe invoice ID for invoice-related notifications';
COMMENT ON TABLE conversations IS 'Tracks conversations between pairs of users';
COMMENT ON TABLE messages IS 'Stores individual messages within conversations';

