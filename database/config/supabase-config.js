/**
 * Supabase Configuration
 * Centralized configuration for Supabase client
 */

const SupabaseConfig = {
    PROJECT_URL: 'https://ofutzrxfbrgtbkyafndv.supabase.co',
    PUBLISHABLE_API_KEY: 'sb_publishable_yUPqP6PRjtgphcvS0--vgw_Zy3S_Urd',
    
    /**
     * Get Supabase client instance
     * @returns {Object} Supabase client
     */
    getClient() {
        if (!window.supabase) {
            throw new Error('Supabase client library not loaded. Please include the Supabase script in your HTML.');
        }
        return window.supabase.createClient(this.PROJECT_URL, this.PUBLISHABLE_API_KEY);
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
        if (typeof window === 'undefined') {
            throw new Error('Supabase config can only be used in browser environment');
        }
        
        if (!window.supabase) {
            await this.waitForLibrary();
        }
        
        return this.getClient();
    }
};

if (typeof window !== 'undefined') {
    window.SupabaseConfig = SupabaseConfig;
}

