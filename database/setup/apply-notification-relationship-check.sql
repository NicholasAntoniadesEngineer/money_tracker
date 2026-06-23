-- ============================================================================
-- M-5 — create_notification(): require a caller<->target relationship
-- ============================================================================
-- Run this ONCE on a LIVE money_tracker database that already has the
-- notifications system (notifications / friends / data_shares / conversations
-- tables + the create_notification RPC, from fresh-install-complete.sql).
--
-- WHAT IT FIXES (audit finding M-5):
--   create_notification is SECURITY DEFINER and granted to `authenticated`. It
--   already forces from_user_id = auth.uid() and blocks server-only financial
--   types, but it had NO check that the caller has any relationship to p_user_id.
--   Any authenticated user could therefore POST a notification into ANY known
--   UUID's feed — arbitrary cross-user in-app spam / plaintext social-engineering
--   carrying a legitimate-looking, server-derived title.
--
-- WHAT IT DOES:
--   CREATE OR REPLACE the function to additionally require, for an AUTHENTICATED
--   caller, a real relationship with p_user_id before inserting:
--     * self (p_user_id = caller), OR
--     * a friends row in either direction (any status — a pending row is created
--       only by the requester, so it is itself a legit friend_request reason), OR
--     * a data_share between the two users (either direction, any status), OR
--     * a shared conversation (either user1/user2 ordering).
--   from_user_id = auth.uid() is still forced; financial types still blocked.
--   Service-role / webhook callers (auth.uid() IS NULL) are UNCHANGED.
--
-- NON-DESTRUCTIVE / idempotent: CREATE OR REPLACE FUNCTION only — no table is
-- dropped or altered, no data touched, no grant changed (the existing
-- GRANT EXECUTE ... TO authenticated is re-asserted at the end for safety).
-- search_path is pinned; auth.uid() is re-read inside the body.
-- ============================================================================

BEGIN;

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
SET search_path = public
AS $$
DECLARE
    v_notification_id BIGINT;
    v_title TEXT;
    v_uid UUID := auth.uid();
    v_has_relationship BOOLEAN;
BEGIN
    -- HARDENING: SECURITY DEFINER (bypasses RLS). An authenticated client must not
    -- forge the sender, create server-only (financial) types, or notify a stranger.
    -- Webhook/service-role calls have a NULL auth.uid() and keep their passed values.
    IF v_uid IS NOT NULL THEN
        p_from_user_id := v_uid;
        IF p_type IN ('payment_received', 'payment_reminder') THEN
            RETURN jsonb_build_object('success', false, 'error', 'forbidden notification type');
        END IF;

        -- M-5: relationship gate (see migration header for the full rationale).
        IF p_user_id = v_uid THEN
            v_has_relationship := TRUE;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM friends f
                WHERE ( (f.user_id = v_uid AND f.friend_user_id = p_user_id)
                     OR (f.user_id = p_user_id AND f.friend_user_id = v_uid) )
            ) OR EXISTS (
                SELECT 1 FROM data_shares ds
                WHERE ( (ds.owner_user_id = v_uid AND ds.shared_with_user_id = p_user_id)
                     OR (ds.owner_user_id = p_user_id AND ds.shared_with_user_id = v_uid) )
            ) OR EXISTS (
                SELECT 1 FROM conversations c
                WHERE ( (c.user1_id = v_uid AND c.user2_id = p_user_id)
                     OR (c.user1_id = p_user_id AND c.user2_id = v_uid) )
            )
            INTO v_has_relationship;
        END IF;

        IF NOT v_has_relationship THEN
            RETURN jsonb_build_object('success', false, 'error', 'no relationship with target user');
        END IF;
    END IF;

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

    INSERT INTO notifications (
        user_id, type, title, message, from_user_id, share_id, conversation_id, read
    ) VALUES (
        p_user_id, p_type, v_title, COALESCE(p_message, v_title),
        p_from_user_id, p_share_id, p_conversation_id, false
    )
    RETURNING id INTO v_notification_id;

    RETURN jsonb_build_object('success', true, 'notification_id', v_notification_id);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION create_notification TO authenticated;

COMMIT;
