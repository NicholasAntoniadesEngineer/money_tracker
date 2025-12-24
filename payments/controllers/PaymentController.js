/**
 * Payment Controller
 * Handles the payment/subscription page logic
 */

const PaymentController = {
    currentSubscription: null,
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
        try {
            if (!window.SubscriptionService) {
                throw new Error('SubscriptionService not available');
            }
            
            const result = await window.SubscriptionService.getCurrentUserSubscription();
            
            if (result.success) {
                this.currentSubscription = result.subscription;
                console.log('[PaymentController] Subscription loaded:', this.currentSubscription);
            } else {
                console.error('[PaymentController] Failed to load subscription:', result.error);
                this.currentSubscription = null;
            }
        } catch (error) {
            console.error('[PaymentController] Exception loading subscription:', error);
            this.currentSubscription = null;
        }
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
        const statusContainer = document.getElementById('subscription-status-container');
        const statusMessage = document.getElementById('subscription-status-message');
        const daysRemainingContainer = document.getElementById('trial-days-remaining');
        const startSubscriptionBtn = document.getElementById('start-subscription-button');
        
        if (!statusContainer || !statusMessage) {
            return;
        }
        
        if (!this.currentSubscription) {
            statusMessage.textContent = 'No subscription found. Please subscribe to access the application.';
            if (startSubscriptionBtn) {
                startSubscriptionBtn.style.display = 'block';
            }
            if (daysRemainingContainer) {
                daysRemainingContainer.style.display = 'none';
            }
            return;
        }
        
        const subscription = this.currentSubscription;
        const isActive = window.SubscriptionService.isSubscriptionActive(subscription);
        
        if (subscription.status === 'trial') {
            const daysRemaining = window.SubscriptionService.getTrialDaysRemaining(subscription);
            const isExpired = window.SubscriptionService.isTrialExpired(subscription);
            
            if (isExpired) {
                statusMessage.textContent = 'Your trial has expired. Please subscribe to continue using the application.';
                statusMessage.className = 'subscription-message subscription-message-error';
                if (startSubscriptionBtn) {
                    startSubscriptionBtn.style.display = 'block';
                }
                if (daysRemainingContainer) {
                    daysRemainingContainer.style.display = 'none';
                }
            } else {
                statusMessage.textContent = 'You are currently on a trial.';
                statusMessage.className = 'subscription-message subscription-message-info';
                if (daysRemainingContainer) {
                    daysRemainingContainer.style.display = 'block';
                    daysRemainingContainer.textContent = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
                }
                if (startSubscriptionBtn) {
                    startSubscriptionBtn.style.display = 'none';
                }
            }
        } else if (subscription.status === 'active') {
            statusMessage.textContent = 'Your subscription is active.';
            statusMessage.className = 'subscription-message subscription-message-success';
            if (startSubscriptionBtn) {
                startSubscriptionBtn.style.display = 'none';
            }
            if (daysRemainingContainer) {
                daysRemainingContainer.style.display = 'none';
            }
        } else {
            statusMessage.textContent = `Your subscription status: ${subscription.status}. Please subscribe to continue.`;
            statusMessage.className = 'subscription-message subscription-message-error';
            if (startSubscriptionBtn) {
                startSubscriptionBtn.style.display = 'block';
            }
            if (daysRemainingContainer) {
                daysRemainingContainer.style.display = 'none';
            }
        }
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

