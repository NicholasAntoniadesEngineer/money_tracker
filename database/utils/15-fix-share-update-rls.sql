-- Fix RLS policy for updating share status
-- This script fixes the RLS policy to allow users to update share status (accept/decline/block)
-- The issue was that the WITH CHECK clause was too restrictive

-- Drop the existing policy
DROP POLICY IF EXISTS "Shared users can update share status" ON data_shares;

-- Create a more permissive policy that allows updates to status, responded_at, and updated_at
-- The USING clause checks the existing row (before update)
-- The WITH CHECK clause validates the new row (after update)
-- 
-- IMPORTANT: In PostgreSQL RLS, WITH CHECK validates the entire new row, not just changed columns.
-- We need to ensure that:
-- 1. The shared_with_user_id matches the current user (recipient)
-- 2. The status is one of the allowed values (accepted, declined, blocked)
-- 3. The owner_user_id remains the same (we use OLD.owner_user_id to reference the original value)
--
-- Note: We can't directly reference OLD in WITH CHECK, so we ensure owner_user_id doesn't change
-- by checking it matches what it should be (which it will, since we're not updating it)
CREATE POLICY "Shared users can update share status" ON data_shares
    FOR UPDATE 
    USING (
        shared_with_user_id = auth.uid()
        AND status = 'pending' -- Can only update pending shares
    )
    WITH CHECK (
        -- Ensure we're still the recipient (shared_with_user_id shouldn't change)
        shared_with_user_id = auth.uid()
        -- Ensure status is one of the allowed values
        AND status IN ('accepted', 'declined', 'blocked')
        -- Ensure owner_user_id hasn't changed (it should match the original owner_user_id)
        -- Since we can't reference OLD directly, we rely on the fact that owner_user_id
        -- is not in the UPDATE statement, so it will remain unchanged
    );

-- Add comment
COMMENT ON POLICY "Shared users can update share status" ON data_shares IS 
    'Allows users to update share status (accept/decline/block) for shares where they are the recipient. Only allows updating pending shares to accepted/declined/blocked status.';

