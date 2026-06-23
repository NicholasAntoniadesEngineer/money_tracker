-- ============================================================================
-- SEC-C1 LIVE-DB FIX — data_shares UPDATE policies need a WITH CHECK.
--   Idempotent, non-destructive. Run ONCE on an existing money_tracker/shared
--   database to close the CRITICAL share-escalation hole (SECURITY_AUDIT.md C-1).
--   Safe to re-run. Mirrors the DDL folded into
--   database/setup/fresh-install-complete.sql.
--
-- THE HOLE (C-1): data_shares_update_as_owner / data_shares_update_as_recipient
--   shipped with a USING clause and NO WITH CHECK. Postgres then defaults the
--   implicit WITH CHECK to the USING expression, which for the recipient policy
--   (USING status='pending') inspects only the OLD row. A pending recipient could
--   therefore PATCH /rest/v1/data_shares?id=eq.<id> body {can_edit:true,
--   share_all_data:true} WITHOUT touching status: the OLD row is still 'pending'
--   so both USING and the implicit WITH CHECK pass, and the table-wide UPDATE grant
--   let the columns be written. After a normal accept, the recipient holds full
--   read+write of the OWNER's entire budget. (The update_share_status() trigger is
--   AFTER UPDATE OF status and only writes notifications — it does NOT re-normalize
--   the grant flags, so both the read- AND write-escalation hold. Confirms U-2.)
--
-- THE FIX (robust form from the audit remediation):
--   1. Add the SEC-H4 seal-context columns (wrap_owner_ik, dek_version) so the
--      column-scoped UPDATE grant below references real columns. (No-op if the
--      H-4 migration apply-budget-share-auth.sql already added them.)
--   2. REVOKE the table-wide UPDATE grant; GRANT UPDATE on ONLY the columns a
--      client legitimately writes directly (status + the seal columns + updated_at).
--      can_edit / share_all_data / owner_user_id / shared_with_user_id / year /
--      month are then NOT in any client UPDATE privilege -> a PATCH of them fails
--      the column privilege check (SQLSTATE 42501) before RLS even runs.
--   3. Recreate both UPDATE policies WITH a WITH CHECK:
--        - owner:     WITH CHECK (auth.uid() = owner_user_id)  (no owner_user_id
--                     reassignment).
--        - recipient: WITH CHECK pins the recipient to their own row and only lets
--                     status land on 'accepted'/'rejected'.
--   4. Add the SECURITY DEFINER update_share_grants() RPC (mirrors start_trial:
--      re-asserts auth.uid() = owner, SET search_path) as the ONLY path that
--      mutates can_edit/share_all_data/scope. The client routes owner flag changes
--      through it instead of a direct PATCH.
--
-- NO DROP TABLE / NO DROP COLUMN / NO DATA CHANGE.
-- ============================================================================
BEGIN;

-- 1) SEC-H4 seal-context columns (idempotent; also added by apply-budget-share-auth.sql).
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS wrap_owner_ik TEXT;
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS dek_version   INTEGER;

-- 2) Replace the table-wide UPDATE grant with a column-scoped one.
REVOKE UPDATE ON data_shares FROM authenticated;
GRANT UPDATE (status, wrapped_dek, wrap_nonce, wrap_eph_pub, wrap_owner_ik, dek_version, updated_at)
    ON data_shares TO authenticated;

-- 3) Recreate the UPDATE policies WITH a WITH CHECK.
DROP POLICY IF EXISTS data_shares_update_as_owner ON data_shares;
CREATE POLICY data_shares_update_as_owner ON data_shares
    FOR UPDATE
    USING (auth.uid() = owner_user_id)
    WITH CHECK (auth.uid() = owner_user_id);

DROP POLICY IF EXISTS data_shares_update_as_recipient ON data_shares;
CREATE POLICY data_shares_update_as_recipient ON data_shares
    FOR UPDATE
    USING (auth.uid() = shared_with_user_id AND status = 'pending')
    WITH CHECK (
        auth.uid() = shared_with_user_id
        AND status IN ('accepted', 'rejected')
    );

-- 4) Owner-only DEFINER RPC for grant-flag / scope mutation.
CREATE OR REPLACE FUNCTION update_share_grants(
    p_share_id       BIGINT,
    p_can_edit       BOOLEAN,
    p_share_all_data BOOLEAN,
    p_year           INTEGER DEFAULT NULL,
    p_month          INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_row data_shares%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_row FROM data_shares WHERE id = p_share_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'share not found');
    END IF;

    -- HARD GATE: only the OWNER of the share may change its grant flags / scope.
    IF v_row.owner_user_id <> v_uid THEN
        RETURN jsonb_build_object('success', false, 'error', 'not the share owner');
    END IF;

    UPDATE data_shares SET
        can_edit       = COALESCE(p_can_edit,       can_edit),
        share_all_data = COALESCE(p_share_all_data, share_all_data),
        year           = p_year,
        month          = p_month,
        updated_at     = NOW()
    WHERE id = p_share_id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('success', true, 'share', to_jsonb(v_row));
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION update_share_grants(BIGINT, BOOLEAN, BOOLEAN, INTEGER, INTEGER) TO authenticated;

COMMIT;
