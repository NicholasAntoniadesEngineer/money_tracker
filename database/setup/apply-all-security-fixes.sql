-- ============================================================================
-- COMBINED SECURITY MIGRATION — run ONCE on the existing shared Supabase DB.
-- Concatenation of all 19 hardening migrations in dependency order.
-- IDEMPOTENT: every block guards with IF EXISTS / IF NOT EXISTS / CREATE OR
-- REPLACE, so any part already applied during the build session is a no-op.
-- Assumes the base schema is already installed (this layers fixes on top).
-- For a FRESH database instead, run money_tracker/.../fresh-install-complete.sql.
-- Each sub-migration keeps its own BEGIN/COMMIT (independent transactions).
-- ============================================================================



-- ============================================================================
-- >>> auth_db/backend/sql/apply-forward-secrecy-schema.sql
-- ============================================================================
-- ============================================================================
-- FORWARD SECRECY — X3DH PREKEY SCHEMA (run ONCE in the Supabase SQL Editor)
-- ============================================================================
-- IDENTITY-SIDE migration for FORWARD_SECRECY_DESIGN.md (step S3). Adds the X3DH
-- prekey tables + the one-time-prekey claim RPC to an EXISTING auth_db / identity
-- database. ADDITIVE ONLY: it creates new objects and NEVER drops or rewrites any
-- existing table, column, policy, grant, or data. Safe to re-run (idempotent):
--   - CREATE TABLE IF NOT EXISTS
--   - CREATE OR REPLACE FUNCTION / TRIGGER guarded by DROP TRIGGER IF EXISTS
--   - DROP POLICY IF EXISTS before each CREATE POLICY
--   - DROP INDEX IF EXISTS before each CREATE INDEX
--
-- These tables hold ONLY PUBLIC key material (Ed25519 identity-signing public key,
-- X25519 signed-prekey public + its Ed25519 signature, and a pool of one-time prekey
-- publics). Secrets never leave the client.
--
-- Companion migration (run separately on the MESSAGING database):
--   secure_db/sql/apply-forward-secrecy-schema.sql  (adds the messages ratchet/X3DH columns)
--
-- DEPLOY ORDER: run BOTH migrations BEFORE shipping the forward-secrecy client (S4-S6).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- prekeys: exactly one row per user (the latest signed prekey bundle).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prekeys (
    user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    identity_sign_pub  TEXT NOT NULL,   -- Ed25519 IK_sig public key (base64)
    signed_prekey_pub  TEXT NOT NULL,   -- X25519 SPK public key (base64)
    signed_prekey_sig  TEXT NOT NULL,   -- Ed25519 signature over SPK pub (base64)
    spk_id             INTEGER NOT NULL,-- SPK rotation id (which signed prekey this is)
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE prekeys IS 'X3DH signed-prekey bundle, one row per user. Public material only; SELECT-able by any authenticated user for session bootstrap.';
COMMENT ON COLUMN prekeys.identity_sign_pub IS 'Ed25519 identity-signing public key (TOFU-pinned by peers). Separate from the X25519 identity_keys.public_key.';
COMMENT ON COLUMN prekeys.spk_id IS 'Signed-prekey rotation id; bumped each time the user rotates their SPK.';

CREATE OR REPLACE FUNCTION update_prekeys_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_prekeys_updated_at ON prekeys;
CREATE TRIGGER trigger_update_prekeys_updated_at
    BEFORE UPDATE ON prekeys
    FOR EACH ROW
    EXECUTE FUNCTION update_prekeys_updated_at();

ALTER TABLE prekeys ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user may read any user's published prekey bundle, exactly
-- like identity_keys_select_all — a sender needs the peer's SPK + signature to run X3DH.
-- (Never anon: TO authenticated only.)
DROP POLICY IF EXISTS prekeys_select_all ON prekeys;
CREATE POLICY prekeys_select_all ON prekeys
    FOR SELECT TO authenticated USING (true);

-- INSERT/UPDATE/DELETE: owner only. WITH CHECK on INSERT and UPDATE stops a user from
-- writing or reassigning a bundle under another user_id (forging another user's prekeys).
DROP POLICY IF EXISTS prekeys_insert_own ON prekeys;
CREATE POLICY prekeys_insert_own ON prekeys
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS prekeys_update_own ON prekeys;
CREATE POLICY prekeys_update_own ON prekeys
    FOR UPDATE TO authenticated USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS prekeys_delete_own ON prekeys;
CREATE POLICY prekeys_delete_own ON prekeys
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON prekeys TO authenticated;

-- ----------------------------------------------------------------------------
-- one_time_prekeys: a per-user pool of single-use X25519 prekeys (OPKs).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS one_time_prekeys (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key_id      INTEGER NOT NULL,  -- client-assigned OPK id (echoed in the X3DH preamble)
    prekey_pub  TEXT NOT NULL,     -- X25519 OPK public key (base64)
    consumed    BOOLEAN NOT NULL DEFAULT FALSE,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, key_id)
);

COMMENT ON TABLE one_time_prekeys IS 'Pool of one-time X3DH prekeys (public only). Published by the owner; consumed ONE-at-a-time by a peer via claim_one_time_prekey(). Each OPK is used at most once.';
COMMENT ON COLUMN one_time_prekeys.consumed IS 'Marked TRUE atomically by claim_one_time_prekey() when a peer claims this OPK (consume-once).';

DROP INDEX IF EXISTS idx_one_time_prekeys_user_unconsumed;
-- Partial index drives the claim RPC: fetch one unconsumed OPK for a target fast.
CREATE INDEX idx_one_time_prekeys_user_unconsumed
    ON one_time_prekeys(user_id) WHERE consumed = FALSE;

ALTER TABLE one_time_prekeys ENABLE ROW LEVEL SECURITY;

-- SELECT (M-2 hardening): a caller may read ONLY their OWN OPK pool. The previous
-- USING(true) let any authenticated user enumerate an arbitrary victim's pool
-- (count unconsumed OPKs, watch a drain in progress) — a free recon oracle that
-- paired with the unthrottled claim RPC to make a targeted forward-secrecy drain
-- trivial to plan. Legitimate session bootstrap NEVER needs to SELECT a peer's
-- OPKs directly: the OPK is handed out one-at-a-time by claim_one_time_prekey()
-- (SECURITY DEFINER, which bypasses RLS), so closing client SELECT to own-rows
-- only costs nothing functionally. Public SPK/identity material still lives in
-- prekeys/identity_keys for X3DH; the OPK pool itself is no longer enumerable.
DROP POLICY IF EXISTS one_time_prekeys_select_all ON one_time_prekeys;
DROP POLICY IF EXISTS one_time_prekeys_select_own ON one_time_prekeys;
CREATE POLICY one_time_prekeys_select_own ON one_time_prekeys
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- INSERT: owner only — a user may only publish OPKs into their OWN pool.
DROP POLICY IF EXISTS one_time_prekeys_insert_own ON one_time_prekeys;
CREATE POLICY one_time_prekeys_insert_own ON one_time_prekeys
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- UPDATE: owner only (e.g. local bookkeeping). Consumption of ANOTHER user's OPK is
-- done by the SECURITY DEFINER RPC, which bypasses RLS; ordinary clients cannot mark a
-- peer's OPK consumed via this policy.
DROP POLICY IF EXISTS one_time_prekeys_update_own ON one_time_prekeys;
CREATE POLICY one_time_prekeys_update_own ON one_time_prekeys
    FOR UPDATE TO authenticated USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- DELETE: owner only — replenishment/cleanup of one's own pool. A SENDER cannot DELETE
-- a peer's OPK directly; that is the whole reason claim is an RPC.
DROP POLICY IF EXISTS one_time_prekeys_delete_own ON one_time_prekeys;
CREATE POLICY one_time_prekeys_delete_own ON one_time_prekeys
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON one_time_prekeys TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE one_time_prekeys_id_seq TO authenticated;

-- ----------------------------------------------------------------------------
-- opk_claim_audit (M-2): one row per successful claim, the backing store for the
-- per-(caller,target) and per-target rate limits enforced inside the claim RPC.
-- SERVICE/DEFINER-written only — RLS is enabled and NO grants are issued to
-- `authenticated`, so an ordinary client can neither read it (it would leak who
-- is talking to whom) nor forge/clear entries to dodge the cap. The DEFINER
-- function writes it while running as the table owner, which bypasses RLS.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opk_claim_audit (
    id         BIGSERIAL PRIMARY KEY,
    caller_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE opk_claim_audit IS 'M-2: rate-limit ledger for claim_one_time_prekey(). One row per successful OPK claim; indexed on (target, claimed_at) and (caller, target, claimed_at) to drive the per-target and per-(caller,target) token buckets. Service/DEFINER-written only; no authenticated grants.';

DROP INDEX IF EXISTS idx_opk_claim_audit_target;
CREATE INDEX idx_opk_claim_audit_target
    ON opk_claim_audit(target_id, claimed_at);
DROP INDEX IF EXISTS idx_opk_claim_audit_caller_target;
CREATE INDEX idx_opk_claim_audit_caller_target
    ON opk_claim_audit(caller_id, target_id, claimed_at);

ALTER TABLE opk_claim_audit ENABLE ROW LEVEL SECURITY;
-- No policies, no grants to `authenticated`: the SECURITY DEFINER RPC is the sole
-- writer/reader. Ordinary clients cannot SELECT (privacy) or DELETE (cap-evasion).

-- ----------------------------------------------------------------------------
-- claim_one_time_prekey(target): atomically pop ONE unconsumed OPK for the target user
-- and return the full X3DH bundle the caller needs to bootstrap a session. SECURITY
-- DEFINER (mirrors start_trial/ensure_subscription) because consuming a PEER'S OPK
-- requires writing a row RLS would otherwise forbid; we re-assert auth.uid() inside and
-- reject NULL so the elevated function cannot be abused by an unauthenticated caller.
-- The OPK select-and-mark is done with FOR UPDATE SKIP LOCKED so two concurrent callers
-- never claim the same OPK (each skips a row another transaction has locked). If the
-- pool is empty, opk_id/opk_pub come back NULL and the caller falls back to SPK-only
-- X3DH (drop DH4) — spec-permitted (FORWARD_SECRECY_DESIGN.md §2.2).
--
-- M-2 RATE LIMIT: before consuming, the function counts recent SUCCESSFUL claims in
-- opk_claim_audit over a sliding window and rejects past two caps:
--   * per-(caller,target): a single user may claim at most OPK_MAX_PER_PAIR OPKs from
--     one victim per window — blocks a single attacker draining a victim's pool.
--   * per-target (all callers): at most OPK_MAX_PER_TARGET claims against one victim per
--     window — blocks a Sybil/multi-account drain of the same victim.
-- Both are token-bucket-style (count within NOW()-window). A legitimate sender opens
-- very few sessions per target per hour, so the caps sit far above honest traffic.
-- Caps/window are intentionally generous; tighten via this single definition if abused.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_one_time_prekey(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    -- Token-bucket parameters (sliding window). Honest first-contact traffic is a
    -- handful of claims per target per hour; these caps sit well above that.
    OPK_WINDOW           CONSTANT INTERVAL := INTERVAL '1 hour';
    OPK_MAX_PER_PAIR     CONSTANT INTEGER  := 10;   -- one caller vs one target / window
    OPK_MAX_PER_TARGET   CONSTANT INTEGER  := 60;   -- all callers vs one target / window
    v_uid          UUID := auth.uid();
    v_prekey       prekeys%ROWTYPE;
    v_opk          one_time_prekeys%ROWTYPE;
    v_pair_count   INTEGER;
    v_target_count INTEGER;
BEGIN
    -- Re-assert the caller identity inside the SECURITY DEFINER body (defense in depth).
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
    END IF;

    IF target_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'target_user_id required');
    END IF;

    -- The target must have a published signed-prekey bundle to be reachable.
    SELECT * INTO v_prekey FROM prekeys WHERE user_id = target_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'no prekey bundle for target');
    END IF;

    -- M-2: enforce the token buckets BEFORE consuming an OPK. Count only SUCCESSFUL
    -- claims (rows are written below only when an OPK was actually consumed), so a
    -- run of SPK-only fallbacks (empty pool) does not burn the caller's budget.
    SELECT count(*) INTO v_pair_count
    FROM opk_claim_audit
    WHERE caller_id = v_uid
      AND target_id = target_user_id
      AND claimed_at > NOW() - OPK_WINDOW;
    IF v_pair_count >= OPK_MAX_PER_PAIR THEN
        RETURN jsonb_build_object('success', false, 'error', 'rate limited',
                                  'retry_after_seconds', EXTRACT(EPOCH FROM OPK_WINDOW)::int);
    END IF;

    SELECT count(*) INTO v_target_count
    FROM opk_claim_audit
    WHERE target_id = target_user_id
      AND claimed_at > NOW() - OPK_WINDOW;
    IF v_target_count >= OPK_MAX_PER_TARGET THEN
        RETURN jsonb_build_object('success', false, 'error', 'rate limited',
                                  'retry_after_seconds', EXTRACT(EPOCH FROM OPK_WINDOW)::int);
    END IF;

    -- Atomically grab ONE unconsumed OPK. FOR UPDATE SKIP LOCKED makes concurrent
    -- claims pick DIFFERENT rows (no double-claim, no blocking). May return zero rows
    -- (pool exhausted) — that is a valid SPK-only fallback, not an error.
    SELECT * INTO v_opk
    FROM one_time_prekeys
    WHERE user_id = target_user_id AND consumed = FALSE
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF FOUND THEN
        UPDATE one_time_prekeys
        SET consumed = TRUE, consumed_at = NOW()
        WHERE id = v_opk.id;
        -- Record the SUCCESSFUL claim against both buckets. Only real consumptions
        -- count toward the cap (SPK-only fallback does not).
        INSERT INTO opk_claim_audit (caller_id, target_id) VALUES (v_uid, target_user_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'target_user_id', target_user_id,
        'identity_sign_pub', v_prekey.identity_sign_pub,
        'signed_prekey_pub', v_prekey.signed_prekey_pub,
        'signed_prekey_sig', v_prekey.signed_prekey_sig,
        'spk_id', v_prekey.spk_id,
        -- opk_id/opk_pub are NULL when the pool is exhausted (SPK-only X3DH fallback).
        'opk_id',  CASE WHEN v_opk.id IS NOT NULL THEN v_opk.key_id     ELSE NULL END,
        'opk_pub', CASE WHEN v_opk.id IS NOT NULL THEN v_opk.prekey_pub ELSE NULL END
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_one_time_prekey(UUID) TO authenticated;

COMMIT;


-- ============================================================================
-- >>> auth_db/backend/sql/apply-opk-claim-rate-limit.sql
-- ============================================================================
-- ============================================================================
-- M-2 — RATE-LIMIT claim_one_time_prekey() + close the OPK enumeration oracle
-- ============================================================================
-- Run this ONCE on a LIVE auth_db / identity database that already has the
-- forward-secrecy prekey schema (prekeys / one_time_prekeys / the claim RPC,
-- from apply-forward-secrecy-schema.sql or complete-setup.sql).
--
-- WHAT IT FIXES (audit finding M-2):
--   1) claim_one_time_prekey() let ANY authenticated user pop a victim's OPKs in
--      an unthrottled loop until the pool was empty, silently downgrading every
--      future first-message to SPK-only X3DH (forward-secrecy DoS/downgrade).
--   2) one_time_prekeys_select_all USING(true) let any user ENUMERATE an arbitrary
--      victim's pool (count unconsumed OPKs / watch a drain), a free recon oracle.
--
-- WHAT IT DOES:
--   * Adds opk_claim_audit (one row per SUCCESSFUL claim) — RLS on, NO grants to
--     `authenticated`; the SECURITY DEFINER RPC is the only reader/writer.
--   * Replaces claim_one_time_prekey() with a version that enforces two sliding-
--     window token buckets BEFORE consuming an OPK:
--        per-(caller,target) <= 10 / hour   (single-attacker drain)
--        per-target          <= 60 / hour   (Sybil/multi-account drain)
--   * Replaces one_time_prekeys_select_all (USING true) with select_own
--     (auth.uid() = user_id). Session bootstrap NEVER needs a peer's OPKs via
--     SELECT — the DEFINER RPC hands them out one-at-a-time — so this is free.
--
-- ADDITIVE / NON-DESTRUCTIVE: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, DROP POLICY/INDEX IF EXISTS before re-create. No DROP TABLE, no data
-- rewrite. Safe to re-run. search_path is pinned and auth.uid() is re-asserted.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Close the OPK enumeration oracle: own-rows-only SELECT.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS one_time_prekeys_select_all ON one_time_prekeys;
DROP POLICY IF EXISTS one_time_prekeys_select_own ON one_time_prekeys;
CREATE POLICY one_time_prekeys_select_own ON one_time_prekeys
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 2) Rate-limit ledger (service/DEFINER-written only).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS opk_claim_audit (
    id         BIGSERIAL PRIMARY KEY,
    caller_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE opk_claim_audit IS 'M-2: rate-limit ledger for claim_one_time_prekey(). One row per successful OPK claim; indexed on (target, claimed_at) and (caller, target, claimed_at) to drive the per-target and per-(caller,target) token buckets. Service/DEFINER-written only; no authenticated grants.';

DROP INDEX IF EXISTS idx_opk_claim_audit_target;
CREATE INDEX idx_opk_claim_audit_target
    ON opk_claim_audit(target_id, claimed_at);
DROP INDEX IF EXISTS idx_opk_claim_audit_caller_target;
CREATE INDEX idx_opk_claim_audit_caller_target
    ON opk_claim_audit(caller_id, target_id, claimed_at);

ALTER TABLE opk_claim_audit ENABLE ROW LEVEL SECURITY;
-- No policies and no grants to `authenticated`: only the SECURITY DEFINER RPC
-- (running as the table owner, which bypasses RLS) reads/writes this table.

-- ----------------------------------------------------------------------------
-- 3) Rate-limited claim RPC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_one_time_prekey(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    OPK_WINDOW           CONSTANT INTERVAL := INTERVAL '1 hour';
    OPK_MAX_PER_PAIR     CONSTANT INTEGER  := 10;   -- one caller vs one target / window
    OPK_MAX_PER_TARGET   CONSTANT INTEGER  := 60;   -- all callers vs one target / window
    v_uid          UUID := auth.uid();
    v_prekey       prekeys%ROWTYPE;
    v_opk          one_time_prekeys%ROWTYPE;
    v_pair_count   INTEGER;
    v_target_count INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
    END IF;

    IF target_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'target_user_id required');
    END IF;

    SELECT * INTO v_prekey FROM prekeys WHERE user_id = target_user_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'no prekey bundle for target');
    END IF;

    SELECT count(*) INTO v_pair_count
    FROM opk_claim_audit
    WHERE caller_id = v_uid
      AND target_id = target_user_id
      AND claimed_at > NOW() - OPK_WINDOW;
    IF v_pair_count >= OPK_MAX_PER_PAIR THEN
        RETURN jsonb_build_object('success', false, 'error', 'rate limited',
                                  'retry_after_seconds', EXTRACT(EPOCH FROM OPK_WINDOW)::int);
    END IF;

    SELECT count(*) INTO v_target_count
    FROM opk_claim_audit
    WHERE target_id = target_user_id
      AND claimed_at > NOW() - OPK_WINDOW;
    IF v_target_count >= OPK_MAX_PER_TARGET THEN
        RETURN jsonb_build_object('success', false, 'error', 'rate limited',
                                  'retry_after_seconds', EXTRACT(EPOCH FROM OPK_WINDOW)::int);
    END IF;

    SELECT * INTO v_opk
    FROM one_time_prekeys
    WHERE user_id = target_user_id AND consumed = FALSE
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF FOUND THEN
        UPDATE one_time_prekeys
        SET consumed = TRUE, consumed_at = NOW()
        WHERE id = v_opk.id;
        INSERT INTO opk_claim_audit (caller_id, target_id) VALUES (v_uid, target_user_id);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'target_user_id', target_user_id,
        'identity_sign_pub', v_prekey.identity_sign_pub,
        'signed_prekey_pub', v_prekey.signed_prekey_pub,
        'signed_prekey_sig', v_prekey.signed_prekey_sig,
        'spk_id', v_prekey.spk_id,
        'opk_id',  CASE WHEN v_opk.id IS NOT NULL THEN v_opk.key_id     ELSE NULL END,
        'opk_pub', CASE WHEN v_opk.id IS NOT NULL THEN v_opk.prekey_pub ELSE NULL END
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION claim_one_time_prekey(UUID) TO authenticated;

COMMIT;


-- ============================================================================
-- >>> auth_db/backend/sql/apply-user-lookup-resolver.sql
-- ============================================================================
-- ============================================================================
-- W3-3 — targeted, rate-limited email -> userId resolver for `user-lookup`
-- ============================================================================
-- Run this ONCE on a LIVE auth_db / identity database, THEN deploy the updated
-- user-lookup edge function (which calls resolve_user_id_by_email instead of
-- auth.admin.listUsers()).
--
-- WHAT IT FIXES (audit finding W3-3):
--   user-lookup.findByEmail used auth.admin.listUsers() (FIRST PAGE ONLY, ~50
--   users) + a JS .find(). That is:
--     * an unthrottled account-EXISTENCE ORACLE (200+userId vs 404 per email),
--     * a correctness bug — real users past page 1 were silently "not found",
--     * an over-broad read — a page of ALL users per single-email query.
--
-- WHAT IT ADDS:
--   * user_lookup_audit — per-caller rate-limit ledger (RLS on, NO authenticated
--     grants; service/DEFINER-written only).
--   * resolve_user_id_by_email(p_caller_id, p_email) SECURITY DEFINER — a single
--     INDEXED lookup against auth.users (paginated-safe at any scale) behind a
--     per-caller sliding-window cap (30/hour). Every attempt (hit OR miss) is
--     recorded so the oracle cannot be brute-forced cheaply. Granted ONLY to
--     service_role (the edge function), NEVER to authenticated.
--
-- ADDITIVE / NON-DESTRUCTIVE: CREATE TABLE IF NOT EXISTS + CREATE OR REPLACE
-- FUNCTION + DROP INDEX IF EXISTS before re-create. No DROP TABLE, no data
-- rewrite. Safe to re-run. search_path is pinned.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_lookup_audit (
    id         BIGSERIAL PRIMARY KEY,
    caller_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    looked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE user_lookup_audit IS 'W3-3: rate-limit ledger for resolve_user_id_by_email(). One row per lookup attempt (found or not) to throttle the account-existence oracle. Service/DEFINER-written only; no authenticated grants.';

DROP INDEX IF EXISTS idx_user_lookup_audit_caller;
CREATE INDEX idx_user_lookup_audit_caller
    ON user_lookup_audit(caller_id, looked_at);

ALTER TABLE user_lookup_audit ENABLE ROW LEVEL SECURITY;
-- No policies / no grants to `authenticated`: only the SECURITY DEFINER resolver
-- (called by the service-role edge function) reads/writes this table.

CREATE OR REPLACE FUNCTION resolve_user_id_by_email(p_caller_id UUID, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    LOOKUP_WINDOW   CONSTANT INTERVAL := INTERVAL '1 hour';
    LOOKUP_MAX      CONSTANT INTEGER  := 30;   -- lookups per caller per window
    v_count   INTEGER;
    v_user_id UUID;
BEGIN
    IF p_caller_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'caller required');
    END IF;
    IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'email required');
    END IF;

    SELECT count(*) INTO v_count
    FROM user_lookup_audit
    WHERE caller_id = p_caller_id
      AND looked_at > NOW() - LOOKUP_WINDOW;
    IF v_count >= LOOKUP_MAX THEN
        RETURN jsonb_build_object('status', 'rate_limited',
                                  'retry_after_seconds', EXTRACT(EPOCH FROM LOOKUP_WINDOW)::int);
    END IF;
    INSERT INTO user_lookup_audit (caller_id) VALUES (p_caller_id);

    SELECT id INTO v_user_id
    FROM auth.users
    WHERE lower(email) = lower(trim(p_email))
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    RETURN jsonb_build_object('status', 'ok', 'user_id', v_user_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION resolve_user_id_by_email(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_user_id_by_email(UUID, TEXT) TO service_role;

COMMIT;


-- ============================================================================
-- >>> auth_db/backend/sql/apply-email-resolver.sql
-- ============================================================================
-- ============================================================================
-- L-1 — targeted, rate-limited userId -> email resolver for `user-lookup`
-- ============================================================================
-- Run this ONCE on a LIVE auth_db / identity database, THEN deploy the updated
-- user-lookup edge function (which calls resolve_email_by_user_id instead of
-- a raw, unthrottled auth.admin.getUserById()).
--
-- Companion to apply-user-lookup-resolver.sql (W3-3, the email -> userId path).
-- Same pattern, opposite direction; reuses the SAME user_lookup_audit ledger so
-- a caller's lookups across BOTH directions share one per-caller budget.
--
-- WHAT IT FIXES (audit finding L-1):
--   user-lookup.getEmailById used auth.admin.getUserById() directly and returned
--   404-vs-200 keyed on the user id, with NO rate limit (unlike findByEmail after
--   W3-3). That is a user-id existence oracle + an unthrottled reverse-lookup.
--   Impact is LOW (user-ids are random UUIDs, not enumerable, and the caller must
--   already hold a valid id) but it is asymmetric with the W3-3 hardening; this
--   brings it to parity.
--
-- WHAT IT ADDS:
--   * resolve_email_by_user_id(p_caller_id, p_user_id) SECURITY DEFINER — a single
--     INDEXED lookup against auth.users behind the SAME per-caller sliding-window
--     cap (30/hour) recorded in user_lookup_audit. Every attempt (hit OR miss) is
--     recorded so neither direction can be brute-forced cheaply. Granted ONLY to
--     service_role (the edge function), NEVER to authenticated.
--
-- The edge function returns a UNIFORM 200 { email: <addr|null> } for both found
-- and not-found, so the response status no longer doubles as an existence oracle.
--
-- ADDITIVE / NON-DESTRUCTIVE: CREATE OR REPLACE FUNCTION only; relies on
-- user_lookup_audit already created by apply-user-lookup-resolver.sql (created
-- here too, IF NOT EXISTS, so this file is also safe to run standalone). No DROP
-- TABLE, no data rewrite. Safe to re-run. search_path is pinned.
-- ============================================================================

BEGIN;

-- Shared rate-limit ledger (also created by apply-user-lookup-resolver.sql).
CREATE TABLE IF NOT EXISTS user_lookup_audit (
    id         BIGSERIAL PRIMARY KEY,
    caller_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    looked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_user_lookup_audit_caller;
CREATE INDEX idx_user_lookup_audit_caller
    ON user_lookup_audit(caller_id, looked_at);

ALTER TABLE user_lookup_audit ENABLE ROW LEVEL SECURITY;
-- No policies / no grants to `authenticated`: only the SECURITY DEFINER resolvers
-- (called by the service-role edge function) read/write this table.

CREATE OR REPLACE FUNCTION resolve_email_by_user_id(p_caller_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    LOOKUP_WINDOW   CONSTANT INTERVAL := INTERVAL '1 hour';
    LOOKUP_MAX      CONSTANT INTEGER  := 30;   -- lookups per caller per window (shared w/ email->id)
    v_count INTEGER;
    v_email TEXT;
BEGIN
    IF p_caller_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'caller required');
    END IF;
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'error', 'user id required');
    END IF;

    SELECT count(*) INTO v_count
    FROM user_lookup_audit
    WHERE caller_id = p_caller_id
      AND looked_at > NOW() - LOOKUP_WINDOW;
    IF v_count >= LOOKUP_MAX THEN
        RETURN jsonb_build_object('status', 'rate_limited',
                                  'retry_after_seconds', EXTRACT(EPOCH FROM LOOKUP_WINDOW)::int);
    END IF;
    INSERT INTO user_lookup_audit (caller_id) VALUES (p_caller_id);

    SELECT email INTO v_email
    FROM auth.users
    WHERE id = p_user_id
    LIMIT 1;

    IF v_email IS NULL THEN
        RETURN jsonb_build_object('status', 'not_found');
    END IF;
    RETURN jsonb_build_object('status', 'ok', 'email', v_email);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('status', 'error', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION resolve_email_by_user_id(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_email_by_user_id(UUID, UUID) TO service_role;

COMMIT;


-- ============================================================================
-- >>> secure_db/sql/apply-forward-secrecy-schema.sql
-- ============================================================================
-- ============================================================================
-- FORWARD SECRECY — MESSAGES RATCHET/X3DH COLUMNS (run ONCE in the SQL Editor)
-- ============================================================================
-- MESSAGING-SIDE migration for FORWARD_SECRECY_DESIGN.md (step S3). Adds the
-- Double Ratchet header columns + X3DH first-message bootstrap columns to the
-- EXISTING messages table. ADDITIVE ONLY: every column is NULLABLE and added with
-- ADD COLUMN IF NOT EXISTS, so it NEVER drops, rewrites, or breaks existing rows or
-- data, and it is safe to re-run (idempotent).
--
-- These columns carry NON-SECRET header material (sender ratchet public key, chain
-- counters, and the initiator's public X3DH preamble). No RLS or GRANT change is
-- needed: the existing GRANT SELECT, INSERT ON messages is whole-row (not column-
-- scoped) and the messages_insert_participant policy constrains sender_id + the
-- conversation membership, not these columns. Pre-cutover rows simply leave the new
-- columns NULL (the client renders them as "previous encryption version — unavailable").
--
-- Companion migration (run separately on the IDENTITY database):
--   auth_db/backend/sql/apply-forward-secrecy-schema.sql  (prekeys + claim RPC)
--
-- DEPLOY ORDER: run BOTH migrations BEFORE shipping the forward-secrecy client (S4-S6),
-- otherwise the new client's inserts referencing these columns would fail.
-- ============================================================================

BEGIN;

-- Double Ratchet header (FORWARD_SECRECY_DESIGN.md §3): per-message routing fields.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ratchet_pub    TEXT;     -- header.dh : sender ratchet pubkey (base64)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS prev_chain_len INTEGER;  -- header.pn : # msgs in previous sending chain
ALTER TABLE messages ADD COLUMN IF NOT EXISTS msg_num        INTEGER;  -- header.n  : message number in current chain

-- X3DH first-message bootstrap preamble (FORWARD_SECRECY_DESIGN.md §2.4): set only on
-- the FIRST message of a conversation; NULL on every subsequent message.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS x3dh_ik        TEXT;     -- initiator X25519 identity public
ALTER TABLE messages ADD COLUMN IF NOT EXISTS x3dh_ik_sign   TEXT;     -- initiator Ed25519 identity-signing public (TOFU pin)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS x3dh_ek        TEXT;     -- initiator ephemeral public EK_a
ALTER TABLE messages ADD COLUMN IF NOT EXISTS x3dh_spk_id    INTEGER;  -- recipient signed-prekey id used
ALTER TABLE messages ADD COLUMN IF NOT EXISTS x3dh_opk_id    INTEGER;  -- recipient one-time-prekey id used (NULL = SPK-only)

COMMENT ON COLUMN messages.ratchet_pub IS 'Double Ratchet header: sender ratchet public key (base64). NULL on pre-forward-secrecy rows.';
COMMENT ON COLUMN messages.prev_chain_len IS 'Double Ratchet header.pn: number of messages in the previous sending chain.';
COMMENT ON COLUMN messages.msg_num IS 'Double Ratchet header.n: message number within the current sending chain.';
COMMENT ON COLUMN messages.x3dh_ik IS 'X3DH first-message preamble: initiator X25519 identity public key. NULL except on the bootstrap message.';
COMMENT ON COLUMN messages.x3dh_ik_sign IS 'X3DH first-message preamble: initiator Ed25519 identity-signing public key (TOFU pin).';
COMMENT ON COLUMN messages.x3dh_ek IS 'X3DH first-message preamble: initiator ephemeral public key EK_a.';
COMMENT ON COLUMN messages.x3dh_spk_id IS 'X3DH first-message preamble: recipient signed-prekey id used.';
COMMENT ON COLUMN messages.x3dh_opk_id IS 'X3DH first-message preamble: recipient one-time prekey id consumed (NULL = SPK-only X3DH fallback).';

COMMIT;


-- ============================================================================
-- >>> secure_db/sql/apply-message-delete.sql
-- ============================================================================
-- ============================================================================
-- DELETE FOR EVERYONE ("unsend") — MESSAGES HARD-DELETE (run ONCE in SQL Editor)
-- ============================================================================
-- MESSAGING-SIDE migration enabling a user to HARD-DELETE a message they SENT,
-- removing the row from the database for BOTH parties. Privacy-first hard delete:
-- there is NO tombstone / soft-delete column — the row is physically removed and
-- the message is gone for sender and recipient alike.
--
-- ADDITIVE ONLY. This migration:
--   * adds a DELETE RLS policy (sender-only),
--   * grants DELETE on messages to authenticated,
--   * ensures REPLICA IDENTITY FULL (so the realtime DELETE event carries the old
--     row's conversation_id — see the long note below),
--   * ensures messages is in the supabase_realtime publication.
-- It NEVER drops a table, never rewrites or deletes existing rows, and is safe to
-- re-run (every statement is idempotent / guarded).
--
-- DEPLOY ORDER: run this BEFORE shipping the client that calls deleteMessage(); the
-- DELETE request would otherwise be rejected (no DELETE grant/policy). It is also
-- already folded into secure_db/sql/complete-setup.sql for fresh installs.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- DELETE RLS POLICY: only the SENDER may delete; the row vanishes for BOTH parties.
-- ----------------------------------------------------------------------------
-- DELETE policies are evaluated via USING only (there is no NEW row, so no
-- WITH CHECK). auth.uid() = sender_id means the recipient simply has no row to
-- target. The FK message_attachments.message_id ON DELETE CASCADE cleans up any
-- attachment metadata rows for the deleted message automatically.
DROP POLICY IF EXISTS messages_delete_own ON messages;
CREATE POLICY messages_delete_own ON messages
    FOR DELETE TO authenticated
    USING (auth.uid() = sender_id);

-- ----------------------------------------------------------------------------
-- GRANT: table-level DELETE privilege (RLS policy above scopes it to the sender).
-- Idempotent — re-GRANTing an existing privilege is a no-op.
-- ----------------------------------------------------------------------------
GRANT DELETE ON messages TO authenticated;

-- ----------------------------------------------------------------------------
-- REPLICA IDENTITY FULL — REQUIRED for the recipient to receive the DELETE event.
-- ----------------------------------------------------------------------------
-- On a DELETE, Postgres writes only the OLD row's *replica-identity* columns to the
-- WAL that logical replication / Supabase Realtime reads. With the default identity
-- (PRIMARY KEY) the realtime DELETE payload's `old` record would contain ONLY the
-- primary key (id) — NOT conversation_id. The recipient subscribes with a
-- conversation filter (`conversation_id=eq.N`), so without conversation_id in the
-- OLD row the broker cannot match the DELETE to the recipient's channel and the
-- recipient would never drop the unsent message.
--
-- REPLICA IDENTITY FULL makes the WAL carry the ENTIRE old row on DELETE (and
-- UPDATE), so old.conversation_id (and old.sender_id) are present and the
-- conversation-filtered subscription matches. This is idempotent (setting it when
-- already FULL is a no-op). complete-setup.sql already sets this; restated here so
-- this migration is self-sufficient on a database provisioned before that change.
ALTER TABLE messages REPLICA IDENTITY FULL;

-- ----------------------------------------------------------------------------
-- PUBLICATION: ensure messages streams realtime changes.
-- ----------------------------------------------------------------------------
-- A publication created without a FOR-operation clause streams INSERT, UPDATE AND
-- DELETE by default, so once messages is a member of supabase_realtime the DELETE
-- event flows automatically — no per-operation publication change is needed. This
-- block is a no-op when messages is already published (the typical case, since the
-- INSERT realtime path is already in production).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE messages;
        EXCEPTION WHEN duplicate_object THEN
            -- Already a member of the publication; nothing to do.
            NULL;
        END;
    ELSE
        CREATE PUBLICATION supabase_realtime FOR TABLE messages;
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFY (optional, run in the SQL Editor after applying):
--   -- sender-only DELETE policy present?
--   SELECT polname, cmd FROM pg_policies
--     WHERE schemaname='public' AND tablename='messages' AND cmd='DELETE';
--   -- REPLICA IDENTITY FULL ('f') on messages?
--   SELECT relreplident FROM pg_class WHERE relname='messages';  -- expect 'f'
--   -- messages in the realtime publication?
--   SELECT 1 FROM pg_publication_tables
--     WHERE pubname='supabase_realtime' AND tablename='messages';
-- ============================================================================


-- ============================================================================
-- >>> secure_db/sql/apply-premium-entitlement-bootstrap.sql
-- ============================================================================
-- ============================================================================
-- PREMIUM ENTITLEMENT PREDICATE — MESSAGING-SCHEMA BOOTSTRAP (run ONCE in SQL Editor)
-- Idempotent, non-destructive.
-- ============================================================================
-- PRODUCT DECISION: MESSAGING IS FREE. The Premium feature is cross-user SHARING, gated
-- on the money_tracker data_shares owner-INSERT. This MESSAGING-SIDE migration therefore
-- does NOT touch any messages policy any more (it previously gated messages_insert_
-- participant on Premium — that gate has been REMOVED; messaging is free).
--
-- All this file still does is ship a fail-CLOSED bootstrap is_premium_active(uid) so the
-- predicate EXISTS in this database regardless of file-load order. In the shared all-in-
-- one DB the data_shares sharing gate (money_tracker/database/setup/
-- apply-premium-sharing-gate.sql) and the payments-side migration (payments_app/backend/
-- sql/apply-premium-entitlement.sql) CREATE-OR-REPLACE this with the full subscriptions-
-- backed body. Any run order is safe:
--   * if subscriptions is NOT present yet -> install the fail-closed bootstrap (denies);
--   * if subscriptions IS present but the function is missing -> install the full body;
--   * otherwise -> leave the existing (full) body untouched.
--
-- Predicate truth (whichever body is live):
--   premium == (status='active' AND plan=Premium)
--           OR (status='trial'  AND trial_end > NOW())   -- expired trial => NOT premium
--
-- ADDITIVE / re-runnable. Never drops the messages table; never rewrites rows; never
-- changes a messages policy. Already folded into secure_db/sql/complete-setup.sql for
-- fresh installs.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- BOOTSTRAP is_premium_active(uid) — fail-closed if subscriptions isn't installed yet.
-- Guards on whether subscriptions already exists and only (re)installs the bootstrap when
-- it does NOT, leaving an already-installed full body untouched.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.subscriptions') IS NULL
       OR to_regclass('public.subscription_plans') IS NULL THEN
        -- Payments schema not present yet: install the fail-closed bootstrap.
        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION is_premium_active(p_uid UUID)
            RETURNS BOOLEAN
            LANGUAGE plpgsql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS $body$
            BEGIN
                -- Fail closed if the subscriptions schema is not installed (deny, never allow).
                IF to_regclass('public.subscriptions') IS NULL
                   OR to_regclass('public.subscription_plans') IS NULL THEN
                    RETURN FALSE;
                END IF;

                RETURN EXISTS (
                    SELECT 1
                    FROM subscriptions s
                    JOIN subscription_plans p ON p.id = s.plan_id
                    WHERE s.user_id = p_uid
                      AND (
                            (s.status = 'active' AND p.name = 'Premium')
                         OR (s.status = 'trial'  AND s.trial_end IS NOT NULL AND s.trial_end > NOW())
                      )
                );
            END;
            $body$;
        $fn$;
        EXECUTE 'GRANT EXECUTE ON FUNCTION is_premium_active(UUID) TO authenticated';
        RAISE NOTICE 'is_premium_active: installed fail-closed bootstrap (subscriptions not present yet).';
    ELSIF to_regprocedure('public.is_premium_active(uuid)') IS NULL THEN
        -- Subscriptions present but the function was never created: install the full body.
        EXECUTE $fn$
            CREATE OR REPLACE FUNCTION is_premium_active(p_uid UUID)
            RETURNS BOOLEAN
            LANGUAGE sql
            STABLE
            SECURITY DEFINER
            SET search_path = public
            AS $body$
                SELECT EXISTS (
                    SELECT 1
                    FROM subscriptions s
                    JOIN subscription_plans p ON p.id = s.plan_id
                    WHERE s.user_id = p_uid
                      AND (
                            (s.status = 'active' AND p.name = 'Premium')
                         OR (s.status = 'trial'  AND s.trial_end IS NOT NULL AND s.trial_end > NOW())
                      )
                );
            $body$;
        $fn$;
        EXECUTE 'GRANT EXECUTE ON FUNCTION is_premium_active(UUID) TO authenticated';
        RAISE NOTICE 'is_premium_active: installed full subscriptions-backed body.';
    ELSE
        RAISE NOTICE 'is_premium_active: already present; leaving its body unchanged.';
    END IF;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- RUNBOOK
--   * MESSAGING IS FREE: this file no longer changes any messages policy. It only
--     guarantees is_premium_active() exists for the SHARING gate.
--   * Shared project (money_tracker + messaging): run the payments-side migration
--     (payments_app/backend/sql/apply-premium-entitlement.sql) and the money_tracker
--     sharing-gate migration (database/setup/apply-premium-sharing-gate.sql) to install
--     the full predicate + trial-expiry sweep + the data_shares Premium INSERT gate.
--     (On a fresh install all of this is already in the complete-setup.sql files.)
-- ----------------------------------------------------------------------------


-- ============================================================================
-- >>> secure_db/sql/apply-attachment-metadata-encryption.sql
-- ============================================================================
-- ============================================================================
-- H-6: ENCRYPT ATTACHMENT METADATA AT REST (run ONCE in the SQL Editor)
-- ============================================================================
-- Audit finding H-6: message_attachments stored file_name, mime_type and the
-- EXACT file_size in PLAINTEXT ("stored unencrypted for querying"), so a curious /
-- compromised server could read original filenames, MIME types and exact byte
-- counts of every attachment despite the file BYTES being E2E-encrypted. Filenames
-- routinely carry the most sensitive content (e.g. "divorce_settlement.pdf"), and
-- the exact size enables known-file fingerprinting against the encrypted blob.
--
-- THE FIX (client side, see messaging/services/attachmentService.js):
--   * file_name + mime_type + exact file_size are sealed CLIENT-SIDE into an
--     encrypted_metadata blob (XSalsa20-Poly1305 under the conversation's INVARIANT
--     attachment KEK — the same key the file key is wrapped with, W3-2), with a
--     separate metadata_nonce.
--   * the server only ever sees file_size_bucket — a COARSE, rounded-UP size — so
--     no exact byte count leaks.
--   * the old plaintext columns are NO LONGER written by current clients.
--
-- THIS MIGRATION (server side): make the schema accept the new shape WITHOUT
-- breaking the rows that already exist.
--   * ADD file_size_bucket / encrypted_metadata / metadata_nonce (nullable).
--   * RELAX the NOT NULL on the legacy file_name / file_size / mime_type columns so
--     new clients can stop writing them. The legacy columns are KEPT (nullable) so
--     pre-migration rows stay readable (the client falls back to them).
--
-- ADDITIVE / IDEMPOTENT ONLY. This migration NEVER drops a table, never rewrites or
-- deletes existing rows, and is safe to re-run (every statement is guarded). It is
-- also folded into secure_db/sql/complete-setup.sql and
-- money_tracker/database/setup/fresh-install-complete.sql for fresh installs.
--
-- RLS is UNCHANGED: attachments_select_participant already scopes rows to the
-- conversation's participants; this migration does not touch any policy or grant.
--
-- DEPLOY ORDER: run this BEFORE (or together with) shipping the client that stops
-- writing the plaintext columns. The new client inserts NULL file_name/size/type, so
-- the old NOT NULL constraints must already be relaxed or the INSERT would be
-- rejected. Old clients keep working (they still write the legacy columns, which
-- remain present).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- NEW COLUMNS — private metadata blob + coarse size bucket. ADD IF NOT EXISTS so
-- re-running is a no-op and an already-migrated DB is untouched.
-- ----------------------------------------------------------------------------
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS file_size_bucket   BIGINT;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS encrypted_metadata TEXT;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS metadata_nonce     TEXT;

-- ----------------------------------------------------------------------------
-- RELAX legacy NOT NULL constraints so new clients can leave them NULL. DROP NOT
-- NULL is idempotent (a no-op when the column is already nullable) and does NOT
-- touch existing data.
-- ----------------------------------------------------------------------------
ALTER TABLE message_attachments ALTER COLUMN file_name DROP NOT NULL;
ALTER TABLE message_attachments ALTER COLUMN file_size DROP NOT NULL;
ALTER TABLE message_attachments ALTER COLUMN mime_type DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- DOCUMENT the new contract on the columns.
-- ----------------------------------------------------------------------------
COMMENT ON TABLE  message_attachments              IS 'File attachments for messages. Files expire after 24 hours. H-6: name/type/exact-size are client-encrypted (encrypted_metadata); only a coarse size bucket is in plaintext.';
COMMENT ON COLUMN message_attachments.encrypted_metadata IS 'H-6: client-encrypted JSON {file_name, mime_type, file_size}, sealed under the conversation attachment KEK. Replaces the plaintext columns.';
COMMENT ON COLUMN message_attachments.metadata_nonce     IS 'H-6: secretbox nonce (base64) for encrypted_metadata.';
COMMENT ON COLUMN message_attachments.file_size_bucket   IS 'H-6: file size rounded UP to a coarse bucket so the exact byte count never leaks. Exact size is in encrypted_metadata.';
COMMENT ON COLUMN message_attachments.file_name          IS 'H-6 LEGACY: plaintext name (nullable). Not written by current clients; kept only to read pre-H-6 rows.';
COMMENT ON COLUMN message_attachments.mime_type          IS 'H-6 LEGACY: plaintext MIME (nullable). Not written by current clients; kept only to read pre-H-6 rows.';
COMMENT ON COLUMN message_attachments.file_size          IS 'H-6 LEGACY: plaintext exact size (nullable). Superseded by file_size_bucket + encrypted_metadata.';

COMMIT;

-- ============================================================================
-- OPTIONAL HARDENING — DROP the legacy plaintext columns entirely.
-- ============================================================================
-- The legacy file_name / file_size / mime_type columns are retained above ONLY so
-- attachments written BEFORE this migration stay readable. Because attachments
-- auto-expire after 24 hours (cleanup_expired_attachments), once >24h have passed
-- since this migration AND every old client has been retired, NO row will have
-- meaningful plaintext metadata and the columns can be dropped to remove the leak
-- surface completely. This step is DESTRUCTIVE of those columns, so it is left
-- COMMENTED OUT — uncomment and run it only after the 24h window:
--
--   BEGIN;
--   ALTER TABLE message_attachments DROP COLUMN IF EXISTS file_name;
--   ALTER TABLE message_attachments DROP COLUMN IF EXISTS file_size;
--   ALTER TABLE message_attachments DROP COLUMN IF EXISTS mime_type;
--   COMMIT;
--
-- After dropping, also remove file_name/file_size/mime_type from the client SELECT
-- in attachmentService.getMessageAttachments (the back-compat fallback path).
-- ============================================================================

-- ============================================================================
-- VERIFY (optional, run in the SQL Editor after applying):
--   -- new columns present?
--   SELECT column_name, is_nullable FROM information_schema.columns
--     WHERE table_name='message_attachments'
--       AND column_name IN ('encrypted_metadata','metadata_nonce','file_size_bucket',
--                           'file_name','file_size','mime_type')
--     ORDER BY column_name;
--   -- expect encrypted_metadata/metadata_nonce/file_size_bucket = YES (nullable)
--   --        and file_name/file_size/mime_type = YES (now nullable too).
-- ============================================================================


-- ============================================================================
-- >>> payments_app/backend/sql/apply-entitlement-lockdown.sql
-- ============================================================================
-- ============================================================================
-- ENTITLEMENT LOCKDOWN — server-authoritative Premium entitlement (audit PAY-3 / RLS-03)
-- Idempotent, non-destructive. Closes the hole where an authenticated user could
-- self-grant Premium by a direct `subscriptions` UPDATE/INSERT (RLS allowed it via
-- subscriptions_update_own / subscriptions_insert_own) or by replaying ?upgrade=success.
--
-- After this migration, the ONLY write paths into `subscriptions` are:
--   1. SECURITY DEFINER RPCs below (start_trial / downgrade_to_free / ensure_subscription),
--      each of which re-asserts auth.uid() and constrains WHAT the caller may set.
--   2. The signup trigger create_trial_subscription() (SECURITY DEFINER, already present).
--   3. The Stripe edge functions (checkout-session / update-subscription / stripe-webhook),
--      which connect with the SERVICE ROLE key and therefore BYPASS RLS *and* the REVOKE.
--
-- ⚠ STAGED DEPLOY — DO NOT run the REVOKE block (Stage C, bottom of this file) until
--   the new client (which calls the RPCs instead of writing `subscriptions` directly)
--   is fully deployed. The CREATE OR REPLACE RPCs + GRANTs (Stage A) are safe to run
--   first and at any time; they are additive. See the runbook at the end.
--
-- Safe to re-run. Mirrors backend/sql/complete-setup.sql (canonical) and the
-- money_tracker installer (database/setup/fresh-install-complete.sql).
-- ============================================================================

-- ===========================================================================
-- STAGE A — SECURITY DEFINER RPCs + GRANTs (additive; deploy FIRST, with/ before client)
-- ===========================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- start_trial() — idempotently put the CALLER'S OWN row onto a Premium trial.
-- Anti-abuse: refuses if the caller has already had a trial (or is/was paid),
-- so a user cannot repeatedly re-trial to keep free Premium forever.
-- Returns the resulting subscription row as JSONB ({success:false,error:...} on refusal).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_trial()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid           UUID := auth.uid();
    v_premium_id    BIGINT;
    v_trial_days    INT := 30;   -- matches create_trial_subscription() trigger; subscription_plans has no trial_period_days column
    v_existing      subscriptions%ROWTYPE;
    v_row           subscriptions%ROWTYPE;
BEGIN
    -- Must be an authenticated end-user. Service-role callers have NULL auth.uid()
    -- and should write subscriptions directly (they have their own trusted paths),
    -- so reject NULL here to avoid an unscoped self-grant.
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
    END IF;

    SELECT id INTO v_premium_id FROM subscription_plans WHERE name = 'Premium' LIMIT 1;
    IF v_premium_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Premium plan not found');
    END IF;

    SELECT * INTO v_existing FROM subscriptions WHERE user_id = v_uid;

    IF FOUND THEN
        -- Idempotent: if they are ALREADY on a live trial, just return it.
        IF v_existing.status = 'trial' THEN
            RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_existing));
        END IF;

        -- Anti-reuse: a row that is not currently 'trial' means the trial was already
        -- consumed (downgraded to Free, paid/active, canceled, etc). Do NOT re-grant.
        RETURN jsonb_build_object('success', false, 'error', 'trial already used');
    END IF;

    -- No row yet (signup trigger did not fire — the original fallback case). Create one.
    INSERT INTO subscriptions (user_id, plan_id, status, trial_end)
    VALUES (v_uid, v_premium_id, 'trial', NOW() + (v_trial_days || ' days')::interval)
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_row));

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION start_trial() TO authenticated;

-- ---------------------------------------------------------------------------
-- downgrade_to_free() — put the CALLER'S OWN row onto the Free plan, status 'active',
-- clearing all Stripe/trial/cancellation/pending fields. Used by trial-expiry
-- auto-downgrade and by a client-initiated cancel-to-Free. Idempotent.
-- Does NOT touch Stripe — cancelling a live Stripe subscription remains the job of
-- the update-subscription edge function (service role). This only fixes local entitlement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION downgrade_to_free()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_free_id   BIGINT;
    v_row       subscriptions%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
    END IF;

    SELECT id INTO v_free_id FROM subscription_plans WHERE name = 'Free' LIMIT 1;
    IF v_free_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Free plan not found');
    END IF;

    UPDATE subscriptions SET
        plan_id                = v_free_id,
        status                 = 'active',
        trial_end              = NULL,
        stripe_customer_id     = NULL,
        stripe_subscription_id = NULL,
        stripe_price_id        = NULL,
        current_period_start   = NULL,
        current_period_end     = NULL,
        cancel_at_period_end   = false,
        canceled_at            = NULL,
        pending_plan_id        = NULL,
        pending_change_at      = NULL
    WHERE user_id = v_uid
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        -- No row yet: create the Free row directly so the caller ends up entitled-as-Free.
        INSERT INTO subscriptions (user_id, plan_id, status, trial_end)
        VALUES (v_uid, v_free_id, 'active', NULL)
        RETURNING * INTO v_row;
    END IF;

    RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_row));

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION downgrade_to_free() TO authenticated;

-- ---------------------------------------------------------------------------
-- ensure_subscription() — guarantee the caller HAS a row, without granting Premium.
-- If the signup trigger fired, this is a no-op returning the existing row. If it did
-- NOT (edge case), it creates a Free/active row (the safe default — NOT a trial, so it
-- can't be used to self-grant Premium). Lets the client drop its direct INSERT entirely.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_subscription()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_free_id BIGINT;
    v_row     subscriptions%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_row FROM subscriptions WHERE user_id = v_uid;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_row));
    END IF;

    SELECT id INTO v_free_id FROM subscription_plans WHERE name = 'Free' LIMIT 1;
    IF v_free_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Free plan not found');
    END IF;

    INSERT INTO subscriptions (user_id, plan_id, status, trial_end)
    VALUES (v_uid, v_free_id, 'active', NULL)
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_row));

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_subscription() TO authenticated;

COMMIT;

-- ===========================================================================
-- STAGE C — THE REVOKE (run LAST, only after the RPC-calling client is deployed)
-- ===========================================================================
-- Once no client writes `subscriptions` directly, remove the client's INSERT/UPDATE
-- grants and the permissive RLS write policies. SELECT stays so the UI can still read
-- the user's own row. The SECURITY DEFINER RPCs + service-role edge functions are
-- unaffected (DEFINER runs as the function owner; service role bypasses RLS).
--
-- To stage: KEEP the block below commented in the canonical installer until cutover,
-- then run it (or run apply-entitlement-lockdown.sql in full once the client is live).
-- It is written idempotently so re-running is harmless.
BEGIN;

-- Defense-in-depth: tighten the (soon-to-be-unreachable) write policies with a
-- WITH CHECK so that even if a grant is ever re-added by mistake, a user can only
-- ever target their OWN row. (REVOKE below is the real lock; this is belt-and-braces.)
DROP POLICY IF EXISTS subscriptions_update_own ON subscriptions;
CREATE POLICY subscriptions_update_own ON subscriptions
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS subscriptions_insert_own ON subscriptions;
CREATE POLICY subscriptions_insert_own ON subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- The actual lockdown: clients can no longer INSERT/UPDATE subscriptions at all.
-- All entitlement writes now flow through the SECURITY DEFINER RPCs above and the
-- service-role edge functions. SELECT is retained.
REVOKE INSERT, UPDATE ON subscriptions FROM authenticated;

-- The sequence grant is only needed for client-side INSERT, which is now gone.
-- (SECURITY DEFINER inserts run as the owner, not `authenticated`.)
REVOKE USAGE, SELECT ON SEQUENCE subscriptions_id_seq FROM authenticated;

COMMIT;


-- ============================================================================
-- >>> payments_app/backend/sql/apply-premium-entitlement.sql
-- ============================================================================
-- ============================================================================
-- SERVER-AUTHORITATIVE PREMIUM ENTITLEMENT + TRIAL EXPIRY
-- PAYMENTS-SIDE migration (run ONCE in the SQL Editor). Idempotent, non-destructive.
-- ============================================================================
-- PRODUCT DECISION: MESSAGING IS FREE; the Premium feature is cross-user SHARING. This
-- PAYMENTS-SIDE migration installs the SERVER-SIDE entitlement TRUTH that the sharing
-- gate consumes. Premium/trial entitlement was previously enforced ONLY client-side: the
-- signup trigger writes status='trial', plan=Premium, trial_end=NOW()+30d, and the ONLY
-- thing that downgraded an expired trial was the CLIENT calling downgrade_to_free(). A
-- tampered client (or direct PostgREST calls) could keep status='trial' with a long-past
-- trial_end forever -> permanent free Premium.
--
-- This migration adds the SERVER-SIDE truth and the trial-expiry job:
--   1. is_premium_active(uid): the canonical entitlement predicate, computed from
--      subscriptions + subscription_plans, NEVER from `status` alone:
--        premium == (status='active' AND plan=Premium)
--                OR (status='trial'  AND trial_end > NOW())   -- expired trial => NOT premium
--   2. expire_overdue_trials(): a sweep that flips expired trials to Free/active,
--      scheduled hourly via pg_cron when the extension is present.
--
-- The SHARING gate that USES is_premium_active() (the data_shares owner-INSERT WITH CHECK)
-- is added by the money_tracker migration database/setup/apply-premium-sharing-gate.sql
-- (and is folded into both complete-setup.sql installers). Order does not matter: this
-- file (re)defines is_premium_active with its full body; the messaging schema ships a
-- fail-closed bootstrap definition so it exists regardless of load order. (Messaging is
-- NO LONGER gated — the former apply-premium-message-gate.sql files were retired.)
--
-- ADDITIVE ONLY: never drops a table, never rewrites/deletes rows. Safe to re-run.
-- Mirrors payments_app/backend/sql/complete-setup.sql and the money_tracker installer.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- is_premium_active(uid) — the single source of truth for current entitlement.
-- SECURITY DEFINER + pinned search_path so the messages-INSERT RLS gate (secure_db)
-- can evaluate it for any caller regardless of the subscriptions row's own RLS. It
-- reads only the passed uid's single row and returns a boolean (no other user's data).
-- The RLS gate always passes auth.uid(), so the answer is scoped to the acting user.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_premium_active(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM subscriptions s
        JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.user_id = p_uid
          AND (
                (s.status = 'active' AND p.name = 'Premium')
             OR (s.status = 'trial'  AND s.trial_end IS NOT NULL AND s.trial_end > NOW())
          )
    );
$$;

GRANT EXECUTE ON FUNCTION is_premium_active(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- expire_overdue_trials() — server-side trial-expiry sweep (replaces the client-only
-- downgrade path). is_premium_active() already denies expired trials, so enforcement
-- is correct even before this sweep runs; the sweep keeps stored rows honest.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_overdue_trials()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_free_id BIGINT;
    v_count   INTEGER;
BEGIN
    SELECT id INTO v_free_id FROM subscription_plans WHERE name = 'Free' LIMIT 1;
    IF v_free_id IS NULL THEN
        RAISE LOG 'expire_overdue_trials: Free plan not found; skipping';
        RETURN 0;
    END IF;

    UPDATE subscriptions SET
        plan_id   = v_free_id,
        status    = 'active',
        trial_end = NULL
    WHERE status = 'trial'
      AND trial_end IS NOT NULL
      AND trial_end < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- Sweep runs as the service role via pg_cron — never grant it to `authenticated`
-- (a client must never be able to mass-mutate other users' subscription rows).
REVOKE ALL ON FUNCTION expire_overdue_trials() FROM PUBLIC;

COMMIT;

-- ---------------------------------------------------------------------------
-- Schedule the hourly sweep via pg_cron IF the extension is available. On Supabase,
-- enable pg_cron once (Dashboard > Database > Extensions > pg_cron) then re-run this
-- file (or run the cron.schedule call below manually). If pg_cron is absent this is a
-- safe no-op — is_premium_active() already denies expired trials, so revenue is
-- protected even without the cron. Kept OUTSIDE the transaction above because some
-- pg_cron versions disallow cron.schedule inside an explicit transaction block.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.schedule(
                'expire-overdue-trials',
                '0 * * * *',               -- top of every hour
                $cron$SELECT public.expire_overdue_trials();$cron$
            );
            RAISE NOTICE 'pg_cron: scheduled job "expire-overdue-trials" (hourly).';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'pg_cron present but scheduling failed (likely already scheduled): %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'pg_cron not installed: trial-expiry sweep NOT scheduled. is_premium_active() still denies expired trials. Enable pg_cron then re-run this file.';
    END IF;
END $$;


-- ============================================================================
-- >>> money_tracker/database/setup/apply-rls-hardening.sql
-- ============================================================================
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

-- SDB-05: conversation_session_keys UPDATE — add WITH CHECK so the owner cannot
-- reassign a session-key row to another user_id (USING validated only the OLD row).
DROP POLICY IF EXISTS session_keys_update_own ON conversation_session_keys;
CREATE POLICY session_keys_update_own ON conversation_session_keys
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- SDB-07: conversations is updated by clients only to advance last_message_at;
-- updated_at is trigger-written (trigger_update_conversations_updated_at), so revoke
-- the broad UPDATE and re-grant column-scoped to last_message_at only — clients must
-- not be able to write updated_at directly.
REVOKE UPDATE ON conversations FROM authenticated;
GRANT UPDATE (last_message_at) ON conversations TO authenticated;

-- ADB-03/RLS-09: pairing_requests SELECT — defense-in-depth so an EXPIRED wrapped
-- bundle is not selectable even before it is physically reaped. The load-bearing half
-- is an operator-set pg_cron reaper:
--   DELETE FROM pairing_requests WHERE expires_at < now();
-- (RLS only hides expired rows; it does not delete the at-rest ciphertext.)
-- NOTE: only takes effect where the pairing_requests table exists (added via
-- add-device-pairing.sql); harmless no-op otherwise.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'pairing_requests' AND relkind = 'r') THEN
        DROP POLICY IF EXISTS pairing_requests_select_own ON pairing_requests;
        CREATE POLICY pairing_requests_select_own ON pairing_requests
            FOR SELECT USING (auth.uid() = user_id AND expires_at > now());
    END IF;
END $$;

-- ADB-05/CR-4: remove the deprecated, unreferenced device_keys table (superseded by
-- pairing_requests; its never-enforced expiry could leave weakly-wrapped identity
-- secrets lingering). paired_devices is intentionally kept (still used by config).
DROP TABLE IF EXISTS device_keys CASCADE;

COMMIT;


-- ============================================================================
-- >>> money_tracker/database/setup/apply-entitlement-lockdown.sql
-- ============================================================================
-- ============================================================================
-- ENTITLEMENT LOCKDOWN — server-authoritative Premium entitlement (audit PAY-3 / RLS-03)
-- Idempotent, non-destructive. Closes the hole where an authenticated user could
-- self-grant Premium by a direct `subscriptions` UPDATE/INSERT (RLS allowed it via
-- subscriptions_update_own / subscriptions_insert_own) or by replaying ?upgrade=success.
--
-- After this migration, the ONLY write paths into `subscriptions` are:
--   1. SECURITY DEFINER RPCs below (start_trial / downgrade_to_free / ensure_subscription),
--      each of which re-asserts auth.uid() and constrains WHAT the caller may set.
--   2. The signup trigger create_trial_subscription() (SECURITY DEFINER, already present).
--   3. The Stripe edge functions (checkout-session / update-subscription / stripe-webhook),
--      which connect with the SERVICE ROLE key and therefore BYPASS RLS *and* the REVOKE.
--
-- ⚠ STAGED DEPLOY — DO NOT run the REVOKE block (Stage C, bottom of this file) until
--   the new client (which calls the RPCs instead of writing `subscriptions` directly)
--   is fully deployed. The CREATE OR REPLACE RPCs + GRANTs (Stage A) are safe to run
--   first and at any time; they are additive. See the runbook at the end.
--
-- Safe to re-run. Mirrors backend/sql/complete-setup.sql (canonical) and the
-- money_tracker installer (database/setup/fresh-install-complete.sql).
-- ============================================================================

-- ===========================================================================
-- STAGE A — SECURITY DEFINER RPCs + GRANTs (additive; deploy FIRST, with/ before client)
-- ===========================================================================
BEGIN;

-- ---------------------------------------------------------------------------
-- start_trial() — idempotently put the CALLER'S OWN row onto a Premium trial.
-- Anti-abuse: refuses if the caller has already had a trial (or is/was paid),
-- so a user cannot repeatedly re-trial to keep free Premium forever.
-- Returns the resulting subscription row as JSONB ({success:false,error:...} on refusal).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION start_trial()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid           UUID := auth.uid();
    v_premium_id    BIGINT;
    v_trial_days    INT := 30;   -- matches create_trial_subscription() trigger; subscription_plans has no trial_period_days column
    v_existing      subscriptions%ROWTYPE;
    v_row           subscriptions%ROWTYPE;
BEGIN
    -- Must be an authenticated end-user. Service-role callers have NULL auth.uid()
    -- and should write subscriptions directly (they have their own trusted paths),
    -- so reject NULL here to avoid an unscoped self-grant.
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
    END IF;

    SELECT id INTO v_premium_id FROM subscription_plans WHERE name = 'Premium' LIMIT 1;
    IF v_premium_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Premium plan not found');
    END IF;

    SELECT * INTO v_existing FROM subscriptions WHERE user_id = v_uid;

    IF FOUND THEN
        -- Idempotent: if they are ALREADY on a live trial, just return it.
        IF v_existing.status = 'trial' THEN
            RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_existing));
        END IF;

        -- Anti-reuse: a row that is not currently 'trial' means the trial was already
        -- consumed (downgraded to Free, paid/active, canceled, etc). Do NOT re-grant.
        RETURN jsonb_build_object('success', false, 'error', 'trial already used');
    END IF;

    -- No row yet (signup trigger did not fire — the original fallback case). Create one.
    INSERT INTO subscriptions (user_id, plan_id, status, trial_end)
    VALUES (v_uid, v_premium_id, 'trial', NOW() + (v_trial_days || ' days')::interval)
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_row));

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION start_trial() TO authenticated;

-- ---------------------------------------------------------------------------
-- downgrade_to_free() — put the CALLER'S OWN row onto the Free plan, status 'active',
-- clearing all Stripe/trial/cancellation/pending fields. Used by trial-expiry
-- auto-downgrade and by a client-initiated cancel-to-Free. Idempotent.
-- Does NOT touch Stripe — cancelling a live Stripe subscription remains the job of
-- the update-subscription edge function (service role). This only fixes local entitlement.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION downgrade_to_free()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid       UUID := auth.uid();
    v_free_id   BIGINT;
    v_row       subscriptions%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
    END IF;

    SELECT id INTO v_free_id FROM subscription_plans WHERE name = 'Free' LIMIT 1;
    IF v_free_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Free plan not found');
    END IF;

    UPDATE subscriptions SET
        plan_id                = v_free_id,
        status                 = 'active',
        trial_end              = NULL,
        stripe_customer_id     = NULL,
        stripe_subscription_id = NULL,
        stripe_price_id        = NULL,
        current_period_start   = NULL,
        current_period_end     = NULL,
        cancel_at_period_end   = false,
        canceled_at            = NULL,
        pending_plan_id        = NULL,
        pending_change_at      = NULL
    WHERE user_id = v_uid
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
        -- No row yet: create the Free row directly so the caller ends up entitled-as-Free.
        INSERT INTO subscriptions (user_id, plan_id, status, trial_end)
        VALUES (v_uid, v_free_id, 'active', NULL)
        RETURNING * INTO v_row;
    END IF;

    RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_row));

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION downgrade_to_free() TO authenticated;

-- ---------------------------------------------------------------------------
-- ensure_subscription() — guarantee the caller HAS a row, without granting Premium.
-- If the signup trigger fired, this is a no-op returning the existing row. If it did
-- NOT (edge case), it creates a Free/active row (the safe default — NOT a trial, so it
-- can't be used to self-grant Premium). Lets the client drop its direct INSERT entirely.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ensure_subscription()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid     UUID := auth.uid();
    v_free_id BIGINT;
    v_row     subscriptions%ROWTYPE;
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not authenticated');
    END IF;

    SELECT * INTO v_row FROM subscriptions WHERE user_id = v_uid;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_row));
    END IF;

    SELECT id INTO v_free_id FROM subscription_plans WHERE name = 'Free' LIMIT 1;
    IF v_free_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Free plan not found');
    END IF;

    INSERT INTO subscriptions (user_id, plan_id, status, trial_end)
    VALUES (v_uid, v_free_id, 'active', NULL)
    RETURNING * INTO v_row;

    RETURN jsonb_build_object('success', true, 'subscription', to_jsonb(v_row));

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_subscription() TO authenticated;

COMMIT;

-- ===========================================================================
-- STAGE C — THE REVOKE (run LAST, only after the RPC-calling client is deployed)
-- ===========================================================================
-- Once no client writes `subscriptions` directly, remove the client's INSERT/UPDATE
-- grants and the permissive RLS write policies. SELECT stays so the UI can still read
-- the user's own row. The SECURITY DEFINER RPCs + service-role edge functions are
-- unaffected (DEFINER runs as the function owner; service role bypasses RLS).
--
-- To stage: KEEP the block below commented in the canonical installer until cutover,
-- then run it (or run apply-entitlement-lockdown.sql in full once the client is live).
-- It is written idempotently so re-running is harmless.
BEGIN;

-- Defense-in-depth: tighten the (soon-to-be-unreachable) write policies with a
-- WITH CHECK so that even if a grant is ever re-added by mistake, a user can only
-- ever target their OWN row. (REVOKE below is the real lock; this is belt-and-braces.)
DROP POLICY IF EXISTS subscriptions_update_own ON subscriptions;
CREATE POLICY subscriptions_update_own ON subscriptions
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS subscriptions_insert_own ON subscriptions;
CREATE POLICY subscriptions_insert_own ON subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- The actual lockdown: clients can no longer INSERT/UPDATE subscriptions at all.
-- All entitlement writes now flow through the SECURITY DEFINER RPCs above and the
-- service-role edge functions. SELECT is retained.
REVOKE INSERT, UPDATE ON subscriptions FROM authenticated;

-- The sequence grant is only needed for client-side INSERT, which is now gone.
-- (SECURITY DEFINER inserts run as the owner, not `authenticated`.)
REVOKE USAGE, SELECT ON SEQUENCE subscriptions_id_seq FROM authenticated;

COMMIT;


-- ============================================================================
-- >>> money_tracker/database/setup/apply-budget-dek.sql
-- ============================================================================
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


-- ============================================================================
-- >>> money_tracker/database/setup/apply-budget-envelope.sql
-- ============================================================================
-- ============================================================================
-- BUDGET E2E ENVELOPE COLUMNS — idempotent, non-destructive. Run ONCE on an
-- existing money_tracker/shared database to add the encrypted-envelope columns to
-- the budget tables that hold sensitive data: user_months (the per-month JSONB
-- blob table) and pots (BUDGET_E2E_DESIGN.md §2.1/§2.2, staged plan S3).
-- Safe to re-run. Mirrors the DDL folded into
-- database/setup/fresh-install-complete.sql so a from-scratch install already
-- includes these columns.
--
-- SCHEMA ONLY — this is staged plan S3. It adds storage for ciphertext; it does
-- NOT wire any client code (that is S4) and does NOT touch existing data. Every
-- new column is NULLABLE and additive, so existing PLAINTEXT rows are untouched:
-- they keep enc_payload/enc_nonce = NULL and enc_version = 0 (legacy plaintext)
-- and continue to be read from their plaintext columns. The S5 dual-read window
-- branches on enc_version (0 = read plaintext columns, 1 = read enc_payload).
--
-- GRANULARITY (per the design, §1.2): ONE per-ROW envelope per table, NOT
-- per-column. user_months gets a single enc_payload covering the JSON of all
-- SEVEN sensitive JSONB columns (date_range, weekly_breakdown, fixed_costs,
-- variable_costs, unplanned_expenses, income_sources, pots); pots gets a single
-- enc_payload over JSON{name, estimatedAmount, actualAmount, comments}.
--
-- NO RLS / GRANT CHANGE: the envelope columns are plain columns on tables that
-- already have owner-only row policies (user_months_*_own, pots_*_own) and
-- table-level GRANTs to authenticated. RLS in Postgres is row-scoped, not
-- column-scoped, and the existing GRANTs cover all columns — so the new columns
-- are automatically covered by the existing row grants. No policy or grant change
-- is needed.
--
-- NO DROP TABLE / NO DROP COLUMN / NO DATA CHANGE. The pots ALTER COLUMN name
-- DROP NOT NULL only RELAXES a constraint (so an encrypted-only insert needs no
-- plaintext name in S4); it is a no-op if name is already nullable and changes no
-- data. The legacy plaintext columns are NOT dropped here — that happens at
-- cutover (BUDGET_E2E_DESIGN.md §6 step 7), not in S3.
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- user_months — single per-row envelope over all seven sensitive JSONB columns.
-- ----------------------------------------------------------------------------
ALTER TABLE user_months ADD COLUMN IF NOT EXISTS enc_payload TEXT;
ALTER TABLE user_months ADD COLUMN IF NOT EXISTS enc_nonce   TEXT;
ALTER TABLE user_months ADD COLUMN IF NOT EXISTS enc_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_months.enc_payload IS 'E2E: base64 secretbox ciphertext of JSON over all seven sensitive JSONB columns (BUDGET_E2E_DESIGN.md §2.1). NULL on legacy plaintext rows.';
COMMENT ON COLUMN user_months.enc_nonce IS 'E2E: base64 24-byte secretbox nonce for enc_payload. NULL on legacy plaintext rows.';
COMMENT ON COLUMN user_months.enc_version IS 'E2E envelope version / dual-read discriminator: 0 = legacy plaintext (read JSONB columns), 1 = encrypted (read enc_payload).';

-- ----------------------------------------------------------------------------
-- pots — single per-row envelope over JSON{name, estimatedAmount, actualAmount,
-- comments}. name is relaxed to nullable so an encrypted-only insert (S4) needs
-- no plaintext name; existing rows keep their name and are untouched.
-- ----------------------------------------------------------------------------
ALTER TABLE pots ADD COLUMN IF NOT EXISTS enc_payload TEXT;
ALTER TABLE pots ADD COLUMN IF NOT EXISTS enc_nonce   TEXT;
ALTER TABLE pots ADD COLUMN IF NOT EXISTS enc_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pots ALTER COLUMN name DROP NOT NULL;

COMMENT ON COLUMN pots.enc_payload IS 'E2E: base64 secretbox ciphertext of JSON{name, estimatedAmount, actualAmount, comments} (BUDGET_E2E_DESIGN.md §2.2). NULL on legacy plaintext rows.';
COMMENT ON COLUMN pots.enc_nonce IS 'E2E: base64 24-byte secretbox nonce for enc_payload. NULL on legacy plaintext rows.';
COMMENT ON COLUMN pots.enc_version IS 'E2E envelope version / dual-read discriminator: 0 = legacy plaintext (read typed columns), 1 = encrypted (read enc_payload).';

COMMIT;


-- ============================================================================
-- >>> money_tracker/database/setup/apply-budget-share-keys.sql
-- ============================================================================
-- ============================================================================
-- BUDGET E2E CROSS-USER SHARING — wrapped DEK per share. Idempotent,
-- non-destructive. Run ONCE on an existing money_tracker/shared database to add
-- the per-share sealed-DEK columns that let a RECIPIENT decrypt budget data an
-- owner shared with them (BUDGET_E2E_DESIGN.md §2.5 / §7, staged plan S7).
-- Safe to re-run. Mirrors the DDL folded into
-- database/setup/fresh-install-complete.sql so a from-scratch install already
-- includes these columns.
--
-- WHY: after S1-S6 every user_months / pots row is ciphertext under the OWNER's
-- budget DEK. The existing share RLS (user_months_select_shared / _update_shared)
-- lets a recipient READ/WRITE the owner's row, but they cannot DECRYPT it with
-- their OWN DEK. S7 seals the owner's DEK to the recipient's identity X25519
-- public key on the share row, so the recipient can unseal it with their identity
-- secret and decrypt the shared rows. This is the ONLY place in the E2E design
-- that needs new key DISTRIBUTION (every other path rides the existing identity).
--
-- HOW (client side, no server crypto):
--   SEAL   (owner, createDataShare): ephemeral keypair eph; shared =
--           box(DEK, nonce, recipientIdentityPub, eph.secret); store
--           wrapped_dek = base64(box ciphertext), wrap_nonce, wrap_eph_pub =
--           base64(eph.public).
--   UNSEAL (recipient, shared-read): DEK =
--           box.open(wrapped_dek, wrap_nonce, wrap_eph_pub, recipientIdentitySecret),
--           then decrypt the shared user_months / pots row with THAT DEK.
-- The server stores ONLY opaque ciphertext + the ephemeral public key — never the
-- unwrapped DEK and never any budget plaintext.
--
-- ADDITIVE + NULLABLE: legacy/un-sealed shares leave all three columns NULL; the
-- recipient simply cannot decrypt that share (H11 per-row skip), exactly as
-- before S7. No existing data is touched.
--
-- RLS / GRANT: NO new policy or grant is needed.
--   * The existing data_shares_select_involved
--       (auth.uid() = owner_user_id OR auth.uid() = shared_with_user_id)
--     already lets the RECIPIENT read their own share row — including these three
--     new columns (RLS is row-scoped, not column-scoped; the existing GRANT to
--     authenticated covers all columns). So the recipient can fetch + unseal.
--   * The OWNER writes the columns via the existing data_shares_insert_as_owner /
--     data_shares_update_as_owner policies (createDataShare inserts/updates a row
--     the owner owns).
--   * wrapped_dek is opaque ciphertext: even though the recipient (and ONLY the
--     recipient, per the SELECT policy) can read it, it is useless without their
--     identity secret.
--
-- REVOCATION: the existing data_shares_delete_as_owner lets the owner DELETE the
-- share row, which removes the wrapped DEK AND (because user_months_select_shared
-- requires a status='accepted' data_shares row) cuts the recipient's RLS read
-- access in the same step. NOTE (design §7 / §10): deleting the row stops FUTURE
-- access, but a recipient who already cached the unsealed DEK could still decrypt
-- ciphertext they previously read; cryptographically-complete revocation requires
-- a full DEK RE-KEY (new DEK, re-encrypt all rows, re-wrap budget_dek + re-seal
-- the remaining shares) — reserved for the forward-secrecy roadmap item, out of
-- S7 scope.
--
-- NO DROP TABLE / NO DROP COLUMN / NO DATA CHANGE.
-- ============================================================================
BEGIN;

ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS wrapped_dek  TEXT;
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS wrap_nonce   TEXT;
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS wrap_eph_pub TEXT;

COMMENT ON COLUMN data_shares.wrapped_dek  IS 'E2E sharing: the OWNER budget DEK sealed (nacl.box) to the recipient identity pubkey (BUDGET_E2E_DESIGN.md §2.5). NULL on an un-sealed/legacy share — recipient then cannot decrypt.';
COMMENT ON COLUMN data_shares.wrap_nonce   IS 'E2E sharing: base64 24-byte nonce for the wrapped_dek box seal.';
COMMENT ON COLUMN data_shares.wrap_eph_pub IS 'E2E sharing: base64 ephemeral X25519 public key the recipient combines with their identity secret to unseal wrapped_dek.';

COMMIT;


-- ============================================================================
-- >>> money_tracker/database/setup/apply-data-shares-with-check.sql
-- ============================================================================
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


-- ============================================================================
-- >>> money_tracker/database/setup/apply-budget-share-auth.sql
-- ============================================================================
-- ============================================================================
-- SEC-H4 LIVE-DB FIX — authenticated, context-bound budget-DEK share seal.
--   Idempotent, non-destructive. Run ONCE on an existing money_tracker/shared
--   database to add the columns the hardened (authenticated) share seal needs.
--   Safe to re-run. Mirrors the DDL folded into
--   database/setup/fresh-install-complete.sql.
--
-- THE HOLE (H-4): the original S7 seal (BudgetCryptoService.sealDEKToRecipient) was
--   an ANONYMOUS nacl box — a fresh ephemeral key DH'd against the recipient pubkey,
--   with NO owner static identity in the DH and NO context binding, AND the recipient
--   key was resolved by a RAW identity_keys read (RLS USING(true)), NOT the TOFU pin.
--   A curious server could therefore (a) substitute the recipient key and recover the
--   DEK, and (b) forge a share to a recipient (no proof of origin); nothing bound
--   (owner, recipient, dek_version, share_id), so a seal could be lifted onto another
--   row.
--
-- THE FIX (client crypto; this migration is the schema half):
--   * sealDEKToRecipient now uses an AUTHENTICATED static+ephemeral box:
--       DH_ss = DH(ownerIdentitySecret, recipientPub)   (owner authentication)
--       DH_es = DH(ephemeralSecret,     recipientPub)   (freshness)
--       wrapKey = SHA-512-KDF( DH_ss || DH_es || info )
--       info bound to (owner IK, recipient IK, owner_id, recipient_id,
--                      dek_version, share_id)
--   * the recipient key is resolved through KeyManagementService._getPinnedPeerKey
--     (TOFU, fail-closed), and unsealDEK verifies the bound owner IK == the PINNED
--     sender key + the full context before returning the DEK.
--   Schema change: persist the OWNER identity pubkey + dek_version bound into the seal
--   so the recipient can verify origin and rebuild the context.
--
-- COLUMNS ADDED (additive + nullable):
--   wrap_owner_ik TEXT     — base64 OWNER identity X25519 PUBLIC key bound into the seal
--   dek_version   INTEGER  — owner budget-DEK generation bound into the seal context
--
-- RE-SEAL / MIGRATION NOTE (REQUIRED):
--   Existing rows sealed under the OLD anonymous v1 construction have wrap_owner_ik =
--   NULL. The hardened unsealDEK FAILS CLOSED on a NULL wrap_owner_ik (an anonymous
--   seal is unauthenticated by construction and must not be trusted). Those shares
--   therefore stop decrypting until the OWNER RE-CREATES / re-saves the share, which
--   re-seals it with the authenticated v2 construction (createDataShare re-seals on
--   every create/update). No automated server-side migration is possible (the server
--   never holds the DEK or the owner identity secret — that is the whole point). Action
--   for the user: owners re-open + re-save each active share once after deploying the
--   new client. This is a deliberate fail-closed trade — a silent v1 read-through would
--   re-open H-4.
--
-- NO DROP TABLE / NO DROP COLUMN / NO DATA CHANGE.
-- ============================================================================
BEGIN;

ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS wrap_owner_ik TEXT;
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS dek_version   INTEGER;

COMMENT ON COLUMN data_shares.wrap_owner_ik IS 'E2E sharing (SEC-H4): base64 OWNER identity X25519 PUBLIC key bound into the authenticated seal. The recipient verifies this equals the PINNED (TOFU) sender key before accepting the DEK, and the static-static DH leg over it authenticates the seal origin (no anonymous box).';
COMMENT ON COLUMN data_shares.dek_version  IS 'E2E sharing (SEC-H4): the owner budget-DEK generation bound into the seal HKDF context (owner_id, recipient_id, owner IK, recipient IK, dek_version, share_id), so a seal cannot be replayed across versions/rows.';

-- The column-scoped UPDATE grant that lets the OWNER persist these seal columns is
-- applied by apply-data-shares-with-check.sql (SEC-C1). If you are applying ONLY this
-- migration, also run that one so the GRANT UPDATE(... wrap_owner_ik, dek_version ...)
-- is in place; otherwise an owner PATCH of these columns would be rejected (42501).

COMMIT;


-- ============================================================================
-- >>> money_tracker/database/setup/apply-premium-sharing-gate.sql
-- ============================================================================
-- ============================================================================
-- SERVER-AUTHORITATIVE PREMIUM ENTITLEMENT + SHARING GATE
-- COMBINED (all-in-one DB) migration — run ONCE in the SQL Editor. Idempotent.
-- ============================================================================
-- PRODUCT DECISION: MESSAGING IS FREE. The Premium feature is cross-user SHARING (the
-- combined "share my budget with another user" experience). Premium/trial entitlement
-- was previously enforced ONLY client-side: new users get status='trial', plan=Premium,
-- trial_end=NOW()+30d, and the ONLY thing that downgraded an expired trial was the
-- CLIENT calling downgrade_to_free(). A tampered client (or direct PostgREST) could keep
-- status='trial' with a long-past trial_end forever and create shares for free. This
-- migration enforces the SHARING gate SERVER-SIDE so a tampered client cannot bypass it.
--
-- This migration (mirrors fresh-install-complete.sql; this is the all-in-one DB shared by
-- money_tracker + messaging_app, so subscriptions AND data_shares live in ONE database):
--   1. is_premium_active(uid): the canonical entitlement predicate, from subscriptions
--      + subscription_plans, NEVER `status` alone:
--        premium == (status='active' AND plan=Premium)
--                OR (status='trial'  AND trial_end > NOW())   -- expired trial => NOT premium
--   2. expire_overdue_trials(): server-side sweep flipping expired trials to Free/active,
--      scheduled hourly via pg_cron when available.
--   3. data_shares_insert_as_owner: the OWNER may create a cross-user share ONLY when
--      premium-active (... AND public.is_premium_active(auth.uid())). Messaging is NOT
--      gated; share SELECT / recipient accept-reject UPDATE / read are NOT gated, so an
--      expired-trial owner keeps reading their own data and messaging for free.
--
-- ORDERING: is_premium_active() is (re)defined FIRST in this file, so it is guaranteed to
-- exist before the data_shares policy that references it is (re)created (definition-before
-- -use). On a fresh DB the data_shares TABLE already exists from the installer; this
-- migration only swaps its INSERT policy.
--
-- ADDITIVE ONLY: never drops a table, never rewrites/deletes rows. Safe to re-run.
-- (Supersedes the earlier apply-premium-message-gate.sql, which gated MESSAGING — that
--  file has been removed; messaging is now free.)
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- is_premium_active(uid) — single source of truth for current entitlement.
-- Defined FIRST so the data_shares INSERT policy below can reference it.
-- SECURITY DEFINER + pinned search_path so the data_shares-INSERT RLS gate can evaluate
-- it for any caller; reads only the passed uid's single row, returns a boolean.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_premium_active(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM subscriptions s
        JOIN subscription_plans p ON p.id = s.plan_id
        WHERE s.user_id = p_uid
          AND (
                (s.status = 'active' AND p.name = 'Premium')
             OR (s.status = 'trial'  AND s.trial_end IS NOT NULL AND s.trial_end > NOW())
          )
    );
$$;

GRANT EXECUTE ON FUNCTION is_premium_active(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- expire_overdue_trials() — server-side trial-expiry sweep.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION expire_overdue_trials()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_free_id BIGINT;
    v_count   INTEGER;
BEGIN
    SELECT id INTO v_free_id FROM subscription_plans WHERE name = 'Free' LIMIT 1;
    IF v_free_id IS NULL THEN
        RAISE LOG 'expire_overdue_trials: Free plan not found; skipping';
        RETURN 0;
    END IF;

    UPDATE subscriptions SET
        plan_id   = v_free_id,
        status    = 'active',
        trial_end = NULL
    WHERE status = 'trial'
      AND trial_end IS NOT NULL
      AND trial_end < NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION expire_overdue_trials() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Gate the data_shares OWNER INSERT on Premium entitlement (re-asserts auth.uid()).
-- CREATING a cross-user share is the Premium feature. DROP + CREATE so re-running
-- cleanly reasserts the latest predicate. ONLY the owner INSERT is gated.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS data_shares_insert_as_owner ON data_shares;
CREATE POLICY data_shares_insert_as_owner ON data_shares
    FOR INSERT WITH CHECK (
        auth.uid() = owner_user_id AND
        -- Premium gate: only a premium-active user may create a cross-user share.
        public.is_premium_active(auth.uid())
    );

COMMIT;

-- ---------------------------------------------------------------------------
-- Schedule the hourly trial-expiry sweep via pg_cron IF available. Safe no-op if
-- absent; is_premium_active() already denies expired trials. Kept OUTSIDE the
-- transaction (some pg_cron versions reject cron.schedule inside an explicit txn).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        BEGIN
            PERFORM cron.schedule(
                'expire-overdue-trials',
                '0 * * * *',
                $cron$SELECT public.expire_overdue_trials();$cron$
            );
            RAISE NOTICE 'pg_cron: scheduled job "expire-overdue-trials" (hourly).';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'pg_cron present but scheduling failed (likely already scheduled): %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'pg_cron not installed: trial-expiry sweep NOT scheduled. is_premium_active() still denies expired trials. Enable pg_cron (Dashboard > Database > Extensions) then re-run this file.';
    END IF;
END $$;


-- ============================================================================
-- >>> money_tracker/database/setup/apply-notification-relationship-check.sql
-- ============================================================================
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
