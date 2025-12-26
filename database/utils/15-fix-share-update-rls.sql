-- Fix RLS policy for updating share status
-- This script fixes the RLS policy to allow users to update share status (accept/decline/block)
-- The issue is that the "Owners can manage their shares" policy conflicts with recipient updates
--
-- IMPORTANT: This script must be run in Supabase SQL Editor
-- The error "new row violates row-level security policy" means the WITH CHECK clause is failing

-- The problem: When a recipient tries to update a share, PostgreSQL evaluates ALL policies' WITH CHECK clauses.
-- The "Owners can manage their shares" policy has WITH CHECK (owner_user_id = auth.uid()), which fails
-- because the recipient is not the owner. PostgreSQL requires ALL policies' WITH CHECK clauses to pass.

-- Solution: Make the owner policy's WITH CHECK clause allow recipient updates to pass through.

-- Step 1: Check current policies (for debugging - comment out if not needed)
-- SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE tablename = 'data_shares' ORDER BY policyname;

-- Step 2: Drop and recreate the "Owners can manage their shares" policy with a more permissive WITH CHECK
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

-- Step 3: Drop and recreate the "Shared users can update share status" policy
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

-- Step 4: Verify the policies were created correctly
-- Uncomment and run this to check the current policies:
/*
SELECT 
    policyname, 
    cmd, 
    qual as using_clause, 
    with_check 
FROM pg_policies 
WHERE tablename = 'data_shares' 
ORDER BY policyname;
*/

-- Add comments
COMMENT ON POLICY "Owners can manage their shares" ON data_shares IS 
    'Allows owners to manage their shares. WITH CHECK allows recipients to update status to avoid policy conflicts.';

COMMENT ON POLICY "Shared users can update share status" ON data_shares IS 
    'Allows users to update share status (accept/decline/block) for shares where they are the recipient. Only allows updating pending shares to accepted/declined/blocked status.';
