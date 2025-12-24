/**
 * Subscription Service
 * Manages subscription lifecycle, trials, and status
 */

const SubscriptionService = {
    /**
     * Create a 30-day trial subscription for a new user
     * @param {string} userId - User ID from Supabase
     * @returns {Promise<{success: boolean, subscription: Object|null, error: string|null}>}
     */
    async createTrialSubscription(userId) {
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }
            
            if (!window.StripeConfig) {
                throw new Error('StripeConfig not available');
            }
            
            console.log('[SubscriptionService] Creating trial subscription for user:', userId);
            
            const trialPeriodDays = window.StripeConfig.getTrialPeriodDays();
            const trialStartDate = new Date();
            const trialEndDate = new Date(trialStartDate);
            trialEndDate.setDate(trialEndDate.getDate() + trialPeriodDays);
            
            const subscriptionData = {
                user_id: userId,
                status: 'trial',
                trial_start_date: trialStartDate.toISOString(),
                trial_end_date: trialEndDate.toISOString(),
                subscription_start_date: null,
                subscription_end_date: null,
                stripe_customer_id: null,
                stripe_subscription_id: null,
                last_payment_date: null
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
     * Get subscription for current user
     * @returns {Promise<{success: boolean, subscription: Object|null, error: string|null}>}
     */
    async getCurrentUserSubscription() {
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }
            
            if (!window.AuthService) {
                throw new Error('AuthService not available');
            }
            
            const userId = await window.DatabaseService._getCurrentUserId();
            if (!userId) {
                return {
                    success: false,
                    subscription: null,
                    error: 'User not authenticated'
                };
            }
            
            const result = await window.DatabaseService.querySelect('subscriptions', {
                filter: { user_id: userId },
                limit: 1
            });
            
            if (result.error) {
                console.error('[SubscriptionService] Error getting subscription:', result.error);
                return {
                    success: false,
                    subscription: null,
                    error: result.error.message || 'Failed to get subscription'
                };
            }
            
            const subscription = result.data && result.data.length > 0 ? result.data[0] : null;
            
            return {
                success: true,
                subscription: subscription,
                error: null
            };
        } catch (error) {
            console.error('[SubscriptionService] Exception getting subscription:', error);
            return {
                success: false,
                subscription: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },
    
    /**
     * Update subscription status
     * @param {string} userId - User ID
     * @param {Object} updateData - Data to update
     * @returns {Promise<{success: boolean, subscription: Object|null, error: string|null}>}
     */
    async updateSubscription(userId, updateData) {
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
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
    }
};

if (typeof window !== 'undefined') {
    window.SubscriptionService = SubscriptionService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubscriptionService;
}

