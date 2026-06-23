// Wait for scripts to load with detailed logging
function waitFor(condition, name, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();
        let checkCount = 0;
        const check = () => {
            checkCount++;
            const elapsed = Date.now() - startTime;
            const isAvailable = condition();

            // Log every 10 checks (every second) or on first check
            if (checkCount === 1 || checkCount % 10 === 0) {
                console.log(`[NotificationsPage] Waiting for ${name}... (check ${checkCount}, ${elapsed}ms elapsed)`);
                console.log(`[NotificationsPage] Current window state:`, {
                    hasHeader: typeof window.Header !== 'undefined',
                    hasNotificationsController: typeof window.NotificationsController !== 'undefined',
                    headerType: typeof window.Header,
                    notificationsControllerType: typeof window.NotificationsController,
                    windowKeys: Object.keys(window).filter(k => k.includes('Header') || k.includes('Notification'))
                });
            }

            if (isAvailable) {
                const totalTime = Date.now() - startTime;
                console.log(`[NotificationsPage] ✅ ${name} is now available after ${totalTime}ms (${checkCount} checks)`);
                resolve();
            } else if (elapsed > timeout) {
                const totalTime = Date.now() - startTime;
                console.error(`[NotificationsPage] ❌ Timeout waiting for ${name} after ${totalTime}ms (${checkCount} checks)`);
                console.error(`[NotificationsPage] Final window state:`, {
                    hasHeader: typeof window.Header !== 'undefined',
                    hasNotificationsController: typeof window.NotificationsController !== 'undefined',
                    headerType: typeof window.Header,
                    notificationsControllerType: typeof window.NotificationsController,
                    allWindowKeys: Object.keys(window).slice(0, 50) // First 50 keys for debugging
                });
                reject(new Error(`Timeout waiting for ${name} after ${totalTime}ms`));
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });
}

// Log script loading progress
document.addEventListener('readystatechange', () => {
    console.log('[NotificationsPage] Document readyState changed to:', document.readyState);
    console.log('[NotificationsPage] Window state at readyState change:', {
        hasHeader: typeof window.Header !== 'undefined',
        hasNotificationsController: typeof window.NotificationsController !== 'undefined',
        headerType: typeof window.Header,
        notificationsControllerType: typeof window.NotificationsController
    });
});

// Log immediately when this script executes
console.log('[NotificationsPage] ========== INITIALIZATION SCRIPT EXECUTING ==========');
console.log('[NotificationsPage] Current readyState:', document.readyState);
console.log('[NotificationsPage] Window state at script execution:', {
    hasHeader: typeof window.Header !== 'undefined',
    hasNotificationsController: typeof window.NotificationsController !== 'undefined',
    headerType: typeof window.Header,
    notificationsControllerType: typeof window.NotificationsController,
    allWindowKeys: Object.keys(window).filter(k => k.includes('Header') || k.includes('Notification') || k.includes('Database') || k.includes('Auth'))
});

async function runInit() {
    console.log('[NotificationsPage] ========== DOMContentLoaded FIRED ==========');
    console.log('[NotificationsPage] Document ready state:', document.readyState);
    console.log('[NotificationsPage] Script loading status:', {
        totalScripts: document.scripts.length,
        loadedScripts: Array.from(document.scripts).map(s => ({
            src: s.src || 'inline',
            readyState: s.readyState,
            async: s.async,
            defer: s.defer
        }))
    });
    console.log('[NotificationsPage] Initial window state check:', {
        hasHeader: typeof window.Header !== 'undefined',
        hasNotificationsController: typeof window.NotificationsController !== 'undefined',
        headerType: typeof window.Header,
        notificationsControllerType: typeof window.NotificationsController,
        headerConstructor: window.Header ? window.Header.constructor.name : 'N/A',
        headerMethods: window.Header ? Object.getOwnPropertyNames(window.Header).filter(n => typeof window.Header[n] === 'function') : []
    });

    // Check if all scripts have loaded
    const allScriptsLoaded = Array.from(document.scripts).every(s => {
        return !s.src || s.readyState === 'complete' || s.readyState === 'loaded';
    });
    console.log('[NotificationsPage] All scripts loaded check:', {
        allLoaded: allScriptsLoaded,
        scriptStates: Array.from(document.scripts).map(s => ({
            src: s.src ? s.src.split('/').pop() : 'inline',
            readyState: s.readyState
        }))
    });

    try {
        console.log('[NotificationsPage] Step 1: Waiting for Header to be available...');
        const headerWaitStart = Date.now();
        await waitFor(() => typeof window.Header !== 'undefined', 'Header', 10000);
        const headerWaitTime = Date.now() - headerWaitStart;
        console.log(`[NotificationsPage] Header wait completed in ${headerWaitTime}ms`);

        console.log('[NotificationsPage] Step 2: Checking Header availability and initializing...');
        console.log('[NotificationsPage] Header object:', {
            exists: window.Header !== undefined,
            type: typeof window.Header,
            hasInit: window.Header && typeof window.Header.init === 'function',
            hasStaticInit: window.Header && typeof window.Header.init === 'function',
            constructor: window.Header ? window.Header.constructor.name : 'N/A'
        });

        // Initialize Header first (it may have already auto-initialized, but init() is idempotent)
        if (window.Header && typeof window.Header.init === 'function') {
            console.log('[NotificationsPage] Calling Header.init()...');
            const headerInitStart = Date.now();
            await window.Header.init();
            const headerInitTime = Date.now() - headerInitStart;
            console.log(`[NotificationsPage] ✅ Header.init() completed in ${headerInitTime}ms`);
        } else {
            console.warn('[NotificationsPage] ⚠️ Header.init() is not available:', {
                hasHeader: window.Header !== undefined,
                headerType: typeof window.Header,
                hasInitMethod: window.Header && typeof window.Header.init
            });
        }

        console.log('[NotificationsPage] Step 3: Waiting for NotificationsController to be available...');
        const controllerWaitStart = Date.now();
        await waitFor(() => typeof window.NotificationsController !== 'undefined', 'NotificationsController', 10000);
        const controllerWaitTime = Date.now() - controllerWaitStart;
        console.log(`[NotificationsPage] NotificationsController wait completed in ${controllerWaitTime}ms`);

        console.log('[NotificationsPage] Step 4: Checking NotificationsController availability and initializing...');
        console.log('[NotificationsPage] NotificationsController object:', {
            exists: window.NotificationsController !== undefined,
            type: typeof window.NotificationsController,
            hasInit: window.NotificationsController && typeof window.NotificationsController.init === 'function'
        });

        // Initialize the encryption key store BEFORE NotificationsController.init(),
        // whose getAllMonths (lines ~977/1131) drives databaseService's
        // _ensureBudgetDekForUser -> ensureBudgetDEK -> getIdentityKeys ->
        // KeyStorageService._ensureInitialized(), which throws "Service not
        // initialized" unless KeyStorageService.initialize(config) has run (M3).
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
                console.log('[NotificationsPage] KeyStorageService initialized:', window.KeyStorageService.initialized);
            } catch (ksErr) {
                console.warn('[NotificationsPage] KeyStorageService init failed:', ksErr);
            }
        }

        // Initialize NotificationsController
        if (window.NotificationsController && typeof window.NotificationsController.init === 'function') {
            console.log('[NotificationsPage] Calling NotificationsController.init()...');
            const controllerInitStart = Date.now();
            await window.NotificationsController.init();
            const controllerInitTime = Date.now() - controllerInitStart;
            console.log(`[NotificationsPage] ✅ NotificationsController.init() completed in ${controllerInitTime}ms`);
            console.log('[NotificationsPage] ========== INITIALIZATION COMPLETE ==========');
        } else {
            console.error('[NotificationsPage] ❌ NotificationsController.init() is not available:', {
                hasController: window.NotificationsController !== undefined,
                controllerType: typeof window.NotificationsController,
                hasInitMethod: window.NotificationsController && typeof window.NotificationsController.init
            });
            throw new Error('NotificationsController.init() is not available');
        }
    } catch (error) {
        console.error('[NotificationsPage] ========== INITIALIZATION ERROR ==========');
        console.error('[NotificationsPage] Error type:', error.constructor.name);
        console.error('[NotificationsPage] Error message:', error.message);
        console.error('[NotificationsPage] Error stack:', error.stack);
        console.error('[NotificationsPage] Final window state at error:', {
            hasHeader: typeof window.Header !== 'undefined',
            hasNotificationsController: typeof window.NotificationsController !== 'undefined',
            headerType: typeof window.Header,
            notificationsControllerType: typeof window.NotificationsController
        });
        (function(){try{console.error('[init] failed:', typeof error!=='undefined'?error:'');}catch(_){}if(document.body){var b=document.createElement('div');b.setAttribute('role','alert');b.style.cssText='background:#7f1d1d;color:#fff;padding:12px 16px;text-align:center;font:14px sans-serif';b.textContent='Could not load the page. Check your connection and refresh.';document.body.prepend(b);}})();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
} else {
    runInit();
}
