console.log('[Landing] Script initialization starting...');

async function runInit() {
    try {
        console.log('[Landing] Starting initialization...');

        if (window.CryptoLibraryLoader && typeof window.CryptoLibraryLoader.load === 'function') {
            await window.CryptoLibraryLoader.load();
            await window.CryptoPrimitivesService.initialize();
            console.log('[Landing] Encryption module initialized');
        }

        // Initialize the encryption key store BEFORE any getAllMonths/getMonth
        // (InitialData.initializeIfEmpty + LandingController.init below). Those
        // drive _ensureBudgetDekForUser -> ensureBudgetDEK -> getIdentityKeys ->
        // KeyStorageService._ensureInitialized(), which throws "Service not
        // initialized" unless KeyStorageService.initialize(config) has run
        // (M3-class). Mirrors auth.html's initCryptoServices().
        if (window.MoneyTrackerEncryptionConfig && window.KeyStorageService
            && typeof window.KeyStorageService.initialize === 'function') {
            try {
                window.MoneyTrackerEncryptionConfig.prepareWithServices();
                if (!window.KeyStorageService.initialized) {
                    await window.KeyStorageService.initialize(window.MoneyTrackerEncryptionConfig);
                }
                console.log('[Landing] KeyStorageService initialized:', window.KeyStorageService.initialized);
            } catch (ksErr) {
                console.warn('[Landing] KeyStorageService init failed:', ksErr);
            }
        }

        const [paymentsReady, dbInitResult] = await Promise.all([
            window.waitForPaymentsInit ? window.waitForPaymentsInit() : Promise.resolve(),
            window.DatabaseService.initialize()
        ]);
        console.log('[Landing] Payments and Database initialized');

        const isAuthenticated = await window.AuthGuard.checkAuth();
        if (!isAuthenticated) {
            console.log('[Landing] Not authenticated, redirecting...');
            return;
        }
        console.log('[Landing] Authentication check passed');

        if (window.PairingGuard) {
            console.log('[Landing] Checking device pairing status...');
            const isPaired = await window.PairingGuard.requirePairing();
            if (!isPaired) {
                return; // requirePairing signs out if not paired
            }
            console.log('[Landing] Device pairing check passed');
        }

        await DataManager.initializeSettings();
        await DataManager.applyFontScale();
        console.log('[Landing] Settings initialized');

        await InitialData.initializeIfEmpty();
        console.log('[Landing] Initial data checked');

        window.landingControllerInitialized = true;

        if (window.LandingController) {
            await window.LandingController.init();
            console.log('[Landing] LandingController initialized');
        }

        console.log('[Landing] Initialization complete!');
    } catch (error) {
        console.error('[Landing] Initialization error:', error);
        const tbody = document.getElementById('months-comparison-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-8 text-danger">
                        <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                        <p>Failed to load data. Please refresh the page.</p>
                    </td>
                </tr>
            `;
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
} else {
    runInit();
}
