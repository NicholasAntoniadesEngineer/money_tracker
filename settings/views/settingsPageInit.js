// Initialize application with parallel loading for better performance
async function runInit() {
    console.log('[SettingsPage] DOMContentLoaded - starting initialization');
    try {
        // PERFORMANCE OPTIMIZATION: Run independent initializations in parallel
        console.log('[SettingsPage] Starting parallel initialization...');
        const [paymentsReady, dbInitResult] = await Promise.all([
            // Wait for payments module initialization
            window.waitForPaymentsInit ? window.waitForPaymentsInit() : Promise.resolve(),
            // Initialize database service
            window.DatabaseService.initialize()
        ]);
        console.log('[SettingsPage] Parallel initialization complete');

        // Check authentication (must happen after database/payments init)
        const isAuthenticated = await window.AuthGuard.checkAuth();
        if (!isAuthenticated) {
            return;
        }

        // Initialize the encryption key store BEFORE SettingsController.init(),
        // whose getAllMonths/getMonth (e.g. line ~405) drive databaseService's
        // _ensureBudgetDekForUser -> ensureBudgetDEK -> getIdentityKeys ->
        // KeyStorageService._ensureInitialized(), which throws "Service not
        // initialized" unless KeyStorageService.initialize(config) has run (M3).
        // The device-pairing IIFE below also inits it, but that is fire-and-forget
        // and races the controller; this ordered init is the budget-read fix.
        if (window.MoneyTrackerEncryptionConfig && window.KeyStorageService
            && typeof window.KeyStorageService.initialize === 'function') {
            try {
                if (window.CryptoLibraryLoader && typeof window.CryptoLibraryLoader.load === 'function') {
                    await window.CryptoLibraryLoader.load();
                    await window.CryptoPrimitivesService.initialize();
                }
                window.MoneyTrackerEncryptionConfig.prepareWithServices();
                if (!window.KeyStorageService.initialized) {
                    await window.KeyStorageService.initialize(window.MoneyTrackerEncryptionConfig);
                }
                console.log('[SettingsPage] KeyStorageService initialized:', window.KeyStorageService.initialized);
            } catch (ksErr) {
                console.warn('[SettingsPage] KeyStorageService init failed:', ksErr);
            }
        }

        // Initialize SettingsController FIRST so buttons work immediately
        if (window.SettingsController) {
            console.log('[SettingsPage] Initializing SettingsController...');
            await window.SettingsController.init();
            console.log('[SettingsPage] SettingsController initialized');
        }

        // Initialize the E2E encryption module for the current user so the
        // "Link a device" card can generate a pairing code. createPairingRequest()
        // -> exportPairingBundle() needs KeyManagementService.currentUserId set AND
        // the local identity keys present (mirrors auth.html's post-sign-in init).
        // Non-blocking: a failure here must NOT break budget settings.
        (async () => {
            try {
                const currentUser = window.AuthService && typeof window.AuthService.getCurrentUser === 'function'
                    ? window.AuthService.getCurrentUser()
                    : null;
                const userId = currentUser && currentUser.id;
                if (!userId) {
                    console.warn('[SettingsPage] No current user id; skipping encryption init.');
                    return;
                }
                if (window.initEncryptionModule) {
                    // Injects DatabaseService/AuthService into the config and loads
                    // the crypto library (EncryptionModule.initialize).
                    await window.initEncryptionModule();
                }
                if (window.KeyManagementService && typeof window.KeyManagementService.initialize === 'function') {
                    // Loads nacl + all sub-services and sets currentUserId so the
                    // local identity secret can be exported into a pairing bundle.
                    await window.KeyManagementService.initialize(userId, window.MoneyTrackerEncryptionConfig);
                }
                console.log('[SettingsPage] Encryption initialized for device pairing');
            } catch (encErr) {
                console.warn('[SettingsPage] Encryption init for pairing failed:', encErr);
            }
        })();

        // Link-a-device: generate a one-time pairing code for another device.
        const linkBtn = document.getElementById('link-device-button');
        if (linkBtn && window.DevicePairingService) {
            linkBtn.addEventListener('click', async () => {
                const out = document.getElementById('pairing-code-output');
                const val = document.getElementById('pairing-code-value');
                const exp = document.getElementById('pairing-code-expiry');
                const status = document.getElementById('link-device-status');
                if (status) status.textContent = '';
                const orig = linkBtn.innerHTML;
                linkBtn.disabled = true;
                linkBtn.textContent = 'Generating…';
                try {
                    const r = await window.DevicePairingService.createPairingRequest();
                    if (r && r.success) {
                        val.textContent = r.code;
                        exp.textContent = r.expiresAt ? ('Valid until ' + new Date(r.expiresAt).toLocaleTimeString()) : '';
                        out.classList.remove('hidden');
                    } else if (status) {
                        status.textContent = (r && r.error) ? r.error : 'Could not generate a pairing code.';
                    }
                } catch (e) {
                    if (status) status.textContent = 'Could not generate a pairing code.';
                } finally {
                    linkBtn.disabled = false;
                    linkBtn.innerHTML = orig;
                }
            });
            const copyBtn = document.getElementById('copy-pairing-code');
            if (copyBtn) {
                copyBtn.addEventListener('click', async () => {
                    const code = document.getElementById('pairing-code-value').textContent;
                    try {
                        await navigator.clipboard.writeText(code);
                        const t = copyBtn.innerHTML;
                        copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                        setTimeout(() => { copyBtn.innerHTML = t; }, 1500);
                    } catch (_) { /* clipboard blocked; the code is selectable */ }
                });
            }
        }

        // Initialize settings (non-blocking - don't wait if it hangs)
        console.log('[SettingsPage] Loading settings (non-blocking)...');
        Promise.all([
            window.DataManager.initializeSettings().catch(err => {
                console.warn('[SettingsPage] Settings initialization failed:', err);
            }),
            window.DataManager.applyFontScale().catch(err => {
                console.warn('[SettingsPage] Font size application failed:', err);
            })
        ]).then(() => {
            console.log('[SettingsPage] Settings loaded');
        }).catch(err => {
            console.warn('[SettingsPage] Settings loading error:', err);
        });

        // Handle payment return from Stripe
        const urlParams = new URLSearchParams(window.location.search);
        const paymentStatus = urlParams.get('payment');
        if (paymentStatus === 'success') {
            const statusDiv = document.getElementById('subscription-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<p style="color: var(--success-color);">Payment successful! Your subscription is now active.</p>';
            }
            // Refresh subscription status
            if (window.SettingsController) {
                await window.SettingsController.loadSubscriptionStatus();
            }
            // Remove query parameter
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (paymentStatus === 'cancelled') {
            const statusDiv = document.getElementById('subscription-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<p style="color: var(--warning-color);">Payment was cancelled. You can try again when ready.</p>';
            }
            // Remove query parameter
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        console.log('[SettingsPage] Initialization complete!');
    } catch (error) {
        console.error('[SettingsPage] ❌ Initialization error:', error);
        console.error('[SettingsPage] Error stack:', error.stack);
        (function(){try{console.error('[init] failed:', typeof error!=='undefined'?error:'');}catch(_){}if(document.body){var b=document.createElement('div');b.setAttribute('role','alert');b.style.cssText='background:#7f1d1d;color:#fff;padding:12px 16px;text-align:center;font:14px sans-serif';b.textContent='Could not load the page. Check your connection and refresh.';document.body.prepend(b);}})();
    }
}

// This script is loaded with `defer`, so the DOM is parsed before it runs.
// Guard for the case where DOMContentLoaded has already fired (H-5: was an
// inline DOMContentLoaded listener).
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
} else {
    runInit();
}
