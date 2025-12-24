/**
 * Subscription Service
 * Manages subscription lifecycle, trials, and status
 */

const SubscriptionService = {
    /**
     * Get default subscription plan from database
     * @returns {Promise<{success: boolean, plan: Object|null, error: string|null}>}
     */
    async getDefaultPlan() {
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }
            
            const result = await window.DatabaseService.querySelect('subscription_plans', {
                filter: { is_active: true },
                order: [{ column: 'id', ascending: true }],
                limit: 1
            });
            
            if (result.error) {
                console.error('[SubscriptionService] Error getting default plan:', result.error);
                return {
                    success: false,
                    plan: null,
                    error: result.error.message || 'Failed to get default plan'
                };
            }
            
            const plan = result.data && result.data.length > 0 ? result.data[0] : null;
            
            return {
                success: true,
                plan: plan,
                error: null
            };
        } catch (error) {
            console.error('[SubscriptionService] Exception getting default plan:', error);
            return {
                success: false,
                plan: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },
    
    /**
     * Create a 30-day trial subscription for a new user
     * Fetches plan details from database
     * @param {string} userId - User ID from Supabase
     * @returns {Promise<{success: boolean, subscription: Object|null, error: string|null}>}
     */
    async createTrialSubscription(userId) {
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }
            
            console.log('[SubscriptionService] Creating trial subscription for user:', userId);
            
            // Get default plan from database
            const planResult = await this.getDefaultPlan();
            if (!planResult.success || !planResult.plan) {
                // Fallback to config if no plan in database
                console.warn('[SubscriptionService] No plan found in database, using config fallback');
                if (!window.StripeConfig) {
                    throw new Error('StripeConfig not available and no plan in database');
                }
                
                const trialPeriodDays = window.StripeConfig.getTrialPeriodDays();
                const trialStartDate = new Date();
                const trialEndDate = new Date(trialStartDate);
                trialEndDate.setDate(trialEndDate.getDate() + trialPeriodDays);
                
                const subscriptionData = {
                    user_id: userId,
                    plan_id: null,
                    status: 'trial',
                    trial_start_date: trialStartDate.toISOString(),
                    trial_end_date: trialEndDate.toISOString(),
                    subscription_start_date: null,
                    subscription_end_date: null,
                    next_billing_date: null,
                    stripe_customer_id: null,
                    stripe_subscription_id: null,
                    stripe_price_id: null,
                    last_payment_date: null,
                    cancellation_date: null,
                    cancellation_reason: null
                };
                
                const result = await window.DatabaseService.queryUpsert('subscriptions', subscriptionData, {
                    identifier: 'user_id',
                    identifierValue: userId
                });
                
                if (result.error) {
                    throw new Error(result.error.message || 'Failed to create trial subscription');
                }
                
                const subscription = result.data && result.data.length > 0 ? result.data[0] : null;
                return {
                    success: true,
                    subscription: subscription,
                    error: null
                };
            }
            
            const plan = planResult.plan;
            const trialPeriodDays = plan.trial_period_days || 30;
            const trialStartDate = new Date();
            const trialEndDate = new Date(trialStartDate);
            trialEndDate.setDate(trialEndDate.getDate() + trialPeriodDays);
            
            const subscriptionData = {
                user_id: userId,
                plan_id: plan.id,
                subscription_type: 'trial', // Clear distinction: this is a free trial subscription (no payment)
                status: 'trial',
                trial_start_date: trialStartDate.toISOString(),
                trial_end_date: trialEndDate.toISOString(),
                subscription_start_date: null,
                subscription_end_date: null,
                next_billing_date: null,
                stripe_customer_id: null,
                stripe_subscription_id: null,
                stripe_price_id: plan.stripe_price_id || null,
                last_payment_date: null,
                cancellation_date: null,
                cancellation_reason: null
            };
            
            const result = await window.DatabaseService.queryUpsert('subscriptions', subscriptionData, {
                identifier: 'user_id',
                identifierValue: userId
            });
            
            if (result.error) {
                console.error('[SubscriptionService] Error creating trial subscription:', result.error);
                return {
                    success: false,
                    subscription: null,
                    error: result.error.message || 'Failed to create trial subscription'
                };
            }
            
            const subscription = result.data && result.data.length > 0 ? result.data[0] : null;
            
            console.log('[SubscriptionService] Trial subscription created successfully:', {
                userId: userId,
                planId: plan.id,
                planName: plan.plan_name,
                trialEndDate: trialEndDate.toISOString()
            });
            
            return {
                success: true,
                subscription: subscription,
                error: null
            };
        } catch (error) {
            console.error('[SubscriptionService] Exception creating trial subscription:', error);
            return {
                success: false,
                subscription: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },
    
    /**
     * Get subscription for current user with plan details
     * Fetches subscription and related plan from database
     * @returns {Promise<{success: boolean, subscription: Object|null, plan: Object|null, error: string|null}>}
     */
    async getCurrentUserSubscription() {
        const methodStartTime = Date.now();
        console.log('[SubscriptionService] ========== getCurrentUserSubscription() CALLED ==========');
        console.log('[SubscriptionService] getCurrentUserSubscription - call stack:', new Error().stack?.split('\n').slice(1, 6).join('\n'));
        
        try {
            console.log('[SubscriptionService] getCurrentUserSubscription - checking services availability...');
            if (!window.DatabaseService) {
                const error = new Error('DatabaseService not available');
                console.error('[SubscriptionService] ❌ getCurrentUserSubscription error:', error);
                throw error;
            }
            
            if (!window.AuthService) {
                const error = new Error('AuthService not available');
                console.error('[SubscriptionService] ❌ getCurrentUserSubscription error:', error);
                throw error;
            }
            
            console.log('[SubscriptionService] getCurrentUserSubscription - services available');
            console.log('[SubscriptionService] getCurrentUserSubscription - DatabaseService.client state:', {
                hasDatabaseService: !!window.DatabaseService,
                hasClient: !!window.DatabaseService.client,
                clientType: window.DatabaseService.client?.constructor?.name,
                hasSupabaseUrl: !!window.DatabaseService.client?.supabaseUrl,
                clientIsNull: window.DatabaseService.client === null,
                clientIsUndefined: window.DatabaseService.client === undefined
            });
            
            // Ensure DatabaseService is initialized before using it
            if (!window.DatabaseService.client) {
                console.log('[SubscriptionService] ⚠️ DatabaseService not initialized, initializing...');
                const initStartTime = Date.now();
                try {
                    await window.DatabaseService.initialize();
                    const initElapsed = Date.now() - initStartTime;
                    console.log(`[SubscriptionService] DatabaseService.initialize() completed in ${initElapsed}ms`);
                } catch (initError) {
                    console.error('[SubscriptionService] ❌ DatabaseService.initialize() failed:', initError);
                    console.error('[SubscriptionService] init error details:', {
                        message: initError.message,
                        name: initError.name,
                        stack: initError.stack
                    });
                    throw initError;
                }
            } else {
                console.log('[SubscriptionService] DatabaseService already initialized');
            }
            
            console.log('[SubscriptionService] getCurrentUserSubscription - DatabaseService.client state AFTER init check:', {
                hasClient: !!window.DatabaseService.client,
                clientType: window.DatabaseService.client?.constructor?.name,
                hasSupabaseUrl: !!window.DatabaseService.client?.supabaseUrl,
                supabaseUrl: window.DatabaseService.client?.supabaseUrl
            });
            
            console.log('[SubscriptionService] getCurrentUserSubscription - calling _getCurrentUserId()...');
            const userId = await window.DatabaseService._getCurrentUserId();
            console.log('[SubscriptionService] getCurrentUserSubscription - userId:', userId);
            if (!userId) {
                return {
                    success: false,
                    subscription: null,
                    plan: null,
                    error: 'User not authenticated'
                };
            }
            
            // Get subscription
            console.log('[SubscriptionService] getCurrentUserSubscription - calling querySelect for subscriptions...');
            console.log('[SubscriptionService] getCurrentUserSubscription - DatabaseService.client state BEFORE querySelect:', {
                hasClient: !!window.DatabaseService.client,
                clientType: window.DatabaseService.client?.constructor?.name,
                hasSupabaseUrl: !!window.DatabaseService.client?.supabaseUrl
            });
            
            const queryStartTime = Date.now();
            const subscriptionResult = await window.DatabaseService.querySelect('subscriptions', {
                filter: { user_id: userId },
                limit: 1
            });
            const queryElapsed = Date.now() - queryStartTime;
            console.log(`[SubscriptionService] getCurrentUserSubscription - querySelect completed in ${queryElapsed}ms`);
            console.log('[SubscriptionService] getCurrentUserSubscription - subscriptionResult:', {
                hasData: !!subscriptionResult.data,
                dataIsArray: Array.isArray(subscriptionResult.data),
                dataLength: Array.isArray(subscriptionResult.data) ? subscriptionResult.data.length : 'N/A',
                hasError: !!subscriptionResult.error,
                errorMessage: subscriptionResult.error?.message
            });
            
            if (subscriptionResult.error) {
                console.error('[SubscriptionService] ❌ Error getting subscription:', subscriptionResult.error);
                console.error('[SubscriptionService] subscriptionResult.error details:', {
                    message: subscriptionResult.error.message,
                    code: subscriptionResult.error.code,
                    status: subscriptionResult.error.status
                });
                return {
                    success: false,
                    subscription: null,
                    plan: null,
                    error: subscriptionResult.error.message || 'Failed to get subscription'
                };
            }
            
            const subscription = subscriptionResult.data && subscriptionResult.data.length > 0 ? subscriptionResult.data[0] : null;
            console.log('[SubscriptionService] getCurrentUserSubscription - subscription:', {
                hasSubscription: !!subscription,
                subscriptionStatus: subscription?.status,
                planId: subscription?.plan_id
            });
            
            // Get plan details if subscription has plan_id
            let plan = null;
            if (subscription && subscription.plan_id) {
                const planResult = await window.DatabaseService.querySelect('subscription_plans', {
                    filter: { id: subscription.plan_id },
                    limit: 1
                });
                
                if (planResult.success && planResult.data && planResult.data.length > 0) {
                    plan = planResult.data[0];
                }
            }
            
            const methodElapsed = Date.now() - methodStartTime;
            console.log(`[SubscriptionService] ✅ getCurrentUserSubscription completed successfully in ${methodElapsed}ms`);
            console.log('[SubscriptionService] ========== getCurrentUserSubscription() COMPLETE ==========');
            
            return {
                success: true,
                subscription: subscription,
                plan: plan,
                error: null
            };
        } catch (error) {
            const methodElapsed = Date.now() - methodStartTime;
            console.error(`[SubscriptionService] ❌ Exception getting subscription after ${methodElapsed}ms:`, error);
            console.error('[SubscriptionService] getCurrentUserSubscription - error details:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });
            console.error('[SubscriptionService] getCurrentUserSubscription - DatabaseService.client state on error:', {
                hasDatabaseService: !!window.DatabaseService,
                hasClient: !!window.DatabaseService?.client,
                clientType: window.DatabaseService?.client?.constructor?.name,
                clientIsNull: window.DatabaseService?.client === null,
                clientIsUndefined: window.DatabaseService?.client === undefined
            });
            console.error('[SubscriptionService] ========== getCurrentUserSubscription() FAILED ==========');
            
            return {
                success: false,
                subscription: null,
                plan: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },
    
    /**
     * Update subscription status
     * Automatically sets subscription_type to 'paid' when Stripe payment information is added
     * @param {string} userId - User ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<{success: boolean, subscription: Object|null, error: string|null}>}
     */
    async updateSubscription(userId, updateData) {
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }
            
            // Automatically set subscription_type to 'paid' when Stripe payment info is added
            // This clearly distinguishes trial subscriptions from paying subscriptions
            if (updateData.stripe_customer_id || updateData.stripe_subscription_id || updateData.last_payment_date) {
                if (!updateData.subscription_type) {
                    updateData.subscription_type = 'paid';
                    console.log('[SubscriptionService] Automatically setting subscription_type to "paid" due to Stripe payment information');
                }
            }
            
            const result = await window.DatabaseService.queryUpsert('subscriptions', {
                user_id: userId,
                ...updateData
            }, {
                identifier: 'user_id',
                identifierValue: userId
            });
            
            if (result.error) {
                console.error('[SubscriptionService] Error updating subscription:', result.error);
                return {
                    success: false,
                    subscription: null,
                    error: result.error.message || 'Failed to update subscription'
                };
            }
            
            const subscription = result.data && result.data.length > 0 ? result.data[0] : null;
            
            return {
                success: true,
                subscription: subscription,
                error: null
            };
        } catch (error) {
            console.error('[SubscriptionService] Exception updating subscription:', error);
            return {
                success: false,
                subscription: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },
    
    /**
     * Check if trial has expired
     * @param {Object} subscription - Subscription object
     * @returns {boolean} True if trial expired
     */
    isTrialExpired(subscription) {
        if (!subscription || subscription.status !== 'trial') {
            return false;
        }
        
        if (!subscription.trial_end_date) {
            return false;
        }
        
        const trialEndDate = new Date(subscription.trial_end_date);
        const now = new Date();
        
        return now > trialEndDate;
    },
    
    /**
     * Check if subscription is active (trial or paid)
     * @param {Object} subscription - Subscription object
     * @returns {boolean} True if subscription is active
     */
    isSubscriptionActive(subscription) {
        if (!subscription) {
            return false;
        }
        
        if (subscription.status === 'active') {
            // Check if subscription end date is in the future
            if (subscription.subscription_end_date) {
                const subscriptionEndDate = new Date(subscription.subscription_end_date);
                const now = new Date();
                return now <= subscriptionEndDate;
            }
            return true;
        }
        
        if (subscription.status === 'trial') {
            return !this.isTrialExpired(subscription);
        }
        
        return false;
    },
    
    /**
     * Get days remaining in trial
     * @param {Object} subscription - Subscription object
     * @returns {number|null} Days remaining or null if not in trial
     */
    getTrialDaysRemaining(subscription) {
        if (!subscription || subscription.status !== 'trial') {
            return null;
        }
        
        if (!subscription.trial_end_date) {
            return null;
        }
        
        const trialEndDate = new Date(subscription.trial_end_date);
        const now = new Date();
        
        if (now > trialEndDate) {
            return 0;
        }
        
        const diffTime = trialEndDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays;
    },
    
    /**
     * Get days remaining in active subscription
     * @param {Object} subscription - Subscription object
     * @returns {number|null} Days remaining or null if not active or no end date
     */
    getSubscriptionDaysRemaining(subscription) {
        if (!subscription || subscription.status !== 'active') {
            return null;
        }
        
        if (!subscription.subscription_end_date) {
            return null;
        }
        
        const subscriptionEndDate = new Date(subscription.subscription_end_date);
        const now = new Date();
        
        if (now > subscriptionEndDate) {
            return 0;
        }
        
        const diffTime = subscriptionEndDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays;
    },
    
    /**
     * Check if subscription is a trial (free, no payment)
     * @param {Object} subscription - Subscription object
     * @returns {boolean} True if subscription is a trial
     */
    isTrialSubscription(subscription) {
        if (!subscription) {
            return false;
        }
        // Check subscription_type first (most reliable)
        if (subscription.subscription_type === 'trial') {
            return true;
        }
        // Fallback: if subscription_type is 'paid', it's not a trial
        if (subscription.subscription_type === 'paid') {
            return false;
        }
        // Legacy check: if no Stripe payment info and status is 'trial', it's a trial
        if (subscription.status === 'trial' && !subscription.stripe_customer_id && !subscription.stripe_subscription_id && !subscription.last_payment_date) {
            return true;
        }
        return false;
    },
    
    /**
     * Check if subscription is a paid subscription (requires Stripe payment)
     * @param {Object} subscription - Subscription object
     * @returns {boolean} True if subscription is paid
     */
    isPaidSubscription(subscription) {
        if (!subscription) {
            return false;
        }
        // Check subscription_type first (most reliable)
        if (subscription.subscription_type === 'paid') {
            return true;
        }
        // Fallback: if subscription_type is 'trial', it's not paid
        if (subscription.subscription_type === 'trial') {
            return false;
        }
        // Legacy check: if has Stripe payment info, it's paid
        if (subscription.stripe_customer_id || subscription.stripe_subscription_id || subscription.last_payment_date) {
            return true;
        }
        return false;
    },
    
    /**
     * Get subscription type description for display
     * @param {Object} subscription - Subscription object
     * @returns {string} Description of subscription type ('Trial' or 'Paid')
     */
    getSubscriptionTypeDescription(subscription) {
        if (this.isPaidSubscription(subscription)) {
            return 'Paid';
        }
        if (this.isTrialSubscription(subscription)) {
            return 'Trial';
        }
        return 'Unknown';
    }
};

if (typeof window !== 'undefined') {
    window.SubscriptionService = SubscriptionService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubscriptionService;
}

