-- Friends List Feature - Database Schema
-- This script adds friends list functionality
-- Run this AFTER 11-add-notifications.sql and 12-add-messaging-and-payment-notifications.sql
-- 
-- SETUP ORDER:
-- 1. Run 01-schema-fresh-install.sql first
-- 2. Run other schema migrations (02-12)
-- 3. Run this script (13-add-friends-list.sql)

-- Friends table (tracks which users have added which other users as friends)
CREATE TABLE IF NOT EXISTS friends (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_user_id),
    CHECK (user_id != friend_user_id)
);

-- Indexes for friends table
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend_user_id ON friends(friend_user_id);
CREATE INDEX IF NOT EXISTS idx_friends_user_friend ON friends(user_id, friend_user_id);

-- Enable Row Level Security
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

-- RLS Policies for friends
-- Users can view their own friends
DROP POLICY IF EXISTS "Users can view their own friends" ON friends;
CREATE POLICY "Users can view their own friends" ON friends
    FOR SELECT USING (user_id = auth.uid());

-- Users can add friends
DROP POLICY IF EXISTS "Users can add friends" ON friends;
CREATE POLICY "Users can add friends" ON friends
    FOR INSERT WITH CHECK (user_id = auth.uid() AND friend_user_id != auth.uid());

-- Users can remove friends
DROP POLICY IF EXISTS "Users can remove friends" ON friends;
CREATE POLICY "Users can remove friends" ON friends
    FOR DELETE USING (user_id = auth.uid());

-- Add updated_at trigger
DROP TRIGGER IF EXISTS update_friends_updated_at ON friends;
CREATE TRIGGER update_friends_updated_at
    BEFORE UPDATE ON friends
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

