-- ============================================================
-- RESET DATABASE - COMPLETE WIPE
-- ============================================================
-- WARNING: This script will DELETE ALL DATA in the database
-- Use this to start completely fresh without migration history
-- ============================================================

-- Note: We use CASCADE on all DROP statements to automatically
-- handle dependencies (RLS policies, triggers, constraints, etc.)
-- Drop tables first, then functions (tables have triggers that depend on functions)

-- ============================================================
-- DROP ALL TABLES (in correct order for foreign keys)
-- ============================================================

-- Encryption and messaging tables
DROP TABLE IF EXISTS message_attachments CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS identity_key_backups CASCADE;
DROP TABLE IF EXISTS conversation_session_keys CASCADE;
DROP TABLE IF EXISTS conversation_participants CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS key_rotation_locks CASCADE;
DROP TABLE IF EXISTS device_keys CASCADE;
DROP TABLE IF EXISTS paired_devices CASCADE;
DROP TABLE IF EXISTS public_key_history CASCADE;
DROP TABLE IF EXISTS identity_keys CASCADE;

-- Social features
DROP TABLE IF EXISTS blocked_users CASCADE;
DROP TABLE IF EXISTS friends CASCADE;

-- Notifications
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;

-- Data sharing
DROP TABLE IF EXISTS field_locks CASCADE;
DROP TABLE IF EXISTS data_shares CASCADE;

-- Budget data (JSONB structure)
DROP TABLE IF EXISTS user_months CASCADE;
DROP TABLE IF EXISTS example_months CASCADE;
DROP TABLE IF EXISTS pots CASCADE;

-- Settings
DROP TABLE IF EXISTS settings CASCADE;

-- Payments and subscriptions
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_plans CASCADE;

-- ============================================================
-- DROP ALL FUNCTIONS (now that tables/triggers are gone)
-- ============================================================
-- Trigger functions
DROP FUNCTION IF EXISTS create_trial_subscription() CASCADE;
DROP FUNCTION IF EXISTS update_key_backups_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_session_keys_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_conversations_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_messages_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_user_months_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_notifications_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_subscriptions_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_share_status() CASCADE;

-- Subscription helper functions
DROP FUNCTION IF EXISTS is_free_plan(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS is_on_trial(TEXT, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS get_price_dollars(BIGINT) CASCADE;
DROP FUNCTION IF EXISTS get_subscription_type(BIGINT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS is_recurring_billing_enabled(BOOLEAN) CASCADE;

-- Messaging and attachment functions
DROP FUNCTION IF EXISTS update_identity_keys_updated_at() CASCADE;
DROP FUNCTION IF EXISTS create_notification(UUID, TEXT, UUID, BIGINT, TEXT, BIGINT, BIGINT, BIGINT, BIGINT) CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_attachments() CASCADE;
DROP FUNCTION IF EXISTS debug_attachment_rls(BIGINT, UUID) CASCADE;

-- ============================================================
-- DROP STORAGE POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Users can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can read attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete attachments" ON storage.objects;

-- ============================================================
-- CLEAR ALL USERS
-- ============================================================
-- Delete all users from auth.users (this will cascade delete related data)
-- WARNING: This removes ALL user accounts
DELETE FROM auth.users;

-- ============================================================
-- RESET COMPLETE
-- ============================================================
-- You can now run: database/setup/fresh-install-complete.sql
-- ============================================================
