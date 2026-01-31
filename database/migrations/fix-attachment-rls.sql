-- ============================================================
-- FIX: Message Attachments RLS Policies
-- ============================================================
-- Run this in Supabase SQL Editor if attachments fail with:
-- "new row violates row-level security policy"
-- ============================================================

-- Drop existing policies (ignore errors if they don't exist)
DROP POLICY IF EXISTS attachments_select_participant ON message_attachments;
DROP POLICY IF EXISTS attachments_insert_uploader ON message_attachments;
DROP POLICY IF EXISTS attachments_update_participant ON message_attachments;
DROP POLICY IF EXISTS attachments_delete_uploader ON message_attachments;

-- Ensure RLS is enabled
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

-- SELECT: Conversation participants can view attachments
CREATE POLICY attachments_select_participant ON message_attachments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = message_attachments.conversation_id
            AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
        )
    );

-- INSERT: User must be uploader AND participant in conversation
CREATE POLICY attachments_insert_uploader ON message_attachments
    FOR INSERT WITH CHECK (
        auth.uid() = uploader_id AND
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = message_attachments.conversation_id
            AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
        )
    );

-- UPDATE: Conversation participants can update (for download count)
CREATE POLICY attachments_update_participant ON message_attachments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = message_attachments.conversation_id
            AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
        )
    );

-- DELETE: Only uploader can delete
CREATE POLICY attachments_delete_uploader ON message_attachments
    FOR DELETE USING (auth.uid() = uploader_id);

-- Ensure grants are in place
GRANT SELECT, INSERT, UPDATE, DELETE ON message_attachments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE message_attachments_id_seq TO authenticated;

-- Verify policies were created
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename = 'message_attachments';
