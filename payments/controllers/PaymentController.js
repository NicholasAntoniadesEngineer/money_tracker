/**
 * Payment Controller
 * Handles the payment/subscription page logic
 */

const PaymentController = {
    currentSubscription: null,
    currentPlan: null,
    paymentHistory: [],
    
    /**
     * Initialize the payment page
     */
    async init() {
        console.log('[PaymentController] Initializing payment page...');
        
        await this.loadSubscriptionData();
        await this.loadPaymentHistory();
        this.setupEventListeners();
        this.renderSubscriptionStatus();
        this.renderPaymentHistory();
    },
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const startSubscriptionBtn = document.getElementById('start-subscription-button');
        if (startSubscriptionBtn) {
            startSubscriptionBtn.addEventListener('click', () => this.handleStartSubscription());
        }
        
        const refreshBtn = document.getElementById('refresh-subscription-button');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshSubscriptionData());
        }
    },
    
    /**
     * Load subscription data for current user
     */
    async loadSubscriptionData() {
        const methodStartTime = Date.now();
        console.log('[PaymentController] ========== loadSubscriptionData() CALLED ==========');
        
        try {
            if (!window.SubscriptionService) {
                const error = new Error('SubscriptionService not available');
                console.error('[PaymentController] ❌ loadSubscriptionData error:', error);
                throw error;
            }
            
            console.log('[PaymentController] loadSubscriptionData - calling SubscriptionService.getCurrentUserSubscription()...');
            const result = await window.SubscriptionService.getCurrentUserSubscription();
            const methodElapsed = Date.now() - methodStartTime;
            console.log(`[PaymentController] loadSubscriptionData - getCurrentUserSubscription() completed in ${methodElapsed}ms`);
            
            console.log('[PaymentController] loadSubscriptionData - result:', {
                success: result.success,
                hasSubscription: !!result.subscription,
                subscriptionStatus: result.subscription?.status,
                hasPlan: !!result.plan,
                planName: result.plan?.plan_name,
                hasError: !!result.error,
                errorMessage: result.error
            });
            
            if (result.success) {
                this.currentSubscription = result.subscription;
                this.currentPlan = result.plan;
                if (this.currentSubscription) {
                    console.log('[PaymentController] ✅ Subscription loaded successfully:', {
                        status: this.currentSubscription.status,
                        planId: this.currentSubscription.plan_id,
                        trialStartDate: this.currentSubscription.trial_start_date,
                        trialEndDate: this.currentSubscription.trial_end_date,
                        planName: this.currentPlan?.plan_name
                    });
                } else {
                    console.log('[PaymentController] ⚠️ Subscription query succeeded but returned null subscription');
                    console.log('[PaymentController] This means the user has NO subscription record in the database');
                }
            } else {
                console.error('[PaymentController] ❌ Failed to load subscription:', result.error);
                console.error('[PaymentController] loadSubscriptionData - error details:', {
                    error: result.error,
                    hasSubscription: !!result.subscription,
                    hasPlan: !!result.plan
                });
                this.currentSubscription = null;
                this.currentPlan = null;
            }
        } catch (error) {
            const methodElapsed = Date.now() - methodStartTime;
            console.error(`[PaymentController] ❌ Exception loading subscription after ${methodElapsed}ms:`, error);
            console.error('[PaymentController] loadSubscriptionData - exception details:', {
                message: error.message,
                name: error.name,
                stack: error.stack
            });
            this.currentSubscription = null;
        }
        
        const totalElapsed = Date.now() - methodStartTime;
        console.log(`[PaymentController] loadSubscriptionData completed in ${totalElapsed}ms`);
        console.log('[PaymentController] loadSubscriptionData - final currentSubscription:', {
            hasSubscription: !!this.currentSubscription,
            subscriptionStatus: this.currentSubscription?.status
        });
        console.log('[PaymentController] ========== loadSubscriptionData() COMPLETE ==========');
    },
    
    /**
     * Load payment history for current user
     */
    async loadPaymentHistory() {
        try {
            if (!window.PaymentService) {
                throw new Error('PaymentService not available');
            }
            
            const result = await window.PaymentService.getPaymentHistory(20);
            
            if (result.success) {
                this.paymentHistory = result.payments || [];
                console.log('[PaymentController] Payment history loaded:', this.paymentHistory.length, 'payments');
            } else {
                console.error('[PaymentController] Failed to load payment history:', result.error);
                this.paymentHistory = [];
            }
        } catch (error) {
            console.error('[PaymentController] Exception loading payment history:', error);
            this.paymentHistory = [];
        }
    },
    
    /**
     * Render subscription status
     */
    renderSubscriptionStatus() {
        console.log('[PaymentController] ========== renderSubscriptionStatus() CALLED ==========');
        const statusContainer = document.getElementById('subscription-status-container');
        const statusMessage = document.getElementById('subscription-status-message');
        const subscriptionSection = statusContainer ? statusContainer.closest('.subscription-section') : null;
        const subscriptionHeading = subscriptionSection ? subscriptionSection.querySelector('h2.section-title') : null;
        const startSubscriptionBtn = document.getElementById('start-subscription-button');
        const statusDiv = document.getElementById('subscription-status');
        const subscriptionDetailsContainer = document.getElementById('subscription-details');
        const subscriptionDetailsContent = document.getElementById('subscription-details-content');
        
        if (!statusContainer || !statusMessage) {
            return;
        }
        
        if (!this.currentSubscription) {
            statusMessage.textContent = 'No subscription found. Please subscribe to access the application.';
            statusMessage.className = 'subscription-message subscription-message-error';
            statusMessage.style.backgroundColor = 'rgba(181, 138, 138, 0.2)';
            statusMessage.style.border = 'var(--border-width-standard) solid var(--danger-color)';
            if (startSubscriptionBtn) {
                startSubscriptionBtn.style.display = 'block';
            }
            if (subscriptionDetailsContainer) {
                subscriptionDetailsContainer.style.display = 'none';
            }
            return;
        }
        
        const subscription = this.currentSubscription;
        const plan = this.currentPlan;
        
        const planName = plan ? (plan.plan_name || 'Standard') : 'Standard';
        
        if (subscriptionHeading) {
            subscriptionHeading.textContent = 'Subscription';
        }
        
        let statusText = '';
        let statusClass = '';
        let statusBgColor = '';
        let statusBorderColor = '';
        
        if (subscription.status === 'trial') {
            const daysRemaining = window.SubscriptionService.getTrialDaysRemaining(subscription);
            const isExpired = window.SubscriptionService.isTrialExpired(subscription);
            
            if (isExpired) {
                statusText = 'Your trial has expired. Please subscribe to continue using the application.';
                statusClass = 'subscription-message-error';
                statusBgColor = 'rgba(181, 138, 138, 0.2)';
                statusBorderColor = 'var(--danger-color)';
                if (startSubscriptionBtn) {
                    startSubscriptionBtn.style.display = 'block';
                }
            } else {
                // Hide status message when subscription details are shown (details table has all info)
                statusText = '';
                statusClass = '';
                statusBgColor = 'transparent';
                statusBorderColor = 'transparent';
                if (startSubscriptionBtn) {
                    startSubscriptionBtn.style.display = 'none';
                }
            }
        } else if (subscription.status === 'active') {
            const daysRemaining = window.SubscriptionService.getSubscriptionDaysRemaining(subscription);
            
            if (daysRemaining !== null && daysRemaining !== undefined) {
                if (daysRemaining === 0) {
                    statusText = `Your ${planName} subscription has expired. Please renew to continue.`;
                    statusClass = 'subscription-message-error';
                    statusBgColor = 'rgba(181, 138, 138, 0.2)';
                    statusBorderColor = 'var(--danger-color)';
                    if (startSubscriptionBtn) {
                        startSubscriptionBtn.style.display = 'block';
                    }
                } else {
                    // Hide status message when subscription details are shown (details table has all info)
                    statusText = '';
                    statusClass = '';
                    statusBgColor = 'transparent';
                    statusBorderColor = 'transparent';
                }
            } else {
                // Hide status message when subscription details are shown (details table has all info)
                statusText = '';
                statusClass = '';
                statusBgColor = 'transparent';
                statusBorderColor = 'transparent';
            }
            
            if (startSubscriptionBtn) {
                startSubscriptionBtn.style.display = 'none';
            }
        } else {
            statusText = `Your subscription status: ${subscription.status}. Please subscribe to continue.`;
            statusClass = 'subscription-message-error';
            statusBgColor = 'rgba(181, 138, 138, 0.2)';
            statusBorderColor = 'var(--danger-color)';
            if (startSubscriptionBtn) {
                startSubscriptionBtn.style.display = 'block';
            }
        }
        
        // Only show status message if there's actual text (hide when details table shows all info)
        if (statusText) {
            statusMessage.textContent = statusText;
            statusMessage.className = `subscription-message ${statusClass}`;
            statusMessage.style.backgroundColor = statusBgColor;
            statusMessage.style.border = `var(--border-width-standard) solid ${statusBorderColor}`;
            statusMessage.style.display = 'block';
        } else {
            // Hide status message when subscription details table is shown
            statusMessage.style.display = 'none';
        }
        
        if (subscriptionDetailsContainer && subscriptionDetailsContent) {
            const detailsHtml = [];
            
            // Subscription Type (always show - clearly distinguishes trial vs paid)
            const subscriptionType = window.SubscriptionService ? window.SubscriptionService.getSubscriptionTypeDescription(subscription) : (subscription.subscription_type ? subscription.subscription_type.charAt(0).toUpperCase() + subscription.subscription_type.slice(1) : 'Unknown');
            detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Type:</strong><span>${subscriptionType}</span></div>`);
            
            // Days Remaining (calculate and show)
            let daysRemaining = null;
            if (subscription.status === 'trial') {
                daysRemaining = window.SubscriptionService.getTrialDaysRemaining(subscription);
            } else if (subscription.status === 'active') {
                daysRemaining = window.SubscriptionService.getSubscriptionDaysRemaining(subscription);
            }
            
            if (daysRemaining !== null && daysRemaining !== undefined) {
                const daysText = daysRemaining === 0 ? 'Expired' : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
                detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Days Remaining:</strong><span>${daysText}</span></div>`);
            }
            
            // Subscription Start (show if available - prefer subscription_start_date, fallback to trial_start_date)
            const subscriptionStartDate = subscription.subscription_start_date || subscription.trial_start_date;
            if (subscriptionStartDate) {
                detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Subscription Start:</strong><span>${this.formatDate(subscriptionStartDate)}</span></div>`);
            }
            
            // Subscription End (show if available - prefer subscription_end_date, fallback to trial_end_date)
            const subscriptionEndDate = subscription.subscription_end_date || subscription.trial_end_date;
            if (subscriptionEndDate) {
                detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Subscription End:</strong><span>${this.formatDate(subscriptionEndDate)}</span></div>`);
            }
            
            // Always show the details box if we have a subscription
            if (detailsHtml.length > 0) {
                subscriptionDetailsContent.innerHTML = detailsHtml.join('');
                subscriptionDetailsContainer.style.display = 'block';
            } else {
                subscriptionDetailsContainer.style.display = 'none';
            }
        }
        
        // Display Account Created date in separate section outside the details box
        const accountCreatedContainer = document.getElementById('account-created-container');
        const accountCreatedDate = document.getElementById('account-created-date');
        if (accountCreatedContainer && accountCreatedDate) {
            // Get user account created date from AuthService (Supabase auth.users table)
            const currentUser = window.AuthService ? window.AuthService.getCurrentUser() : null;
            if (currentUser && currentUser.created_at) {
                accountCreatedDate.textContent = this.formatDate(currentUser.created_at);
                accountCreatedContainer.style.display = 'block';
            } else {
                // Fallback: try to get from session if currentUser doesn't have it
                const session = window.AuthService ? window.AuthService.getSession() : null;
                if (session && session.user && session.user.created_at) {
                    accountCreatedDate.textContent = this.formatDate(session.user.created_at);
                    accountCreatedContainer.style.display = 'block';
                } else {
                    accountCreatedContainer.style.display = 'none';
                }
            }
        }
    },
    
    /**
     * Format date for display
     */
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    },
    
    /**
     * Render payment history
     */
    renderPaymentHistory() {
        const historyContainer = document.getElementById('payment-history-container');
        const historyTableBody = document.getElementById('payment-history-tbody');
        
        if (!historyContainer || !historyTableBody) {
            return;
        }
        
        if (!this.paymentHistory || this.paymentHistory.length === 0) {
            historyTableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No payment history available</td></tr>';
            return;
        }
        
        historyTableBody.innerHTML = '';
        
        this.paymentHistory.forEach(payment => {
            const row = document.createElement('tr');
            
            const date = new Date(payment.payment_date);
            const formattedDate = date.toLocaleDateString('en-GB', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
            
            const amount = (payment.amount / 100).toFixed(2);
            const currency = payment.currency.toUpperCase();
            
            let statusClass = 'payment-status-pending';
            if (payment.status === 'succeeded') {
                statusClass = 'payment-status-success';
            } else if (payment.status === 'failed') {
                statusClass = 'payment-status-error';
            }
            
            row.innerHTML = `
                <td>${formattedDate}</td>
                <td>${amount} ${currency}</td>
                <td><span class="${statusClass}">${payment.status}</span></td>
                <td>${payment.stripe_payment_intent_id || 'N/A'}</td>
            `;
            
            historyTableBody.appendChild(row);
        });
    },
    
    /**
     * Handle start subscription button click
     */
    async handleStartSubscription() {
        try {
            const button = document.getElementById('start-subscription-button');
            if (button) {
                button.disabled = true;
                button.textContent = 'Processing...';
            }
            
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                throw new Error('User not authenticated');
            }
            
            const currentUser = window.AuthService.getCurrentUser();
            if (!currentUser || !currentUser.email) {
                throw new Error('User email not available');
            }
            
            const currentUrl = window.location.href.split('?')[0];
            const successUrl = `${currentUrl}?payment=success`;
            const cancelUrl = `${currentUrl}?payment=cancelled`;
            
            console.log('[PaymentController] Creating checkout session...');
            
            if (!window.StripeService) {
                throw new Error('StripeService not available');
            }
            
            await window.StripeService.initialize();
            
            // Supabase Edge Function endpoint for creating checkout sessions
            // INSTRUCTIONS: See payments/backend/UPDATE_PAYMENT_CONTROLLER.md
            // Replace 'ofutzrxfbrgtbkyafndv' with your actual Supabase project reference ID if different
            const supabaseProjectUrl = 'https://ofutzrxfbrgtbkyafndv.supabase.co';
            const backendEndpoint = `${supabaseProjectUrl}/functions/v1/create-checkout-session`;
            
            const result = await window.StripeService.createCheckoutSession(
                currentUser.email,
                currentUser.id,
                successUrl,
                cancelUrl,
                backendEndpoint
            );
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to create checkout session');
            }
            
            if (result.sessionId) {
                const redirectResult = await window.StripeService.redirectToCheckout(result.sessionId);
                if (!redirectResult.success) {
                    throw new Error(redirectResult.error || 'Failed to redirect to checkout');
                }
            } else {
                throw new Error('Checkout session requires backend implementation. Please set up a server endpoint to create Stripe checkout sessions.');
            }
        } catch (error) {
            console.error('[PaymentController] Error starting subscription:', error);
            alert(`Error: ${error.message || 'Failed to start subscription. Please try again.'}`);
            
            const button = document.getElementById('start-subscription-button');
            if (button) {
                button.disabled = false;
                button.textContent = 'Start Subscription';
            }
        }
    },
    
    /**
     * Refresh subscription data
     */
    async refreshSubscriptionData() {
        await this.loadSubscriptionData();
        await this.loadPaymentHistory();
        this.renderSubscriptionStatus();
        this.renderPaymentHistory();
    }
};

if (typeof window !== 'undefined') {
    window.PaymentController = PaymentController;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaymentController;
}

