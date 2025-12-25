/**
 * Font Size Loader
 * Loads and applies font size setting BEFORE page renders to prevent FOUC
 * Uses localStorage cache for immediate application, then syncs with database
 */

(function() {
    'use strict';
    
    // Apply font size immediately from localStorage cache (if available)
    const cachedFontSize = localStorage.getItem('money_tracker_fontSize');
    if (cachedFontSize) {
        document.documentElement.style.fontSize = cachedFontSize + 'px';
    } else {
        // Default font size
        document.documentElement.style.fontSize = '16px';
    }
    
    // Function to load font size from database and update
    async function loadFontSizeFromDatabase() {
        try {
            // Wait for required services to be available
            if (!window.DatabaseService || !window.AuthService) {
                // Retry after a short delay
                setTimeout(loadFontSizeFromDatabase, 100);
                return;
            }
            
            // Check if user is authenticated
            if (!window.AuthService.isAuthenticated()) {
                return;
            }
            
            // Get settings from database
            const settings = await window.DatabaseService.getSettings();
            if (settings && settings.fontSize) {
                const fontSize = settings.fontSize;
                
                // Apply font size
                document.documentElement.style.fontSize = fontSize + 'px';
                
                // Update localStorage cache
                localStorage.setItem('money_tracker_fontSize', fontSize);
            }
        } catch (error) {
            console.warn('[FontSizeLoader] Error loading font size from database:', error);
            // Keep using cached or default value
        }
    }
    
    // Start loading from database once services are ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadFontSizeFromDatabase);
    } else {
        // DOM already loaded, try immediately
        loadFontSizeFromDatabase();
    }
    
    // Also try when window loads (in case services load later)
    window.addEventListener('load', loadFontSizeFromDatabase);
})();

