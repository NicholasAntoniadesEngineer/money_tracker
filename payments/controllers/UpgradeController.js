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
console.log('[UpgradeController] BUILD_ID:', BUILD_ID);
console.log('[UpgradeController] File loaded at:', FILE_LOAD_TIME);
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
            // Check for success/cancel redirects (store for later processing after auth)
            const urlParams = new URLSearchParams(window.location.search);
            const upgradeStatus = urlParams.get('upgrade');
            const planId = urlParams.get('plan');
            let shouldHandleUpgradeSuccess = false;
            
            if (upgradeStatus === 'success') {
                console.log('[UpgradeController] Upgrade successful, plan:', planId);
                shouldHandleUpgradeSuccess = true;
                // Will handle after authentication is confirmed
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
            
            // Handle upgrade success if needed (after authentication is confirmed)
            if (shouldHandleUpgradeSuccess && planId) {
                console.log('[UpgradeController] Authentication confirmed, now handling upgrade success...');
                await this.handleUpgradeSuccess(planId);
            }
            
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
                
                // Display subscription details
                this.displayCurrentSubscription();
            } else {
                console.warn('[UpgradeController] No subscription found');
                this.currentSubscription = null;
                this.currentPlan = null;
                this.hideCurrentSubscription();
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
            const priceFormatted = plan.price_amount === 0 ? '0' : plan.price_amount.toFixed(2);
            const currency = plan.price_currency.toUpperCase();
            
            // Determine button text based on upgrade/downgrade direction
            let buttonText = 'Subscribe';
            if (currentPlanId && this.currentPlan) {
                const currentPrice = this.currentPlan.price_amount || 0;
                const newPrice = plan.price_amount || 0;
                if (newPrice > currentPrice) {
                    buttonText = 'Upgrade';
                } else if (newPrice < currentPrice) {
                    buttonText = 'Downgrade';
                } else {
                    buttonText = 'Current Plan';
                }
            } else if (currentPlanId && !this.currentPlan) {
                // If we have a current plan ID but no plan details, check subscription
                const currentPrice = this.currentSubscription?.plan?.price_amount || 0;
                const newPrice = plan.price_amount || 0;
                if (newPrice > currentPrice) {
                    buttonText = 'Upgrade';
                } else if (newPrice < currentPrice) {
                    buttonText = 'Downgrade';
                }
            }
            
            planCard.innerHTML = `
                <div class="plan-header">
                    <div class="plan-name">
                        ${plan.plan_name}
                        ${isCurrentPlan ? '<span class="current-plan-badge">Current</span>' : ''}
                    </div>
                    <div class="plan-price">
                        ${plan.price_amount === 0 ? 'Free' : `€${priceFormatted}`}
                        ${plan.price_amount > 0 ? `<span class="plan-price-period">/${plan.billing_interval}</span>` : ''}
                    </div>
                </div>
                <div class="plan-description">
                    ${plan.plan_description || 'Access to Money Tracker application'}
                </div>
                <ul class="plan-features">
                    <li>Full access to all features</li>
                    <li>Monthly budget tracking</li>
                    <li>Savings pots management</li>
                    ${plan.price_amount >= 5 ? '<li>Priority support</li><li>Advanced analytics</li>' : ''}
                </ul>
                <div class="plan-actions">
                    ${isCurrentPlan ? 
                        `<div class="plan-status current">You are currently on this plan</div>` :
                        `<button class="btn btn-action upgrade-btn" data-plan-id="${plan.id}" data-plan-name="${plan.plan_name}" data-price-amount="${priceInCents}">
                            ${buttonText}
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
        
        // Update Payment Method button
        const updatePaymentBtn = document.getElementById('update-payment-button');
        if (updatePaymentBtn) {
            updatePaymentBtn.addEventListener('click', () => this.handleUpdatePayment());
        }
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
            
            // Determine if this is an upgrade or downgrade
            const currentPlan = this.currentPlan;
            const currentPlanPrice = currentPlan ? (currentPlan.price_amount * 100) : 0; // Convert to cents
            const isUpgrade = !currentPlan || priceAmount > currentPlanPrice;
            const isDowngrade = currentPlan && priceAmount < currentPlanPrice;
            const isSamePlan = currentPlan && priceAmount === currentPlanPrice;
            
            console.log('[UpgradeController] Plan change analysis:', {
                currentPlanId: currentPlan?.id,
                newPlanId: planId,
                currentPrice: currentPlanPrice,
                newPrice: priceAmount,
                isUpgrade: isUpgrade,
                isDowngrade: isDowngrade,
                isSamePlan: isSamePlan
            });
            
            // If same plan, do nothing
            if (isSamePlan) {
                alert('You are already on this plan.');
                return;
            }
            
            // For Free plan (€0): update directly without Stripe checkout
            // This handles both new subscriptions to Free and downgrades to Free
            if (priceAmount === 0) {
                console.log('[UpgradeController] Processing Free plan selection (no payment required)...');
                
                if (!window.SubscriptionService) {
                    throw new Error('SubscriptionService not available');
                }
                
                // Check if user has an active paid subscription with Stripe
                const subscriptionResult = await window.SubscriptionService.getCurrentUserSubscription();
                const hasStripeSubscription = subscriptionResult.success && 
                    subscriptionResult.subscription && 
                    subscriptionResult.subscription.subscription_type === 'paid' &&
                    subscriptionResult.subscription.stripe_subscription_id;
                
                // If user has a Stripe subscription, cancel it via update-subscription Edge Function
                if (hasStripeSubscription) {
                    console.log('[UpgradeController] Cancelling Stripe subscription before switching to Free...');
                    
                    const supabaseProjectUrl = 'https://ofutzrxfbrgtbkyafndv.supabase.co';
                    const updateEndpoint = `${supabaseProjectUrl}/functions/v1/update-subscription`;
                    
                    // Get auth token
                    let authToken = null;
                    if (window.AuthService && window.AuthService.isAuthenticated()) {
                        authToken = window.AuthService.getAccessToken();
                    }
                    
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    
                    if (authToken) {
                        headers['Authorization'] = `Bearer ${authToken}`;
                    }
                    
                    // Cancel Stripe subscription immediately and update to Free
                    const response = await fetch(updateEndpoint, {
                        method: 'POST',
                        headers: headers,
                        body: JSON.stringify({
                            userId: currentUser.id,
                            customerId: subscriptionResult.subscription.stripe_customer_id,
                            currentSubscriptionId: subscriptionResult.subscription.stripe_subscription_id,
                            newPlanId: planId,
                            changeType: 'downgrade',
                            recurringBillingEnabled: false // Disable recurring billing for Free plan
                        }),
                        credentials: 'omit'
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: 'Failed to cancel subscription' }));
                        console.warn('[UpgradeController] Failed to cancel Stripe subscription, proceeding with direct update:', errorData.error);
                        // Continue with direct update even if Stripe cancellation fails
                    } else {
                        const result = await response.json();
                        if (result.success) {
                            console.log('[UpgradeController] Stripe subscription cancelled successfully');
                        }
                    }
                }
                
                // Update subscription directly to Free plan
                const updateResult = await window.SubscriptionService.updateSubscription(currentUser.id, {
                    plan_id: planId,
                    subscription_type: 'trial', // Free plan is trial type
                    status: 'active',
                    stripe_subscription_id: null, // Clear Stripe subscription ID
                    recurring_billing_enabled: false // Disable recurring billing for Free plan
                });
                
                if (updateResult.success) {
                    alert(`Successfully switched to ${planName}!`);
                    
                    // Reload subscription and plans to refresh the display
                    await this.loadCurrentSubscription();
                    await this.loadAvailablePlans();
                    await this.renderPlans();
                    this.displayCurrentSubscription();
                } else {
                    throw new Error(updateResult.error || 'Failed to switch to Free plan');
                }
                
                return;
            }
            
            // For downgrades (to paid plans): use update-subscription Edge Function (scheduled)
            if (isDowngrade) {
                console.log('[UpgradeController] Processing downgrade (scheduled)...');
                
                if (!window.SubscriptionService) {
                    throw new Error('SubscriptionService not available');
                }
                
                // Check if user has an active paid subscription
                const subscriptionResult = await window.SubscriptionService.getCurrentUserSubscription();
                if (!subscriptionResult.success || !subscriptionResult.subscription || 
                    subscriptionResult.subscription.subscription_type !== 'paid' ||
                    !subscriptionResult.subscription.stripe_subscription_id) {
                    throw new Error('No active paid subscription found. Please subscribe first.');
                }
                
                // Call update-subscription Edge Function for scheduled downgrade
                const supabaseProjectUrl = 'https://ofutzrxfbrgtbkyafndv.supabase.co';
                const updateEndpoint = `${supabaseProjectUrl}/functions/v1/update-subscription`;
                
                // Get auth token
                let authToken = null;
                if (window.AuthService && window.AuthService.isAuthenticated()) {
                    authToken = window.AuthService.getAccessToken();
                }
                
                const headers = {
                    'Content-Type': 'application/json'
                };
                
                if (authToken) {
                    headers['Authorization'] = `Bearer ${authToken}`;
                }
                
                const response = await fetch(updateEndpoint, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        userId: currentUser.id,
                        customerId: subscriptionResult.subscription.stripe_customer_id,
                        currentSubscriptionId: subscriptionResult.subscription.stripe_subscription_id,
                        newPlanId: planId,
                        changeType: 'downgrade',
                        recurringBillingEnabled: subscriptionResult.subscription.recurring_billing_enabled !== false
                    }),
                    credentials: 'omit'
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to schedule downgrade');
                }
                
                const result = await response.json();
                
                if (result.success) {
                    alert(`Downgrade scheduled! You will be moved to ${planName} at the end of your current billing period (${new Date(result.changeDate).toLocaleDateString()}). You will continue to have access to your current plan features until then.`);
                    
                    // Reload subscription and plans to refresh the display
                    await this.loadCurrentSubscription();
                    await this.loadAvailablePlans();
                    await this.renderPlans();
                    this.displayCurrentSubscription();
                } else {
                    throw new Error(result.error || 'Failed to schedule downgrade');
                }
                
                return;
            }
            
            // For upgrades or new subscriptions: use checkout (immediate)
            console.log('[UpgradeController] Processing upgrade/new subscription (immediate)...');
            
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
                // Store customer ID if returned (non-blocking - webhook will also update this)
                // Use a timeout to ensure redirect happens even if update is slow
                if (result.customerId && window.SubscriptionService) {
                    const customerIdUpdatePromise = window.SubscriptionService.updateSubscription(currentUser.id, {
                        stripe_customer_id: result.customerId
                    }).catch(err => {
                        console.warn('[UpgradeController] Failed to store customer ID (non-critical - webhook will handle):', err.message || err);
                    });
                    
                    // Don't wait for customer ID update - redirect immediately
                    // The webhook will update the customer ID when checkout completes
                    console.log('[UpgradeController] Customer ID update initiated (non-blocking)');
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
     * Handle successful upgrade - update subscription and refresh display
     */
    async handleUpgradeSuccess(planId) {
        console.log('[UpgradeController] ========== HANDLING UPGRADE SUCCESS ==========');
        console.log('[UpgradeController] New plan ID:', planId);
        
        try {
            // Ensure authentication is ready
            if (!window.AuthService) {
                console.warn('[UpgradeController] AuthService not available, waiting...');
                let authWaitCount = 0;
                const maxAuthWait = 50;
                while (!window.AuthService && authWaitCount < maxAuthWait) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    authWaitCount++;
                }
            }
            
            // Wait for authentication to be confirmed
            let authCheckCount = 0;
            const maxAuthCheck = 50;
            while (authCheckCount < maxAuthCheck) {
                if (window.AuthService && window.AuthService.isAuthenticated() && window.AuthService.currentUser) {
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                authCheckCount++;
            }
            
            if (!window.AuthService || !window.AuthService.isAuthenticated() || !window.AuthService.currentUser) {
                console.warn('[UpgradeController] User not authenticated after waiting, cannot update subscription');
                alert('Subscription upgrade successful! Please refresh the page to see your updated plan.');
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }
            
            const currentUser = window.AuthService.currentUser;
            console.log('[UpgradeController] User authenticated, proceeding with subscription update:', currentUser.id);
            
            // Wait for SubscriptionService and DatabaseService to be available
            let serviceWaitCount = 0;
            const maxServiceWait = 30;
            while ((!window.SubscriptionService || !window.DatabaseService) && serviceWaitCount < maxServiceWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
                serviceWaitCount++;
            }
            
            if (!window.SubscriptionService) {
                console.warn('[UpgradeController] SubscriptionService not available');
                alert('Subscription upgrade successful! Please refresh the page to see your updated plan.');
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }
            
            if (!window.DatabaseService) {
                console.warn('[UpgradeController] DatabaseService not available');
                alert('Subscription upgrade successful! Please refresh the page to see your updated plan.');
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }
            
            // Ensure DatabaseService is initialized
            if (!window.DatabaseService.client) {
                console.log('[UpgradeController] DatabaseService not initialized, initializing...');
                await window.DatabaseService.initialize();
            }
            
            // Get plan details to determine tier
            console.log('[UpgradeController] Fetching plan details for plan ID:', planId);
            let planName = null;
            const planResult = await window.DatabaseService.querySelect('subscription_plans', {
                filter: { id: parseInt(planId) },
                limit: 1
            });
            
            if (planResult.data && planResult.data.length > 0) {
                planName = planResult.data[0].plan_name;
                console.log('[UpgradeController] Plan name for tier calculation:', planName);
            } else {
                console.warn('[UpgradeController] Plan not found in database for plan ID:', planId);
            }
            
            // Update subscription with new plan ID
            console.log('[UpgradeController] Updating subscription with plan ID:', planId, 'plan name:', planName);
            const updateResult = await window.SubscriptionService.updateSubscription(currentUser.id, {
                plan_id: parseInt(planId),
                status: 'active',
                subscription_type: 'paid',
                updated_at: new Date().toISOString()
            });
            
            console.log('[UpgradeController] Update result:', {
                success: updateResult.success,
                hasSubscription: !!updateResult.subscription,
                error: updateResult.error
            });
            
            // Log tier information
            if (updateResult.success && updateResult.subscription) {
                const tier = window.SubscriptionService.getSubscriptionTier(planName, 'paid');
                console.log('[UpgradeController] ✅ Subscription updated with tier:', tier);
                console.log('[UpgradeController] Updated subscription:', {
                    planId: updateResult.subscription.plan_id,
                    planName: planName,
                    tier: tier,
                    status: updateResult.subscription.status
                });
            }
            
            if (updateResult.success) {
                console.log('[UpgradeController] ✅ Subscription updated successfully:', updateResult.subscription);
                alert(`Subscription upgrade successful! You are now on the ${planName || 'new'} plan.`);
                
                // Reload subscription and plans to refresh the display
                await this.loadCurrentSubscription();
                await this.loadAvailablePlans();
                await this.renderPlans();
                this.displayCurrentSubscription();
            } else {
                console.error('[UpgradeController] ❌ Failed to update subscription:', updateResult.error);
                console.error('[UpgradeController] Error details:', {
                    error: updateResult.error,
                    hasSubscription: !!updateResult.subscription
                });
                // Still show success message - webhook will update it eventually
                alert(`Subscription upgrade successful! Your new plan will be active shortly. If you don't see the update, please refresh the page.`);
            }
            
            // Remove query params
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
            console.error('[UpgradeController] Error handling upgrade success:', error);
            console.error('[UpgradeController] Error stack:', error.stack);
            // Still show success message - webhook will update it eventually
            alert(`Subscription upgrade successful! Your new plan will be active shortly. If you don't see the update, please refresh the page.`);
            window.history.replaceState({}, document.title, window.location.pathname);
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
    },
    
    /**
     * Handle update payment button click
     * Opens Stripe Customer Portal for updating payment method
     * For trial users without customer ID, creates a customer first
     */
    async handleUpdatePayment() {
        console.log('[UpgradeController] ========== handleUpdatePayment() STARTED ==========');
        const startTime = Date.now();
        
        try {
            console.log('[UpgradeController] Step 1: Getting button element...');
            const button = document.getElementById('update-payment-button');
            if (button) {
                button.disabled = true;
                button.textContent = 'Loading...';
                console.log('[UpgradeController] ✅ Button found and disabled');
            } else {
                console.warn('[UpgradeController] ⚠️ Button element not found');
            }
            
            console.log('[UpgradeController] Step 2: Checking authentication...');
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                console.error('[UpgradeController] ❌ User not authenticated');
                throw new Error('User not authenticated');
            }
            console.log('[UpgradeController] ✅ User authenticated');
            
            console.log('[UpgradeController] Step 3: Getting current user...');
            const currentUser = window.AuthService.getCurrentUser();
            if (!currentUser || !currentUser.email) {
                console.error('[UpgradeController] ❌ User email not available:', { hasUser: !!currentUser, hasEmail: !!currentUser?.email });
                throw new Error('User email not available');
            }
            console.log('[UpgradeController] ✅ Current user:', { userId: currentUser.id, email: currentUser.email });
            
            console.log('[UpgradeController] Step 4: Loading subscription state...');
            let subscription = null;
            if (window.SubscriptionService) {
                const subscriptionResult = await window.SubscriptionService.getCurrentUserSubscription();
                if (subscriptionResult.success && subscriptionResult.subscription) {
                    subscription = subscriptionResult.subscription;
                }
            }
            const existingCustomerId = subscription?.stripe_customer_id;
            console.log('[UpgradeController] Subscription state:', {
                hasSubscription: !!subscription,
                subscriptionType: subscription?.subscription_type,
                subscriptionStatus: subscription?.status,
                hasCustomerId: !!existingCustomerId,
                customerId: existingCustomerId || 'none'
            });
            
            console.log('[UpgradeController] Step 5: Checking StripeService availability...');
            if (!window.StripeService) {
                console.error('[UpgradeController] ❌ StripeService not available');
                throw new Error('StripeService not available');
            }
            console.log('[UpgradeController] ✅ StripeService available');
            
            console.log('[UpgradeController] Step 6: Initializing Stripe...');
            await window.StripeService.initialize();
            console.log('[UpgradeController] ✅ Stripe initialized');
            
            let customerId = existingCustomerId;
            
            // If no customer ID, create one first (for trial users)
            if (!customerId) {
                console.log('[UpgradeController] Step 7: No customer ID found, creating customer...');
                console.log('[UpgradeController] Customer creation details:', {
                    email: currentUser.email,
                    userId: currentUser.id
                });
                
                const supabaseProjectUrl = 'https://ofutzrxfbrgtbkyafndv.supabase.co';
                const createCustomerEndpoint = `${supabaseProjectUrl}/functions/v1/create-customer`;
                console.log('[UpgradeController] Customer creation endpoint:', createCustomerEndpoint);
                
                const customerStartTime = Date.now();
                const customerResult = await window.StripeService.createCustomer(
                    currentUser.email,
                    currentUser.id,
                    createCustomerEndpoint
                );
                const customerElapsed = Date.now() - customerStartTime;
                
                console.log('[UpgradeController] Customer creation result:', {
                    success: customerResult.success,
                    hasCustomerId: !!customerResult.customerId,
                    customerId: customerResult.customerId || 'none',
                    error: customerResult.error || 'none',
                    elapsed: `${customerElapsed}ms`
                });
                
                if (!customerResult.success || !customerResult.customerId) {
                    console.error('[UpgradeController] ❌ Customer creation failed:', customerResult.error);
                    throw new Error(customerResult.error || 'Failed to create customer');
                }
                
                customerId = customerResult.customerId;
                console.log('[UpgradeController] ✅ Customer created successfully:', customerId);
                
                // Store customer ID in database (non-blocking)
                if (window.SubscriptionService && subscription) {
                    console.log('[UpgradeController] Step 8: Storing customer ID in database...');
                    window.SubscriptionService.updateSubscription(currentUser.id, {
                        stripe_customer_id: customerId
                    }).then(() => {
                        console.log('[UpgradeController] ✅ Customer ID stored in database');
                    }).catch(err => {
                        console.warn('[UpgradeController] ⚠️ Failed to store customer ID in database:', err);
                    });
                } else {
                    console.log('[UpgradeController] Step 8: Skipping database update (no subscription or SubscriptionService)');
                }
            } else {
                console.log('[UpgradeController] Step 7: Using existing customer ID:', customerId);
            }
            
            console.log('[UpgradeController] Step 9: Preparing portal session...');
            const currentUrl = window.location.href.split('?')[0];
            const returnUrl = currentUrl;
            console.log('[UpgradeController] Portal session details:', {
                customerId: customerId,
                returnUrl: returnUrl
            });
            
            const supabaseProjectUrl = 'https://ofutzrxfbrgtbkyafndv.supabase.co';
            const backendEndpoint = `${supabaseProjectUrl}/functions/v1/create-portal-session`;
            console.log('[UpgradeController] Portal session endpoint:', backendEndpoint);
            
            console.log('[UpgradeController] Step 10: Creating portal session...');
            const portalStartTime = Date.now();
            const result = await window.StripeService.createPortalSession(
                customerId,
                returnUrl,
                backendEndpoint
            );
            const portalElapsed = Date.now() - portalStartTime;
            
            console.log('[UpgradeController] Portal session result:', {
                success: result.success,
                hasUrl: !!result.url,
                url: result.url || 'none',
                error: result.error || 'none',
                elapsed: `${portalElapsed}ms`
            });
            
            if (!result.success) {
                console.error('[UpgradeController] ❌ Portal session creation failed:', result.error);
                throw new Error(result.error || 'Failed to create portal session');
            }
            
            if (result.url) {
                console.log('[UpgradeController] Step 11: Redirecting to Stripe Customer Portal...');
                console.log('[UpgradeController] Portal URL:', result.url);
                const totalElapsed = Date.now() - startTime;
                console.log('[UpgradeController] ========== handleUpdatePayment() SUCCESS ==========');
                console.log('[UpgradeController] Total time:', `${totalElapsed}ms`);
                // Redirect to Stripe Customer Portal
                window.location.href = result.url;
            } else {
                console.error('[UpgradeController] ❌ No portal URL returned');
                throw new Error('No portal URL returned');
            }
        } catch (error) {
            const totalElapsed = Date.now() - startTime;
            console.error('[UpgradeController] ========== handleUpdatePayment() ERROR ==========');
            console.error('[UpgradeController] Error details:', {
                message: error.message,
                stack: error.stack,
                elapsed: `${totalElapsed}ms`
            });
            console.error('[UpgradeController] Error opening payment portal:', error);
            
            alert(`Error: ${error.message || 'Failed to open payment portal. Please try again.'}`);
            
            const button = document.getElementById('update-payment-button');
            if (button) {
                button.disabled = false;
                button.textContent = 'Update Payment Method';
                console.log('[UpgradeController] Button re-enabled');
            }
        }
    },
    
    /**
     * Display current subscription details including recurring billing status
     */
    displayCurrentSubscription() {
        const container = document.getElementById('current-subscription-details');
        const content = document.getElementById('current-subscription-content');
        
        if (!container || !content || !this.currentSubscription) {
            return;
        }
        
        const subscription = this.currentSubscription;
        const plan = this.currentPlan;
        const detailsHtml = [];
        
        // Plan Name
        if (plan && plan.plan_name) {
            detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Plan:</strong><span>${plan.plan_name}</span></div>`);
        }
        
        // Subscription Status
        if (subscription.status) {
            const statusColor = subscription.status === 'active' ? 'var(--success-color, #28a745)' : 'var(--text-secondary)';
            detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Status:</strong><span style="color: ${statusColor};">${subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}</span></div>`);
        }
        
        // Subscription Type
        if (subscription.subscription_type) {
            detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Type:</strong><span>${subscription.subscription_type.charAt(0).toUpperCase() + subscription.subscription_type.slice(1)}</span></div>`);
        }
        
        // Next Billing Date (if available)
        if (subscription.next_billing_date) {
            const nextBilling = new Date(subscription.next_billing_date);
            detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Next Billing:</strong><span>${nextBilling.toLocaleDateString()}</span></div>`);
        }
        
        // Subscription End Date (if available)
        if (subscription.subscription_end_date) {
            const endDate = new Date(subscription.subscription_end_date);
            detailsHtml.push(`<div style="display: flex; justify-content: space-between; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Ends:</strong><span>${endDate.toLocaleDateString()}</span></div>`);
        }
        
        // Recurring Billing Status (Auto-Renewal) - only for paid subscriptions
        if (subscription.subscription_type === 'paid' && subscription.stripe_subscription_id) {
            const recurringBillingEnabled = subscription.recurring_billing_enabled !== false; // Default to true if not set
            const statusText = recurringBillingEnabled ? 'Enabled' : 'Disabled';
            const statusColor = recurringBillingEnabled ? 'var(--success-color, #28a745)' : 'var(--text-secondary)';
            detailsHtml.push(`<div style="display: flex; justify-content: space-between; align-items: center; padding: var(--spacing-xs) 0; border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));"><strong>Auto-Renewal (Recurring):</strong><span style="color: ${statusColor}; font-weight: 600;">${statusText}</span></div>`);
        }
        
        if (detailsHtml.length > 0) {
            content.innerHTML = detailsHtml.join('');
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    },
    
    /**
     * Hide current subscription details
     */
    hideCurrentSubscription() {
        const container = document.getElementById('current-subscription-details');
        if (container) {
            container.style.display = 'none';
        }
    }
};

if (typeof window !== 'undefined') {
    window.UpgradeController = UpgradeController;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UpgradeController;
}

