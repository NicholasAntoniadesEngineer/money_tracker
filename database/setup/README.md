# Database Setup Scripts

This directory contains utility scripts for setting up and managing your Money Tracker database.

## Fresh Installation (Recommended)

For a brand new setup or complete reset, use these two scripts in order:

### 1. Reset Database (Optional - only if you have existing data)

**File:** `00-reset-database.sql`

This script completely wipes your database:
- Drops all tables, functions, triggers
- Deletes all users from `auth.users`
- Leaves you with a clean slate

**When to use:**
- Starting fresh after development
- Clearing test data
- Resetting for production deployment

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy entire contents of `database/setup/00-reset-database.sql`
3. Execute the script
4. Verify all tables are gone

⚠️ **WARNING:** This deletes EVERYTHING. All user accounts, budgets, messages, encryption keys - gone forever.

---

### 2. Complete Fresh Install

**File:** `fresh-install-complete.sql`

This single script sets up your entire database with all features:
- Budget management (months, categories, recurring transactions)
- Subscription system (Free and Premium plans)
- Data sharing with permissions
- Friends system
- Notifications
- E2E encryption (identity keys, conversations, messages)
- Multi-device support (paired devices, session key backups)
- **Password + Recovery key dual encryption system**

**How to run:**
1. Open Supabase Dashboard → SQL Editor
2. Copy entire contents of `database/setup/fresh-install-complete.sql`
3. Execute the script
4. Verify success (no errors in output)

**What you get:**
```
✓ user_settings
✓ months
✓ categories
✓ recurring_transactions
✓ subscription_plans (with Free and Premium plans)
✓ subscriptions
✓ payments
✓ shared_months
✓ friends
✓ notifications
✓ notification_preferences
✓ identity_keys
✓ paired_devices
✓ conversations
✓ conversation_participants
✓ messages
✓ conversation_session_keys (for multi-device)
✓ identity_key_backups (password + recovery key)
```

---

## Testing Your Setup

After running the fresh install, test the system:

### Test 1: Sign Up
1. Clear browser data or use incognito
2. Sign up with new account
3. You should see recovery key modal
4. Test "Customize" button to edit recovery key
5. Save recovery key (copy/download/print)
6. Check mandatory checkbox
7. Continue to app

### Test 2: Sign In (Same Device)
1. Sign out
2. Sign in with same account
3. Should redirect seamlessly (automatic password decryption)

### Test 3: Device Pairing (New Device)
1. Open different browser/incognito
2. Sign in with same account
3. Should see device pairing options:
   - QR Code pairing
   - Password restore
   - Recovery key restore

### Test 4: Recovery Key Restore
1. On new device
2. Choose "Recovery Key" method
3. Enter 24-word recovery key
4. Should restore encryption keys successfully

---

---

## Production Deployment

For production, recommended approach:

1. **Backup existing data** (if any)
2. Run `database/setup/00-reset-database.sql` on staging first
3. Test thoroughly on staging
4. Run `database/setup/fresh-install-complete.sql` on staging
5. Test all features on staging
6. Once confident, repeat on production
7. Users will need to sign up fresh

---

## Troubleshooting

### "relation already exists" errors
- Run `database/setup/00-reset-database.sql` first
- Make sure previous execution completed fully

### RLS Policy errors
- Check that `auth.users` table exists
- Verify you're running as authenticated user in Supabase

### Permission denied errors
- Ensure you're using Supabase admin/postgres role
- Check RLS policies are properly configured

### Testing encryption
```sql
-- Check if encryption tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('identity_keys', 'identity_key_backups', 'conversation_session_keys');

-- Should return all three tables
```

---

## Architecture Overview

### Encryption System
- **Identity Keys**: X25519 key pairs for ECDH
- **Session Keys**: Derived shared secrets for conversations
- **Message Encryption**: XSalsa20-Poly1305 authenticated encryption
- **Key Backup**: Dual encryption with password AND recovery key
- **Multi-Device**: Encrypted session key backups for message decryption

### Recovery System
- **Password Backup**: AES-256-GCM with PBKDF2 (600k iterations)
- **Recovery Key Backup**: 24-word mnemonic, AES-256-GCM with PBKDF2
- **User Choice**: Auto-generated recovery key or custom 24 words
- **Mandatory Save**: Users MUST save recovery key before proceeding

### Security Properties
- **Zero-Knowledge**: Server never sees plaintext keys or messages
- **Forward Secrecy**: Per-message key derivation
- **Authenticated Encryption**: All encryption uses AEAD
- **Key Rotation**: Users can generate new keys (loses old messages)

---

## Files in This Directory

- `00-reset-database.sql` - Complete database wipe
- `fresh-install-complete.sql` - Single-script fresh setup
- `README.md` - This documentation file

## Utility Files

Additional utility files are available in `database/utils/`:
- `databaseConfigHelper.js` - Database configuration utilities
- `debugMissingRow.js` - Debug helper for troubleshooting
- `SECURITY-ANALYSIS.md` - Security architecture documentation

---

## Need Help?

1. Check console logs in browser DevTools
2. Check Supabase Dashboard → Logs
3. Verify tables exist: Supabase Dashboard → Table Editor
4. Test with simple account first
5. Check RLS policies allow your operations

---

**Last Updated:** January 2026
