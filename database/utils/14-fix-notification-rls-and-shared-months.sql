-- Fix notification RLS and shared months display
-- This script adds a function to create notifications for any user (bypassing RLS)
-- and ensures shared months display correctly

-- Create a function to create notifications (bypasses RLS)
-- This allows the system to create notifications for any user
-- This function is idempotent - can be run multiple times safely
DROP FUNCTION IF EXISTS create_notification(UUID, TEXT, UUID, BIGINT, TEXT, BIGINT, BIGINT, UUID, TEXT);

CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type TEXT,
    p_from_user_id UUID,
    p_share_id BIGINT DEFAULT NULL,
    p_message TEXT DEFAULT NULL,
    p_conversation_id BIGINT DEFAULT NULL,
    p_payment_id BIGINT DEFAULT NULL,
    p_subscription_id UUID DEFAULT NULL,
    p_invoice_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_notification_id BIGINT;
BEGIN
    INSERT INTO notifications (
        user_id,
        type,
        share_id,
        from_user_id,
        message,
        conversation_id,
        payment_id,
        subscription_id,
        invoice_id,
        read,
        created_at
    )
    VALUES (
        p_user_id,
        p_type,
        p_share_id,
        p_from_user_id,
        p_message,
        p_conversation_id,
        p_payment_id,
        p_subscription_id,
        p_invoice_id,
        false,
        NOW()
    )
    RETURNING id INTO v_notification_id;
    
    RETURN v_notification_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_notification TO authenticated;

-- Add comment
COMMENT ON FUNCTION create_notification IS 'Creates a notification for any user (bypasses RLS). Used by the system to create notifications for share requests, acceptances, etc.';

