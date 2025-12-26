/**
 * Payments Module Initializer
 * 
 * This module initializes and configures all payment services with the provided configuration.
 * It acts as a dependency injection container for the payments module.
 * 
 * The module maintains backward compatibility - if not initialized, services will work
 * with their default window-based dependencies.
 * 
 * USAGE:
 * ```javascript
 * // For new projects with config:
 * await PaymentsModule.initialize(MoneyTrackerPaymentsConfig);
 * 
 * // Services will automatically use config if available, or fall back to window objects
 * ```
 */

const PaymentsModule = {
    VERSION: '1.0.0',
    config: null,
    initialized: false,
    
    /**
     * Services container
     * All initialized services are stored here
     */
    services: {
        stripe: null,
        payment: null,
        subscription: null
    },
    
    /**
     * Initialize the payments module with a configuration
     * This injects the config into all services so they can use it
     * @param {Object} config - Configuration object (should extend PaymentsConfigBase)
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async initialize(config) {
        console.log('[PaymentsModule] ========== INITIALIZATION STARTED ==========');
        console.log('[PaymentsModule] Version:', this.VERSION);
        
        try {
            // Validate configuration
            if (!config) {
                throw new Error('Configuration is required');
            }
            
            const validation = config.validate();
            if (!validation.valid) {
                throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
            }
            
            // Inject services into config if not already set (for money_tracker compatibility)
            // In new projects, services should be provided directly in the config
            if (!config.services.database && typeof window !== 'undefined' && window.DatabaseService) {
                config.services.database = window.DatabaseService;
                console.log('[PaymentsModule] Using window.DatabaseService (auto-injected for compatibility)');
            }
            
            if (!config.services.auth && typeof window !== 'undefined' && window.AuthService) {
                config.services.auth = window.AuthService;
                console.log('[PaymentsModule] Using window.AuthService (auto-injected for compatibility)');
            }
            
            // Validate services are available
            if (!config.services.database) {
                throw new Error('Database service is required. Provide via config.services.database or ensure window.DatabaseService is available.');
            }
            
            if (!config.services.auth) {
                throw new Error('Auth service is required. Provide via config.services.auth or ensure window.AuthService is available.');
            }
            
            // Store configuration
            this.config = config;
            
            // Get services from window (they should already be loaded)
            if (typeof window !== 'undefined') {
                // Inject config into services
                if (window.StripeService) {
                    this.services.stripe = window.StripeService;
                    window.StripeService._config = config;
                    console.log('[PaymentsModule] StripeService configured');
                }
                
                if (window.PaymentService) {
                    this.services.payment = window.PaymentService;
                    window.PaymentService._config = config;
                    console.log('[PaymentsModule] PaymentService configured');
                }
                
                if (window.SubscriptionService) {
                    this.services.subscription = window.SubscriptionService;
                    window.SubscriptionService._config = config;
                    console.log('[PaymentsModule] SubscriptionService configured');
                }
                
                // Store module reference
                window.PaymentsModule = this;
            }
            
            this.initialized = true;
            console.log('[PaymentsModule] ========== INITIALIZATION SUCCESSFUL ==========');
            
            return {
                success: true,
                error: null
            };
        } catch (error) {
            console.error('[PaymentsModule] ========== INITIALIZATION FAILED ==========');
            console.error('[PaymentsModule] Error:', error);
            return {
                success: false,
                error: error.message || 'Unknown error during initialization'
            };
        }
    },
    
    /**
     * Get a service by name
     * @param {string} serviceName - Name of the service ('stripe', 'payment', 'subscription')
     * @returns {Object|null} Service instance or null if not found
     */
    getService(serviceName) {
        if (typeof window !== 'undefined') {
            // Return from window if available (works even if not initialized)
            if (serviceName === 'stripe' && window.StripeService) {
                return window.StripeService;
            }
            if (serviceName === 'payment' && window.PaymentService) {
                return window.PaymentService;
            }
            if (serviceName === 'subscription' && window.SubscriptionService) {
                return window.SubscriptionService;
            }
        }
        
        return this.services[serviceName] || null;
    },
    
    /**
     * Get the current configuration
     * @returns {Object|null} Current configuration or null if not initialized
     */
    getConfig() {
        return this.config;
    },
    
    /**
     * Check if module is initialized
     * @returns {boolean} True if initialized
     */
    isInitialized() {
        return this.initialized;
    }
};

if (typeof window !== 'undefined') {
    window.PaymentsModule = PaymentsModule;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaymentsModule;
}

