/**
 * Key Management Service
 *
 * High-level orchestration of all encryption key operations.
 * Coordinates between:
 * - CryptoPrimitivesService (crypto operations)
 * - KeyStorageService (local IndexedDB)
 * - KeyBackupService (database backups)
 * - HistoricalKeysService (key history)
 * - KeyDerivationService (HKDF)
 */

const KeyManagementService = {
    /**
     * Current user ID
     */
    currentUserId: null,

    /**
     * Current key epoch
     */
    currentEpoch: 0,

    /**
     * Backup key derived from identity key
     */
    _backupKey: null,

    /**
     * Whether the service is initialized
     */
    initialized: false,

    /**
     * Configuration (set during initialize)
     */
    _config: null,

    /**
     * Database service reference
     */
    _database: null,

    /**
     * Initialize the service for a user
     * @param {Object} config - Encryption config object
     * @param {string} userId - User ID
     * @returns {Promise<Object>} { success: boolean, needsRestore?: boolean, error?: string }
     */
    async initialize(config, userId) {
        this._config = config;
        this._database = config.services?.database;
        this.currentUserId = userId;

        console.log(`[KeyManagementService] Initializing for user ${userId.slice(0, 8)}...`);

        try {
            // Initialize dependencies
            await CryptoPrimitivesService.initialize(config);
            await KeyStorageService.initialize(config);
            KeyDerivationService.initialize(config);
            HistoricalKeysService.initialize(config);
            KeyBackupService.initialize(config);
            PasswordCryptoService.initialize(config);

            // Check for existing local keys
            let keys = await KeyStorageService.getIdentityKeys(userId);

            if (!keys) {
                // No local keys - check if we have a backup in database
                const hasBackup = await KeyBackupService.hasBackup(userId);

                if (hasBackup) {
                    console.log('[KeyManagementService] Keys exist in database - restoration required');
                    return { success: false, needsRestore: true };
                }

                // No backup either - this is a new user, don't auto-generate
                // The facade will handle key generation when needed
                console.log('[KeyManagementService] No keys found - ready for generation');
                this.initialized = true;
                return { success: true, keysExist: false };
            }

            // Verify local keys match database
            const dbPublicKey = await HistoricalKeysService.getCurrentKey(userId);
            if (dbPublicKey) {
                const localPublicKeyB64 = CryptoPrimitivesService.serializeKey(keys.publicKey);
                if (localPublicKeyB64 !== dbPublicKey) {
                    console.warn('[KeyManagementService] Local key mismatch with database');
                    // Local keys don't match - need restoration
                    return { success: false, needsRestore: true, keyMismatch: true };
                }
            }

            // Fetch current epoch from database
            await this._fetchCurrentEpoch(userId);

            // Derive backup key for session encryption
            const userSalt = KeyDerivationService.stringToBytes(userId);
            this._backupKey = await KeyDerivationService.deriveBackupKey(keys.secretKey, userSalt);

            // Sync session keys from database to local
            await this._syncSessionKeys(userId);

            // Sync historical keys
            await HistoricalKeysService.syncToLocal(userId);

            this.initialized = true;
            console.log(`[KeyManagementService] Initialized with epoch ${this.currentEpoch}`);

            return { success: true, keysExist: true };
        } catch (error) {
            console.error('[KeyManagementService] Initialization failed:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Generate new identity keys for the user
     * @param {string} password - Password for backup encryption
     * @returns {Promise<Object>} { success: boolean, recoveryKey?: string }
     */
    async generateKeys(password) {
        if (!this.currentUserId) {
            throw new Error('[KeyManagementService] No user ID set');
        }

        console.log('[KeyManagementService] Generating new identity keys...');

        // Generate new key pair
        const keys = CryptoPrimitivesService.generateKeyPair();
        const publicKeyB64 = CryptoPrimitivesService.serializeKey(keys.publicKey);

        // Store locally
        await KeyStorageService.storeIdentityKeys(this.currentUserId, keys);

        // Store public key in database
        if (this._database) {
            const identityTable = this._config?.tables?.identityKeys || 'identity_keys';

            await this._database.queryUpsert(identityTable, {
                user_id: this.currentUserId,
                public_key: publicKeyB64,
                current_epoch: 0,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id',
                returning: true
            });
        }

        // Create encrypted backup
        const backupResult = await KeyBackupService.createIdentityBackup(
            this.currentUserId,
            keys.secretKey,
            password
        );

        // Store initial public key in history (epoch 0)
        await HistoricalKeysService.storeKey(this.currentUserId, publicKeyB64, 0);

        // Derive backup key
        const userSalt = KeyDerivationService.stringToBytes(this.currentUserId);
        this._backupKey = await KeyDerivationService.deriveBackupKey(keys.secretKey, userSalt);

        this.currentEpoch = 0;
        this.initialized = true;

        console.log('[KeyManagementService] Keys generated successfully');

        return {
            success: true,
            recoveryKey: backupResult.recoveryKey,
            publicKey: publicKeyB64,
            fingerprint: CryptoPrimitivesService.getKeyFingerprint(keys.publicKey)
        };
    },

    /**
     * Restore keys from password backup
     * @param {string} password - Backup password
     * @returns {Promise<Object>} { success: boolean }
     */
    async restoreFromPassword(password) {
        console.log('[KeyManagementService] Restoring from password...');

        const secretKey = await KeyBackupService.restoreFromPassword(this.currentUserId, password);

        // Derive public key from secret key
        // Note: In NaCl, we need to regenerate the pair or store public key separately
        // For now, we'll fetch the public key from the database
        const publicKeyB64 = await HistoricalKeysService.getCurrentKey(this.currentUserId);
        if (!publicKeyB64) {
            throw new Error('Cannot find public key in database');
        }

        const publicKey = CryptoPrimitivesService.deserializeKey(publicKeyB64);

        // Store locally
        await KeyStorageService.storeIdentityKeys(this.currentUserId, {
            publicKey,
            secretKey
        });

        // Fetch epoch
        await this._fetchCurrentEpoch(this.currentUserId);

        // Derive backup key
        const userSalt = KeyDerivationService.stringToBytes(this.currentUserId);
        this._backupKey = await KeyDerivationService.deriveBackupKey(secretKey, userSalt);

        // Sync session keys
        await this._syncSessionKeys(this.currentUserId);

        // Sync historical keys
        await HistoricalKeysService.syncToLocal(this.currentUserId);

        this.initialized = true;
        console.log('[KeyManagementService] Restored successfully');

        return { success: true };
    },

    /**
     * Restore keys from recovery key
     * @param {string} recoveryKey - Recovery key
     * @returns {Promise<Object>} { success: boolean }
     */
    async restoreFromRecoveryKey(recoveryKey) {
        console.log('[KeyManagementService] Restoring from recovery key...');

        const secretKey = await KeyBackupService.restoreFromRecoveryKey(this.currentUserId, recoveryKey);

        const publicKeyB64 = await HistoricalKeysService.getCurrentKey(this.currentUserId);
        if (!publicKeyB64) {
            throw new Error('Cannot find public key in database');
        }

        const publicKey = CryptoPrimitivesService.deserializeKey(publicKeyB64);

        await KeyStorageService.storeIdentityKeys(this.currentUserId, {
            publicKey,
            secretKey
        });

        await this._fetchCurrentEpoch(this.currentUserId);

        const userSalt = KeyDerivationService.stringToBytes(this.currentUserId);
        this._backupKey = await KeyDerivationService.deriveBackupKey(secretKey, userSalt);

        await this._syncSessionKeys(this.currentUserId);
        await HistoricalKeysService.syncToLocal(this.currentUserId);

        this.initialized = true;
        console.log('[KeyManagementService] Restored successfully');

        return { success: true };
    },

    /**
     * Regenerate identity keys (key rotation)
     * @returns {Promise<Object>} { success: boolean, newEpoch: number }
     */
    async regenerateKeys() {
        if (!this.initialized) {
            throw new Error('[KeyManagementService] Not initialized');
        }

        console.log('[KeyManagementService] Regenerating keys...');

        const oldKeys = await KeyStorageService.getIdentityKeys(this.currentUserId);
        const oldEpoch = this.currentEpoch;

        // Archive old public key BEFORE generating new
        await HistoricalKeysService.storeKey(
            this.currentUserId,
            CryptoPrimitivesService.serializeKey(oldKeys.publicKey),
            oldEpoch
        );

        // Generate new keys
        const newKeys = CryptoPrimitivesService.generateKeyPair();
        const newPublicKeyB64 = CryptoPrimitivesService.serializeKey(newKeys.publicKey);
        const newEpoch = oldEpoch + 1;

        // Store new keys locally
        await KeyStorageService.storeIdentityKeys(this.currentUserId, newKeys);

        // Update database
        if (this._database) {
            const identityTable = this._config?.tables?.identityKeys || 'identity_keys';

            await this._database.queryUpdate(identityTable, {
                public_key: newPublicKeyB64,
                current_epoch: newEpoch,
                updated_at: new Date().toISOString()
            }, {
                user_id: this.currentUserId
            });
        }

        // Store new key in history
        await HistoricalKeysService.storeKey(this.currentUserId, newPublicKeyB64, newEpoch);

        // Re-encrypt session backups
        const oldBackupKey = this._backupKey;
        const userSalt = KeyDerivationService.stringToBytes(this.currentUserId);
        this._backupKey = await KeyDerivationService.deriveBackupKey(newKeys.secretKey, userSalt);

        await KeyBackupService.reEncryptSessionBackups(
            this.currentUserId,
            oldBackupKey,
            this._backupKey
        );

        this.currentEpoch = newEpoch;

        console.log(`[KeyManagementService] Keys regenerated. New epoch: ${newEpoch}`);

        return {
            success: true,
            newEpoch,
            fingerprint: CryptoPrimitivesService.getKeyFingerprint(newKeys.publicKey)
        };
    },

    /**
     * Check if key rotation is due and rotate if needed
     * @param {number|null} intervalMs - Custom interval (uses config if null)
     * @returns {Promise<Object>} { rotated: boolean, reason: string, newEpoch?: number }
     */
    async checkAndRotateIfNeeded(intervalMs = null) {
        if (!this.initialized) {
            return { rotated: false, reason: 'not_initialized' };
        }

        // Get rotation config
        const rotationConfig = this._config?.keyRotation || {};
        if (rotationConfig.enabled === false) {
            return { rotated: false, reason: 'rotation_disabled' };
        }

        // Determine interval
        const minInterval = rotationConfig.minIntervalMs || 3600000; // 1 hour min
        const maxInterval = rotationConfig.maxIntervalMs || 2592000000; // 30 days max
        let interval = intervalMs || rotationConfig.intervalMs || 86400000; // 24h default

        // Clamp interval to valid range
        interval = Math.max(minInterval, Math.min(maxInterval, interval));

        // Fetch last update time from database
        if (!this._database) {
            return { rotated: false, reason: 'no_database' };
        }

        const identityTable = this._config?.tables?.identityKeys || 'identity_keys';

        try {
            const result = await this._database.querySelect(identityTable, {
                filter: { user_id: this.currentUserId },
                limit: 1
            });

            const lastUpdated = result.data?.[0]?.updated_at;
            if (!lastUpdated) {
                return { rotated: false, reason: 'no_keys' };
            }

            const lastRotationTime = new Date(lastUpdated).getTime();
            const now = Date.now();
            const elapsed = now - lastRotationTime;

            if (elapsed > interval) {
                console.log(`[KeyManagementService] Auto-rotating keys (${Math.round(elapsed / 3600000)}h since last rotation)`);
                const rotateResult = await this.regenerateKeys();
                return {
                    rotated: true,
                    newEpoch: rotateResult.newEpoch,
                    fingerprint: rotateResult.fingerprint,
                    elapsed: elapsed
                };
            }

            const nextRotation = interval - elapsed;
            return {
                rotated: false,
                reason: 'not_due',
                nextRotationMs: nextRotation,
                nextRotationHuman: this._formatDuration(nextRotation)
            };
        } catch (error) {
            console.error('[KeyManagementService] Rotation check failed:', error);
            return { rotated: false, reason: 'error', error: error.message };
        }
    },

    /**
     * Get rotation status
     * @returns {Promise<Object>} Current rotation status
     */
    async getRotationStatus() {
        if (!this._database || !this.currentUserId) {
            return { configured: false };
        }

        const rotationConfig = this._config?.keyRotation || {};
        const identityTable = this._config?.tables?.identityKeys || 'identity_keys';

        try {
            const result = await this._database.querySelect(identityTable, {
                filter: { user_id: this.currentUserId },
                limit: 1
            });

            const lastUpdated = result.data?.[0]?.updated_at;
            const now = Date.now();
            const lastRotationTime = lastUpdated ? new Date(lastUpdated).getTime() : null;
            const interval = rotationConfig.intervalMs || 86400000;

            return {
                configured: true,
                enabled: rotationConfig.enabled !== false,
                intervalMs: interval,
                intervalHuman: this._formatDuration(interval),
                lastRotation: lastUpdated,
                timeSinceLastRotation: lastRotationTime ? now - lastRotationTime : null,
                timeSinceHuman: lastRotationTime ? this._formatDuration(now - lastRotationTime) : null,
                currentEpoch: this.currentEpoch
            };
        } catch (error) {
            console.error('[KeyManagementService] Failed to get rotation status:', error);
            return { configured: false, error: error.message };
        }
    },

    /**
     * Format duration for human-readable output
     * @private
     * @param {number} ms - Duration in milliseconds
     * @returns {string} Human-readable duration
     */
    _formatDuration(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days}d ${hours % 24}h`;
        }
        return `${hours}h ${minutes}m`;
    },

    /**
     * Establish a session with another user for a conversation
     * @param {number|string} conversationId - Conversation ID
     * @param {string} otherUserId - Other user's ID
     * @returns {Promise<Object>} { sessionKey, epoch, counter }
     */
    async establishSession(conversationId, otherUserId) {
        if (!this.initialized) {
            throw new Error('[KeyManagementService] Not initialized');
        }

        // Check if session already exists for current epoch
        let session = await KeyStorageService.getSessionKey(conversationId, this.currentEpoch);
        if (session) {
            return {
                sessionKey: session.sessionKey,
                epoch: this.currentEpoch,
                counter: session.counter
            };
        }

        console.log(`[KeyManagementService] Establishing session for conv=${conversationId}`);

        // Get other user's current public key
        const theirPublicKeyB64 = await HistoricalKeysService.getCurrentKey(otherUserId);
        if (!theirPublicKeyB64) {
            throw new Error(`Other user (${otherUserId.slice(0, 8)}...) has no public key`);
        }

        // Get our keys
        const ourKeys = await KeyStorageService.getIdentityKeys(this.currentUserId);
        if (!ourKeys) {
            throw new Error('No local identity keys');
        }

        // ECDH key agreement
        const theirPublicKey = CryptoPrimitivesService.deserializeKey(theirPublicKeyB64);
        const sharedSecret = CryptoPrimitivesService.deriveSharedSecret(ourKeys.secretKey, theirPublicKey);

        // Derive epoch-specific session key
        const sessionKey = await KeyDerivationService.deriveSessionKey(sharedSecret, this.currentEpoch);

        // Store locally
        await KeyStorageService.storeSessionKey(conversationId, this.currentEpoch, sessionKey, 0);

        // Backup to database
        await KeyBackupService.backupSessionKey(
            this.currentUserId,
            conversationId,
            sessionKey,
            this.currentEpoch,
            this._backupKey
        );

        console.log(`[KeyManagementService] Session established for conv=${conversationId}, epoch=${this.currentEpoch}`);

        return {
            sessionKey,
            epoch: this.currentEpoch,
            counter: 0
        };
    },

    /**
     * Encrypt a message
     * @param {number|string} conversationId - Conversation ID
     * @param {string} plaintext - Message to encrypt
     * @returns {Promise<Object>} { ciphertext, nonce, counter, epoch }
     */
    async encryptMessage(conversationId, plaintext) {
        if (!this.initialized) {
            throw new Error('[KeyManagementService] Not initialized');
        }

        const session = await KeyStorageService.getSessionKey(conversationId, this.currentEpoch);
        if (!session) {
            throw new Error('No session - call establishSession first');
        }

        // Derive message-specific key
        const messageKey = await KeyDerivationService.deriveMessageKey(
            session.sessionKey,
            this.currentEpoch,
            session.counter
        );

        // Encrypt
        const encrypted = CryptoPrimitivesService.encrypt(plaintext, messageKey);

        // Get counter before incrementing
        const counter = session.counter;

        // Increment counter
        await KeyStorageService.incrementCounter(conversationId, this.currentEpoch);

        // Update backup counter
        await KeyBackupService.updateSessionCounter(
            this.currentUserId,
            conversationId,
            this.currentEpoch,
            counter + 1
        );

        return {
            ciphertext: encrypted.ciphertext,
            nonce: encrypted.nonce,
            counter: counter,
            epoch: this.currentEpoch
        };
    },

    /**
     * Decrypt a message
     * @param {number|string} conversationId - Conversation ID
     * @param {Object} encryptedData - { ciphertext, nonce, counter, epoch }
     * @param {string} senderId - Sender's user ID
     * @returns {Promise<string>} Decrypted plaintext
     */
    async decryptMessage(conversationId, encryptedData, senderId) {
        if (!this.initialized) {
            throw new Error('[KeyManagementService] Not initialized');
        }

        const { ciphertext, nonce, counter, epoch } = encryptedData;

        // Get session for message's epoch
        let session = await KeyStorageService.getSessionKey(conversationId, epoch);

        if (!session) {
            // Try to derive using historical key
            session = await this._deriveSessionFromHistory(conversationId, senderId, epoch);
        }

        if (!session) {
            throw new Error(`No session key for epoch ${epoch} - message cannot be decrypted`);
        }

        // Derive message key
        const messageKey = await KeyDerivationService.deriveMessageKey(
            session.sessionKey,
            epoch,
            counter
        );

        // Decrypt
        return CryptoPrimitivesService.decrypt(ciphertext, nonce, messageKey);
    },

    /**
     * Get safety number for a conversation
     * @param {string} otherUserId - Other user's ID
     * @returns {Promise<string>} Formatted safety number
     */
    async getSafetyNumber(otherUserId) {
        const ourKeys = await KeyStorageService.getIdentityKeys(this.currentUserId);
        if (!ourKeys) {
            throw new Error('No local identity keys');
        }

        const theirPublicKeyB64 = await HistoricalKeysService.getCurrentKey(otherUserId);
        if (!theirPublicKeyB64) {
            throw new Error('Other user has no public key');
        }

        const theirPublicKey = CryptoPrimitivesService.deserializeKey(theirPublicKeyB64);

        return CryptoPrimitivesService.generateSafetyNumber(ourKeys.publicKey, theirPublicKey);
    },

    /**
     * Get our public key fingerprint
     * @returns {Promise<string>} Hex fingerprint
     */
    async getOurFingerprint() {
        const keys = await KeyStorageService.getIdentityKeys(this.currentUserId);
        if (!keys) {
            return null;
        }
        return CryptoPrimitivesService.getKeyFingerprint(keys.publicKey);
    },

    /**
     * Fetch current epoch from database
     * @private
     * @param {string} userId - User ID
     */
    async _fetchCurrentEpoch(userId) {
        if (!this._database) {
            this.currentEpoch = 0;
            return;
        }

        const identityTable = this._config?.tables?.identityKeys || 'identity_keys';

        try {
            const result = await this._database.querySelect(identityTable, {
                filter: { user_id: userId },
                limit: 1
            });

            this.currentEpoch = result.data?.[0]?.current_epoch || 0;
            console.log(`[KeyManagementService] Current epoch: ${this.currentEpoch}`);
        } catch (error) {
            console.error('[KeyManagementService] Failed to fetch epoch:', error);
            this.currentEpoch = 0;
        }
    },

    /**
     * Sync session keys from database to local
     * @private
     * @param {string} userId - User ID
     */
    async _syncSessionKeys(userId) {
        if (!this._backupKey) {
            console.warn('[KeyManagementService] No backup key - cannot sync sessions');
            return;
        }

        const sessions = await KeyBackupService.restoreSessionKeys(userId, this._backupKey);

        for (const session of sessions) {
            await KeyStorageService.storeSessionKey(
                session.conversationId,
                session.epoch,
                session.sessionKey,
                session.counter
            );
        }

        console.log(`[KeyManagementService] Synced ${sessions.length} session keys`);
    },

    /**
     * Derive session key from historical public key
     * @private
     * @param {number|string} conversationId - Conversation ID
     * @param {string} otherUserId - Other user's ID
     * @param {number} epoch - Key epoch
     * @returns {Promise<Object|null>} { sessionKey, epoch, counter } or null
     */
    async _deriveSessionFromHistory(conversationId, otherUserId, epoch) {
        console.log(`[KeyManagementService] Deriving session from history: epoch=${epoch}`);

        // Get their public key at that epoch
        const theirPublicKeyB64 = await HistoricalKeysService.getKeyForEpoch(otherUserId, epoch);
        if (!theirPublicKeyB64) {
            console.warn(`[KeyManagementService] No historical key found for user at epoch ${epoch}`);
            return null;
        }

        // Get our keys
        const ourKeys = await KeyStorageService.getIdentityKeys(this.currentUserId);
        if (!ourKeys) {
            return null;
        }

        // ECDH
        const theirPublicKey = CryptoPrimitivesService.deserializeKey(theirPublicKeyB64);
        const sharedSecret = CryptoPrimitivesService.deriveSharedSecret(ourKeys.secretKey, theirPublicKey);

        // Derive session key
        const sessionKey = await KeyDerivationService.deriveSessionKey(sharedSecret, epoch);

        // Cache for future use
        await KeyStorageService.storeSessionKey(conversationId, epoch, sessionKey, 0);

        return { sessionKey, epoch, counter: 0 };
    },

    /**
     * Clear all local encryption data
     */
    async clearLocalData() {
        console.log('[KeyManagementService] Clearing local data...');
        await KeyStorageService.clearAll();
        this.initialized = false;
        this.currentUserId = null;
        this.currentEpoch = 0;
        this._backupKey = null;
    }
};

if (typeof window !== 'undefined') {
    window.KeyManagementService = KeyManagementService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyManagementService;
}
