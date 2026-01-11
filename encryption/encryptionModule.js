/**
 * Encryption Module
 *
 * Central module initializer for the encryption system.
 * Handles:
 * - Subscription-based feature gating
 * - Loading encryption services conditionally
 * - Providing the appropriate facade (encryption or null)
 */

const EncryptionModule = {
    /**
     * Module version
     */
    VERSION: '2.0.0',

    /**
     * Configuration
     */
    config: null,

    /**
     * Whether the module is initialized
     */
    initialized: false,

    /**
     * Whether encryption is enabled for this user
     */
    enabled: false,

    /**
     * The active facade (EncryptionFacade or NullEncryptionFacade)
     */
    _facade: null,

    /**
     * Current user ID
     */
    _userId: null,

    /**
     * Initialize the encryption module
     * @param {Object} config - Encryption config object
     * @returns {Promise<Object>} { success: boolean, enabled: boolean }
     */
    async initialize(config) {
        console.log(`[EncryptionModule] Initializing v${this.VERSION}...`);

        this.config = config;

        // Inject services from global scope if not provided
        if (!config.services.database && window.DatabaseService) {
            config.services.database = window.DatabaseService;
        }

        if (!config.services.auth && window.AuthService) {
            config.services.auth = window.AuthService;
        }

        if (!config.services.subscriptionGuard && window.SubscriptionGuard) {
            config.services.subscriptionGuard = window.SubscriptionGuard;
        }

        // Validate config
        const validation = config.validate();
        if (!validation.valid) {
            console.error('[EncryptionModule] Invalid config:', validation.errors);
            throw new Error(`Invalid encryption config: ${validation.errors.join(', ')}`);
        }

        // Check subscription tier
        const requiredTier = config.features?.requiredTier;
        let hasTier = true;

        if (requiredTier && config.services.subscriptionGuard) {
            try {
                hasTier = await config.services.subscriptionGuard.hasTier(requiredTier);
            } catch (error) {
                console.warn('[EncryptionModule] Failed to check subscription:', error);
                hasTier = false;
            }
        }

        if (!hasTier) {
            console.log('[EncryptionModule] User does not have required tier - encryption disabled');
            this.enabled = false;
            this._facade = NullEncryptionFacade;
            this.initialized = true;
            return { success: true, enabled: false };
        }

        // User has required tier - initialize encryption
        try {
            // Initialize the crypto library loader with config
            CryptoLibraryLoader.initialize(config);

            // Load the crypto library
            await CryptoLibraryLoader.load();

            this.enabled = true;
            this._facade = EncryptionFacade;
            this.initialized = true;

            console.log('[EncryptionModule] Encryption enabled');
            return { success: true, enabled: true };
        } catch (error) {
            console.error('[EncryptionModule] Failed to load crypto library:', error);

            // Fall back to null facade
            this.enabled = false;
            this._facade = NullEncryptionFacade;
            this.initialized = true;

            return { success: true, enabled: false, loadError: error.message };
        }
    },

    /**
     * Initialize for a specific user
     * Call this after initialize() and after user authentication
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Initialization result
     */
    async initializeForUser(userId) {
        if (!this.initialized) {
            throw new Error('[EncryptionModule] Module not initialized. Call initialize() first.');
        }

        this._userId = userId;

        if (!this.enabled) {
            // Null facade just returns success
            return await this._facade.initialize(this.config, userId);
        }

        // Initialize the encryption facade for this user
        const result = await this._facade.initialize(this.config, userId);

        // Check for key rotation if configured and encryption is set up
        if (result.success && !result.needsSetup && !result.needsRestore) {
            const rotationConfig = this.config?.keyRotation || {};
            if (rotationConfig.enabled !== false && rotationConfig.checkOnInit !== false) {
                try {
                    const rotationResult = await this._facade.checkAndRotateIfNeeded();
                    if (rotationResult.rotated) {
                        console.log(`[EncryptionModule] Auto-rotated keys to epoch ${rotationResult.newEpoch}`);
                        result.keyRotation = rotationResult;
                    } else if (rotationResult.reason === 'not_due') {
                        console.log(`[EncryptionModule] Next key rotation in ${rotationResult.nextRotationHuman}`);
                    }
                } catch (error) {
                    console.warn('[EncryptionModule] Key rotation check failed:', error);
                    // Don't fail initialization due to rotation check failure
                }
            }
        }

        return result;
    },

    /**
     * Get the active facade
     * @returns {Object} EncryptionFacade or NullEncryptionFacade
     */
    getFacade() {
        if (!this.initialized) {
            throw new Error('[EncryptionModule] Module not initialized. Call initialize() first.');
        }
        return this._facade;
    },

    /**
     * Check if encryption is enabled
     * @returns {boolean}
     */
    isEnabled() {
        return this.enabled;
    },

    /**
     * Check if the module is initialized
     * @returns {boolean}
     */
    isInitialized() {
        return this.initialized;
    },

    /**
     * Get module status
     * @returns {Object}
     */
    getStatus() {
        return {
            version: this.VERSION,
            initialized: this.initialized,
            enabled: this.enabled,
            userId: this._userId?.slice(0, 8) + '...',
            facade: this.enabled ? 'EncryptionFacade' : 'NullEncryptionFacade',
            facadeStatus: this._facade?.getStatus?.() || null
        };
    },

    /**
     * Re-check subscription and update enabled state
     * Call this when subscription status may have changed
     * @returns {Promise<boolean>} New enabled state
     */
    async refreshSubscriptionStatus() {
        if (!this.initialized || !this.config) {
            return this.enabled;
        }

        const requiredTier = this.config.features?.requiredTier;
        if (!requiredTier || !this.config.services.subscriptionGuard) {
            return this.enabled;
        }

        try {
            const hasTier = await this.config.services.subscriptionGuard.hasTier(requiredTier);

            if (hasTier && !this.enabled) {
                // User upgraded - enable encryption
                console.log('[EncryptionModule] Subscription upgraded - enabling encryption');

                await CryptoLibraryLoader.load();
                this.enabled = true;
                this._facade = EncryptionFacade;

                // Re-initialize for user if we have one
                if (this._userId) {
                    await this._facade.initialize(this.config, this._userId);
                }
            } else if (!hasTier && this.enabled) {
                // User downgraded - disable encryption
                console.log('[EncryptionModule] Subscription downgraded - disabling encryption');
                this.enabled = false;
                this._facade = NullEncryptionFacade;
            }

            return this.enabled;
        } catch (error) {
            console.error('[EncryptionModule] Failed to refresh subscription:', error);
            return this.enabled;
        }
    },

    /**
     * Clear all local encryption data
     */
    async clearLocalData() {
        if (this._facade?.clearLocalData) {
            await this._facade.clearLocalData();
        }
        this._userId = null;
    },

    /**
     * Reset the module (for testing or logout)
     */
    reset() {
        this.config = null;
        this.initialized = false;
        this.enabled = false;
        this._facade = null;
        this._userId = null;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.EncryptionModule = EncryptionModule;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = EncryptionModule;
}
