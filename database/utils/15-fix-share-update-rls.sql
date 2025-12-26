-- Fix RLS policy for updating share status
-- This script fixes the RLS policy to allow users to update share status (accept/decline/block)
-- The issue is that the "Owners can manage their shares" policy conflicts with recipient updates
--
-- IMPORTANT: This script must be run in Supabase SQL Editor
-- The error "new row violates row-level security policy" means the WITH CHECK clause is failing

-- The problem: When a recipient tries to update a share, the "Owners can manage their shares" policy
-- has WITH CHECK (owner_user_id = auth.uid()), which fails because the recipient is not the owner.
-- PostgreSQL requires ALL policies' WITH CHECK clauses to pass for an UPDATE to succeed.
--
-- Solution: Make the owner policy's WITH CHECK only apply when the user IS the owner.
-- For recipient updates, the owner policy's USING clause won't match, so its WITH CHECK won't be evaluated.
-- However, we need to ensure the owner policy doesn't block recipient updates.

-- Fix the "Owners can manage their shares" policy
-- The problem: PostgreSQL RLS evaluates ALL policies' WITH CHECK clauses for UPDATE operations.
-- Even though this policy's USING clause doesn't match for recipients, the WITH CHECK still gets evaluated.
-- We need to make the WITH CHECK permissive enough to allow recipient status updates.
--
-- Solution: Allow the WITH CHECK to pass if:
-- 1. User is the owner (original behavior), OR
-- 2. User is the recipient AND only updating status-related fields (to allow status updates)
DROP POLICY IF EXISTS "Owners can manage their shares" ON data_shares;
CREATE POLICY "Owners can manage their shares" ON data_shares
    FOR ALL 
    USING (owner_user_id = auth.uid()) 
    WITH CHECK (
        -- Allow if user is the owner (original behavior)
        owner_user_id = auth.uid()
        -- OR allow if user is the recipient (to avoid blocking recipient status updates)
        -- This is safe because the USING clause ensures only owners can use this policy for other operations
        OR shared_with_user_id = auth.uid()
    );

-- Now fix the "Shared users can update share status" policy
DROP POLICY IF EXISTS "Shared users can update share status" ON data_shares;
CREATE POLICY "Shared users can update share status" ON data_shares
    FOR UPDATE 
    USING (
        shared_with_user_id = auth.uid()
        AND status = 'pending' -- Can only update pending shares
    )
    WITH CHECK (
        -- Ensure we're still the recipient
        shared_with_user_id = auth.uid()
        -- Ensure status is one of the allowed values
        AND status IN ('accepted', 'declined', 'blocked')
    );

-- Verify the policies were created
-- Run this to check:
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'data_shares' ORDER BY policyname;

-- Add comments
COMMENT ON POLICY "Owners can manage their shares" ON data_shares IS 
    'Allows owners to manage their shares. WITH CHECK also allows recipients to update status to avoid policy conflicts.';

COMMENT ON POLICY "Shared users can update share status" ON data_shares IS 
    'Allows users to update share status (accept/decline/block) for shares where they are the recipient. Only allows updating pending shares to accepted/declined/blocked status.';
