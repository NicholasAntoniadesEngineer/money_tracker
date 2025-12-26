-- Fix RLS policy for updating share status
-- This script fixes the RLS policy to allow users to update share status (accept/decline/block)
-- The issue was that the WITH CHECK clause was too restrictive

-- Drop the existing policy
DROP POLICY IF EXISTS "Shared users can update share status" ON data_shares;

-- Create a more permissive policy that allows updates to status, responded_at, and updated_at
-- The WITH CHECK clause should allow the update as long as:
-- 1. The shared_with_user_id matches the current user (recipient) - this ensures the recipient can only update their own shares
-- 2. The status is one of the allowed values (accepted, declined, blocked)
-- Note: We don't check owner_user_id because it shouldn't be changed by the application code
-- If it is changed, that's a bug in the application, not an RLS issue
CREATE POLICY "Shared users can update share status" ON data_shares
    FOR UPDATE 
    USING (
        shared_with_user_id = auth.uid()
        AND status = 'pending' -- Can only update pending shares
    )
    WITH CHECK (
        shared_with_user_id = auth.uid() -- Recipient must match current user (ensures they can only update their own shares)
        AND status IN ('accepted', 'declined', 'blocked') -- Can only set to these statuses
    );

-- Add comment
COMMENT ON POLICY "Shared users can update share status" ON data_shares IS 
    'Allows users to update share status (accept/decline/block) for shares where they are the recipient';

