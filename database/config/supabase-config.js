/**
 * Supabase Configuration
 * Centralized configuration for Supabase client
 */

/**
 * Global Debug Configuration
 * Set ENABLE_ALL_LOGS to false to disable ALL console logging across the entire codebase
 * This significantly improves performance by skipping all log operations
 *
 * PRODUCTION SETTINGS (recommended):
 * ENABLE_ALL_LOGS: false (disables ALL console.log, console.warn, console.error)
 * DEBUG_MODE: false
 * ENABLE_AUTH_LOGS: false
 * ENABLE_DB_LOGS: false
 * ENABLE_PERF_LOGS: false
 *
 * NOTE: When ENABLE_ALL_LOGS is false, ALL console methods are disabled
 * Set ENABLE_ALL_LOGS to true to enable all logging for debugging
 */

// Initialize AppConfig with defaults (can be overridden before this script loads)
window.AppConfig = window.AppConfig || {};
window.AppConfig.ENABLE_ALL_LOGS = window.AppConfig.ENABLE_ALL_LOGS !== undefined ? window.AppConfig.ENABLE_ALL_LOGS : false; // Set to false to disable ALL console logging
window.AppConfig.DEBUG_MODE = window.AppConfig.DEBUG_MODE !== undefined ? window.AppConfig.DEBUG_MODE : false; // Set to false in production
window.AppConfig.ENABLE_AUTH_LOGS = window.AppConfig.ENABLE_AUTH_LOGS !== undefined ? window.AppConfig.ENABLE_AUTH_LOGS : false; // Set to false to disable auth-specific logs
window.AppConfig.ENABLE_DB_LOGS = window.AppConfig.ENABLE_DB_LOGS !== undefined ? window.AppConfig.ENABLE_DB_LOGS : false; // Set to false to disable database logs
window.AppConfig.ENABLE_PERF_LOGS = window.AppConfig.ENABLE_PERF_LOGS !== undefined ? window.AppConfig.ENABLE_PERF_LOGS : false; // Set to false to disable performance logs

/**
 * Override console methods to respect ENABLE_ALL_LOGS flag
 * This allows disabling ALL logs across the entire codebase with a single flag
 * This runs immediately after AppConfig is set to catch all logs
 */
(function() {
    // Store original console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    
    // Override console.log
    console.log = function(...args) {
        if (window.AppConfig && window.AppConfig.ENABLE_ALL_LOGS === false) {
            return; // Skip logging
        }
        originalLog.apply(console, args);
    };
    
    // Override console.warn
    console.warn = function(...args) {
        if (window.AppConfig && window.AppConfig.ENABLE_ALL_LOGS === false) {
            return; // Skip logging
        }
        originalWarn.apply(console, args);
    };
    
    // Override console.error
    console.error = function(...args) {
        if (window.AppConfig && window.AppConfig.ENABLE_ALL_LOGS === false) {
            return; // Skip logging
        }
        originalError.apply(console, args);
    };
    
    // Override console.info
    console.info = function(...args) {
        if (window.AppConfig && window.AppConfig.ENABLE_ALL_LOGS === false) {
            return; // Skip logging
        }
        originalInfo.apply(console, args);
    };
    
    // Override console.debug
    console.debug = function(...args) {
        if (window.AppConfig && window.AppConfig.ENABLE_ALL_LOGS === false) {
            return; // Skip logging
        }
        originalDebug.apply(console, args);
    };
    
    // Store original methods for potential restoration
    console._originalLog = originalLog;
    console._originalWarn = originalWarn;
    console._originalError = originalError;
    console._originalInfo = originalInfo;
    console._originalDebug = originalDebug;
})();

/**
 * Debug logging helper
 * Only logs if DEBUG_MODE is enabled
 */
window.debugLog = function(category, ...args) {
    if (!window.AppConfig.DEBUG_MODE) return;

    const categoryFlags = {
        'auth': window.AppConfig.ENABLE_AUTH_LOGS,
        'db': window.AppConfig.ENABLE_DB_LOGS,
        'perf': window.AppConfig.ENABLE_PERF_LOGS
    };

    if (categoryFlags[category] !== false) {
        console.log(...args);
    }
};

const SupabaseConfig = {
    PROJECT_URL: 'https://ofutzrxfbrgtbkyafndv.supabase.co',
    PUBLISHABLE_API_KEY: 'sb_publishable_yUPqP6PRjtgphcvS0--vgw_Zy3S_Urd',
    _clientInstance: null,
    
    /**
     * Get Supabase client instance (reuses existing instance if available)
     * @returns {Object} Supabase client
     */
    getClient() {
        console.log('[SupabaseConfig] getClient() called');
        
        // Return existing client if available
        if (this._clientInstance) {
            console.log('[SupabaseConfig] Reusing existing Supabase client instance');
            return this._clientInstance;
        }
        
        if (!window.supabase) {
            console.error('[SupabaseConfig] Supabase client library not loaded');
            throw new Error('Supabase client library not loaded. Please include the Supabase script in your HTML.');
        }
        
        console.log('[SupabaseConfig] Creating new Supabase client with URL:', this.PROJECT_URL);
        this._clientInstance = window.supabase.createClient(this.PROJECT_URL, this.PUBLISHABLE_API_KEY);
        console.log('[SupabaseConfig] Supabase client created successfully');
        return this._clientInstance;
    },
    
    /**
     * Wait for Supabase library to load
     * @param {number} maxWaitTime - Maximum time to wait in milliseconds
     * @returns {Promise<void>}
     */
    async waitForLibrary(maxWaitTime = 10000) {
        const startTime = Date.now();
        while (!window.supabase && (Date.now() - startTime) < maxWaitTime) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        if (!window.supabase) {
            throw new Error('Supabase library failed to load within timeout period');
        }
    },
    
    /**
     * Initialize Supabase client
     * @returns {Promise<Object>} Supabase client instance
     */
    async initialize() {
        console.log('[SupabaseConfig] initialize() called');
        if (typeof window === 'undefined') {
            throw new Error('Supabase config can only be used in browser environment');
        }
        
        if (!window.supabase) {
            console.log('[SupabaseConfig] Waiting for Supabase library to load...');
            await this.waitForLibrary();
            console.log('[SupabaseConfig] Supabase library loaded');
        }
        
        return this.getClient();
    }
};

if (typeof window !== 'undefined') {
    window.SupabaseConfig = SupabaseConfig;
}
