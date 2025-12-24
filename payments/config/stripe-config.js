/**
 * Stripe Configuration
 * Centralized configuration for Stripe payment integration
 * Note: Secret key should be server-side only in production
 */

const StripeConfig = {
    PUBLISHABLE_KEY: 'pk_test_51QAQyCClUqvgxZvpgpfE0qWj3sOl3FbVBEhGS1uLOWdl8zyMK2z3LWGijvw0y4cn04EvydDqdK26VD7tcy1Qx1q40073PZrcmn',
    SECRET_KEY: 'sk_test_51QAQyCClUqvgxZvphuCsjTtAzcbKOlmJJ1SuMbad31PmSQ2F7cWwYicOiNSJGhekET1EzezJihiIiL0zN4x19bUd00pDHFalh2',
    RESTRICTED_KEY: 'rk_test_51QAQyCClUqvgxZvpKaTgchHG8wvTU069VUU1yrF7slV03H9htAgNJOCjgbS3DpLZAN4r9eLseB8njvy1xUVCoBlE003Y4K4ytP',
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
     * Get restricted key (for server-side use only)
     * Note: This key should NEVER be exposed in client-side code
     * Use this in your backend/Edge Function to create checkout sessions
     * @returns {string} Stripe restricted key
     */
    getRestrictedKey() {
        return this.RESTRICTED_KEY;
    },
    
    /**
     * Get secret key (for server-side use only)
     * Note: This key should NEVER be exposed in client-side code
     * @returns {string} Stripe secret key
     */
    getSecretKey() {
        return this.SECRET_KEY;
    }
};

if (typeof window !== 'undefined') {
    window.StripeConfig = StripeConfig;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StripeConfig;
}

