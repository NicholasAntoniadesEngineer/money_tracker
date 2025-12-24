/**
 * Subscription Checker Utility
 * Provides functions to check subscription status and access
 */

const SubscriptionChecker = {
    /**
     * Check if user has active access (trial or paid subscription)
     * @returns {Promise<{hasAccess: boolean, status: string, details: Object|null, error: string|null}>}
     */
    async checkAccess() {
        try {
            if (!window.SubscriptionService) {
                throw new Error('SubscriptionService not available');
            }
            
            const subscriptionResult = await window.SubscriptionService.getCurrentUserSubscription();
            
            if (!subscriptionResult.success) {
                return {
                    hasAccess: false,
                    status: 'no_subscription',
                    details: null,
                    error: subscriptionResult.error || 'Failed to check subscription'
                };
            }
            
            const subscription = subscriptionResult.subscription;
            
            if (!subscription) {
                return {
                    hasAccess: false,
                    status: 'no_subscription',
                    details: null,
                    error: null
                };
            }
            
            const isActive = window.SubscriptionService.isSubscriptionActive(subscription);
            
            if (isActive) {
                if (subscription.status === 'trial') {
                    const daysRemaining = window.SubscriptionService.getTrialDaysRemaining(subscription);
                    return {
                        hasAccess: true,
                        status: 'trial',
                        details: {
                            subscription: subscription,
                            daysRemaining: daysRemaining
                        },
                        error: null
                    };
                } else if (subscription.status === 'active') {
                    return {
                        hasAccess: true,
                        status: 'active',
                        details: {
                            subscription: subscription
                        },
                        error: null
                    };
                }
            }
            
            // Check if trial expired
            if (subscription.status === 'trial' && window.SubscriptionService.isTrialExpired(subscription)) {
                return {
                    hasAccess: false,
                    status: 'trial_expired',
                    details: {
                        subscription: subscription
                    },
                    error: null
                };
            }
            
            return {
                hasAccess: false,
                status: subscription.status || 'expired',
                details: {
                    subscription: subscription
                },
                error: null
            };
        } catch (error) {
            console.error('[SubscriptionChecker] Exception checking access:', error);
            return {
                hasAccess: false,
                status: 'error',
                details: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },
    
    /**
     * Get subscription status message for display
     * @param {Object} accessCheckResult - Result from checkAccess()
     * @returns {string} Human-readable status message
     */
    getStatusMessage(accessCheckResult) {
        if (!accessCheckResult) {
            return 'Unable to determine subscription status';
        }
        
        switch (accessCheckResult.status) {
            case 'trial':
                const daysRemaining = accessCheckResult.details?.daysRemaining;
                if (daysRemaining !== null && daysRemaining !== undefined) {
                    if (daysRemaining === 0) {
                        return 'Your trial has expired. Please subscribe to continue.';
                    }
                    return `You have ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining in your trial.`;
                }
                return 'You are currently on a trial.';
                
            case 'active':
                return 'Your subscription is active.';
                
            case 'trial_expired':
                return 'Your trial has expired. Please subscribe to continue using the application.';
                
            case 'expired':
                return 'Your subscription has expired. Please renew to continue.';
                
            case 'cancelled':
                return 'Your subscription has been cancelled.';
                
            case 'no_subscription':
                return 'No subscription found. Please subscribe to access the application.';
                
            case 'error':
                return `Error checking subscription: ${accessCheckResult.error || 'Unknown error'}`;
                
            default:
                return 'Unknown subscription status.';
        }
    }
};

if (typeof window !== 'undefined') {
    window.SubscriptionChecker = SubscriptionChecker;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SubscriptionChecker;
}

