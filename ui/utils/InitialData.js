/**
 * Initial Data Loader
 * No longer needed - data is loaded from Supabase database
 * This file is kept for backwards compatibility but does nothing
 */

const InitialData = {
    /**
     * Initialize - no longer needed with Supabase
     */
    async initializeIfEmpty() {
        // Data is now loaded from Supabase database
        // This method is kept for backwards compatibility
        return false;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.InitialData = InitialData;
}
