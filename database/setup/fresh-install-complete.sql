-- ============================================================
-- MONEY TRACKER - COMPLETE FRESH INSTALL
-- ============================================================
-- This script sets up a complete fresh database with all features
-- including E2E encryption, recovery keys, and multi-device support.
-- Security hardening from the 2026-06 investigation is baked in (search
-- "HARDENING:" below): WITH CHECK on update policies, column-scoped UPDATE
-- grants (conversation ordering + mark-as-read), and create_notification
-- anti-spoofing. NOTE: server-side Premium entitlement enforcement (C1) is
-- NOT yet applied here — it needs a staged trial-RPC migration first.
-- ============================================================
-- Can be run on existing database - drops and recreates all tables.
-- ============================================================
-- FULL FRESH-INSTALL CHECKLIST (DB alone is not enough):
--   1. Create a private Storage bucket `message-attachments` (1 MB limit).
--   2. Run THIS script in the Supabase SQL Editor.
--   3. Deploy the edge functions (Supabase CLI or Dashboard):
--        payments_app: checkout-session, create-portal-session, stripe-webhook,
--                      list-invoices, update-subscription
--        auth_db:      user-lookup, delete-account
--   4. Set edge secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
--        (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are auto-injected).
--   5. Auth → URL Configuration: add each app origin + .../auth/views/auth.html
--        to the redirect allow-list.
--   See secure_db/README.md for the authoritative cross-repo runbook.
-- CANONICAL SOURCES (this all-in-one aggregates them for a single-shot install):
--   identity / E2E-crypto tables  -> auth_db/backend/sql/complete-setup.sql
--   messaging tables              -> secure_db/sql/complete-setup.sql
--   To add device pairing to an EXISTING DB instead, run
--   auth_db/backend/sql/add-device-pairing.sql (non-destructive).
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'FRESH INSTALL - Starting complete database setup...';
    RAISE NOTICE '============================================================';
END $$;

-- ============================================================
-- CLEANUP: DROP ALL EXISTING TABLES (in dependency order)
-- ============================================================
-- This ensures a true fresh install by removing all existing data

DO $$ BEGIN RAISE NOTICE '[1/16] Dropping existing tables, functions, and policies...'; END $$;

-- Drop tables with foreign key dependencies first
DROP TABLE IF EXISTS message_attachments CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversation_session_keys CASCADE;
DROP TABLE IF EXISTS conversation_participants CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS device_keys CASCADE;
DROP TABLE IF EXISTS paired_devices CASCADE;
DROP TABLE IF EXISTS key_rotation_locks CASCADE;
DROP TABLE IF EXISTS public_key_history CASCADE;
DROP TABLE IF EXISTS identity_key_backups CASCADE;
DROP TABLE IF EXISTS identity_keys CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS field_locks CASCADE;
DROP TABLE IF EXISTS data_shares CASCADE;
DROP TABLE IF EXISTS friends CASCADE;
DROP TABLE IF EXISTS blocked_users CASCADE;
DROP TABLE IF EXISTS payment_history CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS pots CASCADE;
DROP TABLE IF EXISTS example_months CASCADE;
DROP TABLE IF EXISTS user_months CASCADE;

-- Drop functions that may exist
DROP FUNCTION IF EXISTS update_user_months_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_subscriptions_updated_at() CASCADE;
DROP FUNCTION IF EXISTS is_free_plan(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS is_on_trial(TEXT, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS get_price_dollars(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS get_subscription_type(BIGINT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS is_recurring_billing_enabled(BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS create_trial_subscription() CASCADE;
DROP FUNCTION IF EXISTS update_identity_keys_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_conversations_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_notifications_updated_at() CASCADE;
DROP FUNCTION IF EXISTS create_notification(UUID, TEXT, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT) CASCADE;
DROP FUNCTION IF EXISTS update_messages_updated_at() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_attachments() CASCADE;
DROP FUNCTION IF EXISTS update_session_keys_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_key_backups_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_share_status() CASCADE;
DROP FUNCTION IF EXISTS debug_attachment_rls(BIGINT, UUID) CASCADE;
-- SM-15: SECURITY DEFINER helper for server-side block enforcement
DROP FUNCTION IF EXISTS is_blocked(UUID, UUID) CASCADE;
-- SM-30: SECURITY DEFINER helper for download-count increment
DROP FUNCTION IF EXISTS increment_attachment_download_count(BIGINT) CASCADE;

-- Drop storage policies
DROP POLICY IF EXISTS "Users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete attachments" ON storage.objects;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN RAISE NOTICE '[2/16] Creating budget data tables (user_months, example_months, pots)...'; END $$;

-- ============================================================
-- BUDGET DATA TABLES (JSONB Structure)
-- ============================================================

-- User months table (for user-created months with JSONB structure)
CREATE TABLE IF NOT EXISTS user_months (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    id BIGSERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    month_name TEXT NOT NULL,
    date_range JSONB DEFAULT '{}',
    weekly_breakdown JSONB DEFAULT '[]',
    fixed_costs JSONB DEFAULT '[]',
    variable_costs JSONB DEFAULT '[]',
    unplanned_expenses JSONB DEFAULT '[]',
    income_sources JSONB DEFAULT '[]',
    pots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, year, month)
);

DROP INDEX IF EXISTS idx_user_months_user_id;
DROP INDEX IF EXISTS idx_user_months_year_month;
CREATE INDEX idx_user_months_user_id ON user_months(user_id);
CREATE INDEX idx_user_months_year_month ON user_months(year, month);

ALTER TABLE user_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_months_select_own ON user_months
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY user_months_insert_own ON user_months
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS-02: WITH CHECK stops the owner reassigning a month row to another user_id
-- on update. (The upsert always sends user_id, so a column-scoped grant is not an
-- option — this WITH CHECK is the enforcement point.)
CREATE POLICY user_months_update_own ON user_months
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_months_delete_own ON user_months
    FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_user_months_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_user_months_updated_at
    BEFORE UPDATE ON user_months
    FOR EACH ROW
    EXECUTE FUNCTION update_user_months_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON user_months TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE user_months_id_seq TO authenticated;

-- Example months table (for protected example data)
CREATE TABLE IF NOT EXISTS example_months (
    id BIGSERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    month_name TEXT NOT NULL,
    date_range JSONB DEFAULT '{}',
    weekly_breakdown JSONB DEFAULT '[]',
    fixed_costs JSONB DEFAULT '[]',
    variable_costs JSONB DEFAULT '[]',
    unplanned_expenses JSONB DEFAULT '[]',
    income_sources JSONB DEFAULT '[]',
    pots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(year, month)
);

-- Enable RLS but allow all authenticated users to read (public example data)
ALTER TABLE example_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY example_months_select_all ON example_months
    FOR SELECT TO authenticated USING (true);

GRANT SELECT ON example_months TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE example_months_id_seq TO authenticated;

-- Pots table (user-specific savings pots)
CREATE TABLE IF NOT EXISTS pots (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    estimated_amount NUMERIC(12, 2) DEFAULT 0,
    actual_amount NUMERIC(12, 2) DEFAULT 0,
    comments TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pots ENABLE ROW LEVEL SECURITY;

CREATE POLICY pots_select_own ON pots
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY pots_insert_own ON pots
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY pots_update_own ON pots
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY pots_delete_own ON pots
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON pots TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE pots_id_seq TO authenticated;

DO $$ BEGIN RAISE NOTICE '[3/16] Creating settings table...'; END $$;

-- ============================================================
-- SETTINGS & CONFIGURATION
-- ============================================================

-- Settings table (user preferences)
CREATE TABLE IF NOT EXISTS settings (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    id BIGSERIAL PRIMARY KEY,
    currency TEXT DEFAULT '£',
    font_size TEXT DEFAULT '16',
    default_fixed_costs JSONB DEFAULT '[]',
    default_variable_categories JSONB DEFAULT '["Food", "Travel/Transport", "Activities"]',
    default_pots JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_select_own ON settings
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY settings_insert_own ON settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY settings_update_own ON settings
    FOR UPDATE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON settings TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE settings_id_seq TO authenticated;

DO $$ BEGIN RAISE NOTICE '[4/16] Creating subscription system (plans, subscriptions, payments)...'; END $$;

-- ============================================================
-- SUBSCRIPTION SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,  -- Plan description for UI display
    stripe_price_id TEXT UNIQUE,  -- Stripe's price ID (null for Free plan)
    price_cents INT NOT NULL,  -- 0 for Free, 999 for $9.99/month
    interval TEXT NOT NULL CHECK (interval IN ('month', 'year')),
    features JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS but allow all authenticated users to read (public plan data)
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscription_plans_select_all ON subscription_plans
    FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id BIGINT NOT NULL REFERENCES subscription_plans(id),

    -- Stripe integration (null for Free plan users)
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT UNIQUE,
    stripe_price_id TEXT,

    -- Subscription status (source of truth from Stripe)
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN (
        'trial',      -- 30-day trial (new users)
        'active',     -- Active subscription (Free or Premium)
        'past_due',   -- Payment failed
        'canceled',   -- Canceled by user
        'unpaid'      -- Payment failed multiple times
    )),

    -- Billing period (from Stripe, updated by webhook)
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,  -- This IS the next billing date!

    -- Trial management
    trial_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),

    -- Cancellation tracking
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMPTZ,

    -- Downgrade scheduling (null if no pending change)
    pending_plan_id BIGINT REFERENCES subscription_plans(id),
    pending_change_at TIMESTAMPTZ,  -- When downgrade takes effect (= current_period_end)

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select_own ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY subscriptions_update_own ON subscriptions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY subscriptions_insert_own ON subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscriptions_updated_at();

GRANT SELECT ON subscription_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON subscriptions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE subscriptions_id_seq TO authenticated;

CREATE TABLE IF NOT EXISTS payments (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_payment_intent_id TEXT UNIQUE,
    amount_cents INT NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select_own ON payments
    FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON payments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE payments_id_seq TO authenticated;

-- ============================================================
-- PAYMENT HISTORY (written by the stripe-webhook edge function)
-- ============================================================
-- The stripe-webhook records every invoice payment here via the service role
-- (recordPayment() in payments_app stripe-webhook). The subscription UI reads
-- it back (PaymentService.getPaymentHistory + renderPaymentHistory) and the
-- webhook re-reads it by (user_id, stripe_invoice_id) to attach the payment id
-- to its notifications. The legacy `payments` table above lacks
-- stripe_invoice_id, so this separate table is required for those read-backs.
-- NOTE: amount is stored in MAJOR units (dollars/euros); the webhook divides
-- Stripe's integer cents by 100 before writing (e.g. invoice.amount_paid / 100).
CREATE TABLE IF NOT EXISTS payment_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID,  -- webhook writes the user_id here ("user_id is the subscription_id in our schema")
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    stripe_invoice_id TEXT,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0,  -- major units (dollars/euros), NOT cents
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL,
    payment_method TEXT,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    refunded_amount NUMERIC(12, 2) DEFAULT 0,
    refunded_date TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_history_user_invoice
    ON payment_history(user_id, stripe_invoice_id);

ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_history_select_own ON payment_history;
CREATE POLICY payment_history_select_own ON payment_history
    FOR SELECT USING (auth.uid() = user_id);

-- Writes are service-role (webhook, bypasses RLS); authenticated gets SELECT only.
GRANT SELECT ON payment_history TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE payment_history_id_seq TO authenticated;

-- Populate subscription plans
-- stripe_price_id: the Stripe Price the checkout-session edge function charges for Premium.
-- Test Price = 'price_1Tl87aClUqvgxZvpUn4uUrx6' (Secure Messenger Premium, £9.99/mo). Replace for live.
INSERT INTO subscription_plans (name, description, stripe_price_id, price_cents, interval, features, is_active)
VALUES
    ('Free', 'Basic features for personal budgeting', NULL, 0, 'month', '["Basic budgeting", "1 device", "Local storage only", "Limited history (6 months)"]'::jsonb, true),
    ('Premium', 'Full access with unlimited history and cloud sync', 'price_1Tl87aClUqvgxZvpUn4uUrx6', 999, 'month', '["Unlimited budget history", "Unlimited devices", "Cloud sync across devices", "Data sharing with friends", "E2E encrypted messaging", "Priority support"]'::jsonb, true)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    stripe_price_id = EXCLUDED.stripe_price_id,
    price_cents = EXCLUDED.price_cents,
    features = EXCLUDED.features,
    is_active = EXCLUDED.is_active;

DO $$ BEGIN RAISE NOTICE '[5/16] Creating subscription helper functions...'; END $$;

-- ============================================================
-- SUBSCRIPTION HELPER FUNCTIONS (Derived Data)
-- ============================================================

-- Check if subscription is on Free plan
CREATE OR REPLACE FUNCTION is_free_plan(sub_plan_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    RETURN (SELECT name FROM subscription_plans WHERE id = sub_plan_id) = 'Free';
END;
$$;

-- Check if subscription is on trial
CREATE OR REPLACE FUNCTION is_on_trial(sub_status TEXT, trial_end_date TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    RETURN sub_status = 'trial' AND trial_end_date > NOW();
END;
$$;

-- Get plan price in dollars (for display)
CREATE OR REPLACE FUNCTION get_price_dollars(sub_plan_id BIGINT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    RETURN (SELECT price_cents FROM subscription_plans WHERE id = sub_plan_id) / 100.0;
END;
$$;

-- Get subscription type (derived from plan and status)
CREATE OR REPLACE FUNCTION get_subscription_type(sub_plan_id BIGINT, sub_status TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    IF sub_status = 'trial' THEN
        RETURN 'trial';
    ELSIF is_free_plan(sub_plan_id) THEN
        RETURN 'free';
    ELSE
        RETURN 'paid';
    END IF;
END;
$$;

-- Check if recurring billing is enabled (inverse of cancel_at_period_end)
CREATE OR REPLACE FUNCTION is_recurring_billing_enabled(cancel_at_end BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
    RETURN NOT cancel_at_end;
END;
$$;

GRANT EXECUTE ON FUNCTION is_free_plan(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_on_trial(TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_price_dollars(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_subscription_type(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION is_recurring_billing_enabled(BOOLEAN) TO authenticated;

-- ============================================================
-- AUTO-CREATE TRIAL SUBSCRIPTION ON SIGNUP
-- ============================================================

-- Automatically create a 30-day Premium trial when user signs up
CREATE OR REPLACE FUNCTION create_trial_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    premium_plan_id BIGINT;
BEGIN
    -- Get Premium plan ID
    SELECT id INTO premium_plan_id
    FROM subscription_plans
    WHERE name = 'Premium'
    LIMIT 1;

    -- Create trial subscription for new user
    INSERT INTO subscriptions (
        user_id,
        plan_id,
        status,
        trial_end
    ) VALUES (
        NEW.id,
        premium_plan_id,
        'trial',
        NOW() + INTERVAL '30 days'
    );

    RETURN NEW;
END;
$$;

-- Trigger on user creation
DROP TRIGGER IF EXISTS trigger_create_trial_subscription ON auth.users;
CREATE TRIGGER trigger_create_trial_subscription
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_trial_subscription();

DO $$ BEGIN RAISE NOTICE '[6/16] Creating data sharing system (data_shares, field_locks)...'; END $$;

-- ============================================================
-- DATA SHARING
-- ============================================================

CREATE TABLE IF NOT EXISTS data_shares (
    id BIGSERIAL PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    shared_with_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    share_all_data BOOLEAN DEFAULT false,
    year INTEGER,
    month INTEGER,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    conversation_id BIGINT,
    can_edit BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(owner_user_id, shared_with_user_id, year, month)
);

ALTER TABLE data_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_shares_select_involved ON data_shares
    FOR SELECT USING (auth.uid() = owner_user_id OR auth.uid() = shared_with_user_id);

CREATE POLICY data_shares_insert_as_owner ON data_shares
    FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY data_shares_update_as_owner ON data_shares
    FOR UPDATE USING (auth.uid() = owner_user_id);

CREATE POLICY data_shares_update_as_recipient ON data_shares
    FOR UPDATE USING (auth.uid() = shared_with_user_id AND status = 'pending');

CREATE POLICY data_shares_delete_as_owner ON data_shares
    FOR DELETE USING (auth.uid() = owner_user_id);

-- Allow viewing shared data
CREATE POLICY user_months_select_shared ON user_months
    FOR SELECT USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM data_shares
            WHERE data_shares.owner_user_id = user_months.user_id
            AND data_shares.shared_with_user_id = auth.uid()
            AND data_shares.status = 'accepted'
            AND (
                data_shares.share_all_data = true
                OR (data_shares.year = user_months.year AND data_shares.month = user_months.month)
            )
        )
    );

-- Allow editing shared data
-- RLS-02: USING alone is not enough. With the permissive OR of this policy and
-- user_months_update_own, a can_edit recipient could UPDATE user_months SET
-- user_id = auth.uid() and steal the owner's row (the row would still satisfy
-- user_months_update_own's USING). The WITH CHECK re-asserts, on the NEW row, that
-- a data_share still exists FROM some owner TO auth.uid() covering it — so the
-- recipient cannot reassign user_id to themselves (no share has
-- owner_user_id = auth.uid() for their own context) nor move the row to a
-- year/month they were not granted edit rights to. Ownership therefore stays put.
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

GRANT SELECT, INSERT, UPDATE, DELETE ON data_shares TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE data_shares_id_seq TO authenticated;

-- Field locking for concurrent edit prevention
CREATE TABLE IF NOT EXISTS field_locks (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id BIGINT NOT NULL,
    field_path TEXT NOT NULL,
    locked_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    locked_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '5 minutes'),
    UNIQUE(table_name, record_id, field_path)
);

DROP INDEX IF EXISTS idx_field_locks_expires_at;
CREATE INDEX idx_field_locks_expires_at ON field_locks(expires_at);

ALTER TABLE field_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY field_locks_select_all ON field_locks
    FOR SELECT USING (true);

CREATE POLICY field_locks_insert_own ON field_locks
    FOR INSERT WITH CHECK (auth.uid() = locked_by);

CREATE POLICY field_locks_delete_own ON field_locks
    FOR DELETE USING (auth.uid() = locked_by);

GRANT SELECT, INSERT, DELETE ON field_locks TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE field_locks_id_seq TO authenticated;

DO $$ BEGIN RAISE NOTICE '[7/16] Creating friends system...'; END $$;

-- ============================================================
-- FRIENDS SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS friends (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_user_id),
    CHECK (user_id != friend_user_id)
);

ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY friends_select_involved ON friends
    FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_user_id);

CREATE POLICY friends_insert_own ON friends
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- SM-39: only the request recipient may act on a pending request, and the row may
-- only be transitioned to 'accepted' or 'blocked'. WITH CHECK validates the NEW row
-- so the recipient cannot flip the row to an unauthorized state (e.g. reassign
-- friend_user_id away from themselves or set a value outside this set).
CREATE POLICY friends_update_as_friend ON friends
    FOR UPDATE
    USING (auth.uid() = friend_user_id AND status = 'pending')
    WITH CHECK (auth.uid() = friend_user_id AND status IN ('accepted', 'blocked'));

CREATE POLICY friends_delete_involved ON friends
    FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON friends TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE friends_id_seq TO authenticated;

DO $$ BEGIN RAISE NOTICE '[8/16] Creating blocked users system...'; END $$;

-- ============================================================
-- BLOCKED USERS
-- ============================================================

CREATE TABLE IF NOT EXISTS blocked_users (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, blocked_user_id)
);

DROP INDEX IF EXISTS idx_blocked_users_user;
DROP INDEX IF EXISTS idx_blocked_users_blocked;
CREATE INDEX idx_blocked_users_user ON blocked_users(user_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users(blocked_user_id);

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- Users can see their own blocked list
CREATE POLICY blocked_users_select_own ON blocked_users
    FOR SELECT USING (auth.uid() = user_id);

-- Users can block others
CREATE POLICY blocked_users_insert_own ON blocked_users
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can unblock others
CREATE POLICY blocked_users_delete_own ON blocked_users
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON blocked_users TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE blocked_users_id_seq TO authenticated;

-- SM-15: server-side block enforcement helper.
-- blocked_users_select_own deliberately hides a user's block rows from everyone
-- but the owner, so a plain subquery inside another user's INSERT policy cannot
-- read them. This SECURITY DEFINER function answers "has p_owner blocked p_blocked?"
-- regardless of the caller, without exposing the block list itself.
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

DO $$ BEGIN RAISE NOTICE '[9/16] Creating E2E encryption system (identity_keys, public_key_history, devices)...'; END $$;

-- ============================================================
-- E2E ENCRYPTION SYSTEM
-- ============================================================

-- Identity keys (public keys for key exchange)
CREATE TABLE IF NOT EXISTS identity_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    current_epoch INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN identity_keys.current_epoch IS 'Current key epoch. Incremented on each key regeneration for key rotation support.';

CREATE OR REPLACE FUNCTION update_identity_keys_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_identity_keys_updated_at
    BEFORE UPDATE ON identity_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_identity_keys_updated_at();

DROP INDEX IF EXISTS idx_identity_keys_user_id;
CREATE INDEX idx_identity_keys_user_id ON identity_keys(user_id);

ALTER TABLE identity_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY identity_keys_select_all ON identity_keys
    FOR SELECT USING (true);

CREATE POLICY identity_keys_insert_own ON identity_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY identity_keys_update_own ON identity_keys
    FOR UPDATE USING (auth.uid() = user_id)
    -- HARDENING: WITH CHECK stops a user reassigning their key row to another user_id.
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY identity_keys_delete_own ON identity_keys
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON identity_keys TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE identity_keys_id_seq TO authenticated;

-- Public key history (stores historical public keys for epoch-based decryption)
-- When a user regenerates keys, their old public key is archived here
CREATE TABLE IF NOT EXISTS public_key_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    epoch INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, epoch)
);

DROP INDEX IF EXISTS idx_public_key_history_user_epoch;
CREATE INDEX idx_public_key_history_user_epoch ON public_key_history(user_id, epoch);

ALTER TABLE public_key_history ENABLE ROW LEVEL SECURITY;

-- Public keys are readable by all authenticated users (needed for decryption)
CREATE POLICY public_key_history_select_all ON public_key_history
    FOR SELECT TO authenticated USING (true);

-- Users can only insert their own historical keys
CREATE POLICY public_key_history_insert_own ON public_key_history
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public_key_history TO authenticated;

COMMENT ON TABLE public_key_history IS 'Historical public keys for epoch-based decryption of old messages';
COMMENT ON COLUMN public_key_history.epoch IS 'Key epoch - increments each time user regenerates keys';

-- NOTE: user_key_backups table has been REMOVED and consolidated into identity_key_backups
-- The identity_key_backups table (defined later) stores:
-- - Password-encrypted identity secret key
-- - Recovery-key encrypted identity secret key
-- - Stable session backup key for multi-device support
-- Public keys are stored in the identity_keys table

-- Paired devices (for multi-device support)
CREATE TABLE IF NOT EXISTS paired_devices (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_name TEXT NOT NULL,
    device_fingerprint TEXT,
    is_primary BOOLEAN DEFAULT false,
    last_active TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN paired_devices.device_fingerprint IS 'Browser fingerprint for device identification';

DROP INDEX IF EXISTS idx_paired_devices_user_id;
CREATE INDEX idx_paired_devices_user_id ON paired_devices(user_id);

ALTER TABLE paired_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY paired_devices_select_own ON paired_devices
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY paired_devices_insert_own ON paired_devices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY paired_devices_update_own ON paired_devices
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY paired_devices_delete_own ON paired_devices
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON paired_devices TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE paired_devices_id_seq TO authenticated;

-- Device keys (temporary storage for device pairing requests)
-- Pairing codes are short-lived (5 minutes) and contain encrypted identity keys
CREATE TABLE IF NOT EXISTS device_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    public_key TEXT NOT NULL,
    encrypted_secret_key TEXT,
    encryption_nonce TEXT,
    pairing_code TEXT,
    expires_at TIMESTAMPTZ,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN device_keys.encrypted_secret_key IS 'Secret key encrypted with pairing-code-derived key (XSalsa20-Poly1305)';
COMMENT ON COLUMN device_keys.encryption_nonce IS 'Nonce used for secret key encryption';
COMMENT ON COLUMN device_keys.pairing_code IS '6-digit code for device pairing (expires after 5 minutes)';

DROP INDEX IF EXISTS idx_device_keys_user_id;
DROP INDEX IF EXISTS idx_device_keys_pairing_code;
CREATE INDEX idx_device_keys_user_id ON device_keys(user_id);
CREATE INDEX idx_device_keys_pairing_code ON device_keys(pairing_code) WHERE pairing_code IS NOT NULL;

ALTER TABLE device_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY device_keys_select_own ON device_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY device_keys_insert_own ON device_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY device_keys_update_own ON device_keys
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY device_keys_delete_own ON device_keys
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON device_keys TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE device_keys_id_seq TO authenticated;

-- Key rotation locks (prevents concurrent key rotations across devices/tabs)
CREATE TABLE IF NOT EXISTS key_rotation_locks (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    lock_token TEXT NOT NULL,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

COMMENT ON COLUMN key_rotation_locks.lock_token IS 'Unique token to identify lock owner';
COMMENT ON COLUMN key_rotation_locks.expires_at IS 'Lock auto-expires to prevent deadlocks (default 60 seconds)';

ALTER TABLE key_rotation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY rotation_locks_select_own ON key_rotation_locks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY rotation_locks_insert_own ON key_rotation_locks
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY rotation_locks_update_own ON key_rotation_locks
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY rotation_locks_delete_own ON key_rotation_locks
    FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON key_rotation_locks TO authenticated;

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
    id BIGSERIAL PRIMARY KEY,
    user1_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT conversations_users_different CHECK (user1_id != user2_id),
    CONSTRAINT conversations_users_ordered CHECK (user1_id < user2_id)
);

DROP INDEX IF EXISTS idx_conversations_users;
DROP INDEX IF EXISTS idx_conversations_user1;
DROP INDEX IF EXISTS idx_conversations_user2;
DROP INDEX IF EXISTS idx_conversations_last_message;
DROP INDEX IF EXISTS idx_conversations_updated_at;
CREATE UNIQUE INDEX idx_conversations_users ON conversations(user1_id, user2_id);
CREATE INDEX idx_conversations_user1 ON conversations(user1_id);
CREATE INDEX idx_conversations_user2 ON conversations(user2_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- SM-40: the conversations RLS policies (below) reference user1_id/user2_id
-- directly. The 1:1 model is sufficient, so the dead conversation_participants
-- table (self-only RLS, never referenced by the app) has been removed.

CREATE OR REPLACE FUNCTION update_conversations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_conversations_updated_at();

GRANT SELECT, INSERT ON conversations TO authenticated;
-- HARDENING: column-scoped UPDATE so clients can advance conversation ordering
-- (last_message_at) but cannot rewrite participants or other columns.
GRANT UPDATE (last_message_at, updated_at) ON conversations TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE conversations_id_seq TO authenticated;

-- SM-40: conversation_participants table + policies removed (dead, self-only RLS).
-- The 1:1 model is sufficient — conversations RLS references user1_id/user2_id
-- directly. The table is dropped in the idempotent cleanup section above so
-- re-running this script removes it from existing databases.

-- Now create conversations RLS policies (uses user1_id/user2_id directly)
CREATE POLICY conversations_select_participant ON conversations
    FOR SELECT USING (
        auth.uid() = user1_id OR auth.uid() = user2_id
    );

CREATE POLICY conversations_insert_participant ON conversations
    FOR INSERT WITH CHECK (
        auth.uid() = user1_id OR auth.uid() = user2_id
    );

CREATE POLICY conversations_update_participant ON conversations
    FOR UPDATE USING (
        auth.uid() = user1_id OR auth.uid() = user2_id
    )
    -- HARDENING: WITH CHECK prevents moving a conversation to other users.
    WITH CHECK (
        auth.uid() = user1_id OR auth.uid() = user2_id
    );

DO $$ BEGIN RAISE NOTICE '[10/16] Creating notifications system...'; END $$;

-- ============================================================
-- NOTIFICATIONS SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    read BOOLEAN DEFAULT false,
    from_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id BIGINT REFERENCES conversations(id) ON DELETE CASCADE,
    share_id BIGINT REFERENCES data_shares(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_notifications_user_id;
DROP INDEX IF EXISTS idx_notifications_created_at;
DROP INDEX IF EXISTS idx_notifications_read;
DROP INDEX IF EXISTS idx_notifications_from_user;
DROP INDEX IF EXISTS idx_notifications_conversation;
DROP INDEX IF EXISTS idx_notifications_share;
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_from_user ON notifications(from_user_id);
CREATE INDEX idx_notifications_conversation ON notifications(conversation_id);
CREATE INDEX idx_notifications_share ON notifications(share_id);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON notifications
    FOR SELECT USING (auth.uid() = user_id);

-- RLS-08: a user may only mark their OWN notifications read. The previous full-row
-- UPDATE (no WITH CHECK, table-wide GRANT UPDATE) let a user rewrite type /
-- from_user_id / data on their own rows — e.g. forge a 'payment_received' or spoof
-- the sender. WITH CHECK re-asserts ownership of the NEW row; the column-scoped
-- GRANT below (read only) confines the mutation to the read flag.
CREATE POLICY notifications_update_own ON notifications
    FOR UPDATE USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY notifications_delete_own ON notifications
    FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_notifications_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_notifications_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_notifications_updated_at();

GRANT SELECT, DELETE ON notifications TO authenticated;
-- RLS-08: column-scoped UPDATE so a user can mark a notification read WITHOUT being
-- able to alter type / from_user_id / data. (This table has no read_at column.)
GRANT UPDATE (read) ON notifications TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE notifications_id_seq TO authenticated;

CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    share_requests BOOLEAN DEFAULT true,
    share_responses BOOLEAN DEFAULT true,
    friend_requests BOOLEAN DEFAULT true,
    messages BOOLEAN DEFAULT true,
    payments BOOLEAN DEFAULT true,
    system BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_prefs_select_own ON notification_preferences
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notification_prefs_insert_own ON notification_preferences
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY notification_prefs_update_own ON notification_preferences
    FOR UPDATE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON notification_preferences TO authenticated;

-- Create notification RPC function (bypasses RLS for system notifications)
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
BEGIN
    -- HARDENING: this is SECURITY DEFINER (bypasses RLS). An authenticated client
    -- must not be able to forge the sender or create server-only (financial)
    -- notification types. Webhook/service-role calls have a NULL auth.uid() and
    -- keep their passed values.
    IF auth.uid() IS NOT NULL THEN
        p_from_user_id := auth.uid();
        IF p_type IN ('payment_received', 'payment_reminder') THEN
            RETURN jsonb_build_object('success', false, 'error', 'forbidden notification type');
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

    -- Insert the notification
    INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        from_user_id,
        share_id,
        conversation_id,
        read
    ) VALUES (
        p_user_id,
        p_type,
        v_title,
        COALESCE(p_message, v_title),
        p_from_user_id,
        p_share_id,
        p_conversation_id,
        false
    )
    RETURNING id INTO v_notification_id;

    RETURN jsonb_build_object(
        'success', true,
        'notification_id', v_notification_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_notification TO authenticated;

-- Note: The create_notification function uses SECURITY DEFINER which bypasses RLS.
-- No separate insert policy needed for system notifications.

-- Messages (encrypted)
-- key_epoch tracks which session key version was used to encrypt each message
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    encrypted_content TEXT NOT NULL,
    encryption_nonce TEXT NOT NULL,
    message_counter BIGINT NOT NULL,
    key_epoch INTEGER DEFAULT 0,
    is_encrypted BOOLEAN DEFAULT TRUE,
    read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN messages.key_epoch IS 'Session key epoch used to encrypt this message. Enables decryption with correct key version after key rotations.';

DROP INDEX IF EXISTS idx_messages_conversation_id;
DROP INDEX IF EXISTS idx_messages_sender_id;
DROP INDEX IF EXISTS idx_messages_recipient_id;
DROP INDEX IF EXISTS idx_messages_recipient_unread;
DROP INDEX IF EXISTS idx_messages_created_at;
DROP INDEX IF EXISTS idx_messages_key_epoch;
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX idx_messages_recipient_unread ON messages(recipient_id, read) WHERE read = FALSE;
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_key_epoch ON messages(key_epoch);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select_participant ON messages
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
        )
    );

-- SM-15: enforce blocking server-side. A sender the recipient has blocked must not
-- be able to INSERT, even if they bypass the client guard and call PostgREST
-- directly. is_blocked() is SECURITY DEFINER because blocked_users_select_own hides
-- the recipient's block rows from the sender's own context.
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

-- MT-06: only the RECIPIENT may mark a message read. Marking read/read_at is a
-- read-receipt action that belongs to the receiver; the previous policy let either
-- participant flip it on any message in the conversation (including the sender on
-- their own outbound message). USING restricts the targetable rows to messages
-- addressed to the caller AND in one of the caller's conversations; WITH CHECK
-- re-asserts the recipient binding on the NEW row. Paired with the column-scoped
-- GRANT below (read/read_at only), message content and sender stay tamper-proof.
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

CREATE OR REPLACE FUNCTION update_messages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW
    EXECUTE FUNCTION update_messages_updated_at();

GRANT SELECT, INSERT ON messages TO authenticated;
-- HARDENING: column-scoped UPDATE so a participant can mark messages read (clears
-- unread counts) WITHOUT being able to alter encrypted_content / sender_id.
GRANT UPDATE (read, read_at) ON messages TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE messages_id_seq TO authenticated;

-- ============================================================
-- DEVICE PAIRING: pairing_requests (code-wrapped key handoff for multi-device)
-- The bundle (identity secret + session backup key) is PBKDF2+AES-GCM encrypted
-- under a one-time high-entropy code BEFORE storage; rows are RLS-owner-scoped,
-- single-use, and expiring. UPDATE is column-scoped to the attempt counter.
-- ============================================================
CREATE TABLE IF NOT EXISTS pairing_requests (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    encrypted_data TEXT NOT NULL,
    salt TEXT NOT NULL,
    iv TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pairing_requests_user_id ON pairing_requests(user_id);
ALTER TABLE pairing_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pairing_requests_select_own ON pairing_requests;
CREATE POLICY pairing_requests_select_own ON pairing_requests
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS pairing_requests_insert_own ON pairing_requests;
CREATE POLICY pairing_requests_insert_own ON pairing_requests
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS pairing_requests_update_own ON pairing_requests;
CREATE POLICY pairing_requests_update_own ON pairing_requests
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS pairing_requests_delete_own ON pairing_requests;
CREATE POLICY pairing_requests_delete_own ON pairing_requests
    FOR DELETE USING (auth.uid() = user_id);
GRANT SELECT, INSERT, DELETE ON pairing_requests TO authenticated;
GRANT UPDATE (attempts) ON pairing_requests TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE pairing_requests_id_seq TO authenticated;

DO $$ BEGIN RAISE NOTICE '[11/16] Creating message attachments system...'; END $$;

-- ============================================================
-- MESSAGE ATTACHMENTS (Premium feature)
-- ============================================================
-- Files are stored in Supabase Storage with encrypted metadata
-- Files auto-expire after 24 hours via scheduled cleanup

CREATE TABLE IF NOT EXISTS message_attachments (
    id BIGSERIAL PRIMARY KEY,
    message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    uploader_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- File metadata (stored unencrypted for querying)
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,  -- Path in Supabase Storage bucket

    -- Encrypted file key (file is encrypted client-side before upload)
    -- This key is encrypted with the conversation's session key
    encrypted_file_key TEXT,
    file_key_nonce TEXT,

    -- Lifecycle
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    downloaded_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE message_attachments IS 'File attachments for messages. Files expire after 24 hours.';
COMMENT ON COLUMN message_attachments.storage_path IS 'Path to encrypted file in Supabase Storage bucket';
COMMENT ON COLUMN message_attachments.encrypted_file_key IS 'File encryption key, encrypted with conversation session key';
COMMENT ON COLUMN message_attachments.expires_at IS 'Files auto-delete after this time (default 24 hours)';

DROP INDEX IF EXISTS idx_attachments_message_id;
DROP INDEX IF EXISTS idx_attachments_conversation_id;
DROP INDEX IF EXISTS idx_attachments_uploader_id;
DROP INDEX IF EXISTS idx_attachments_expires_at;
CREATE INDEX idx_attachments_message_id ON message_attachments(message_id);
CREATE INDEX idx_attachments_conversation_id ON message_attachments(conversation_id);
CREATE INDEX idx_attachments_uploader_id ON message_attachments(uploader_id);
CREATE INDEX idx_attachments_expires_at ON message_attachments(expires_at);

ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

-- Only conversation participants can view attachments
CREATE POLICY attachments_select_participant ON message_attachments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = message_attachments.conversation_id
            AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
        )
    );

-- Only the uploader can insert
CREATE POLICY attachments_insert_uploader ON message_attachments
    FOR INSERT WITH CHECK (
        auth.uid() = uploader_id AND
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = message_attachments.conversation_id
            AND (conversations.user1_id = auth.uid() OR conversations.user2_id = auth.uid())
        )
    );

-- SM-30: the previous UPDATE policy let ANY conversation participant rewrite ANY
-- column on ANY attachment row (no WITH CHECK, no column scope) — enabling
-- cross-user metadata tampering (plant an XSS file_name on the counterparty's row),
-- object substitution (storage_path/encrypted_file_key), and expiry bypass
-- (push expires_at far into the future). Attachment metadata is immutable once
-- created, so there is NO table-level UPDATE policy and the table GRANT below
-- omits UPDATE. The only legitimate mutation — bumping downloaded_count — is
-- done through the SECURITY DEFINER function below, which any conversation
-- participant may call but which can touch no other column.
DROP POLICY IF EXISTS attachments_update_participant ON message_attachments;

-- Only uploader can delete
CREATE POLICY attachments_delete_uploader ON message_attachments
    FOR DELETE USING (auth.uid() = uploader_id);

-- Deliberately NO UPDATE in this grant (SM-30): rows are immutable post-insert.
GRANT SELECT, INSERT, DELETE ON message_attachments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE message_attachments_id_seq TO authenticated;

-- SM-30: controlled, column-scoped download-count increment. Runs as owner so it
-- can UPDATE despite no UPDATE GRANT/policy, but it only touches downloaded_count
-- and only for attachments in a conversation the caller participates in. All other
-- columns (file_name, storage_path, encrypted_file_key, expires_at, ...) stay
-- immutable after insert.
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

DO $$ BEGIN RAISE NOTICE '[12/16] Creating storage bucket policies...'; END $$;

-- ============================================================
-- STORAGE BUCKET POLICIES FOR MESSAGE ATTACHMENTS
-- ============================================================
-- These policies control access to the 'message-attachments' storage bucket.
-- The bucket must be created manually in Supabase Dashboard > Storage.

-- Allow authenticated users to upload to message-attachments bucket
DROP POLICY IF EXISTS "Users can upload attachments" ON storage.objects;
CREATE POLICY "Users can upload attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

-- Allow authenticated users to read from message-attachments bucket
DROP POLICY IF EXISTS "Users can read attachments" ON storage.objects;
CREATE POLICY "Users can read attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'message-attachments');

-- Allow authenticated users to delete from message-attachments bucket
DROP POLICY IF EXISTS "Users can delete attachments" ON storage.objects;
CREATE POLICY "Users can delete attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'message-attachments');

-- Function to clean up expired attachments (run via scheduled job)
CREATE OR REPLACE FUNCTION cleanup_expired_attachments()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired attachment records
    -- Note: Actual file deletion from storage must be handled separately
    DELETE FROM message_attachments
    WHERE expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$;

DO $$ BEGIN RAISE NOTICE '[13/16] Configuring realtime for messages and conversations...'; END $$;

-- ============================================================
-- REALTIME CONFIGURATION FOR MESSAGES
-- ============================================================
-- Enable Supabase Realtime on the messages table
-- REPLICA IDENTITY FULL is required for filters to work with Realtime
ALTER TABLE messages REPLICA IDENTITY FULL;

-- Add the messages table to the supabase_realtime publication
-- This enables real-time subscriptions for the messages table
-- Note: Run this command. If the publication doesn't exist, create it first.
DO $$
BEGIN
    -- Check if the publication exists
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        -- Add the table to existing publication (ignore if already added)
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE messages;
        EXCEPTION WHEN duplicate_object THEN
            -- Table already in publication, that's fine
            NULL;
        END;
    ELSE
        -- Create the publication with the messages table
        CREATE PUBLICATION supabase_realtime FOR TABLE messages;
    END IF;
END $$;

-- Also enable for conversations table (for unread counts, etc.)
ALTER TABLE conversations REPLICA IDENTITY FULL;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
    END IF;
END $$;

-- Link conversations to data shares
ALTER TABLE data_shares
    ADD CONSTRAINT fk_conversation
    FOREIGN KEY (conversation_id)
    REFERENCES conversations(id)
    ON DELETE SET NULL;

DO $$ BEGIN RAISE NOTICE '[14/16] Creating multi-device encryption support (session keys, backups)...'; END $$;

-- ============================================================
-- MULTI-DEVICE ENCRYPTION SUPPORT
-- ============================================================

-- Session key backup for multi-device message decryption
-- Supports multiple session keys per conversation (one per epoch) for key rotation
CREATE TABLE IF NOT EXISTS conversation_session_keys (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    encrypted_session_key TEXT NOT NULL,
    encryption_nonce TEXT NOT NULL,
    message_counter BIGINT NOT NULL DEFAULT 0,
    key_epoch INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, conversation_id, key_epoch)
);

COMMENT ON COLUMN conversation_session_keys.key_epoch IS 'Key epoch this session belongs to. Higher epochs = more recent keys after regeneration.';

DROP INDEX IF EXISTS idx_session_keys_user_conversation;
DROP INDEX IF EXISTS idx_session_keys_epoch;
CREATE INDEX idx_session_keys_user_conversation ON conversation_session_keys(user_id, conversation_id);
CREATE INDEX idx_session_keys_epoch ON conversation_session_keys(key_epoch);

ALTER TABLE conversation_session_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY session_keys_select_own ON conversation_session_keys
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY session_keys_insert_own ON conversation_session_keys
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY session_keys_update_own ON conversation_session_keys
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY session_keys_delete_own ON conversation_session_keys
    FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_session_keys_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_session_keys_updated_at
    BEFORE UPDATE ON conversation_session_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_session_keys_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_session_keys TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE conversation_session_keys_id_seq TO authenticated;

-- Password and recovery key encrypted identity key backups
-- Also stores the stable session backup key for multi-device support
CREATE TABLE IF NOT EXISTS identity_key_backups (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Password-encrypted identity secret key
    password_encrypted_data TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_iv TEXT NOT NULL,
    -- Recovery-key encrypted identity secret key
    recovery_encrypted_data TEXT NOT NULL,
    recovery_salt TEXT NOT NULL,
    recovery_iv TEXT NOT NULL,
    -- Stable session backup key (encrypted with password)
    -- This key survives identity key rotation for reliable multi-device sync
    session_backup_key_encrypted TEXT,
    session_backup_key_salt TEXT,
    session_backup_key_iv TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

DROP INDEX IF EXISTS idx_key_backups_user_id;
CREATE INDEX idx_key_backups_user_id ON identity_key_backups(user_id);

ALTER TABLE identity_key_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY key_backups_select_own ON identity_key_backups
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY key_backups_insert_own ON identity_key_backups
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY key_backups_update_own ON identity_key_backups
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY key_backups_delete_own ON identity_key_backups
    FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_key_backups_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_key_backups_updated_at
    BEFORE UPDATE ON identity_key_backups
    FOR EACH ROW
    EXECUTE FUNCTION update_key_backups_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON identity_key_backups TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE identity_key_backups_id_seq TO authenticated;

-- ============================================================
-- DATA SHARE STATUS UPDATE FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION update_share_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES (
            NEW.owner_user_id,
            'share_response',
            'Share Request Accepted',
            'Your budget share request was accepted',
            jsonb_build_object(
                'share_id', NEW.id,
                'year', NEW.year,
                'month', NEW.month,
                'accepted_by', NEW.shared_with_user_id
            )
        );
    ELSIF NEW.status = 'rejected' AND OLD.status = 'pending' THEN
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES (
            NEW.owner_user_id,
            'share_response',
            'Share Request Rejected',
            'Your budget share request was rejected',
            jsonb_build_object(
                'share_id', NEW.id,
                'year', NEW.year,
                'month', NEW.month,
                'rejected_by', NEW.shared_with_user_id
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_share_status_update ON data_shares;
CREATE TRIGGER trigger_share_status_update
    AFTER UPDATE OF status ON data_shares
    FOR EACH ROW
    EXECUTE FUNCTION update_share_status();

DO $$ BEGIN RAISE NOTICE '[15/16] Populating example data (4 example months)...'; END $$;

-- ============================================================
-- POPULATE EXAMPLE DATA
-- ============================================================
-- Insert 4 example months (January, September, October, November 2045)
-- This provides users with working examples to learn from

INSERT INTO example_months (year, month, month_name, date_range, weekly_breakdown, fixed_costs, variable_costs, unplanned_expenses, income_sources, pots, created_at, updated_at)
VALUES
-- January 2045 (Simple example with minimal data)
(2045, 1, 'January',
 '{"start": "2044-12-31", "end": "2045-01-30"}'::jsonb,
 '[
   {"dateRange": "1-5", "weekRange": "1-5", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 22, "weekly-variable-food": "Estimate: £2.80\n= 10", "Food": "Estimate: £2.80\n= 10", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=12", "Activities": "Estimate: £2.80\n=12"},
   {"dateRange": "6-12", "weekRange": "6-12", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 30, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=20 + 10", "Activities": "Estimate: £2.80\n=20 + 10"},
   {"dateRange": "13-19", "weekRange": "13-19", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="},
   {"dateRange": "20-26", "weekRange": "20-26", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="},
   {"dateRange": "27-31", "weekRange": "27-31", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="}
 ]'::jsonb,
 '[
   {"category": "", "estimatedAmount": 0, "actualAmount": 0, "date": "", "card": "", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Food", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "Travel", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "Activities", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}
 ]'::jsonb,
 '[
   {"name": "", "amount": 0, "date": "", "card": "", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"source": "", "estimated": 0, "actual": 0, "date": "", "description": "", "comments": ""},
   {"source": "", "estimated": 0, "actual": 0, "date": "", "description": "", "comments": ""}
 ]'::jsonb,
 '[]'::jsonb,
 NOW(), NOW()),

-- September 2045 (Another simple example)
(2045, 9, 'September',
 '{"start": "2045-08-31", "end": "2045-09-30"}'::jsonb,
 '[
   {"dateRange": "1-4", "weekRange": "1-4", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 22, "weekly-variable-food": "Estimate: £2.80\n= 10", "Food": "Estimate: £2.80\n= 10", "weekly-variable-travel": "Estimate: £2.80\n=12", "Travel": "Estimate: £2.80\n=12", "weekly-variable-activities": "Estimate: £2.80\n=12", "Activities": "Estimate: £2.80\n=12"},
   {"dateRange": "5-11", "weekRange": "5-11", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 30, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=20 + 10", "Activities": "Estimate: £2.80\n=20 + 10"},
   {"dateRange": "12-18", "weekRange": "12-18", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="},
   {"dateRange": "19-25", "weekRange": "19-25", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="},
   {"dateRange": "26-30", "weekRange": "26-30", "paymentsDue": "", "estimate": 5.6, "weeklyEstimate": 5.6, "actual": 0, "weekly-variable-food": "Estimate: £2.80\n=", "Food": "Estimate: £2.80\n=", "weekly-variable-travel": "Estimate: £2.80\n=", "Travel": "Estimate: £2.80\n=", "weekly-variable-activities": "Estimate: £2.80\n=", "Activities": "Estimate: £2.80\n="}
 ]'::jsonb,
 '[
   {"category": "", "estimatedAmount": 0, "actualAmount": 0, "date": "", "card": "", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Food", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "Travel", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "Activities", "estimatedAmount": 14, "actualAmount": 0, "comments": ""},
   {"category": "", "estimatedAmount": 0, "actualAmount": 0, "comments": ""}
 ]'::jsonb,
 '[
   {"name": "", "amount": 0, "date": "", "card": "", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"source": "", "estimated": 0, "actual": 0, "date": "", "description": "", "comments": ""},
   {"source": "", "estimated": 0, "actual": 0, "date": "", "description": "", "comments": ""}
 ]'::jsonb,
 '[]'::jsonb,
 NOW(), NOW()),

-- October 2045 (Comprehensive example with full data)
(2045, 10, 'October',
 '{"start": "2045-09-30", "end": "2045-10-30"}'::jsonb,
 '[
   {"dateRange": "1-7", "weekRange": "1-7", "paymentsDue": "Rent/Mortgage: £1,200.00 (Bank Transfer) ✓\nGym Membership: £40.00 (Credit Card) ✓\nSpotify Premium: £12.00 (Credit Card) ✓\nNetflix: £15.00 (Credit Card) ✓", "weekly-variable-food": "Estimate: £85.00\n= 25+30+18+27", "Food": "Estimate: £85.00\n= 25+30+18+27", "weekly-variable-travel": "Estimate: £40.00\n= 42", "Travel": "Estimate: £40.00\n= 42", "weekly-variable-activities": "Estimate: £50.00\n= 20+35+15", "Activities": "Estimate: £50.00\n= 20+35+15", "estimate": 1492, "weeklyEstimate": 1492, "actual": 1437},
   {"dateRange": "8-14", "weekRange": "8-14", "paymentsDue": "Electricity: £72.00 (Debit Card) ✓\nWater Bill: £28.00 (Debit Card) ✓\nCloud Storage: £10.00 (Credit Card) ✓", "weekly-variable-food": "Estimate: £85.00\n= 45+22+33", "Food": "Estimate: £85.00\n= 45+22+33", "weekly-variable-travel": "Estimate: £40.00\n= 65", "Travel": "Estimate: £40.00\n= 65", "weekly-variable-activities": "Estimate: £50.00\n= 45", "Activities": "Estimate: £50.00\n= 45", "estimate": 335, "weeklyEstimate": 335, "actual": 320},
   {"dateRange": "15-21", "weekRange": "15-21", "paymentsDue": "Phone Plan: £45.00 (Debit Card) ✓\nHealth Insurance: £85.00 (Bank Transfer) ✓\nApp Subscriptions: £25.00 (Credit Card) ✓", "weekly-variable-food": "Estimate: £85.00\n= 28+42+15+20", "Food": "Estimate: £85.00\n= 28+42+15+20", "weekly-variable-travel": "Estimate: £40.00\n= 38", "Travel": "Estimate: £40.00\n= 38", "weekly-variable-activities": "Estimate: £50.00\n= 60+15", "Activities": "Estimate: £50.00\n= 60+15", "estimate": 380, "weeklyEstimate": 380, "actual": 358},
   {"dateRange": "22-31", "weekRange": "22-31", "paymentsDue": "Internet: £55.00 (Debit Card) ✓\nCar Payment: £250.00 (Bank Transfer) ✓", "weekly-variable-food": "Estimate: £85.00\n= 35+28+40", "Food": "Estimate: £85.00\n= 35+28+40", "weekly-variable-travel": "Estimate: £40.00\n= 55", "Travel": "Estimate: £40.00\n= 55", "weekly-variable-activities": "Estimate: £50.00\n= 40+25+15", "Activities": "Estimate: £50.00\n= 40+25+15", "estimate": 530, "weeklyEstimate": 530, "actual": 528}
 ]'::jsonb,
 '[
   {"category": "Rent/Mortgage", "estimatedAmount": 1200, "actualAmount": 1200, "date": "1", "card": "Bank Transfer", "paid": true, "comments": ""},
   {"category": "Gym Membership", "estimatedAmount": 40, "actualAmount": 40, "date": "1", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Spotify Premium", "estimatedAmount": 12, "actualAmount": 12, "date": "3", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Netflix", "estimatedAmount": 15, "actualAmount": 15, "date": "5", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Electricity", "estimatedAmount": 70, "actualAmount": 72, "date": "8", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Water Bill", "estimatedAmount": 30, "actualAmount": 28, "date": "10", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Cloud Storage", "estimatedAmount": 10, "actualAmount": 10, "date": "12", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Phone Plan", "estimatedAmount": 45, "actualAmount": 45, "date": "15", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Health Insurance", "estimatedAmount": 85, "actualAmount": 85, "date": "18", "card": "Bank Transfer", "paid": true, "comments": ""},
   {"category": "App Subscriptions", "estimatedAmount": 25, "actualAmount": 25, "date": "20", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Internet", "estimatedAmount": 55, "actualAmount": 55, "date": "22", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Car Payment", "estimatedAmount": 250, "actualAmount": 250, "date": "28", "card": "Bank Transfer", "paid": true, "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Food", "estimatedAmount": 400, "actualAmount": 381, "comments": ""},
   {"category": "Travel", "estimatedAmount": 200, "actualAmount": 200, "comments": ""},
   {"category": "Activities", "estimatedAmount": 300, "actualAmount": 225, "comments": ""}
 ]'::jsonb,
 '[
   {"name": "Car Service", "amount": 180, "date": "12", "card": "Credit Card", "paid": true, "comments": ""},
   {"name": "Birthday Gift", "amount": 45, "date": "18", "card": "Debit Card", "paid": true, "comments": ""},
   {"name": "Urgent Plumber", "amount": 120, "date": "25", "card": "Debit Card", "paid": true, "comments": ""}
 ]'::jsonb,
 '[
   {"source": "Primary Job", "estimated": 3200, "actual": 3250, "date": "1st", "description": "Monthly salary after tax", "comments": ""},
   {"source": "Freelance Work", "estimated": 400, "actual": 550, "date": "15th", "description": "Web design project", "comments": ""},
   {"source": "Dividend Income", "estimated": 50, "actual": 48, "date": "20th", "description": "Quarterly dividend", "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Emergency Fund", "estimatedAmount": 200, "actualAmount": 175, "comments": ""},
   {"category": "Holiday Savings", "estimatedAmount": 150, "actualAmount": 125, "comments": ""},
   {"category": "New Laptop Fund", "estimatedAmount": 150, "actualAmount": 125, "comments": ""},
   {"category": "Investment Account", "estimatedAmount": 100, "actualAmount": 75, "comments": ""}
 ]'::jsonb,
 NOW(), NOW()),

-- November 2045 (Moderate month with some unpaid bills)
(2045, 11, 'November',
 '{"start": "2045-10-31", "end": "2045-11-29"}'::jsonb,
 '[
   {"dateRange": "1-7", "weekRange": "1-7", "paymentsDue": "Rent: £1,200.00 (Bank Transfer) ✓\nGym Membership: £40.00 (Credit Card) ✓\nStreaming Services: £35.00 (Credit Card) ✓", "weekly-variable-food": "Estimate: £68.00\n= 22+35+28", "Food": "Estimate: £68.00\n= 22+35+28", "weekly-variable-travel": "Estimate: £32.00\n= 38", "Travel": "Estimate: £32.00\n= 38", "weekly-variable-activities": "Estimate: £40.00\n= 45+20", "Activities": "Estimate: £40.00\n= 45+20", "estimate": 1410, "weeklyEstimate": 1410, "actual": 1388},
   {"dateRange": "8-14", "weekRange": "8-14", "paymentsDue": "Electricity: £68.00 (Debit Card) ✓\nWater: £25.00 (Debit Card) ✓", "weekly-variable-food": "Estimate: £68.00\n= 30+25+18+22", "Food": "Estimate: £68.00\n= 30+25+18+22", "weekly-variable-travel": "Estimate: £32.00\n= 45", "Travel": "Estimate: £32.00\n= 45", "weekly-variable-activities": "Estimate: £40.00\n= 30", "Activities": "Estimate: £40.00\n= 30", "estimate": 268, "weeklyEstimate": 268, "actual": 263},
   {"dateRange": "15-21", "weekRange": "15-21", "paymentsDue": "Phone Plan: £42.00 (Debit Card) ✓\nHealth Insurance: £85.00 (Bank Transfer) ✓", "weekly-variable-food": "Estimate: £68.00\n= 28+35+20", "Food": "Estimate: £68.00\n= 28+35+20", "weekly-variable-travel": "Estimate: £32.00\n=35", "Travel": "Estimate: £32.00\n=35", "weekly-variable-activities": "Estimate: £40.00\n= 65+25", "Activities": "Estimate: £40.00\n= 65+25", "estimate": 337, "weeklyEstimate": 337, "actual": 335},
   {"dateRange": "22-28", "weekRange": "22-28", "paymentsDue": "Internet: £50.00 (Debit Card)\nCar Insurance: £75.00 (Bank Transfer)", "weekly-variable-food": "Estimate: £68.00\n= 35+28+22", "Food": "Estimate: £68.00\n= 35+28+22", "weekly-variable-travel": "Estimate: £32.00\n= 35", "Travel": "Estimate: £32.00\n= 35", "weekly-variable-activities": "Estimate: £40.00\n= 40+25", "Activities": "Estimate: £40.00\n= 40+25", "estimate": 300, "weeklyEstimate": 300, "actual": 275},
   {"dateRange": "29-30", "weekRange": "29-30", "paymentsDue": "", "weekly-variable-food": "Estimate: £68.00\n=", "Food": "Estimate: £68.00\n=", "weekly-variable-travel": "Estimate: £32.00\n=", "Travel": "Estimate: £32.00\n=", "weekly-variable-activities": "Estimate: £40.00\n=", "Activities": "Estimate: £40.00\n=", "estimate": 85, "weeklyEstimate": 85, "actual": 0}
 ]'::jsonb,
 '[
   {"category": "Rent", "estimatedAmount": 1200, "actualAmount": 1200, "date": "1", "card": "Bank Transfer", "paid": true, "comments": ""},
   {"category": "Gym Membership", "estimatedAmount": 40, "actualAmount": 40, "date": "1", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Streaming Services", "estimatedAmount": 35, "actualAmount": 35, "date": "5", "card": "Credit Card", "paid": true, "comments": ""},
   {"category": "Electricity", "estimatedAmount": 70, "actualAmount": 68, "date": "8", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Water", "estimatedAmount": 25, "actualAmount": 25, "date": "10", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Phone Plan", "estimatedAmount": 42, "actualAmount": 42, "date": "15", "card": "Debit Card", "paid": true, "comments": ""},
   {"category": "Health Insurance", "estimatedAmount": 85, "actualAmount": 85, "date": "18", "card": "Bank Transfer", "paid": true, "comments": ""},
   {"category": "Internet", "estimatedAmount": 50, "actualAmount": 50, "date": "22", "card": "Debit Card", "paid": false, "comments": ""},
   {"category": "Car Insurance", "estimatedAmount": 75, "actualAmount": 75, "date": "25", "card": "Bank Transfer", "paid": false, "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Food", "estimatedAmount": 340, "actualAmount": 265, "comments": ""},
   {"category": "Travel", "estimatedAmount": 160, "actualAmount": 118, "comments": ""},
   {"category": "Activities", "estimatedAmount": 200, "actualAmount": 185, "comments": ""}
 ]'::jsonb,
 '[
   {"name": "Black Friday Deals", "amount": 150, "date": "25", "card": "Credit Card", "paid": true, "comments": "Holiday shopping"},
   {"name": "Thanksgiving Dinner", "amount": 85, "date": "28", "card": "Debit Card", "paid": true, "comments": ""}
 ]'::jsonb,
 '[
   {"source": "Salary", "estimated": 3100, "actual": 3100, "date": "1st", "description": "Monthly salary", "comments": ""},
   {"source": "Side Project", "estimated": 200, "actual": 175, "date": "20th", "description": "Consulting work", "comments": ""}
 ]'::jsonb,
 '[
   {"category": "Emergency Fund", "estimatedAmount": 500, "actualAmount": 500, "comments": ""},
   {"category": "Christmas Savings", "estimatedAmount": 400, "actualAmount": 400, "comments": ""},
   {"category": "Travel Fund", "estimatedAmount": 200, "actualAmount": 200, "comments": ""}
 ]'::jsonb,
 NOW(), NOW())

ON CONFLICT (year, month) DO UPDATE SET
    month_name = EXCLUDED.month_name,
    date_range = EXCLUDED.date_range,
    weekly_breakdown = EXCLUDED.weekly_breakdown,
    fixed_costs = EXCLUDED.fixed_costs,
    variable_costs = EXCLUDED.variable_costs,
    unplanned_expenses = EXCLUDED.unplanned_expenses,
    income_sources = EXCLUDED.income_sources,
    pots = EXCLUDED.pots,
    updated_at = NOW();

DO $$ BEGIN RAISE NOTICE '[16/16] Creating performance indexes...'; END $$;

-- ============================================================
-- ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================================

-- Improve query performance for common access patterns
CREATE INDEX IF NOT EXISTS idx_identity_keys_updated ON identity_keys(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_epoch ON messages(conversation_id, key_epoch);
CREATE INDEX IF NOT EXISTS idx_session_keys_user_updated ON conversation_session_keys(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_key_history_user_epoch ON public_key_history(user_id, epoch);

-- ============================================================
-- FRESH INSTALL COMPLETE
-- ============================================================

DO $$
DECLARE
    table_count INTEGER;
    function_count INTEGER;
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

    SELECT COUNT(*) INTO function_count FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';

    SELECT COUNT(*) INTO policy_count FROM pg_policies
    WHERE schemaname = 'public';

    RAISE NOTICE '============================================================';
    RAISE NOTICE 'FRESH INSTALL COMPLETE';
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Created % tables in public schema', table_count;
    RAISE NOTICE 'Created % functions in public schema', function_count;
    RAISE NOTICE 'Created % RLS policies', policy_count;
    RAISE NOTICE '------------------------------------------------------------';
    RAISE NOTICE 'Database is now ready with:';
    RAISE NOTICE '  - Budget management (user_months, example_months, pots)';
    RAISE NOTICE '  - Settings (user preferences)';
    RAISE NOTICE '  - Subscription system (plans, subscriptions, payments)';
    RAISE NOTICE '  - Data sharing (data_shares with field locks)';
    RAISE NOTICE '  - Friends and blocked users systems';
    RAISE NOTICE '  - Notifications system (with create_notification RPC)';
    RAISE NOTICE '  - E2E encryption (identity keys, conversations, messages)';
    RAISE NOTICE '  - Multi-device support (paired devices, session key backups)';
    RAISE NOTICE '  - Message attachments with storage policies';
    RAISE NOTICE '============================================================';
END $$;
