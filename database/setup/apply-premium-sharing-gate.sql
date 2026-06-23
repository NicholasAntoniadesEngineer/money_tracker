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
