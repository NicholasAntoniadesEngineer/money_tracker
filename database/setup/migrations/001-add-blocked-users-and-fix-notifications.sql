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
