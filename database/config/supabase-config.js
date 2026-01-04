/**
 * Supabase Configuration
 * Centralized configuration for Supabase client
 */

// ============================================================================
// SINGLE LINE TO CONTROL ALL LOGGING - Change this line to enable/disable logs
// ============================================================================
const ENABLE_ALL_LOGS = false; // Set to true to enable all console logging, false to disable
// ============================================================================

/**
 * Global Debug Configuration
 * Set ENABLE_ALL_LOGS to false to disable ALL console logging across the entire codebase
 * This achieves zero-overhead performance by using no-op functions that are optimized away
 * by JavaScript engines. Arguments to disabled log calls are never evaluated.
 *
 * PRODUCTION SETTINGS (recommended):
 * ENABLE_ALL_LOGS: false (disables ALL console.log, console.warn, console.error, console.info, console.debug)
 *
 * DEVELOPMENT SETTINGS:
 * ENABLE_ALL_LOGS: true (enables all logging for debugging)
 *
 * NOTE: The flag is checked once at initialization, not on every log call, for maximum performance.
 */

// Initialize AppConfig with defaults (can be overridden before this script loads)
window.AppConfig = window.AppConfig || {};
window.AppConfig.ENABLE_ALL_LOGS = window.AppConfig.ENABLE_ALL_LOGS !== undefined ? window.AppConfig.ENABLE_ALL_LOGS : ENABLE_ALL_LOGS; // Uses the constant above

/**
 * Override console methods to respect ENABLE_ALL_LOGS flag
 * This achieves zero-overhead logging by checking the flag once at initialization
 * instead of on every log call. When disabled, console methods become no-op functions
 * that are optimized away by JavaScript engines.
 */
(function() {
    // Store original console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;
    const originalDebug = console.debug;

    // Check flag once at initialization time
    const loggingEnabled = window.AppConfig && window.AppConfig.ENABLE_ALL_LOGS === true;

    if (!loggingEnabled) {
        // Assign no-op functions - zero overhead when disabled!
        // Arguments are not evaluated and empty functions are optimized away by JS engines
        console.log = function() {};
        console.warn = function() {};
        console.error = function() {};
        console.info = function() {};
        console.debug = function() {};
    }
    // If logging is enabled, keep original methods (no wrapper needed)

    // Store original methods for potential restoration
    console._originalLog = originalLog;
    console._originalWarn = originalWarn;
    console._originalError = originalError;
    console._originalInfo = originalInfo;
    console._originalDebug = originalDebug;
})();

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
