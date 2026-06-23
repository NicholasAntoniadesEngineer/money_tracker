-- ============================================================================
-- BUDGET DEK — idempotent, non-destructive. Run ONCE on an existing
-- money_tracker/shared database to add the per-user wrapped Data Encryption Key
-- row used by client-side end-to-end encryption of budget data
-- (BUDGET_E2E_DESIGN.md §2.3, staged plan S2). Safe to re-run. Mirrors the
-- DDL folded into database/setup/fresh-install-complete.sql so a from-scratch
-- install already includes it.
--
-- What it creates: one RLS-scoped row per user (user_id PRIMARY KEY) holding the
-- DEK wrapped under the user's existing X25519 identity secret. The server NEVER
-- sees the unwrapped DEK or any budget plaintext — only opaque base64 ciphertext.
-- Owner-only RLS (auth.uid() = user_id) for SELECT/INSERT/UPDATE/DELETE, each with
-- WITH CHECK on the write paths so a user cannot reassign their row to another
-- user_id. No DROP TABLE — re-running only (re)asserts the table/policies/grants.
-- ============================================================================
BEGIN;

-- One wrapped DEK per user. user_id is the PRIMARY KEY (exactly one row per user;
-- ON CONFLICT / unique-violation is how the client bootstrap detects a concurrent
-- INSERT race and falls back to re-fetch + unwrap). FK to auth.users so the row is
-- removed automatically when the account is deleted.
CREATE TABLE IF NOT EXISTS budget_dek (
    user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    wrapped_dek TEXT NOT NULL,            -- base64 secretbox ciphertext of the 32-byte DEK
    wrap_nonce  TEXT NOT NULL,            -- base64 24-byte nonce
    dek_version INTEGER NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE budget_dek IS 'Per-user wrapped Data Encryption Key for client-side E2E budget encryption (BUDGET_E2E_DESIGN.md §2.3). Server stores only ciphertext.';
COMMENT ON COLUMN budget_dek.wrapped_dek IS 'base64 secretbox ciphertext of the 32-byte DEK, wrapped under the identity-derived wrap key';
COMMENT ON COLUMN budget_dek.wrap_nonce IS 'base64 24-byte nonce for the wrapped_dek secretbox';
COMMENT ON COLUMN budget_dek.dek_version IS 'DEK generation. Reserved for the future per-epoch forward-secrecy re-key (BUDGET_E2E_DESIGN.md §7).';

-- Keep updated_at fresh on re-wrap (e.g. future DEK re-key). Mirrors the other
-- updated_at triggers in the installer.
CREATE OR REPLACE FUNCTION update_budget_dek_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_budget_dek_updated_at ON budget_dek;
CREATE TRIGGER trigger_update_budget_dek_updated_at
    BEFORE UPDATE ON budget_dek
    FOR EACH ROW
    EXECUTE FUNCTION update_budget_dek_updated_at();

ALTER TABLE budget_dek ENABLE ROW LEVEL SECURITY;

-- Owner-only RLS. The wrapped DEK is opaque to the server, but it is still scoped
-- to its owner: only the authenticated user may read or write their own row.
DROP POLICY IF EXISTS budget_dek_select_own ON budget_dek;
CREATE POLICY budget_dek_select_own ON budget_dek
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS budget_dek_insert_own ON budget_dek;
CREATE POLICY budget_dek_insert_own ON budget_dek
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- WITH CHECK stops a user reassigning their wrapped-DEK row to another user_id on
-- update (e.g. a future re-key UPDATE). Mirrors identity_keys_update_own.
DROP POLICY IF EXISTS budget_dek_update_own ON budget_dek;
CREATE POLICY budget_dek_update_own ON budget_dek
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS budget_dek_delete_own ON budget_dek;
CREATE POLICY budget_dek_delete_own ON budget_dek
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON budget_dek TO authenticated;

COMMIT;
