-- ============================================================================
-- LIVE-DB RLS HARDENING — idempotent, non-destructive. Run ONCE on an existing
-- money_tracker/shared database to close holes the older installer left open
-- (audit RLS-01/02/04/07/08/10, MT-06). Safe to re-run. Mirrors the installer.
-- ============================================================================
BEGIN;

-- RLS-04: block-check helper
CREATE OR REPLACE FUNCTION is_blocked(p_owner UUID, p_blocked UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM blocked_users
        WHERE user_id = p_owner
          AND blocked_user_id = p_blocked
    );
$$;
GRANT EXECUTE ON FUNCTION is_blocked(UUID, UUID) TO authenticated;

-- RLS-01: download-count helper
CREATE OR REPLACE FUNCTION increment_attachment_download_count(p_attachment_id BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_count INTEGER;
BEGIN
    UPDATE message_attachments AS ma
    SET downloaded_count = ma.downloaded_count + 1
    WHERE ma.id = p_attachment_id
      AND EXISTS (
          SELECT 1 FROM conversations c
          WHERE c.id = ma.conversation_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
      )
    RETURNING ma.downloaded_count INTO new_count;

    RETURN new_count; -- NULL if not found / caller not a participant
END;
$$;
GRANT EXECUTE ON FUNCTION increment_attachment_download_count(BIGINT) TO authenticated;

-- RLS-01: lock down attachment UPDATE
DROP POLICY IF EXISTS attachments_update_participant ON message_attachments;
REVOKE UPDATE ON message_attachments FROM authenticated;

-- SDB-01 + RLS-04: messages INSERT (recipient binding + block check)
DROP POLICY IF EXISTS messages_insert_participant ON messages;
CREATE POLICY messages_insert_participant ON messages
    FOR INSERT WITH CHECK (
        auth.uid() = sender_id AND
        messages.recipient_id <> auth.uid() AND
        -- HARDENING (SDB-01): bind recipient_id to the conversation counterparty so a
        -- blocked sender cannot set recipient_id = self to bypass is_blocked().
        EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = messages.conversation_id
            AND ((c.user1_id = auth.uid() AND c.user2_id = messages.recipient_id)
              OR (c.user2_id = auth.uid() AND c.user1_id = messages.recipient_id))
        ) AND
        NOT public.is_blocked(messages.recipient_id, auth.uid())
    );

-- MT-06: messages read-receipt UPDATE (recipient only)
DROP POLICY IF EXISTS messages_update_participant ON messages;
CREATE POLICY messages_update_participant ON messages
    FOR UPDATE USING (
        recipient_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
        )
    )
    WITH CHECK (
        recipient_id = auth.uid()
    );

-- RLS-02: user_months UPDATE WITH CHECK
DROP POLICY IF EXISTS user_months_update_own ON user_months;
CREATE POLICY user_months_update_own ON user_months
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_months_update_shared ON user_months;
CREATE POLICY user_months_update_shared ON user_months
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = user_months.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.can_edit = true
            AND data_shares.status = 'accepted'
            AND (
                data_shares.share_all_data = true
                OR (data_shares.year = user_months.year AND data_shares.month = user_months.month)
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = user_months.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.can_edit = true
            AND data_shares.status = 'accepted'
            AND (
                data_shares.share_all_data = true
                OR (data_shares.year = user_months.year AND data_shares.month = user_months.month)
            )
        )
    );

-- RLS-07: friends UPDATE WITH CHECK
DROP POLICY IF EXISTS friends_update_as_friend ON friends;
CREATE POLICY friends_update_as_friend ON friends
    FOR UPDATE
    USING (auth.uid() = friend_user_id AND status = 'pending')
    WITH CHECK (auth.uid() = friend_user_id AND status IN ('accepted', 'blocked'));

-- RLS-08: notifications UPDATE column-scoped + WITH CHECK
DROP POLICY IF EXISTS notifications_update_own ON notifications;
CREATE POLICY notifications_update_own ON notifications
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

REVOKE UPDATE ON notifications FROM authenticated;
GRANT UPDATE (read) ON notifications TO authenticated;

-- RLS-10: remove dead table
DROP TABLE IF EXISTS conversation_participants CASCADE;

COMMIT;
