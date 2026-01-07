/**
 * Global Logging Configuration
 * Controls all console logging across the entire application
 * This file should be loaded FIRST, before any other scripts
 * @module shared/config/loggingConfig
 */

// ============================================================================
// SINGLE LINE TO CONTROL ALL LOGGING - Change this line to enable/disable logs
// ============================================================================
const ENABLE_ALL_LOGS = true; // Set to true to enable all console logging, false to disable
// ============================================================================

/**
 * Global Logging Configuration
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

// Initialize global logging configuration
window.LoggingConfig = window.LoggingConfig || {};
window.LoggingConfig.ENABLE_ALL_LOGS = ENABLE_ALL_LOGS;

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
    const loggingEnabled = window.LoggingConfig && window.LoggingConfig.ENABLE_ALL_LOGS === true;

    if (!loggingEnabled) {
        // Assign no-op functions - zero overhead when disabled!
        // Arguments are not evaluated and empty functions are optimized away by JS engines
        console.log = function() {};
        console.warn = function() {};
        console.error = function() {};
        console.info = function() {};
        console.debug = function() {};

        // Log that logging is disabled (using original methods)
        originalLog('[LoggingConfig] All console logging is DISABLED');
    } else {
        // Log that logging is enabled
        console.log('[LoggingConfig] All console logging is ENABLED');
    }
    // If logging is enabled, keep original methods (no wrapper needed)

    // Store original methods for potential restoration
    console._originalLog = originalLog;
    console._originalWarn = originalWarn;
    console._originalError = originalError;
    console._originalInfo = originalInfo;
    console._originalDebug = originalDebug;

    // Provide method to restore original console methods
    window.LoggingConfig.restoreConsole = function() {
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
        console.info = originalInfo;
        console.debug = originalDebug;
    };

    // Provide method to disable console methods
    window.LoggingConfig.disableConsole = function() {
        console.log = function() {};
        console.warn = function() {};
        console.error = function() {};
        console.info = function() {};
        console.debug = function() {};
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.LoggingConfig;
}
