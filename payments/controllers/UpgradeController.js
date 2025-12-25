/**
 * Upgrade Controller
 * Handles subscription upgrade/downgrade page logic
 * VERSION: 2.0.0-with-session-wait
 * LAST_UPDATED: 2025-12-25T18:53:00Z
 */

// Log immediately when file loads to verify latest code
const BUILD_ID = Date.now();
const FILE_LOAD_TIME = new Date().toISOString();
console.log('═══════════════════════════════════════════════════════════════');
console.log('[UpgradeController] ═════ FILE LOADED ═════');
console.log('[UpgradeController] VERSION: 2.0.0-with-session-wait');
console.log('[UpgradeController] LAST_UPDATED: 2025-12-25T18:53:00Z');
console.log('[UpgradeController] BUILD_ID:', BUILD_ID);
console.log('[UpgradeController] File loaded at:', FILE_LOAD_TIME);
console.log('[UpgradeController] ✅✅✅ NEW CODE WITH SESSION POLLING LOADED ✅✅✅');
console.log('[UpgradeController] If you see this message, the latest code is running!');
console.log('[UpgradeController] Look for "SESSION WAIT STARTED (NEW CODE PATH)" in logs');
console.log('═══════════════════════════════════════════════════════════════');

const UpgradeController = {
    VERSION: '2.0.0-with-session-wait',
    LAST_UPDATED: '2025-12-25T18:53:00Z',
    currentSubscription: null,
    availablePlans: [],
    currentPlan: null,
    
    /**
     * Initialize the upgrade page
     */
    async init() {
        console.log('[UpgradeController] ========== INIT STARTED ==========');
        console.log('[UpgradeController] VERSION:', this.VERSION);
        console.log('[UpgradeController] LAST_UPDATED:', this.LAST_UPDATED);
        console.log('[UpgradeController] Code loaded at:', new Date().toISOString());
        console.log('[UpgradeController] File location:', window.location.href);
        
        try {
            // Check for success/cancel redirects
            const urlParams = new URLSearchParams(window.location.search);
            const upgradeStatus = urlParams.get('upgrade');
            const planId = urlParams.get('plan');
            
            if (upgradeStatus === 'success') {
                console.log('[UpgradeController] Upgrade successful, plan:', planId);
                alert(`Subscription upgrade successful! Your new plan will be active on your next billing cycle.`);
                // Remove query params
                window.history.replaceState({}, document.title, window.location.pathname);
            } else if (upgradeStatus === 'cancelled') {
                console.log('[UpgradeController] Upgrade cancelled');
                alert('Subscription upgrade was cancelled.');
                // Remove query params
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            
            // Wait for SupabaseConfig to be available
            console.log('[UpgradeController] Waiting for SupabaseConfig...');
            let waitCount = 0;
            const maxWait = 50; // Wait up to 5 seconds (50 * 100ms)
            while (!window.SupabaseConfig && waitCount < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            
            if (!window.SupabaseConfig) {
                console.error('[UpgradeController] SupabaseConfig not available after waiting');
                this.showError('Configuration not available. Please refresh the page.');
                return;
            }
            
            // Wait for AuthService to be available and initialized
            console.log('[UpgradeController] Waiting for AuthService...');
            waitCount = 0;
            while (!window.AuthService && waitCount < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            
            if (!window.AuthService) {
                console.error('[UpgradeController] AuthService not available after waiting');
                this.showError('Authentication service not available. Please refresh the page.');
                return;
            }
            
            // Initialize AuthService if needed
            if (!window.AuthService.client) {
                console.log('[UpgradeController] AuthService client not initialized, initializing...');
                try {
                    await window.AuthService.initialize();
                    console.log('[UpgradeController] AuthService initialized');
                } catch (initError) {
                    console.error('[UpgradeController] Failed to initialize AuthService:', initError);
                    this.showError('Failed to initialize authentication. Please refresh the page.');
                    return;
                }
            }
            
            // Wait for session check to complete - poll until session is loaded or timeout
            console.log('[UpgradeController] ========== SESSION WAIT STARTED (NEW CODE PATH) ==========');
            console.log('[UpgradeController] This is the NEW code with session polling - VERSION:', this.VERSION);
            console.log('[UpgradeController] Waiting for session check to complete...');
            let sessionCheckWaitCount = 0;
            const maxSessionWait = 30; // Wait up to 3 seconds (30 * 100ms)
            console.log('[UpgradeController] Max session wait configured:', maxSessionWait, 'iterations (3 seconds)');
            
            // Check if session is loaded by checking both isAuthenticated() and direct state
            while (sessionCheckWaitCount < maxSessionWait) {
                const isAuthenticated = window.AuthService.isAuthenticated();
                const hasDirectSession = window.AuthService.currentUser !== null && window.AuthService.session !== null;
                const hasClient = !!window.AuthService.client;
                
                console.log('[UpgradeController] Session check attempt', sessionCheckWaitCount + 1, '/', maxSessionWait, ':', {
                    isAuthenticated: isAuthenticated,
                    hasDirectSession: hasDirectSession,
                    hasClient: hasClient,
                    hasCurrentUser: !!window.AuthService.currentUser,
                    hasSession: !!window.AuthService.session,
                    currentUserEmail: window.AuthService.currentUser?.email
                });
                
                // If we have authentication (either method), break
                if (isAuthenticated || hasDirectSession) {
                    console.log('[UpgradeController] ✅ Session found on attempt', sessionCheckWaitCount + 1, '- authentication confirmed');
                    console.log('[UpgradeController] Session detection method:', isAuthenticated ? 'isAuthenticated()' : 'direct state check');
                    break;
                }
                
                // If client exists but no session yet, wait a bit more
                if (hasClient) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    sessionCheckWaitCount++;
                } else {
                    // Client not ready yet, wait longer
                    await new Promise(resolve => setTimeout(resolve, 200));
                    sessionCheckWaitCount += 2;
                }
            }
            
            console.log('[UpgradeController] Session polling completed after', sessionCheckWaitCount, 'iterations');
            
            // Final authentication check
            const isAuthenticated = window.AuthService.isAuthenticated();
            const hasDirectSession = window.AuthService.currentUser !== null && window.AuthService.session !== null;
            const finalAuthCheck = isAuthenticated || hasDirectSession;
            
            console.log('[UpgradeController] ========== FINAL AUTHENTICATION CHECK ==========');
            console.log('[UpgradeController] Final authentication check results:', {
                isAuthenticated: isAuthenticated,
                hasDirectSession: hasDirectSession,
                finalAuthCheck: finalAuthCheck,
                hasCurrentUser: !!window.AuthService.currentUser,
                userEmail: window.AuthService.currentUser?.email,
                hasSession: !!window.AuthService.session
            });
            
            if (!finalAuthCheck) {
                console.warn('[UpgradeController] ❌ User not authenticated after waiting', sessionCheckWaitCount, 'iterations');
                console.warn('[UpgradeController] Redirecting to auth page...');
                const baseUrl = window.location.origin;
                const currentPath = window.location.pathname;
                const basePath = currentPath.includes('/payments/') ? '../../../' : '';
                const authUrl = `${baseUrl}/${basePath}ui/views/auth.html`;
                console.warn('[UpgradeController] Auth URL:', authUrl);
                window.location.href = authUrl;
                return;
            }
            
            console.log('[UpgradeController] ✅ User authenticated successfully, proceeding with upgrade page initialization...');
            console.log('[UpgradeController] Authenticated user:', window.AuthService.currentUser?.email);
            
            // Load current subscription and available plans
            await Promise.all([
                this.loadCurrentSubscription(),
                this.loadAvailablePlans()
            ]);
            
            // Render plans
            this.renderPlans();
            
            console.log('[UpgradeController] ========== INIT COMPLETE ==========');
        } catch (error) {
            console.error('[UpgradeController] Error initializing:', error);
            this.showError('Failed to load subscription information. Please try again.');
        }
    },
    
    /**
     * Load current user subscription
     */
    async loadCurrentSubscription() {
        console.log('[UpgradeController] Loading current subscription...');
        
        try {
            if (!window.SubscriptionService) {
                throw new Error('SubscriptionService not available');
            }
            
            const result = await window.SubscriptionService.getCurrentUserSubscription();
            
            if (result.success && result.subscription) {
                this.currentSubscription = result.subscription;
                this.currentPlan = result.plan;
                console.log('[UpgradeController] Current subscription loaded:', {
                    planId: this.currentSubscription.plan_id,
                    planName: this.currentPlan?.plan_name,
                    subscriptionType: this.currentSubscription.subscription_type,
                    status: this.currentSubscription.status
                });
            } else {
                console.warn('[UpgradeController] No subscription found');
                this.currentSubscription = null;
                this.currentPlan = null;
            }
        } catch (error) {
            console.error('[UpgradeController] Error loading subscription:', error);
            this.currentSubscription = null;
            this.currentPlan = null;
        }
    },
    
    /**
     * Load all available subscription plans
     */
    async loadAvailablePlans() {
        console.log('[UpgradeController] Loading available plans...');
        
        try {
            if (!window.DatabaseService) {
                throw new Error('DatabaseService not available');
            }
            
            const result = await window.DatabaseService.querySelect('subscription_plans', {
                filter: { is_active: true },
                order: [{ column: 'price_amount', ascending: true }]
            });
            
            if (result.error) {
                throw new Error(result.error.message || 'Failed to load plans');
            }
            
            this.availablePlans = result.data || [];
            console.log('[UpgradeController] Available plans loaded:', this.availablePlans.length);
        } catch (error) {
            console.error('[UpgradeController] Error loading plans:', error);
            throw error;
        }
    },
    
    /**
     * Render subscription plans
     */
    renderPlans() {
        console.log('[UpgradeController] ========== renderPlans() CALLED ==========');
        
        const container = document.getElementById('plans-container');
        const loadingMessage = document.getElementById('loading-message');
        const errorMessage = document.getElementById('error-message');
        
        if (!container) {
            console.error('[UpgradeController] Plans container not found');
            return;
        }
        
        // Hide loading/error messages
        if (loadingMessage) loadingMessage.style.display = 'none';
        if (errorMessage) errorMessage.style.display = 'none';
        
        if (this.availablePlans.length === 0) {
            console.warn('[UpgradeController] No plans available');
            if (errorMessage) {
                errorMessage.style.display = 'block';
                errorMessage.textContent = 'No subscription plans available.';
            }
            return;
        }
        
        container.innerHTML = '';
        
        const currentPlanId = this.currentSubscription?.plan_id;
        
        this.availablePlans.forEach((plan, index) => {
            const isCurrentPlan = currentPlanId === plan.id;
            const isRecommended = index === this.availablePlans.length - 1; // Last plan (highest tier) is recommended
            
            const planCard = document.createElement('div');
            planCard.className = `plan-card ${isCurrentPlan ? 'current' : ''} ${isRecommended ? 'recommended' : ''}`;
            
            const priceInCents = Math.round(plan.price_amount * 100);
            const priceFormatted = plan.price_amount.toFixed(2);
            const currency = plan.price_currency.toUpperCase();
            
            planCard.innerHTML = `
                <div class="plan-header">
                    <div class="plan-name">
                        ${plan.plan_name}
                        ${isCurrentPlan ? '<span class="current-plan-badge">Current</span>' : ''}
                    </div>
                    <div class="plan-price">
                        €${priceFormatted}
                        <span class="plan-price-period">/${plan.billing_interval}</span>
                    </div>
                </div>
                <div class="plan-description">
                    ${plan.plan_description || 'Access to Money Tracker application'}
                </div>
                <ul class="plan-features">
                    <li>Full access to all features</li>
                    <li>Monthly budget tracking</li>
                    <li>Savings pots management</li>
                    ${plan.price_amount >= 10 ? '<li>Priority support</li><li>Advanced analytics</li>' : ''}
                </ul>
                <div class="plan-actions">
                    ${isCurrentPlan ? 
                        `<div class="plan-status current">You are currently on this plan</div>` :
                        `<button class="btn btn-action upgrade-btn" data-plan-id="${plan.id}" data-plan-name="${plan.plan_name}" data-price-amount="${priceInCents}">
                            ${currentPlanId && plan.price_amount > (this.currentPlan?.price_amount || 0) ? 'Upgrade' : 
                              currentPlanId && plan.price_amount < (this.currentPlan?.price_amount || 0) ? 'Downgrade' : 
                              'Subscribe'}
                        </button>`
                    }
                </div>
            `;
            
            container.appendChild(planCard);
        });
        
        // Attach event listeners
        this.setupEventListeners();
        
        console.log('[UpgradeController] Plans rendered:', this.availablePlans.length);
    },
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const upgradeButtons = document.querySelectorAll('.upgrade-btn');
        upgradeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const planId = parseInt(button.dataset.planId);
                const planName = button.dataset.planName;
                const priceAmount = parseInt(button.dataset.priceAmount);
                this.handleUpgrade(planId, planName, priceAmount);
            });
        });
    },
    
    /**
     * Handle subscription upgrade/downgrade
     */
    async handleUpgrade(planId, planName, priceAmount) {
        console.log('[UpgradeController] ========== handleUpgrade() STARTED ==========');
        console.log('[UpgradeController] Upgrade details:', { planId, planName, priceAmount });
        
        try {
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                throw new Error('User not authenticated');
            }
            
            const currentUser = window.AuthService.getCurrentUser();
            if (!currentUser || !currentUser.email) {
                throw new Error('User email not available');
            }
            
            if (!window.StripeService) {
                throw new Error('StripeService not available');
            }
            
            await window.StripeService.initialize();
            
            const currentUrl = window.location.href.split('?')[0];
            const successUrl = `${currentUrl}?upgrade=success&plan=${planId}`;
            const cancelUrl = `${currentUrl}?upgrade=cancelled`;
            
            console.log('[UpgradeController] Creating checkout session for upgrade...');
            
            const supabaseProjectUrl = 'https://ofutzrxfbrgtbkyafndv.supabase.co';
            const backendEndpoint = `${supabaseProjectUrl}/functions/v1/create-checkout-session`;
            
            const result = await window.StripeService.createCheckoutSession(
                currentUser.email,
                currentUser.id,
                successUrl,
                cancelUrl,
                backendEndpoint,
                planId,
                priceAmount
            );
            
            if (!result.success) {
                throw new Error(result.error || 'Failed to create checkout session');
            }
            
            if (result.sessionId) {
                // Store customer ID if returned
                if (result.customerId && window.SubscriptionService) {
                    window.SubscriptionService.updateSubscription(currentUser.id, {
                        stripe_customer_id: result.customerId
                    }).catch(err => {
                        console.warn('[UpgradeController] Failed to store customer ID:', err);
                    });
                }
                
                console.log('[UpgradeController] Redirecting to Stripe Checkout...');
                const redirectResult = await window.StripeService.redirectToCheckout(result.sessionId);
                if (!redirectResult.success) {
                    throw new Error(redirectResult.error || 'Failed to redirect to checkout');
                }
            } else {
                throw new Error('Checkout session requires backend implementation.');
            }
        } catch (error) {
            console.error('[UpgradeController] Error upgrading subscription:', error);
            alert(`Error: ${error.message || 'Failed to upgrade subscription. Please try again.'}`);
        }
    },
    
    /**
     * Show error message
     */
    showError(message) {
        const errorMessage = document.getElementById('error-message');
        const loadingMessage = document.getElementById('loading-message');
        
        if (loadingMessage) loadingMessage.style.display = 'none';
        if (errorMessage) {
            errorMessage.style.display = 'block';
            errorMessage.textContent = message;
        }
    }
};

if (typeof window !== 'undefined') {
    window.UpgradeController = UpgradeController;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UpgradeController;
}

