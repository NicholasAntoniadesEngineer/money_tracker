/**
 * Embedded Initial Data
 * Contains initial months data embedded directly for file:// protocol compatibility
 * This data is loaded when localStorage is empty and JSON files cannot be fetched
 */

const EmbeddedInitialData = {
    /**
     * Get embedded initial months data
     * Returns an object with month keys and their data
     */
    getInitialMonths() {
        // This will be populated by reading the JSON files and embedding them
        // For now, return empty - we'll populate this by reading the actual files
        return {};
    },

    /**
     * Initialize localStorage with embedded data if empty
     */
    initializeIfEmpty() {
        const allMonths = DataManager.getAllMonths();
        
        if (Object.keys(allMonths).length === 0) {
            const embeddedMonths = this.getInitialMonths();
            if (Object.keys(embeddedMonths).length > 0) {
                DataManager.saveAllMonths(embeddedMonths);
                console.log(`Initialized with ${Object.keys(embeddedMonths).length} months from embedded data`);
                return true;
            }
        }
        return false;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.EmbeddedInitialData = EmbeddedInitialData;
}

