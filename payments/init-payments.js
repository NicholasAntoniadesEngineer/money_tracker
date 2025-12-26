/**
 * Payments Module Initialization Script
 * 
 * This script initializes the payments module with the project-specific configuration.
 * Include this script after all payment services are loaded.
 * 
 * For the money_tracker project, this uses MoneyTrackerPaymentsConfig.
 * For other projects, create a similar config file and update the import.
 */

(async function() {
    console.log('[PaymentsInit] ========== PAYMENTS MODULE INITIALIZATION ==========');
    
    try {
        // Wait for required dependencies
        let waitCount = 0;
        const maxWait = 50; // 5 seconds
        
        while ((typeof PaymentsConfigBase === 'undefined' || 
                typeof MoneyTrackerPaymentsConfig === 'undefined' ||
                typeof PaymentsModule === 'undefined') && 
               waitCount < maxWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
            waitCount++;
        }
        
        if (typeof PaymentsConfigBase === 'undefined') {
            console.error('[PaymentsInit] PaymentsConfigBase not found');
            return;
        }
        
        if (typeof MoneyTrackerPaymentsConfig === 'undefined') {
            console.error('[PaymentsInit] MoneyTrackerPaymentsConfig not found');
            return;
        }
        
        if (typeof PaymentsModule === 'undefined') {
            console.error('[PaymentsInit] PaymentsModule not found');
            return;
        }
        
        // Wait for services to be loaded
        let serviceWaitCount = 0;
        const maxServiceWait = 50; // 5 seconds
        while ((!window.StripeService || !window.PaymentService || !window.SubscriptionService) && serviceWaitCount < maxServiceWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
            serviceWaitCount++;
        }
        
        if (!window.StripeService || !window.PaymentService || !window.SubscriptionService) {
            console.error('[PaymentsInit] Services not loaded after waiting:', {
                hasStripeService: !!window.StripeService,
                hasPaymentService: !!window.PaymentService,
                hasSubscriptionService: !!window.SubscriptionService
            });
            return;
        }
        
        // Initialize the module
        const result = await PaymentsModule.initialize(MoneyTrackerPaymentsConfig);
        
        if (result.success) {
            console.log('[PaymentsInit] ========== PAYMENTS MODULE INITIALIZED SUCCESSFULLY ==========');
        } else {
            console.error('[PaymentsInit] ========== PAYMENTS MODULE INITIALIZATION FAILED ==========');
            console.error('[PaymentsInit] Error:', result.error);
        }
    } catch (error) {
        console.error('[PaymentsInit] ========== PAYMENTS MODULE INITIALIZATION ERROR ==========');
        console.error('[PaymentsInit] Exception:', error);
    }
})();


