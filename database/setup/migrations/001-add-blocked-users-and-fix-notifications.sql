-- Migration: Add blocked_users table and fix notifications schema
-- Run this in Supabase SQL Editor

-- ============================================================
-- 1. ADD SHARE_ID COLUMN TO NOTIFICATIONS TABLE
-- ============================================================

ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS share_id BIGINT REFERENCES data_shares(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_share ON notifications(share_id);

-- ============================================================
-- 2. CREATE BLOCKED_USERS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS blocked_users (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_user ON blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_user_id);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Users can see their own blocked list
CREATE POLICY blocked_users_select_own ON blocked_users
    FOR SELECT USING (auth.uid() = user_id);

-- Users can block others
CREATE POLICY blocked_users_insert_own ON blocked_users
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can unblock others
CREATE POLICY blocked_users_delete_own ON blocked_users
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON blocked_users TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE blocked_users_id_seq TO authenticated;

-- ============================================================
-- 3. CREATE OR REPLACE THE CREATE_NOTIFICATION RPC FUNCTION
-- ============================================================

-- Drop ALL existing versions of create_notification function
DO $$
DECLARE
    func_oid oid;
BEGIN
    FOR func_oid IN
        SELECT p.oid
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'create_notification'
        AND n.nspname = 'public'
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_oid::regprocedure);
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_from_user_id UUID DEFAULT NULL,
    p_share_id BIGINT DEFAULT NULL,
    p_message TEXT DEFAULT NULL,
    p_conversation_id BIGINT DEFAULT NULL,
    p_payment_id BIGINT DEFAULT NULL,
    p_subscription_id BIGINT DEFAULT NULL,
    p_invoice_id BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_notification_id BIGINT;
    v_title TEXT;
BEGIN
    -- Generate title based on type
    CASE p_type
        WHEN 'message_received' THEN v_title := 'New Message';
        WHEN 'share_request' THEN v_title := 'Data Share Request';
        WHEN 'share_response' THEN v_title := 'Share Request Response';
        WHEN 'friend_request' THEN v_title := 'Friend Request';
        WHEN 'friend_accepted' THEN v_title := 'Friend Request Accepted';
        WHEN 'payment_received' THEN v_title := 'Payment Received';
        WHEN 'payment_reminder' THEN v_title := 'Payment Reminder';
        ELSE v_title := 'Notification';
    END CASE;

    -- Insert the notification
    INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        from_user_id,
        share_id,
        conversation_id,
        read
    ) VALUES (
        p_user_id,
        p_type,
        v_title,
        COALESCE(p_message, v_title),
        p_from_user_id,
        p_share_id,
        p_conversation_id,
        false
    )
    RETURNING id INTO v_notification_id;

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', v_notification_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_notification TO authenticated;

-- ============================================================
-- 4. CREATE INSERT POLICY FOR NOTIFICATIONS (for RPC)
-- ============================================================

-- Drop existing insert policy if it exists
DROP POLICY IF EXISTS notifications_insert_for_others ON notifications;

-- Allow the RPC function (running as SECURITY DEFINER) to insert notifications
-- This is needed because the function runs with the definer's permissions
CREATE POLICY notifications_insert_for_others ON notifications
    FOR INSERT WITH CHECK (true);

COMMENT ON FUNCTION create_notification IS
'RPC function to create notifications for any user. Uses SECURITY DEFINER to bypass RLS.';

-- ============================================================
-- 5. CREATE USER_KEY_BACKUPS TABLE (for E2E encryption)
-- ============================================================

CREATE TABLE IF NOT EXISTS user_key_backups (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    encryption_salt TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_key_backups_user ON user_key_backups(user_id);

ALTER TABLE user_key_backups ENABLE ROW LEVEL SECURITY;

-- Users can read any public key (needed for encryption)
CREATE POLICY user_key_backups_select_all ON user_key_backups
    FOR SELECT USING (true);

-- Users can only insert/update their own key backup
CREATE POLICY user_key_backups_insert_own ON user_key_backups
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_key_backups_update_own ON user_key_backups
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY user_key_backups_delete_own ON user_key_backups
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_key_backups TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE user_key_backups_id_seq TO authenticated;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_user_key_backups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_key_backups_updated_at ON user_key_backups;
CREATE TRIGGER trigger_update_user_key_backups_updated_at
    BEFORE UPDATE ON user_key_backups
    FOR EACH ROW
    EXECUTE FUNCTION update_user_key_backups_updated_at();

-- ============================================================
-- 6. CREATE CONVERSATION_SESSION_KEYS TABLE (for E2E encryption)
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_session_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    encrypted_session_key TEXT NOT NULL,
    encryption_nonce TEXT NOT NULL,
    message_counter BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_session_keys_user ON conversation_session_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_session_keys_conversation ON conversation_session_keys(conversation_id);

ALTER TABLE conversation_session_keys ENABLE ROW LEVEL SECURITY;

-- Users can only access their own session keys
CREATE POLICY conversation_session_keys_select_own ON conversation_session_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY conversation_session_keys_insert_own ON conversation_session_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY conversation_session_keys_update_own ON conversation_session_keys
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY conversation_session_keys_delete_own ON conversation_session_keys
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_session_keys TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE conversation_session_keys_id_seq TO authenticated;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_conversation_session_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_conversation_session_keys_updated_at ON conversation_session_keys;
CREATE TRIGGER trigger_update_conversation_session_keys_updated_at
    BEFORE UPDATE ON conversation_session_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_conversation_session_keys_updated_at();
