/**
 * Supabase Configuration
 * Centralized configuration for Supabase client
 */

/**
 * Global Debug Configuration
 * Set DEBUG_MODE to false in production to disable console logging
 * This significantly improves performance by skipping log operations
 *
 * PRODUCTION SETTINGS (recommended):
 * DEBUG_MODE: false
 * ENABLE_AUTH_LOGS: false
 * ENABLE_DB_LOGS: false
 * ENABLE_PERF_LOGS: false
 *
 * NOTE: console.error and console.warn will always work regardless of these settings
 */
window.AppConfig = window.AppConfig || {
    DEBUG_MODE: true, // Set to false in production
    ENABLE_AUTH_LOGS: true, // Set to false to disable auth-specific logs
    ENABLE_DB_LOGS: true, // Set to false to disable database logs
    ENABLE_PERF_LOGS: true // Set to false to disable performance logs
};

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

