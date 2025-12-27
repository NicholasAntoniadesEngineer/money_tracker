# Database Setup Guide

This directory contains SQL scripts for setting up the Money Tracker database in Supabase.

## Setup Order

Execute these scripts in the Supabase SQL Editor in the following order:

### 1. Initial Schema Setup
**File:** `01-schema-fresh-install.sql`

Run this script **first** to create all database tables, indexes, triggers, and Row Level Security (RLS) policies.

This script creates:
- `user_months` - User-created monthly budget data
- `example_months` - Protected example data
- `pots` - Savings pots
- `settings` - Application settings
- Indexes for performance
- Triggers for automatic timestamp updates
- RLS policies for authenticated users

### 2. (Optional) Example Data
**File:** `02-populate-example-data.sql`

Run this script **after** the schema setup to populate example data for demonstration purposes.

This inserts example months (January, September, October, November 2045) into the `example_months` table.

### 3. (Optional) Public Access Configuration
**File:** `03-enable-public-access.sql`

Run this script **only if** you want to allow anonymous/public access without authentication.

**Note:** The default schema setup uses authenticated user access. Only use this script if you're not using Supabase authentication.

### 4. Subscription Plans Setup
**Files:** `04-populate-subscription-plans.sql` through `08-setup-free-and-premium-plans.sql`

Run these scripts to set up subscription plans and related functionality.

### 5. Data Sharing Feature
**File:** `09-add-data-sharing.sql`

Run this script to add data sharing and field-level locking capabilities.

This script creates:
- `data_shares` - Tracks which users have access to which data (includes `share_all_data` column)
- `field_locks` - Prevents concurrent edits to the same field
- RLS policies for shared data access
- Functions and triggers for lock management

## Troubleshooting

If you encounter signup errors or authentication issues, you may need to:

1. Create a `profiles` table (if using Supabase Auth)
2. Set up proper RLS policies for the profiles table
3. Create triggers to automatically create profiles on user signup

These are typically handled by Supabase's default setup, but if you need to fix issues, you can create the necessary tables and triggers manually.

## Notes

- All scripts use `IF NOT EXISTS` and `IF EXISTS` clauses to be idempotent (safe to run multiple times)
- The schema assumes you're using Supabase authentication
- RLS is enabled by default for security
- Example data uses year 2045 to avoid conflicts with real user data

