-- Create a database function to update share status (bypasses RLS)
-- This function allows recipients to update share status without RLS conflicts
-- Similar to the create_notification function, this uses SECURITY DEFINER to bypass RLS

-- Drop the function if it exists (for idempotency)
DROP FUNCTION IF EXISTS update_share_status(BIGINT, TEXT, UUID);

CREATE OR REPLACE FUNCTION update_share_status(
    p_share_id BIGINT,
    p_new_status TEXT,
    p_user_id UUID
)
RETURNS TABLE(
    id BIGINT,
    owner_user_id UUID,
    shared_with_user_id UUID,
    access_level TEXT,
    shared_months JSONB,
    shared_pots BOOLEAN,
    shared_settings BOOLEAN,
    share_all_data BOOLEAN,
    status TEXT,
    notification_sent_at TIMESTAMPTZ,
    responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_share RECORD;
    v_updated_share RECORD;
BEGIN
    -- Validate the new status
    IF p_new_status NOT IN ('accepted', 'declined', 'blocked') THEN
        RAISE EXCEPTION 'Invalid status. Must be accepted, declined, or blocked';
    END IF;

    -- Get the share to verify the user is the recipient
    SELECT * INTO v_share
    FROM data_shares
    WHERE id = p_share_id;

    -- Check if share exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Share not found';
    END IF;

    -- Verify the user is the recipient
    IF v_share.shared_with_user_id != p_user_id THEN
        RAISE EXCEPTION 'Not authorized to update this share';
    END IF;

    -- Verify the share is pending
    IF v_share.status != 'pending' THEN
        RAISE EXCEPTION 'Can only update pending shares';
    END IF;

    -- Update the share status
    UPDATE data_shares
    SET 
        status = p_new_status,
        responded_at = NOW(),
        updated_at = NOW()
    WHERE id = p_share_id
    RETURNING * INTO v_updated_share;

    -- Return the updated share
    RETURN QUERY
    SELECT 
        v_updated_share.id,
        v_updated_share.owner_user_id,
        v_updated_share.shared_with_user_id,
        v_updated_share.access_level,
        v_updated_share.shared_months,
        v_updated_share.shared_pots,
        v_updated_share.shared_settings,
        v_updated_share.share_all_data,
        v_updated_share.status,
        v_updated_share.notification_sent_at,
        v_updated_share.responded_at,
        v_updated_share.created_at,
        v_updated_share.updated_at;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_share_status TO authenticated;

-- Add comment
COMMENT ON FUNCTION update_share_status IS 
    'Updates share status (accept/decline/block) for recipients. Bypasses RLS using SECURITY DEFINER. Validates that user is the recipient and share is pending.';

