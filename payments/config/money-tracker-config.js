/**
 * Money Tracker Project-Specific Payments Configuration
 * This configures the payments module for the money_tracker project.
 * 
 * This file extends PaymentsConfigBase with project-specific values.
 */

// Ensure base config is loaded first
if (typeof PaymentsConfigBase === 'undefined') {
    throw new Error('PaymentsConfigBase must be loaded before MoneyTrackerPaymentsConfig');
}

const MoneyTrackerPaymentsConfig = PaymentsConfigBase.merge({
    services: {
        // Services will be injected at runtime via PaymentsModule.initialize()
        // They are set from window objects for backward compatibility
        database: null,
        auth: null
    },
    
    stripe: {
        publishableKey: 'pk_test_51QAQyCClUqvgxZvpgpfE0qWj3sOl3FbVBEhGS1uLOWdl8zyMK2z3LWGijvw0y4cn04EvydDqdK26VD7tcy1Qx1q40073PZrcmn',
        stripeJsLoader: null // Uses window.Stripe if available
    },
    
    backend: {
        baseUrl: 'https://ofutzrxfbrgtbkyafndv.supabase.co',
        endpoints: {
            createCheckoutSession: '/functions/v1/create-checkout-session',
            createPortalSession: '/functions/v1/create-portal-session',
            createCustomer: '/functions/v1/create-customer',
            updateSubscription: '/functions/v1/update-subscription',
            listInvoices: '/functions/v1/list-invoices',
            stripeWebhook: '/functions/v1/stripe-webhook'
        },
        getAuthHeaders: null // Will use auth service by default
    },
    
    tables: {
        subscriptions: 'subscriptions',
        subscriptionPlans: 'subscription_plans',
        paymentHistory: 'payment_history'
    },
    
    subscription: {
        defaultTrialPeriodDays: 30,
        tierMapping: {
            'trial': 'trial',
            'Free': 'basic',
            'Monthly Subscription': 'basic',
            'Basic Subscription': 'basic',
            'Premium': 'premium',
            'Premium Subscription': 'premium'
        },
        tierHierarchy: {
            'trial': 0,
            'basic': 1,
            'premium': 2
        }
    },
    
    application: {
        name: 'Money Tracker',
        currency: 'eur',
        interval: 'month',
        buildRedirectUrl: function(baseUrl, status) {
            const currentUrl = baseUrl.split('?')[0];
            return `${currentUrl}?payment=${status}`;
        }
    },
    
    logging: {
        verbose: true,
        prefix: '[Payments]'
    }
});

if (typeof window !== 'undefined') {
    window.MoneyTrackerPaymentsConfig = MoneyTrackerPaymentsConfig;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MoneyTrackerPaymentsConfig;
}

