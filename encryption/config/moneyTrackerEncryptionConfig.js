/**
 * Money Tracker Project-Specific Encryption Configuration
 * This configures the encryption module for the money_tracker project.
 *
 * This file extends EncryptionConfigBase with project-specific values.
 */

// Ensure base config is loaded first
if (typeof EncryptionConfigBase === 'undefined') {
    throw new Error('EncryptionConfigBase must be loaded before MoneyTrackerEncryptionConfig');
}

const MoneyTrackerEncryptionConfig = EncryptionConfigBase.merge({
    services: {
        // Services will be injected at runtime via EncryptionModule.initialize()
        database: null,
        auth: null,
        subscriptionGuard: null
    },

    crypto: {
        naclUrl: 'https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js',
        naclUtilUrl: 'https://cdn.jsdelivr.net/npm/tweetnacl-util@0.15.1/nacl-util.min.js',
        loadTimeout: 15000,
        hkdf: {
            hash: 'SHA-256',
            infoPrefix: 'MoneyTracker'
        },
        pbkdf2: {
            hash: 'SHA-256',
            iterations: 600000,
            keyLength: 256
        }
    },

    indexedDB: {
        name: 'MoneyTrackerEncryption',
        version: 1,
        stores: {
            identityKeys: 'identity_keys',
            sessionKeys: 'session_keys',
            historicalKeys: 'historical_keys'
        }
    },

    tables: {
        identityKeys: 'identity_keys',
        publicKeyHistory: 'public_key_history',
        identityKeyBackups: 'identity_key_backups',
        conversationSessionKeys: 'conversation_session_keys',
        messages: 'messages',
        pairedDevices: 'paired_devices'
    },

    features: {
        // Encryption is a premium feature
        requiredTier: 'premium',
        allowPlaintextFallback: true
    },

    application: {
        name: 'MoneyTracker',
        safetyNumberGroups: 6,
        safetyNumberDigitsPerGroup: 5
    },

    keyRotation: {
        // Enable periodic key rotation for improved forward secrecy
        enabled: true,
        // Rotation interval in milliseconds (default: 24 hours)
        intervalMs: 24 * 60 * 60 * 1000,
        // Minimum interval to prevent excessive rotation (1 hour)
        minIntervalMs: 60 * 60 * 1000,
        // Maximum interval allowed (30 days)
        maxIntervalMs: 30 * 24 * 60 * 60 * 1000,
        // Check for rotation on initialization
        checkOnInit: true
    },

    logging: {
        verbose: true,
        prefix: '[Encryption]'
    }
});

if (typeof window !== 'undefined') {
    window.MoneyTrackerEncryptionConfig = MoneyTrackerEncryptionConfig;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MoneyTrackerEncryptionConfig;
}
