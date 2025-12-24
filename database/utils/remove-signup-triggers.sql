-- Remove All Triggers from auth.users Table
-- Use this script if you want to completely remove triggers and handle user creation differently
-- Run this in Supabase SQL Editor

-- Remove all triggers on auth.users
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    FOR trigger_record IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_schema = 'auth'
          AND event_object_table = 'users'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users CASCADE', trigger_record.trigger_name);
        RAISE NOTICE 'Dropped trigger: %', trigger_record.trigger_name;
    END LOOP;
END $$;

-- Remove functions that might be related to user creation (optional - be careful!)
-- Uncomment the following lines only if you're sure you want to remove these functions
-- DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
-- DROP FUNCTION IF EXISTS public.on_auth_user_created() CASCADE;

-- Verify all triggers are removed
SELECT 
    'Triggers remaining' AS check_item,
    COUNT(*) AS count
FROM information_schema.triggers
WHERE event_object_schema = 'auth'
  AND event_object_table = 'users';

-- Expected result: count should be 0

