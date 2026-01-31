/**
 * Rate Limiter
 * Prevents brute force attacks on authentication endpoints
 * Tracks attempts in memory (per-tab) and provides rate limiting functionality
 */

const RateLimiter = {
    /**
     * Track attempts by action:identifier
     */
    _attempts: {},

    /**
     * Configuration per action type
     */
    _config: {
        signin: {
            maxAttempts: 5,
            windowMs: 300000,  // 5 minutes
            message: 'Too many sign-in attempts. Please try again in {minutes} minutes.'
        },
        signup: {
            maxAttempts: 3,
            windowMs: 3600000, // 1 hour
            message: 'Too many sign-up attempts. Please try again in {minutes} minutes.'
        },
        passwordReset: {
            maxAttempts: 3,
            windowMs: 900000,  // 15 minutes
            message: 'Too many password reset attempts. Please try again in {minutes} minutes.'
        },
        keyRestore: {
            maxAttempts: 5,
            windowMs: 600000,  // 10 minutes
            message: 'Too many key restoration attempts. Please try again in {minutes} minutes.'
        }
    },

    /**
     * Check if an action is allowed
     * @param {string} action - Action type (signin, signup, passwordReset, keyRestore)
     * @param {string} identifier - User identifier (email or user ID)
     * @returns {{ allowed: boolean, retryAfterMs?: number, remainingAttempts?: number, message?: string }}
     */
    checkLimit(action, identifier) {
        const config = this._config[action];
        if (!config) {
            console.warn(`[RateLimiter] Unknown action type: ${action}`);
            return { allowed: true };
        }

        const key = `${action}:${identifier.toLowerCase()}`;
        const now = Date.now();

        // Initialize or clean old attempts
        if (!this._attempts[key]) {
            this._attempts[key] = [];
        }

        // Remove attempts outside the window
        this._attempts[key] = this._attempts[key].filter(
            timestamp => now - timestamp < config.windowMs
        );

        const currentAttempts = this._attempts[key].length;

        if (currentAttempts >= config.maxAttempts) {
            const oldestAttempt = this._attempts[key][0];
            const retryAfterMs = config.windowMs - (now - oldestAttempt);
            const minutes = Math.ceil(retryAfterMs / 60000);

            return {
                allowed: false,
                retryAfterMs,
                message: config.message.replace('{minutes}', minutes)
            };
        }

        return {
            allowed: true,
            remainingAttempts: config.maxAttempts - currentAttempts
        };
    },

    /**
     * Record an attempt for an action
     * Call this BEFORE attempting the action
     * @param {string} action - Action type
     * @param {string} identifier - User identifier
     */
    recordAttempt(action, identifier) {
        const key = `${action}:${identifier.toLowerCase()}`;

        if (!this._attempts[key]) {
            this._attempts[key] = [];
        }

        this._attempts[key].push(Date.now());

        // Log for debugging
        console.log(`[RateLimiter] Recorded attempt for ${action}:${identifier.slice(0, 8)}... (${this._attempts[key].length} attempts)`);
    },

    /**
     * Clear attempts on successful action
     * Call this after a successful action to reset the counter
     * @param {string} action - Action type
     * @param {string} identifier - User identifier
     */
    clearAttempts(action, identifier) {
        const key = `${action}:${identifier.toLowerCase()}`;
        delete this._attempts[key];
        console.log(`[RateLimiter] Cleared attempts for ${action}:${identifier.slice(0, 8)}...`);
    },

    /**
     * Get current status for an action
     * @param {string} action - Action type
     * @param {string} identifier - User identifier
     * @returns {{ attempts: number, maxAttempts: number, windowMs: number }}
     */
    getStatus(action, identifier) {
        const config = this._config[action];
        if (!config) {
            return { attempts: 0, maxAttempts: 0, windowMs: 0 };
        }

        const key = `${action}:${identifier.toLowerCase()}`;
        const now = Date.now();

        // Clean old attempts first
        if (this._attempts[key]) {
            this._attempts[key] = this._attempts[key].filter(
                timestamp => now - timestamp < config.windowMs
            );
        }

        return {
            attempts: (this._attempts[key] || []).length,
            maxAttempts: config.maxAttempts,
            windowMs: config.windowMs
        };
    },

    /**
     * Reset all rate limits (useful for testing)
     */
    reset() {
        this._attempts = {};
        console.log('[RateLimiter] All rate limits reset');
    },

    /**
     * Update configuration for an action
     * @param {string} action - Action type
     * @param {{ maxAttempts?: number, windowMs?: number, message?: string }} config
     */
    configure(action, config) {
        if (this._config[action]) {
            this._config[action] = { ...this._config[action], ...config };
        } else {
            this._config[action] = {
                maxAttempts: config.maxAttempts || 5,
                windowMs: config.windowMs || 300000,
                message: config.message || 'Too many attempts. Please try again later.'
            };
        }
        console.log(`[RateLimiter] Configuration updated for ${action}`);
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.RateLimiter = RateLimiter;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RateLimiter;
}

console.log('[RateLimiter] Utility loaded');
