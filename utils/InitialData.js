/**
 * Initial Data Loader
 * Loads initial months data from individual JSON files in data/months/
 */

const InitialData = {
    /**
     * Initialize with months from individual JSON files if localStorage is empty
     */
    async initializeIfEmpty() {
        const allMonths = DataManager.getAllMonths();
        
        if (Object.keys(allMonths).length === 0) {
            // Try to load from files (will fail gracefully with file:// protocol)
            const loadedMonths = await DataManager.loadMonthsFromFiles();
            if (Object.keys(loadedMonths).length > 0) {
                console.log(`Initialized with ${Object.keys(loadedMonths).length} months from individual JSON files`);
                return true;
            } else {
                // localStorage is empty and files couldn't be loaded (file:// protocol)
                console.log('No months found. Use the Import page to load data from JSON files, or create a new month.');
            }
        } else {
            // Months exist in localStorage, try to sync with files if possible
            await DataManager.loadMonthsFromFiles();
        }
        return false;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.InitialData = InitialData;
}
