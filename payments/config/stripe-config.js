/**
 * Stripe Configuration
 * Centralized configuration for Stripe payment integration
 * Note: Secret key should be server-side only in production
 */

const StripeConfig = {
    // SECURITY WARNING:
    // - Publishable keys (pk_*) are safe to expose in client-side code
    // - Secret keys (sk_*) and Restricted keys (rk_*) MUST NEVER be in client-side code
    // - Replace this with your actual publishable key from Stripe Dashboard
    // - For production, consider loading from environment variables or a config service
    PUBLISHABLE_KEY: '', // TODO: Set your Stripe publishable key here (pk_test_... or pk_live_...)
    // SECRET_KEY and RESTRICTED_KEY removed - these should NEVER be in client-side code
    // Use Edge Functions with environment variables for server-side operations
    SUBSCRIPTION_PRICE_AMOUNT: 500, // 5 EUR in cents
    SUBSCRIPTION_PRICE_CURRENCY: 'eur',
    TRIAL_PERIOD_DAYS: 30,
    CHECKOUT_SUCCESS_URL: null, // Set dynamically based on current page
    CHECKOUT_CANCEL_URL: null, // Set dynamically based on current page
    
    /**
     * Get Stripe publishable key
     * @returns {string} Stripe publishable key
     */
    getPublishableKey() {
        return this.PUBLISHABLE_KEY;
    },
    
    /**
     * Get subscription price amount in cents
     * @returns {number} Price in cents
     */
    getSubscriptionPriceAmount() {
        return this.SUBSCRIPTION_PRICE_AMOUNT;
    },
    
    /**
     * Get subscription price currency
     * @returns {string} Currency code
     */
    getSubscriptionPriceCurrency() {
        return this.SUBSCRIPTION_PRICE_CURRENCY;
    },
    
    /**
     * Get trial period in days
     * @returns {number} Trial period days
     */
    getTrialPeriodDays() {
        return this.TRIAL_PERIOD_DAYS;
    },
    
    /**
     * SECURITY WARNING: Secret and restricted keys have been removed
     * These should NEVER be in client-side code or version control
     * Use Edge Functions with environment variables for server-side operations
     * 
     * To use Stripe server-side:
     * 1. Set STRIPE_RESTRICTED_KEY or STRIPE_SECRET_KEY in Edge Function environment variables
     * 2. Call Edge Functions from client-side code
     * 3. Never expose secret keys in client-side JavaScript
     */
};

if (typeof window !== 'undefined') {
    window.StripeConfig = StripeConfig;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StripeConfig;
}

