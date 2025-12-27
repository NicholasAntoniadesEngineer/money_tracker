-- Notifications and Blocked Users Feature - Database Schema
-- This script adds notification system, blocked users, and notification preferences
-- Run this AFTER 09-add-data-sharing.sql
-- 
-- SETUP ORDER:
-- 1. Run 01-schema-fresh-install.sql first
-- 2. Run other schema migrations (02-09)
-- 3. Run this script (11-add-notifications.sql)

-- Notifications table (tracks all user notifications)
CREATE TABLE IF NOT EXISTS notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('share_request', 'share_accepted', 'share_declined', 'share_blocked')),
    share_id BIGINT REFERENCES data_shares(id) ON DELETE CASCADE,
    from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message TEXT,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Blocked users table (tracks which users have blocked which other users)
CREATE TABLE IF NOT EXISTS blocked_users (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, blocked_user_id)
);

-- Indexes for notifications table
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_share_id ON notifications(share_id);
CREATE INDEX IF NOT EXISTS idx_notifications_from_user_id ON notifications(from_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);

-- Indexes for blocked_users table
CREATE INDEX IF NOT EXISTS idx_blocked_users_user_id ON blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked_user_id ON blocked_users(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_user_blocked ON blocked_users(user_id, blocked_user_id);

-- Add notification_preferences column to settings table
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
    "share_requests": true,
    "share_responses": true,
    "in_app_enabled": true,
    "email_enabled": false,
    "auto_accept_shares": false,
    "auto_decline_shares": false,
    "quiet_hours_enabled": false,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "08:00"
}'::jsonb;

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notifications
-- Users can only see their own notifications
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (user_id = auth.uid());

-- Users can insert notifications for themselves (for system-generated notifications)
-- Note: In practice, notifications are created server-side, but this allows flexibility
CREATE POLICY "Users can create their own notifications" ON notifications
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own notifications (mark as read, delete)
CREATE POLICY "Users can update their own notifications" ON notifications
    FOR UPDATE USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications" ON notifications
    FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for blocked_users
-- Users can only see their own block list
CREATE POLICY "Users can view their own blocks" ON blocked_users
    FOR SELECT USING (user_id = auth.uid());

-- Users can block other users
CREATE POLICY "Users can block other users" ON blocked_users
    FOR INSERT WITH CHECK (user_id = auth.uid() AND blocked_user_id != auth.uid());

-- Users can unblock (delete) users they have blocked
CREATE POLICY "Users can unblock users" ON blocked_users
    FOR DELETE USING (user_id = auth.uid());

-- Add comment to document the notification_preferences column
COMMENT ON COLUMN settings.notification_preferences IS 'User notification preferences including enabled types, channels, auto-actions, and quiet hours';

