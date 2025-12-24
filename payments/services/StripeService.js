/**
 * Stripe Service
 * Handles all Stripe API interactions
 * Uses Stripe.js for client-side operations
 */

const StripeService = {
    stripeInstance: null,
    
    /**
     * Initialize Stripe with publishable key
     * @returns {Promise<Object>} Stripe instance
     */
    async initialize() {
        if (this.stripeInstance) {
            return this.stripeInstance;
        }
        
        if (!window.StripeConfig) {
            throw new Error('StripeConfig not available');
        }
        
        if (!window.Stripe) {
            throw new Error('Stripe.js library not loaded. Please include Stripe.js script in your HTML.');
        }
        
        const publishableKey = window.StripeConfig.getPublishableKey();
        this.stripeInstance = window.Stripe(publishableKey);
        
        console.log('[StripeService] Stripe initialized with publishable key');
        return this.stripeInstance;
    },
    
    /**
     * Create a Stripe Checkout session for subscription
     * Note: This requires a backend endpoint to create the session securely
     * The backend should use the restricted key (rk_test_...) or secret key (sk_test_...)
     * @param {string} customerEmail - Customer email
     * @param {string} userId - User ID from Supabase
     * @param {string} successUrl - URL to redirect after successful payment
     * @param {string} cancelUrl - URL to redirect after cancelled payment
     * @param {string} backendEndpoint - Optional backend endpoint URL for creating checkout session
     * @returns {Promise<{success: boolean, sessionId: string|null, error: string|null}>}
     */
    async createCheckoutSession(customerEmail, userId, successUrl, cancelUrl, backendEndpoint = null) {
        try {
            if (!this.stripeInstance) {
                await this.initialize();
            }
            
            console.log('[StripeService] Creating checkout session for:', {
                email: customerEmail,
                userId: userId,
                successUrl: successUrl,
                cancelUrl: cancelUrl,
                backendEndpoint: backendEndpoint
            });
            
            // If backend endpoint is provided, use it
            if (backendEndpoint) {
                try {
                    const response = await fetch(backendEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            customerEmail: customerEmail,
                            userId: userId,
                            successUrl: successUrl,
                            cancelUrl: cancelUrl
                        })
                    });
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Backend error: ${errorText}`);
                    }
                    
                    const result = await response.json();
                    
                    if (result.sessionId) {
                        return {
                            success: true,
                            sessionId: result.sessionId,
                            error: null
                        };
                    } else {
                        throw new Error(result.error || 'No session ID returned from backend');
                    }
                } catch (fetchError) {
                    console.error('[StripeService] Backend endpoint error:', fetchError);
                    return {
                        success: false,
                        sessionId: null,
                        error: `Backend endpoint error: ${fetchError.message}`
                    };
                }
            }
            
            // No backend endpoint provided - return error with instructions
            return {
                success: false,
                sessionId: null,
                error: 'Checkout session creation requires a backend endpoint. Please set up a server endpoint (Supabase Edge Function or separate server) that uses your Stripe restricted key (rk_test_...) or secret key (sk_test_...) to create checkout sessions. See StripeConfig for the keys.'
            };
        } catch (error) {
            console.error('[StripeService] Error creating checkout session:', error);
            return {
                success: false,
                sessionId: null,
                error: error.message || 'Failed to create checkout session'
            };
        }
    },
    
    /**
     * Redirect to Stripe Checkout
     * @param {string} sessionId - Stripe Checkout session ID
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async redirectToCheckout(sessionId) {
        try {
            if (!this.stripeInstance) {
                await this.initialize();
            }
            
            const result = await this.stripeInstance.redirectToCheckout({
                sessionId: sessionId
            });
            
            if (result.error) {
                console.error('[StripeService] Checkout redirect error:', result.error);
                return {
                    success: false,
                    error: result.error.message
                };
            }
            
            return {
                success: true,
                error: null
            };
        } catch (error) {
            console.error('[StripeService] Error redirecting to checkout:', error);
            return {
                success: false,
                error: error.message || 'Failed to redirect to checkout'
            };
        }
    },
    
    /**
     * Get Stripe instance
     * @returns {Object|null} Stripe instance
     */
    getStripeInstance() {
        return this.stripeInstance;
    }
};

if (typeof window !== 'undefined') {
    window.StripeService = StripeService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = StripeService;
}

