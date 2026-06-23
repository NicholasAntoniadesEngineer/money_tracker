// Initialize application with parallel loading for better performance
async function runInit() {
    try {
        console.log('[pots.html] Starting initialization...');

        // PERFORMANCE OPTIMIZATION: Run independent initializations in parallel
        const [paymentsReady, dbInitResult] = await Promise.all([
            // Wait for payments module initialization
            window.waitForPaymentsInit ? window.waitForPaymentsInit() : Promise.resolve(),
            // Initialize database service
            window.DatabaseService.initialize()
        ]);
        console.log('[pots.html] Payments and Database initialized');

        // Check authentication (must happen after database/payments init)
        const isAuthenticated = await window.AuthGuard.checkAuth();
        if (!isAuthenticated) {
            console.log('[pots.html] Not authenticated, redirecting...');
            return;
        }
        console.log('[pots.html] Authentication check passed');

        // Initialize the encryption key store BEFORE the controller's first
        // getAllPots/getAllMonths. Those -> ensureBudgetDEK -> getIdentityKeys ->
        // KeyStorageService._ensureInitialized() throws "Service not initialized"
        // unless KeyStorageService.initialize(config) has run (C2). Mirrors
        // auth.html's initCryptoServices(). Idempotent + ordered before the
        // controller so the budget DEK can bootstrap from the identity secret.
        if (window.MoneyTrackerEncryptionConfig && window.KeyStorageService
            && typeof window.KeyStorageService.initialize === 'function') {
            if (window.CryptoLibraryLoader && typeof window.CryptoLibraryLoader.load === 'function') {
                await window.CryptoLibraryLoader.load();
                await window.CryptoPrimitivesService.initialize();
            }
            window.MoneyTrackerEncryptionConfig.prepareWithServices();
            if (!window.KeyStorageService.initialized) {
                await window.KeyStorageService.initialize(window.MoneyTrackerEncryptionConfig);
            }
            console.log('[pots.html] KeyStorageService initialized:', window.KeyStorageService.initialized);
        }

        // Initialize settings after database is ready
        await window.DataManager.initializeSettings();
        await window.DataManager.applyFontScale();
        console.log('[pots.html] Settings initialized and applied');

        // Now initialize the controller
        if (window.PotsController) {
            await window.PotsController.init();
            console.log('[pots.html] PotsController initialized');
        }

        console.log('[pots.html] Initialization complete!');
    } catch (error) {
        console.error('[pots.html] ❌ Initialization error:', error);
        console.error('[pots.html] Error stack:', error.stack);
        (function(){try{console.error('[init] failed:', typeof error!=='undefined'?error:'');}catch(_){}if(document.body){var b=document.createElement('div');b.setAttribute('role','alert');b.style.cssText='background:#7f1d1d;color:#fff;padding:12px 16px;text-align:center;font:14px sans-serif';b.textContent='Could not load the page. Check your connection and refresh.';document.body.prepend(b);}})();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
} else {
    runInit();
}
