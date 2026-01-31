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
     * Session backup key for encrypting session keys
     * This key is derived from the user's password and survives identity key rotation
     */
    _sessionBackupKey: null,

    /**
     * Key rotation lock state
     */
    _rotationInProgress: false,
    _rotationLockToken: null,

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
    async initialize(userId, config) {
        this._config = config;
        this._database = config.services?.database;

        // Validate userId
        if (!userId || typeof userId !== 'string') {
            console.error('[KeyManagementService] Invalid userId provided:', userId, typeof userId);
            throw new Error('KeyManagementService.initialize requires a valid userId string');
        }

        this.currentUserId = userId;

        console.log(`[KeyManagementService] Initializing for user ${userId.slice(0, 8)}...`);
        console.log(`[KeyManagementService] Database service available: ${!!this._database}`);

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
            console.log(`[KeyManagementService] Local keys exist: ${!!keys}`);

            if (!keys) {
                // No local keys - check if we have a backup in database
                const hasBackup = await KeyBackupService.hasBackup(userId);
                console.log(`[KeyManagementService] No local keys, has backup: ${hasBackup}`);

                if (hasBackup) {
                    console.log('[KeyManagementService] Keys exist in database - restoration required');
                    return { success: false, needsRestore: true, hasBackup: true };
                }

                // No backup either - this is a new user, don't auto-generate
                // The facade will handle key generation when needed
                console.log('[KeyManagementService] No keys found - ready for generation');
                this.initialized = true;
                return { success: true, keysExist: false };
            }

            // Verify local keys match database and auto-repair if missing
            const localPublicKeyB64 = CryptoPrimitivesService.serializeKey(keys.publicKey);
            const dbPublicKey = await HistoricalKeysService.getCurrentKey(userId);
            console.log(`[KeyManagementService] LOCAL public key: ${localPublicKeyB64}`);
            console.log(`[KeyManagementService] DB public key: ${dbPublicKey || 'NULL'}`);
            console.log(`[KeyManagementService] Keys match: ${localPublicKeyB64 === dbPublicKey}`);

            if (!dbPublicKey) {
                // Server key missing - AUTO-REPAIR: upload local key to server
                console.log('[KeyManagementService] AUTO-REPAIR: Server key missing, uploading local key...');
                await this._uploadPublicKeyToServer(userId, localPublicKeyB64);
            } else if (localPublicKeyB64 !== dbPublicKey) {
                // Key mismatch - clear bad local keys and check for backup
                console.log('[KeyManagementService] AUTO-REPAIR: Key mismatch detected, clearing invalid local keys...');
                await KeyStorageService.clearAll();

                // Check if there's a backup we can restore from
                const hasBackup = await KeyBackupService.hasBackup(userId);
                if (hasBackup) {
                    console.log('[KeyManagementService] AUTO-REPAIR: Backup exists, user needs to enter password to restore');
                    return { success: false, needsRestore: true, keyMismatch: true, hasBackup: true };
                }

                // No backup - generate new keys (old messages won't be decryptable)
                console.log('[KeyManagementService] AUTO-REPAIR: No backup found, generating fresh keys...');
                const newKeys = CryptoPrimitivesService.generateKeyPair();
                const newPublicKeyB64 = CryptoPrimitivesService.serializeKey(newKeys.publicKey);

                // Store new keys locally
                await KeyStorageService.storeIdentityKeys(userId, newKeys);
                console.log('[KeyManagementService] AUTO-REPAIR: New keys generated and stored locally');

                // Upload new public key to server (replaces the old one)
                await this._uploadPublicKeyToServer(userId, newPublicKeyB64);
                console.log('[KeyManagementService] AUTO-REPAIR: New public key uploaded to server');

                // Store in history with new epoch
                await this._fetchCurrentEpoch(userId);
                const newEpoch = this.currentEpoch + 1;
                await HistoricalKeysService.storeKey(userId, newPublicKeyB64, newEpoch);

                // Update epoch in identity_keys table
                if (this._database) {
                    const identityTable = this._config?.tables?.identityKeys || 'identity_keys';
                    await this._database.queryUpdate(identityTable, {
                        current_epoch: newEpoch,
                        updated_at: new Date().toISOString()
                    }, { filter: { user_id: userId } });
                }

                this.currentEpoch = newEpoch;
                console.log('[KeyManagementService] AUTO-REPAIR: Fresh keys created, new epoch:', newEpoch);
            }

            // Fetch current epoch from database
            await this._fetchCurrentEpoch(userId);

            // Note: _sessionBackupKey is set during password restore
            // Session sync will only work after password is provided

            // Sync session keys from database to local (requires session backup key)
            if (this._sessionBackupKey) {
                await this._syncSessionKeys(userId);
            }

            // Sync historical keys for ourselves
            await HistoricalKeysService.syncToLocal(userId);

            // Sync historical keys for all conversation partners
            await this._syncConversationPartnerKeys(userId);

            this.initialized = true;
            console.log(`[KeyManagementService] Initialized with epoch ${this.currentEpoch}`);

            return { success: true, keysExist: true };
        } catch (error) {
            console.error('[KeyManagementService] Initialization failed:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Generate and store identity keys without creating a backup
     * Used during device pairing when backup creation is a separate step
     * @param {string} userId - User ID to generate keys for
     * @returns {Promise<Object>} { success: boolean, publicKey: string }
     */
    async generateAndStoreIdentityKeys(userId) {
        if (!userId || typeof userId !== 'string') {
            throw new Error('[KeyManagementService] generateAndStoreIdentityKeys requires a valid userId');
        }

        // Set current user if not set
        if (!this.currentUserId) {
            this.currentUserId = userId;
        }

        console.log('[KeyManagementService] Generating and storing identity keys...');

        // CRITICAL: Clear any old session keys from IndexedDB
        // Old sessions are invalid with new identity keys
        console.log('[KeyManagementService] Clearing old session keys...');
        await KeyStorageService.clearAll();

        // Generate new key pair
        const keys = CryptoPrimitivesService.generateKeyPair();
        const publicKeyB64 = CryptoPrimitivesService.serializeKey(keys.publicKey);

        // Store locally
        await KeyStorageService.storeIdentityKeys(userId, keys);

        // Store public key in database - CRITICAL for E2E encryption
        if (this._database) {
            const identityTable = this._config?.tables?.identityKeys || 'identity_keys';
            console.log(`[KeyManagementService] Storing public key in ${identityTable} for user ${userId.slice(0, 8)}...`);

            try {
                const result = await this._database.queryUpsert(identityTable, {
                    user_id: userId,
                    public_key: publicKeyB64,
                    current_epoch: 0,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id',
                    returning: true
                });

                if (result.error) {
                    console.error(`[KeyManagementService] CRITICAL: Failed to store public key in database:`, result.error);
                    throw new Error(`Failed to store identity key: ${result.error.message || result.error}`);
                }

                console.log(`[KeyManagementService] Public key stored in database successfully`);
            } catch (dbError) {
                console.error(`[KeyManagementService] CRITICAL: Database error storing public key:`, dbError);
                throw new Error(`Failed to store identity key in database: ${dbError.message}`);
            }
        } else {
            console.error(`[KeyManagementService] CRITICAL: No database service - public key NOT stored remotely!`);
            throw new Error('Database service not available - cannot store identity key');
        }

        // Store initial public key in history (epoch 0)
        await HistoricalKeysService.storeKey(userId, publicKeyB64, 0);

        this.currentEpoch = 0;

        // Sync historical keys for all conversation partners
        // This ensures we can decrypt messages from existing conversations
        await this._syncConversationPartnerKeys(userId);

        console.log('[KeyManagementService] Identity keys generated and stored');

        return {
            success: true,
            publicKey: publicKeyB64,
            fingerprint: CryptoPrimitivesService.getKeyFingerprint(keys.publicKey)
        };
    },

    /**
     * Create a dual backup (password + recovery key) for existing identity keys
     * Called after generateAndStoreIdentityKeys during device pairing
     * @param {string} password - Password for backup encryption
     * @param {string} recoveryKey - 24-word recovery key (generated by CryptoPrimitivesService.generateRecoveryKey)
     * @returns {Promise<Object>} { success: boolean }
     */
    async createDualBackup(password, recoveryKey) {
        if (!this.currentUserId) {
            throw new Error('[KeyManagementService] No user ID set - call generateAndStoreIdentityKeys first');
        }

        if (!password || typeof password !== 'string') {
            throw new Error('[KeyManagementService] createDualBackup requires a valid password');
        }

        if (!recoveryKey || typeof recoveryKey !== 'string') {
            throw new Error('[KeyManagementService] createDualBackup requires a valid recovery key');
        }

        console.log('[KeyManagementService] Creating dual backup...');

        // Get the identity keys from local storage
        const keys = await KeyStorageService.getIdentityKeys(this.currentUserId);
        if (!keys || !keys.secretKey) {
            throw new Error('[KeyManagementService] No identity keys found - generate keys first');
        }

        // Create encrypted backup with password and the provided recovery key
        // This generates a stable session backup key for multi-device support
        const backupResult = await KeyBackupService.createIdentityBackupWithRecoveryKey(
            this.currentUserId,
            keys.secretKey,
            password,
            recoveryKey
        );

        // Store the session backup key
        this._sessionBackupKey = backupResult.sessionBackupKey;

        if (!this._sessionBackupKey) {
            throw new Error('[KeyManagementService] Failed to create session backup key');
        }

        this.initialized = true;

        console.log('[KeyManagementService] Dual backup created successfully');

        return { success: true };
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

        // CRITICAL: Clear any old session keys from IndexedDB
        // Old sessions are invalid with new identity keys
        console.log('[KeyManagementService] Clearing old session keys...');
        await KeyStorageService.clearAll();

        // Generate new key pair
        const keys = CryptoPrimitivesService.generateKeyPair();
        const publicKeyB64 = CryptoPrimitivesService.serializeKey(keys.publicKey);

        // Store locally
        await KeyStorageService.storeIdentityKeys(this.currentUserId, keys);

        // Store public key in database - CRITICAL for E2E encryption
        if (this._database) {
            const identityTable = this._config?.tables?.identityKeys || 'identity_keys';
            console.log(`[KeyManagementService] Storing public key in ${identityTable} for user ${this.currentUserId.slice(0, 8)}...`);

            try {
                const result = await this._database.queryUpsert(identityTable, {
                    user_id: this.currentUserId,
                    public_key: publicKeyB64,
                    current_epoch: 0,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id',
                    returning: true
                });

                if (result.error) {
                    console.error(`[KeyManagementService] CRITICAL: Failed to store public key in database:`, result.error);
                    throw new Error(`Failed to store identity key: ${result.error.message || result.error}`);
                }

                console.log(`[KeyManagementService] Public key stored in database successfully`);
            } catch (dbError) {
                console.error(`[KeyManagementService] CRITICAL: Database error storing public key:`, dbError);
                throw new Error(`Failed to store identity key in database: ${dbError.message}`);
            }
        } else {
            console.error(`[KeyManagementService] CRITICAL: No database service - public key NOT stored remotely!`);
            throw new Error('Database service not available - cannot store identity key');
        }

        // Create encrypted backup (this also generates the stable session backup key)
        const backupResult = await KeyBackupService.createIdentityBackup(
            this.currentUserId,
            keys.secretKey,
            password
        );

        // Store initial public key in history (epoch 0)
        await HistoricalKeysService.storeKey(this.currentUserId, publicKeyB64, 0);

        // Store the session backup key (required for multi-device sync)
        this._sessionBackupKey = backupResult.sessionBackupKey;

        if (!this._sessionBackupKey) {
            throw new Error('[KeyManagementService] Failed to create session backup key');
        }

        this.currentEpoch = 0;
        this.initialized = true;

        // Sync historical keys for all conversation partners
        // This ensures we can decrypt messages from existing conversations
        await this._syncConversationPartnerKeys(this.currentUserId);

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

        // Clear any stale local keys/sessions before restoring
        console.log('[KeyManagementService] Clearing stale local data...');
        await KeyStorageService.clearAll();

        const secretKey = await KeyBackupService.restoreFromPassword(this.currentUserId, password);

        // CRITICAL: Derive public key FROM the secret key to ensure they match
        // Using nacl.box.keyPair.fromSecretKey() ensures cryptographic consistency
        console.log('[KeyManagementService] Deriving public key from restored secret key...');
        const secretKeyB64 = CryptoPrimitivesService.serializeKey(secretKey);
        console.log(`[KeyManagementService] Restored secret key (prefix): ${secretKeyB64.substring(0, 20)}...`);

        const keyPair = CryptoPrimitivesService.keyPairFromSecretKey(secretKey);
        const publicKey = keyPair.publicKey;
        const derivedPublicKeyB64 = CryptoPrimitivesService.serializeKey(publicKey);
        console.log(`[KeyManagementService] Derived public key (FULL): ${derivedPublicKeyB64}`);

        // Verify it matches what's in the database (for debugging)
        const dbPublicKeyB64 = await HistoricalKeysService.getCurrentKey(this.currentUserId);
        console.log(`[KeyManagementService] Database public key (FULL): ${dbPublicKeyB64 || 'NULL'}`);

        if (dbPublicKeyB64) {
            if (dbPublicKeyB64 === derivedPublicKeyB64) {
                console.log('[KeyManagementService] ✓ Derived public key matches database');
            } else {
                console.error('[KeyManagementService] ✗ PUBLIC KEY MISMATCH!');
                console.error('[KeyManagementService] This means the secret key was corrupted during backup/restore!');
                console.error(`[KeyManagementService]   Database: ${dbPublicKeyB64}`);
                console.error(`[KeyManagementService]   Derived:  ${derivedPublicKeyB64}`);
                console.log('[KeyManagementService] Updating database with correct derived public key...');
                // Update database with the correct derived public key
                await this._uploadPublicKeyToServer(this.currentUserId, derivedPublicKeyB64);
            }
        }

        // Store locally with the DERIVED public key (not the one from database)
        await KeyStorageService.storeIdentityKeys(this.currentUserId, {
            publicKey,
            secretKey
        });

        // Fetch epoch
        await this._fetchCurrentEpoch(this.currentUserId);

        // Restore the session backup key (required for multi-device sync)
        console.log('[KeyManagementService] Restoring session backup key...');
        this._sessionBackupKey = await KeyBackupService.restoreSessionBackupKey(this.currentUserId, password);

        if (!this._sessionBackupKey) {
            console.warn('[KeyManagementService] No session backup key available - sessions will be derived via ECDH');
        } else {
            const backupKeyPreview = Array.from(this._sessionBackupKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log(`[KeyManagementService] Session backup key restored (8 bytes): ${backupKeyPreview}`);
        }

        // Sync session keys from database
        await this._syncSessionKeys(this.currentUserId);

        // Sync historical keys for ourselves
        await HistoricalKeysService.syncToLocal(this.currentUserId);

        // CRITICAL: Also sync historical keys for all conversation partners
        // This ensures we can decrypt messages from other users on this new device
        await this._syncConversationPartnerKeys(this.currentUserId);

        this.initialized = true;
        console.log('[KeyManagementService] Restored successfully');

        return { success: true };
    },

    /**
     * Restore keys from recovery key
     * Note: Recovery key restores identity keys but not session keys.
     * After recovery, user must establish new sessions for conversations.
     * @param {string} recoveryKey - Recovery key
     * @returns {Promise<Object>} { success: boolean }
     */
    async restoreFromRecoveryKey(recoveryKey) {
        console.log('[KeyManagementService] Restoring from recovery key...');

        // Clear any stale local keys/sessions before restoring
        console.log('[KeyManagementService] Clearing stale local data...');
        await KeyStorageService.clearAll();

        const secretKey = await KeyBackupService.restoreFromRecoveryKey(this.currentUserId, recoveryKey);

        // CRITICAL: Derive public key FROM the secret key to ensure they match
        console.log('[KeyManagementService] Deriving public key from restored secret key...');
        const keyPair = CryptoPrimitivesService.keyPairFromSecretKey(secretKey);
        const publicKey = keyPair.publicKey;
        const derivedPublicKeyB64 = CryptoPrimitivesService.serializeKey(publicKey);
        console.log(`[KeyManagementService] Derived public key: ${derivedPublicKeyB64.substring(0, 20)}...`);

        // Verify it matches what's in the database (for debugging)
        const dbPublicKeyB64 = await HistoricalKeysService.getCurrentKey(this.currentUserId);
        if (dbPublicKeyB64) {
            if (dbPublicKeyB64 === derivedPublicKeyB64) {
                console.log('[KeyManagementService] ✓ Derived public key matches database');
            } else {
                console.error('[KeyManagementService] ✗ PUBLIC KEY MISMATCH!');
                console.error(`[KeyManagementService]   Database: ${dbPublicKeyB64.substring(0, 20)}...`);
                console.error(`[KeyManagementService]   Derived:  ${derivedPublicKeyB64.substring(0, 20)}...`);
                console.log('[KeyManagementService] Updating database with correct derived public key...');
                await this._uploadPublicKeyToServer(this.currentUserId, derivedPublicKeyB64);
            }
        }

        await KeyStorageService.storeIdentityKeys(this.currentUserId, {
            publicKey,
            secretKey
        });

        await this._fetchCurrentEpoch(this.currentUserId);

        // Recovery key can restore identity keys but NOT session backup key
        // Session keys will be re-derived from ECDH when needed
        this._sessionBackupKey = null;
        console.log('[KeyManagementService] Recovery key restore: session backup key not available');
        console.log('[KeyManagementService] Sessions will be re-established via ECDH as needed');

        await HistoricalKeysService.syncToLocal(this.currentUserId);

        // Sync historical keys for all conversation partners
        await this._syncConversationPartnerKeys(this.currentUserId);

        this.initialized = true;
        console.log('[KeyManagementService] Restored successfully (identity keys only)');

        return { success: true, sessionKeysAvailable: false };
    },

    /**
     * Acquire a lock for key rotation
     * Prevents concurrent rotations across devices/tabs
     * @private
     * @returns {Promise<boolean>} True if lock acquired
     */
    async _acquireRotationLock() {
        // Check in-memory flag first
        if (this._rotationInProgress) {
            console.warn('[KeyManagementService] Rotation already in progress (in-memory lock)');
            return false;
        }

        this._rotationInProgress = true;
        this._rotationLockToken = crypto.randomUUID ? crypto.randomUUID() :
            `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Try to acquire database lock
        if (this._database) {
            try {
                const lockTable = this._config?.tables?.keyRotationLocks || 'key_rotation_locks';
                const expiresAt = new Date(Date.now() + 60000).toISOString(); // 60 second lock

                await this._database.queryUpsert(lockTable, {
                    user_id: this.currentUserId,
                    lock_token: this._rotationLockToken,
                    locked_at: new Date().toISOString(),
                    expires_at: expiresAt
                }, {
                    onConflict: 'user_id',
                    returning: true
                });

                console.log('[KeyManagementService] Acquired rotation lock');
                return true;
            } catch (error) {
                console.error('[KeyManagementService] Failed to acquire database lock:', error);
                this._rotationInProgress = false;
                this._rotationLockToken = null;
                return false;
            }
        }

        return true;
    },

    /**
     * Release the key rotation lock
     * @private
     */
    async _releaseRotationLock() {
        if (this._database && this._rotationLockToken) {
            try {
                const lockTable = this._config?.tables?.keyRotationLocks || 'key_rotation_locks';
                await this._database.queryDelete(lockTable, {
                    filter: {
                        user_id: this.currentUserId,
                        lock_token: this._rotationLockToken
                    }
                });
                console.log('[KeyManagementService] Released rotation lock');
            } catch (error) {
                console.warn('[KeyManagementService] Failed to release database lock:', error);
            }
        }

        this._rotationInProgress = false;
        this._rotationLockToken = null;
    },

    /**
     * Regenerate identity keys (key rotation)
     * Uses locking to prevent concurrent rotations
     * @returns {Promise<Object>} { success: boolean, newEpoch: number }
     */
    async regenerateKeys() {
        if (!this.initialized) {
            throw new Error('[KeyManagementService] Not initialized');
        }

        // Acquire lock before rotation
        const lockAcquired = await this._acquireRotationLock();
        if (!lockAcquired) {
            throw new Error('[KeyManagementService] Key rotation already in progress - please wait');
        }

        try {
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

            // Session backup key is unchanged during rotation - no re-encryption needed
            // This is why the session backup key is password-derived, not identity-key-derived
            if (!this._sessionBackupKey) {
                throw new Error('[KeyManagementService] Cannot rotate keys without session backup key');
            }

            this.currentEpoch = newEpoch;

            console.log(`[KeyManagementService] Keys regenerated. New epoch: ${newEpoch}`);

            return {
                success: true,
                newEpoch,
                fingerprint: CryptoPrimitivesService.getKeyFingerprint(newKeys.publicKey)
            };
        } finally {
            // Always release the lock
            await this._releaseRotationLock();
        }
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

        // Always use epoch 0 - key rotation is disabled for reliability
        const epoch = 0;

        // Check if session already exists
        let session = await KeyStorageService.getSessionKey(conversationId, epoch);
        if (session) {
            console.log(`[KeyManagementService] establishSession: Using cached session for conv=${conversationId}`);
            return {
                sessionKey: session.sessionKey,
                epoch: epoch,
                counter: session.counter
            };
        }

        console.log(`[KeyManagementService] establishSession: Creating NEW session for conv=${conversationId}`);

        // Get other user's current public key
        const theirPublicKeyB64 = await HistoricalKeysService.getCurrentKey(otherUserId);
        if (!theirPublicKeyB64) {
            throw new Error(`Other user (${otherUserId.substring(0, 8)}...) has no public key - they may not have set up encryption yet`);
        }
        console.log(`[KeyManagementService] establishSession: Their public key (FULL): ${theirPublicKeyB64}`);

        // Get our keys
        const ourKeys = await KeyStorageService.getIdentityKeys(this.currentUserId);
        if (!ourKeys) {
            throw new Error('No local identity keys - run device pairing first');
        }
        const ourSecretKeyB64 = CryptoPrimitivesService.serializeKey(ourKeys.secretKey);
        const ourPublicKeyB64 = CryptoPrimitivesService.serializeKey(ourKeys.publicKey);
        console.log(`[KeyManagementService] establishSession: Our public key (FULL): ${ourPublicKeyB64}`);
        console.log(`[KeyManagementService] establishSession: Our secret key prefix: ${ourSecretKeyB64.substring(0, 12)}...`);

        // ECDH key agreement
        const theirPublicKey = CryptoPrimitivesService.deserializeKey(theirPublicKeyB64);
        console.log(`[KeyManagementService] establishSession: Computing ECDH shared secret...`);
        const sharedSecret = CryptoPrimitivesService.deriveSharedSecret(ourKeys.secretKey, theirPublicKey);

        // Log more bytes of shared secret for debugging (safe to log - derived, not the keys)
        const sharedSecretPreview = Array.from(sharedSecret.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`[KeyManagementService] establishSession: Shared secret (8 bytes): ${sharedSecretPreview}`);

        // Derive session key (always epoch 0)
        const sessionKey = await KeyDerivationService.deriveSessionKey(sharedSecret, epoch);
        const sessionKeyPreview = Array.from(sessionKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`[KeyManagementService] establishSession: Session key (8 bytes): ${sessionKeyPreview}`);

        // Store locally
        await KeyStorageService.storeSessionKey(conversationId, epoch, sessionKey, 0);

        // Backup to database using the session backup key
        if (this._sessionBackupKey) {
            await KeyBackupService.backupSessionKey(
                this.currentUserId,
                conversationId,
                sessionKey,
                epoch,
                this._sessionBackupKey
            );
            console.log(`[KeyManagementService] establishSession: Session backed up to database`);
        } else {
            console.log(`[KeyManagementService] establishSession: No session backup key - session NOT backed up`);
        }

        console.log(`[KeyManagementService] establishSession: Session created for conv=${conversationId}`);

        return {
            sessionKey,
            epoch: epoch,
            counter: 0
        };
    },

    /**
     * Maximum safe counter value to prevent overflow
     * JavaScript's Number.MAX_SAFE_INTEGER is 2^53 - 1
     * We use a lower limit to leave headroom for any arithmetic
     */
    MAX_COUNTER: Number.MAX_SAFE_INTEGER - 1000,

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

        // Always use epoch 0
        const epoch = 0;
        const session = await KeyStorageService.getSessionKey(conversationId, epoch);
        if (!session) {
            throw new Error('No session - call establishSession first');
        }

        // Check for counter overflow
        if (session.counter >= this.MAX_COUNTER) {
            console.error(`[KeyManagementService] Counter overflow: ${session.counter}`);
            throw new Error('Message counter overflow');
        }

        // Log session key being used for encryption
        const sessionKeyPreview = Array.from(session.sessionKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`[KeyManagementService] encryptMessage: Using session key (8 bytes): ${sessionKeyPreview}`);
        console.log(`[KeyManagementService] encryptMessage: Deriving message key for epoch=${epoch}, counter=${session.counter}...`);

        // Derive message-specific key
        const messageKey = await KeyDerivationService.deriveMessageKey(
            session.sessionKey,
            epoch,
            session.counter
        );
        const messageKeyPreview = Array.from(messageKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`[KeyManagementService] encryptMessage: Message key (8 bytes): ${messageKeyPreview}`);

        // Encrypt
        const encrypted = CryptoPrimitivesService.encrypt(plaintext, messageKey);
        const counter = session.counter;

        // Increment counter
        await KeyStorageService.incrementCounter(conversationId, epoch);

        // Update backup counter
        if (this._sessionBackupKey) {
            await KeyBackupService.updateSessionCounter(
                this.currentUserId,
                conversationId,
                epoch,
                counter + 1
            );
        }

        return {
            ciphertext: encrypted.ciphertext,
            nonce: encrypted.nonce,
            counter: counter,
            epoch: epoch
        };
    },

    /**
     * Decrypt a message
     * @param {number|string} conversationId - Conversation ID
     * @param {Object} encryptedData - { ciphertext, nonce, counter, epoch }
     * @param {string} senderId - Sender's user ID
     * @param {string} recipientId - Recipient's user ID (optional, for decrypting own messages)
     * @returns {Promise<string>} Decrypted plaintext
     */
    async decryptMessage(conversationId, encryptedData, senderId, recipientId = null) {
        if (!this.initialized) {
            throw new Error('[KeyManagementService] Not initialized');
        }

        const { ciphertext, nonce, counter } = encryptedData;
        // Always use epoch 0 - ignore message epoch for simplicity
        const epoch = 0;

        // Validate counter
        if (typeof counter !== 'number' || counter < 0 || !Number.isInteger(counter)) {
            throw new Error(`Invalid counter value: ${counter}`);
        }

        // Determine the OTHER user for ECDH derivation
        // If we sent the message (senderId === us), use recipientId
        // If we received the message, use senderId
        let otherUserId;
        if (senderId === this.currentUserId) {
            // We sent this message - need to use recipient's public key for ECDH
            otherUserId = recipientId;
            console.log(`[KeyManagementService] decryptMessage: OWN MESSAGE - using recipient ${otherUserId?.substring(0, 8)}... for ECDH`);
        } else {
            // We received this message - use sender's public key for ECDH
            otherUserId = senderId;
            console.log(`[KeyManagementService] decryptMessage: RECEIVED MESSAGE - using sender ${otherUserId.substring(0, 8)}... for ECDH`);
        }

        if (!otherUserId) {
            throw new Error('Cannot determine other user for ECDH - recipientId not provided for own message');
        }

        console.log(`[KeyManagementService] decryptMessage: conv=${conversationId}, counter=${counter}, otherUser=${otherUserId.substring(0, 8)}...`);

        // Get or derive session key
        let session = await KeyStorageService.getSessionKey(conversationId, epoch);
        let usedCachedSession = false;

        if (session) {
            console.log(`[KeyManagementService] decryptMessage: Found cached session for conv=${conversationId}`);
            usedCachedSession = true;
        } else {
            console.log(`[KeyManagementService] decryptMessage: No cached session, deriving from ECDH...`);
            session = await this._deriveSessionFromHistory(conversationId, otherUserId);
        }

        if (!session) {
            console.error(`[KeyManagementService] decryptMessage: FAILED - could not get or derive session key`);
            throw new Error('Cannot decrypt - no session key available');
        }

        // Derive message key
        const sessionKeyPreview = Array.from(session.sessionKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`[KeyManagementService] decryptMessage: Using session key (8 bytes): ${sessionKeyPreview}`);
        console.log(`[KeyManagementService] decryptMessage: Deriving message key for epoch=${epoch}, counter=${counter}...`);
        const messageKey = await KeyDerivationService.deriveMessageKey(
            session.sessionKey,
            epoch,
            counter
        );
        const messageKeyPreview = Array.from(messageKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`[KeyManagementService] decryptMessage: Message key (8 bytes): ${messageKeyPreview}`);

        // Decrypt
        console.log(`[KeyManagementService] decryptMessage: Attempting decryption...`);
        try {
            const plaintext = CryptoPrimitivesService.decrypt(ciphertext, nonce, messageKey);
            console.log(`[KeyManagementService] decryptMessage: SUCCESS - message decrypted`);
            return plaintext;
        } catch (decryptError) {
            console.error(`[KeyManagementService] decryptMessage: FAILED - ${decryptError.message}`);

            // AUTO-REPAIR: If we used a cached session and it failed, try re-deriving from ECDH
            if (usedCachedSession) {
                console.log(`[KeyManagementService] decryptMessage: AUTO-REPAIR - Cached session may be stale, re-deriving from ECDH...`);

                // Delete the stale cached session
                try {
                    await KeyStorageService.deleteSessionKeysForConversation(conversationId);
                    console.log(`[KeyManagementService] decryptMessage: AUTO-REPAIR - Deleted stale session cache`);
                } catch (deleteError) {
                    console.warn(`[KeyManagementService] decryptMessage: AUTO-REPAIR - Could not delete stale session:`, deleteError.message);
                }

                // Re-derive session from ECDH
                const freshSession = await this._deriveSessionFromHistory(conversationId, otherUserId);
                if (freshSession) {
                    // Try decryption again with fresh session
                    const freshMessageKey = await KeyDerivationService.deriveMessageKey(
                        freshSession.sessionKey,
                        epoch,
                        counter
                    );

                    try {
                        const plaintext = CryptoPrimitivesService.decrypt(ciphertext, nonce, freshMessageKey);
                        console.log(`[KeyManagementService] decryptMessage: AUTO-REPAIR SUCCESS - message decrypted with fresh session`);
                        return plaintext;
                    } catch (retryError) {
                        console.error(`[KeyManagementService] decryptMessage: AUTO-REPAIR FAILED - ${retryError.message}`);
                        throw retryError;
                    }
                }
            }

            throw decryptError;
        }
    },

    /**
     * Get a sender's current epoch from the database
     * Used to validate message epochs aren't from the "future"
     * @private
     * @param {string} senderId - Sender's user ID
     * @returns {Promise<number|null>} Current epoch or null if not found
     */
    async _getSenderCurrentEpoch(senderId) {
        if (!this._database) {
            return null;
        }

        try {
            const identityTable = this._config?.tables?.identityKeys || 'identity_keys';
            const result = await this._database.querySelect(identityTable, {
                filter: { user_id: senderId },
                limit: 1
            });

            return result.data?.[0]?.current_epoch ?? null;
        } catch (error) {
            console.warn(`[KeyManagementService] Could not fetch sender's epoch:`, error.message);
            return null;
        }
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
     * Upload public key to server (auto-repair for missing keys)
     * @private
     * @param {string} userId - User ID
     * @param {string} publicKeyB64 - Base64 encoded public key
     */
    async _uploadPublicKeyToServer(userId, publicKeyB64) {
        if (!this._database) {
            console.error('[KeyManagementService] AUTO-REPAIR FAILED: No database service');
            return;
        }

        const identityTable = this._config?.tables?.identityKeys || 'identity_keys';

        try {
            const result = await this._database.queryUpsert(identityTable, {
                user_id: userId,
                public_key: publicKeyB64,
                current_epoch: this.currentEpoch || 0,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'user_id',
                returning: true
            });

            if (result.error) {
                console.error('[KeyManagementService] AUTO-REPAIR FAILED:', result.error);
                return;
            }

            // Also store in public_key_history for ECDH
            await HistoricalKeysService.storeKey(userId, publicKeyB64, this.currentEpoch || 0);

            console.log('[KeyManagementService] AUTO-REPAIR SUCCESS: Public key uploaded to server');
        } catch (error) {
            console.error('[KeyManagementService] AUTO-REPAIR FAILED:', error);
        }
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
     * Get the session backup key for session encryption
     * @private
     * @returns {Uint8Array|null}
     */
    _getSessionBackupKey() {
        return this._sessionBackupKey;
    },

    /**
     * Sync session keys from database to local
     * Requires session backup key to be available
     * @private
     * @param {string} userId - User ID
     */
    async _syncSessionKeys(userId) {
        if (!this._sessionBackupKey) {
            console.log('[KeyManagementService] No session backup key - skipping session sync');
            console.log('[KeyManagementService] Sessions will be derived via ECDH as needed');
            return;
        }

        const backupKeyPreview = Array.from(this._sessionBackupKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`[KeyManagementService] _syncSessionKeys: Using session backup key (8 bytes): ${backupKeyPreview}`);

        let sessions = [];
        try {
            sessions = await KeyBackupService.restoreSessionKeys(userId, this._sessionBackupKey);
            console.log(`[KeyManagementService] Restored ${sessions.length} sessions from backup`);

            // Log each restored session for debugging
            for (const session of sessions) {
                const sessionKeyPreview = Array.from(session.sessionKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
                console.log(`[KeyManagementService] _syncSessionKeys: Restored session conv=${session.conversationId}, epoch=${session.epoch}, counter=${session.counter}, key=${sessionKeyPreview}`);
            }
        } catch (error) {
            console.error('[KeyManagementService] Failed to restore sessions:', error.message);
            throw new Error(`Failed to restore session keys: ${error.message}`);
        }

        // Store sessions locally
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
     * Sync historical keys for all conversation partners
     * This is critical for decrypting messages on new devices
     * @private
     * @param {string} userId - User ID
     */
    async _syncConversationPartnerKeys(userId) {
        if (!this._database) {
            console.warn('[KeyManagementService] No database - cannot sync partner keys');
            return;
        }

        console.log('[KeyManagementService] Syncing conversation partner keys...');

        try {
            // Get all conversations where this user is a participant
            const conversationsTable = this._config?.tables?.conversations || 'conversations';

            // Query for conversations where user is user1
            const result1 = await this._database.querySelect(conversationsTable, {
                filter: { user1_id: userId }
            });

            // Query for conversations where user is user2
            const result2 = await this._database.querySelect(conversationsTable, {
                filter: { user2_id: userId }
            });

            // Collect unique partner IDs
            const partnerIds = new Set();

            for (const conv of result1.data || []) {
                if (conv.user2_id && conv.user2_id !== userId) {
                    partnerIds.add(conv.user2_id);
                }
            }

            for (const conv of result2.data || []) {
                if (conv.user1_id && conv.user1_id !== userId) {
                    partnerIds.add(conv.user1_id);
                }
            }

            console.log(`[KeyManagementService] Found ${partnerIds.size} conversation partners`);

            // Sync historical keys for each partner
            for (const partnerId of partnerIds) {
                try {
                    await HistoricalKeysService.syncToLocal(partnerId);
                } catch (error) {
                    console.warn(`[KeyManagementService] Failed to sync keys for partner ${partnerId.slice(0, 8)}...`, error.message);
                }
            }

            console.log('[KeyManagementService] Partner key sync complete');
        } catch (error) {
            console.error('[KeyManagementService] Failed to sync partner keys:', error);
        }
    },

    /**
     * Derive session key from historical public key
     * @private
     * @param {number|string} conversationId - Conversation ID
     * @param {string} otherUserId - Other user's ID
     * @returns {Promise<Object|null>} { sessionKey, epoch, counter } or null
     */
    async _deriveSessionFromHistory(conversationId, otherUserId) {
        console.log(`[KeyManagementService] _deriveSessionFromHistory: conv=${conversationId}, otherUser=${otherUserId.substring(0, 8)}...`);

        // Get their current public key from database (no rotation, so current = only)
        const theirPublicKeyB64 = await HistoricalKeysService.getCurrentKey(otherUserId);
        if (!theirPublicKeyB64) {
            console.error(`[KeyManagementService] _deriveSessionFromHistory: FAILED - No public key for user ${otherUserId.substring(0, 8)}...`);
            console.error(`[KeyManagementService] _deriveSessionFromHistory: This user may not have set up encryption yet`);
            return null;
        }
        console.log(`[KeyManagementService] _deriveSessionFromHistory: Their public key (FULL): ${theirPublicKeyB64}`);

        // Get our keys from local storage
        const ourKeys = await KeyStorageService.getIdentityKeys(this.currentUserId);
        if (!ourKeys) {
            console.error(`[KeyManagementService] _deriveSessionFromHistory: FAILED - No local identity keys`);
            console.error(`[KeyManagementService] _deriveSessionFromHistory: User needs to restore keys via device pairing`);
            return null;
        }
        const ourSecretKeyB64 = CryptoPrimitivesService.serializeKey(ourKeys.secretKey);
        const ourPublicKeyB64 = CryptoPrimitivesService.serializeKey(ourKeys.publicKey);
        console.log(`[KeyManagementService] _deriveSessionFromHistory: Our public key (FULL): ${ourPublicKeyB64}`);
        console.log(`[KeyManagementService] _deriveSessionFromHistory: Our secret key prefix: ${ourSecretKeyB64.substring(0, 12)}...`);

        // ECDH key agreement
        const theirPublicKey = CryptoPrimitivesService.deserializeKey(theirPublicKeyB64);
        console.log(`[KeyManagementService] _deriveSessionFromHistory: Computing ECDH...`);
        const sharedSecret = CryptoPrimitivesService.deriveSharedSecret(ourKeys.secretKey, theirPublicKey);

        // Log more bytes of shared secret for debugging (safe to log - derived, not the keys)
        const sharedSecretPreview = Array.from(sharedSecret.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`[KeyManagementService] _deriveSessionFromHistory: Shared secret (8 bytes): ${sharedSecretPreview}`);

        // Derive session key (always epoch 0)
        const sessionKey = await KeyDerivationService.deriveSessionKey(sharedSecret, 0);
        const sessionKeyPreview = Array.from(sessionKey.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log(`[KeyManagementService] _deriveSessionFromHistory: Session key (8 bytes): ${sessionKeyPreview}`);

        // Cache for future use
        await KeyStorageService.storeSessionKey(conversationId, 0, sessionKey, 0);
        console.log(`[KeyManagementService] _deriveSessionFromHistory: Session derived and cached for conv=${conversationId}`);

        return { sessionKey, epoch: 0, counter: 0 };
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
        this._sessionBackupKey = null;
    }
};

if (typeof window !== 'undefined') {
    window.KeyManagementService = KeyManagementService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = KeyManagementService;
}
