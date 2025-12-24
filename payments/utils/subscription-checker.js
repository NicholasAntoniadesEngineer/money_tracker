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
        const methodStartTime = Date.now();
        console.log('[SubscriptionChecker] ========== checkAccess() CALLED ==========');
        console.log('[SubscriptionChecker] checkAccess - call stack:', new Error().stack?.split('\n').slice(1, 6).join('\n'));
        
        try {
            if (!window.SubscriptionService) {
                const error = new Error('SubscriptionService not available');
                console.error('[SubscriptionChecker] ❌ checkAccess error:', error);
                return {
                    hasAccess: false,
                    status: 'error',
                    details: null,
                    error: error.message
                };
            }
            
            console.log('[SubscriptionChecker] checkAccess - calling SubscriptionService.getCurrentUserSubscription()...');
            const subscriptionResult = await window.SubscriptionService.getCurrentUserSubscription();
            console.log('[SubscriptionChecker] checkAccess - subscriptionResult:', {
                success: subscriptionResult.success,
                hasSubscription: !!subscriptionResult.subscription,
                hasPlan: !!subscriptionResult.plan,
                subscriptionStatus: subscriptionResult.subscription?.status,
                hasError: !!subscriptionResult.error,
                errorMessage: subscriptionResult.error
            });
            
            if (!subscriptionResult.success) {
                console.log('[SubscriptionChecker] ⚠️ checkAccess - subscriptionResult not successful');
                console.log('[SubscriptionChecker] checkAccess - error:', subscriptionResult.error);
                const result = {
                    hasAccess: false,
                    status: 'no_subscription',
                    details: null,
                    error: subscriptionResult.error || 'Failed to check subscription'
                };
                console.log('[SubscriptionChecker] checkAccess - returning:', result);
                return result;
            }
            
            const subscription = subscriptionResult.subscription;
            console.log('[SubscriptionChecker] checkAccess - subscription:', {
                hasSubscription: !!subscription,
                subscriptionStatus: subscription?.status,
                planId: subscription?.plan_id,
                trialStartDate: subscription?.trial_start_date,
                trialEndDate: subscription?.trial_end_date,
                subscriptionStartDate: subscription?.subscription_start_date,
                subscriptionEndDate: subscription?.subscription_end_date
            });
            
            if (!subscription) {
                console.log('[SubscriptionChecker] ⚠️ checkAccess - NO SUBSCRIPTION FOUND');
                console.log('[SubscriptionChecker] checkAccess - User has no subscription record in database');
                console.log('[SubscriptionChecker] checkAccess - Attempting to create trial subscription for existing user...');
                
                // Try to create a trial subscription for this user
                if (window.SubscriptionService && window.DatabaseService) {
                    try {
                        const userId = await window.DatabaseService._getCurrentUserId();
                        if (userId) {
                            console.log('[SubscriptionChecker] checkAccess - Creating trial subscription for user:', userId);
                            const createTrialResult = await window.SubscriptionService.createTrialSubscription(userId);
                            
                            if (createTrialResult.success && createTrialResult.subscription) {
                                console.log('[SubscriptionChecker] ✅ Trial subscription created successfully');
                                console.log('[SubscriptionChecker] checkAccess - New subscription:', {
                                    status: createTrialResult.subscription.status,
                                    trialStartDate: createTrialResult.subscription.trial_start_date,
                                    trialEndDate: createTrialResult.subscription.trial_end_date
                                });
                                
                                // Now check access again with the newly created subscription
                                const newSubscription = createTrialResult.subscription;
                                const isActive = window.SubscriptionService.isSubscriptionActive(newSubscription);
                                
                                if (isActive && newSubscription.status === 'trial') {
                                    const daysRemaining = window.SubscriptionService.getTrialDaysRemaining(newSubscription);
                                    console.log('[SubscriptionChecker] ✅ User now has ACTIVE TRIAL');
                                    console.log('[SubscriptionChecker] checkAccess - daysRemaining:', daysRemaining);
                                    const result = {
                                        hasAccess: true,
                                        status: 'trial',
                                        details: {
                                            subscription: newSubscription,
                                            daysRemaining: daysRemaining
                                        },
                                        error: null
                                    };
                                    console.log('[SubscriptionChecker] checkAccess - returning:', result);
                                    return result;
                                }
                            } else {
                                console.warn('[SubscriptionChecker] ⚠️ Failed to create trial subscription:', createTrialResult.error);
                            }
                        } else {
                            console.warn('[SubscriptionChecker] ⚠️ Could not get user ID to create trial subscription');
                        }
                    } catch (createTrialError) {
                        console.error('[SubscriptionChecker] ❌ Exception creating trial subscription:', createTrialError);
                        console.error('[SubscriptionChecker] createTrialError details:', {
                            message: createTrialError.message,
                            name: createTrialError.name,
                            stack: createTrialError.stack
                        });
                    }
                } else {
                    console.warn('[SubscriptionChecker] ⚠️ SubscriptionService or DatabaseService not available - cannot create trial subscription');
                }
                
                // If we get here, trial creation failed or services unavailable
                const result = {
                    hasAccess: false,
                    status: 'no_subscription',
                    details: null,
                    error: null
                };
                console.log('[SubscriptionChecker] checkAccess - returning (no subscription, trial creation failed or unavailable):', result);
                return result;
            }
            
            console.log('[SubscriptionChecker] checkAccess - checking if subscription is active...');
            const isActive = window.SubscriptionService.isSubscriptionActive(subscription);
            console.log('[SubscriptionChecker] checkAccess - isActive:', isActive);
            
            if (isActive) {
                if (subscription.status === 'trial') {
                    const daysRemaining = window.SubscriptionService.getTrialDaysRemaining(subscription);
                    console.log('[SubscriptionChecker] ✅ checkAccess - User has ACTIVE TRIAL');
                    console.log('[SubscriptionChecker] checkAccess - daysRemaining:', daysRemaining);
                    const result = {
                        hasAccess: true,
                        status: 'trial',
                        details: {
                            subscription: subscription,
                            daysRemaining: daysRemaining
                        },
                        error: null
                    };
                    console.log('[SubscriptionChecker] checkAccess - returning:', result);
                    return result;
                } else if (subscription.status === 'active') {
                    console.log('[SubscriptionChecker] ✅ checkAccess - User has ACTIVE SUBSCRIPTION');
                    const result = {
                        hasAccess: true,
                        status: 'active',
                        details: {
                            subscription: subscription
                        },
                        error: null
                    };
                    console.log('[SubscriptionChecker] checkAccess - returning:', result);
                    return result;
                }
            }
            
            // Check if trial expired
            if (subscription.status === 'trial' && window.SubscriptionService.isTrialExpired(subscription)) {
                console.log('[SubscriptionChecker] ⚠️ checkAccess - TRIAL EXPIRED');
                const result = {
                    hasAccess: false,
                    status: 'trial_expired',
                    details: {
                        subscription: subscription
                    },
                    error: null
                };
                console.log('[SubscriptionChecker] checkAccess - returning:', result);
                return result;
            }
            
            console.log('[SubscriptionChecker] ⚠️ checkAccess - Subscription exists but NOT ACTIVE');
            console.log('[SubscriptionChecker] checkAccess - subscription status:', subscription.status);
            const result = {
                hasAccess: false,
                status: subscription.status || 'expired',
                details: {
                    subscription: subscription
                },
                error: null
            };
            console.log('[SubscriptionChecker] checkAccess - returning:', result);
            const methodElapsed = Date.now() - methodStartTime;
            console.log(`[SubscriptionChecker] checkAccess completed in ${methodElapsed}ms`);
            console.log('[SubscriptionChecker] ========== checkAccess() COMPLETE ==========');
            return result;
        } catch (error) {
            const methodElapsed = Date.now() - methodStartTime;
            console.error(`[SubscriptionChecker] ❌ Exception checking access after ${methodElapsed}ms:`, error);
            console.error('[SubscriptionChecker] checkAccess - error details:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });
            const result = {
                hasAccess: false,
                status: 'error',
                details: null,
                error: error.message || 'An unexpected error occurred'
            };
            console.log('[SubscriptionChecker] checkAccess - returning error result:', result);
            console.log('[SubscriptionChecker] ========== checkAccess() FAILED ==========');
            return result;
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

