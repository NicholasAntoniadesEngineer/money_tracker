# Subscription Tier System

This document explains how the subscription tier system works and how to use it in your pages.

## Overview

The subscription system supports three tiers:
- **Trial**: Free trial period (no payment required)
- **Basic**: Basic paid subscription (e.g., "Monthly Subscription" plan)
- **Premium**: Premium paid subscription (e.g., "Premium Subscription" plan)

## Database Structure

### Subscription Plans Table
The `subscription_plans` table stores available plans:
- `plan_name`: Name of the plan (e.g., "Monthly Subscription", "Premium Subscription")
- `price_amount`: Price in cents
- `is_active`: Whether the plan is currently available

### Subscriptions Table
The `subscriptions` table tracks user subscriptions:
- `user_id`: User identifier
- `plan_id`: Reference to `subscription_plans.id`
- `subscription_type`: 'trial' or 'paid'
- `status`: 'trial', 'active', 'expired', 'cancelled', 'past_due'

### Tier Mapping
Tiers are automatically calculated based on:
1. `subscription_type`: If 'trial', tier is always 'trial'
2. `plan_name`: For paid subscriptions, mapped to tier:
   - "Monthly Subscription" → 'basic'
   - "Premium Subscription" → 'premium'

## Usage in Pages

### Method 1: Using SubscriptionGuard (Recommended)

```javascript
// Check if user has premium access
const hasPremium = await SubscriptionGuard.hasTier('premium');
if (hasPremium) {
    // Load premium features
    loadPremiumFeatures();
}

// Get current tier
const currentTier = await SubscriptionGuard.getCurrentTier();
console.log('Current tier:', currentTier); // 'trial', 'basic', or 'premium'

// Conditionally load content
await SubscriptionGuard.loadIfTier('premium', () => {
    // This code only runs if user has premium tier
    showPremiumFeatures();
}, () => {
    // This code runs if user doesn't have premium tier
    showUpgradePrompt();
});

// Require tier and show upgrade prompt if needed
const hasAccess = await SubscriptionGuard.requireTier('premium', 'Advanced Analytics');
if (hasAccess) {
    // User has access, proceed
    showAdvancedAnalytics();
}

// Get full subscription info
const info = await SubscriptionGuard.getSubscriptionInfo();
console.log('Tier:', info.tier); // 'trial', 'basic', 'premium'
console.log('Tier Name:', info.tierName); // 'Trial', 'Basic', 'Premium'
console.log('Status:', info.status); // 'trial', 'active', etc.
console.log('Has Access:', info.hasAccess);
```

### Method 2: Using SubscriptionChecker Directly

```javascript
// Check access and get tier
const accessResult = await SubscriptionChecker.checkAccess();
if (accessResult.hasAccess) {
    const tier = accessResult.tier; // 'trial', 'basic', or 'premium'
    
    if (tier === 'premium') {
        // Load premium features
    }
}

// Check tier access
const tierResult = await SubscriptionChecker.checkTierAccess('premium');
if (tierResult.hasAccess) {
    // User has premium tier or higher
}
```

### Method 3: Using SubscriptionService Directly

```javascript
// Get subscription with tier
const result = await SubscriptionService.getCurrentUserSubscription();
if (result.success) {
    const tier = result.tier; // 'trial', 'basic', or 'premium'
    const subscription = result.subscription;
    const plan = result.plan;
    
    // Check if user has access to a specific tier
    const hasPremium = SubscriptionService.hasTierAccess('premium', tier);
}
```

## Tier Hierarchy

Tiers have a hierarchy where higher tiers include lower tier access:
- **Premium** includes Basic and Trial access
- **Basic** includes Trial access
- **Trial** is the base level

Example:
- If a user has 'premium' tier, `hasTierAccess('basic', 'premium')` returns `true`
- If a user has 'basic' tier, `hasTierAccess('premium', 'basic')` returns `false`

## Example: Conditional Feature Loading

```javascript
// In your page initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Load basic features (available to all tiers)
    loadBasicFeatures();
    
    // Load premium features only if user has premium tier
    await SubscriptionGuard.loadIfTier('premium', () => {
        loadPremiumFeatures();
        showPremiumUI();
    }, () => {
        // Show upgrade prompt for premium features
        showPremiumUpgradePrompt();
    });
    
    // Require basic tier for core features
    const hasBasic = await SubscriptionGuard.hasTier('basic');
    if (!hasBasic) {
        // Redirect to upgrade page
        window.location.href = '../payments/views/upgrade.html';
    }
});
```

## Updating Subscription Tiers

When a user upgrades:
1. The `plan_id` in the `subscriptions` table is updated
2. The tier is automatically calculated based on the plan name
3. The subscription is refreshed on the upgrade page

The tier is calculated in real-time, so no manual updates are needed.

## Adding New Plans

To add a new plan:
1. Insert into `subscription_plans` table with a `plan_name`
2. Update `SubscriptionService.TIER_MAPPING` to map the plan name to a tier:
   ```javascript
   TIER_MAPPING: {
       'Monthly Subscription': 'basic',
       'Premium Subscription': 'premium',
       'Your New Plan': 'premium' // or 'basic'
   }
   ```

## Files Modified

- `payments/services/SubscriptionService.js`: Added tier mapping and calculation
- `payments/utils/subscription-checker.js`: Added tier to access check results
- `ui/utils/subscription-guard.js`: New utility for easy tier checking in pages
- `payments/controllers/UpgradeController.js`: Updated to handle tier on upgrade success

