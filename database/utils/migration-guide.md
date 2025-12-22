# Database Migration Guide

This guide explains how to migrate existing localStorage data to Supabase.

## Prerequisites

1. Supabase database schema has been created (run `database/utils/schema.sql`)
2. Supabase client is configured and working
3. Application is running

## Migration Steps

### Option 1: Manual Migration Script

Create a migration script that:
1. Reads data from localStorage
2. Transforms it to database format
3. Saves to Supabase using DatabaseService

### Option 2: One-time Migration

If you have existing data in localStorage, you can create a one-time migration utility:

```javascript
// migration-utility.js (run once in browser console)
async function migrateLocalStorageToSupabase() {
    // Get all months from localStorage
    const monthsData = JSON.parse(localStorage.getItem('money_tracker_months') || '{}');
    
    // Initialize database service
    await window.DatabaseService.initialize();
    
    // Migrate each month
    for (const [monthKey, monthData] of Object.entries(monthsData)) {
        try {
            await window.DatabaseService.saveMonth(monthKey, monthData);
            console.log(`Migrated ${monthKey}`);
        } catch (error) {
            console.error(`Error migrating ${monthKey}:`, error);
        }
    }
    
    // Migrate pots
    const potsData = JSON.parse(localStorage.getItem('money_tracker_pots') || '{}');
    if (Object.keys(potsData).length > 0) {
        await window.DatabaseService.saveAllPots(potsData);
        console.log('Migrated pots');
    }
    
    // Migrate settings
    const settingsData = JSON.parse(localStorage.getItem('money_tracker_settings') || 'null');
    if (settingsData) {
        await window.DatabaseService.saveSettings(settingsData);
        console.log('Migrated settings');
    }
    
    console.log('Migration complete!');
}
```

## Verification

After migration, verify:
1. All months appear in the application
2. Settings are preserved
3. Pots data is intact
4. No data loss occurred

## Rollback

If migration fails:
1. Data remains in localStorage (not deleted)
2. You can continue using the old system
3. Fix issues and retry migration

