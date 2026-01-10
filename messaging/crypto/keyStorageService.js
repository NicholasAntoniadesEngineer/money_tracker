/**
 * Key Storage Service
 *
 * Manages client-side key storage using IndexedDB
 * Stores:
 * - Identity keys (user's permanent keypair)
 * - Session keys (per-conversation shared secrets)
 * - Device keys (for multi-device support)
 *
 * Security: Keys are stored in browser's IndexedDB, isolated per origin
 * Keys never leave the client except when encrypted during device pairing
 */

const KeyStorageService = {
    dbName: 'MoneyTrackerCrypto',
    dbVersion: 2, // Bumped for epoch support
    db: null,

    /**
     * Initialize IndexedDB database
     * Creates object stores for identity keys, session keys, and device keys
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.db) {
            console.log('[KeyStorageService] Already initialized');
            return;
        }

        console.log('[KeyStorageService] Initializing IndexedDB...');

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                const error = new Error('Failed to open IndexedDB: ' + request.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('[KeyStorageService] ✓ Initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                console.log('[KeyStorageService] Creating/upgrading database schema...');
                console.log('[KeyStorageService] Old version:', event.oldVersion, '-> New version:', event.newVersion);
                const db = event.target.result;

                // Identity keys store (user's permanent keys)
                if (!db.objectStoreNames.contains('identity_keys')) {
                    const identityStore = db.createObjectStore('identity_keys', { keyPath: 'userId' });
                    console.log('[KeyStorageService] Created identity_keys store');
                }

                // Session keys store (per-conversation shared secrets)
                // In v2+, we use composite key format: "conversationId:epoch"
                if (!db.objectStoreNames.contains('session_keys')) {
                    const sessionStore = db.createObjectStore('session_keys', { keyPath: 'sessionKey' });
                    console.log('[KeyStorageService] Created session_keys store');
                }

                // Device keys store (multi-device support)
                if (!db.objectStoreNames.contains('device_keys')) {
                    const deviceStore = db.createObjectStore('device_keys', { keyPath: 'deviceId' });
                    console.log('[KeyStorageService] Created device_keys store');
                }

                // v2 upgrade: Add epoch_sessions store for epoch-based session keys
                if (event.oldVersion < 2) {
                    if (!db.objectStoreNames.contains('epoch_sessions')) {
                        const epochStore = db.createObjectStore('epoch_sessions', { keyPath: 'sessionKey' });
                        epochStore.createIndex('conversationId', 'conversationId', { unique: false });
                        epochStore.createIndex('epoch', 'epoch', { unique: false });
                        console.log('[KeyStorageService] Created epoch_sessions store for key rotation support');
                    }
                }

                console.log('[KeyStorageService] Schema created/upgraded');
            };
        });
    },

    /**
     * Store user's identity keys (permanent keypair)
     * @param {string} userId - User ID
     * @param {Uint8Array} publicKey - Public key
     * @param {Uint8Array} secretKey - Secret key
     * @returns {Promise<void>}
     */
    async storeIdentityKeys(userId, publicKey, secretKey) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        if (!userId) {
            throw new Error('User ID required');
        }

        if (!publicKey || !secretKey) {
            throw new Error('Public key and secret key required');
        }

        console.log('[KeyStorageService] Storing identity keys for user:', userId);

        const tx = this.db.transaction(['identity_keys'], 'readwrite');
        const store = tx.objectStore('identity_keys');

        await store.put({
            userId,
            publicKey: window.CryptoService.serializePublicKey(publicKey),
            secretKey: window.CryptoService.serializePublicKey(secretKey),
            createdAt: Date.now()
        });

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                console.log('[KeyStorageService] ✓ Identity keys stored');
                resolve();
            };
            tx.onerror = () => {
                const error = new Error('Failed to store identity keys: ' + tx.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Retrieve user's identity keys
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} Object with publicKey and secretKey, or null if not found
     */
    async getIdentityKeys(userId) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        if (!userId) {
            throw new Error('User ID required');
        }

        const tx = this.db.transaction(['identity_keys'], 'readonly');
        const store = tx.objectStore('identity_keys');
        const request = store.get(userId);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const result = request.result;

                if (!result) {
                    console.log('[KeyStorageService] No identity keys found for user:', userId);
                    resolve(null);
                    return;
                }

                console.log('[KeyStorageService] ✓ Retrieved identity keys for user:', userId);

                resolve({
                    publicKey: window.CryptoService.deserializePublicKey(result.publicKey),
                    secretKey: window.CryptoService.deserializePublicKey(result.secretKey),
                    createdAt: result.createdAt
                });
            };

            request.onerror = () => {
                const error = new Error('Failed to get identity keys: ' + request.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Store session key (shared secret for a conversation)
     * @param {string} conversationId - Conversation ID
     * @param {Uint8Array} sharedSecret - Shared secret from key agreement
     * @param {number} messageCounter - Current message counter
     * @returns {Promise<void>}
     */
    async storeSessionKey(conversationId, sharedSecret, messageCounter = 0) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        if (!conversationId) {
            throw new Error('Conversation ID required');
        }

        if (!sharedSecret || sharedSecret.length !== 32) {
            throw new Error('Invalid shared secret: must be 32 bytes');
        }

        console.log('[KeyStorageService] Storing session key for conversation:', conversationId);

        const tx = this.db.transaction(['session_keys'], 'readwrite');
        const store = tx.objectStore('session_keys');

        await store.put({
            conversationId,
            sharedSecret: window.CryptoService.serializePublicKey(sharedSecret),
            messageCounter,
            updatedAt: Date.now()
        });

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                console.log('[KeyStorageService] ✓ Session key stored');
                resolve();
            };
            tx.onerror = () => {
                const error = new Error('Failed to store session key: ' + tx.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Retrieve session key for a conversation
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Object|null>} Object with sharedSecret and messageCounter, or null
     */
    async getSessionKey(conversationId) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        if (!conversationId) {
            throw new Error('Conversation ID required');
        }

        const tx = this.db.transaction(['session_keys'], 'readonly');
        const store = tx.objectStore('session_keys');
        const request = store.get(conversationId);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const result = request.result;

                if (!result) {
                    console.log('[KeyStorageService] No session key found for conversation:', conversationId);
                    resolve(null);
                    return;
                }

                console.log('[KeyStorageService] ✓ Retrieved session key for conversation:', conversationId);

                resolve({
                    sharedSecret: window.CryptoService.deserializePublicKey(result.sharedSecret),
                    messageCounter: result.messageCounter || 0,
                    updatedAt: result.updatedAt
                });
            };

            request.onerror = () => {
                const error = new Error('Failed to get session key: ' + request.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Increment message counter for forward secrecy
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<number>} New message counter value
     */
    async incrementMessageCounter(conversationId) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        const session = await this.getSessionKey(conversationId);

        if (!session) {
            throw new Error('No session found for conversation: ' + conversationId);
        }

        const newCounter = session.messageCounter + 1;

        await this.storeSessionKey(
            conversationId,
            session.sharedSecret,
            newCounter
        );

        console.log('[KeyStorageService] ✓ Incremented message counter:', newCounter);

        return newCounter;
    },

    /**
     * Delete session key (e.g., when conversation is deleted)
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<void>}
     */
    async deleteSessionKey(conversationId) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        console.log('[KeyStorageService] Deleting session key for conversation:', conversationId);

        const tx = this.db.transaction(['session_keys'], 'readwrite');
        const store = tx.objectStore('session_keys');

        await store.delete(conversationId);

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                console.log('[KeyStorageService] ✓ Session key deleted');
                resolve();
            };
            tx.onerror = () => {
                const error = new Error('Failed to delete session key: ' + tx.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Clear all keys (use with caution!)
     * @returns {Promise<void>}
     */
    async clearAllKeys() {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        console.warn('[KeyStorageService] Clearing ALL keys - this cannot be undone!');

        const tx = this.db.transaction(['identity_keys', 'session_keys', 'device_keys'], 'readwrite');

        await tx.objectStore('identity_keys').clear();
        await tx.objectStore('session_keys').clear();
        await tx.objectStore('device_keys').clear();

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                console.log('[KeyStorageService] ✓ All keys cleared');
                resolve();
            };
            tx.onerror = () => {
                const error = new Error('Failed to clear keys: ' + tx.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Get storage statistics
     * @returns {Promise<Object>} Object with key counts
     */
    async getStats() {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        const stores = ['identity_keys', 'session_keys', 'device_keys'];
        if (this.db.objectStoreNames.contains('epoch_sessions')) {
            stores.push('epoch_sessions');
        }

        const tx = this.db.transaction(stores, 'readonly');

        const identityCount = await tx.objectStore('identity_keys').count();
        const sessionCount = await tx.objectStore('session_keys').count();
        const deviceCount = await tx.objectStore('device_keys').count();
        const epochCount = stores.includes('epoch_sessions')
            ? await tx.objectStore('epoch_sessions').count()
            : { result: 0 };

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                const stats = {
                    identityKeys: identityCount.result,
                    sessionKeys: sessionCount.result,
                    deviceKeys: deviceCount.result,
                    epochSessions: epochCount.result,
                    totalKeys: identityCount.result + sessionCount.result + deviceCount.result + epochCount.result
                };

                console.log('[KeyStorageService] Stats:', stats);
                resolve(stats);
            };

            tx.onerror = () => {
                const error = new Error('Failed to get stats: ' + tx.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    // ========== EPOCH-BASED SESSION KEY METHODS ==========
    // These methods support key rotation by storing multiple session keys per conversation

    /**
     * Generate composite session key for epoch storage
     * @param {string} conversationId - Conversation ID
     * @param {number} epoch - Key epoch
     * @returns {string} Composite key
     */
    _makeEpochSessionKey(conversationId, epoch) {
        return `${conversationId}:${epoch}`;
    },

    /**
     * Store session key for a specific epoch
     * Enables key rotation where old messages use old keys, new messages use new keys
     * @param {string} conversationId - Conversation ID
     * @param {number} epoch - Key epoch (0 = original, 1+ = after regeneration)
     * @param {Uint8Array} sharedSecret - Shared secret from key agreement
     * @param {number} messageCounter - Current message counter for this epoch
     * @returns {Promise<void>}
     */
    async storeEpochSessionKey(conversationId, epoch, sharedSecret, messageCounter = 0) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        if (!conversationId) {
            throw new Error('Conversation ID required');
        }

        if (typeof epoch !== 'number' || epoch < 0) {
            throw new Error('Valid epoch required');
        }

        if (!sharedSecret || sharedSecret.length !== 32) {
            throw new Error('Invalid shared secret: must be 32 bytes');
        }

        const sessionKey = this._makeEpochSessionKey(conversationId, epoch);
        console.log('[KeyStorageService] Storing epoch session key:', sessionKey);

        const tx = this.db.transaction(['epoch_sessions'], 'readwrite');
        const store = tx.objectStore('epoch_sessions');

        await store.put({
            sessionKey,
            conversationId: conversationId.toString(),
            epoch,
            sharedSecret: window.CryptoService.serializePublicKey(sharedSecret),
            messageCounter,
            updatedAt: Date.now()
        });

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                console.log('[KeyStorageService] ✓ Epoch session key stored (epoch:', epoch + ')');
                resolve();
            };
            tx.onerror = () => {
                const error = new Error('Failed to store epoch session key: ' + tx.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Retrieve session key for a specific epoch
     * @param {string} conversationId - Conversation ID
     * @param {number} epoch - Key epoch to retrieve
     * @returns {Promise<Object|null>} Object with sharedSecret, messageCounter, epoch, or null
     */
    async getEpochSessionKey(conversationId, epoch) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        if (!conversationId) {
            throw new Error('Conversation ID required');
        }

        const sessionKey = this._makeEpochSessionKey(conversationId, epoch);

        const tx = this.db.transaction(['epoch_sessions'], 'readonly');
        const store = tx.objectStore('epoch_sessions');
        const request = store.get(sessionKey);

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const result = request.result;

                if (!result) {
                    console.log('[KeyStorageService] No epoch session key found:', sessionKey);
                    resolve(null);
                    return;
                }

                console.log('[KeyStorageService] ✓ Retrieved epoch session key:', sessionKey);

                resolve({
                    sharedSecret: window.CryptoService.deserializePublicKey(result.sharedSecret),
                    messageCounter: result.messageCounter || 0,
                    epoch: result.epoch,
                    updatedAt: result.updatedAt
                });
            };

            request.onerror = () => {
                const error = new Error('Failed to get epoch session key: ' + request.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Get all session keys for a conversation (all epochs)
     * Useful for decrypting messages from any epoch
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Array>} Array of session key objects sorted by epoch
     */
    async getAllEpochSessionKeys(conversationId) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        if (!conversationId) {
            throw new Error('Conversation ID required');
        }

        const tx = this.db.transaction(['epoch_sessions'], 'readonly');
        const store = tx.objectStore('epoch_sessions');
        const index = store.index('conversationId');
        const request = index.getAll(conversationId.toString());

        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const results = request.result || [];

                const sessions = results.map(r => ({
                    sharedSecret: window.CryptoService.deserializePublicKey(r.sharedSecret),
                    messageCounter: r.messageCounter || 0,
                    epoch: r.epoch,
                    updatedAt: r.updatedAt
                })).sort((a, b) => a.epoch - b.epoch);

                console.log('[KeyStorageService] ✓ Retrieved', sessions.length, 'epoch sessions for conversation:', conversationId);

                resolve(sessions);
            };

            request.onerror = () => {
                const error = new Error('Failed to get all epoch session keys: ' + request.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Get the latest (highest epoch) session key for a conversation
     * Used when sending new messages
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Object|null>} Latest session key object or null
     */
    async getLatestEpochSessionKey(conversationId) {
        const allSessions = await this.getAllEpochSessionKeys(conversationId);

        if (allSessions.length === 0) {
            return null;
        }

        // Return the one with highest epoch
        return allSessions[allSessions.length - 1];
    },

    /**
     * Increment message counter for a specific epoch session
     * @param {string} conversationId - Conversation ID
     * @param {number} epoch - Key epoch
     * @returns {Promise<number>} New message counter value
     */
    async incrementEpochMessageCounter(conversationId, epoch) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        const session = await this.getEpochSessionKey(conversationId, epoch);

        if (!session) {
            throw new Error(`No session found for conversation ${conversationId} epoch ${epoch}`);
        }

        const newCounter = session.messageCounter + 1;

        await this.storeEpochSessionKey(
            conversationId,
            epoch,
            session.sharedSecret,
            newCounter
        );

        console.log('[KeyStorageService] ✓ Incremented epoch message counter:', newCounter, '(epoch:', epoch + ')');

        return newCounter;
    },

    /**
     * Delete session key for a specific epoch
     * @param {string} conversationId - Conversation ID
     * @param {number} epoch - Key epoch to delete
     * @returns {Promise<void>}
     */
    async deleteEpochSessionKey(conversationId, epoch) {
        if (!this.db) {
            throw new Error('KeyStorageService not initialized');
        }

        const sessionKey = this._makeEpochSessionKey(conversationId, epoch);
        console.log('[KeyStorageService] Deleting epoch session key:', sessionKey);

        const tx = this.db.transaction(['epoch_sessions'], 'readwrite');
        const store = tx.objectStore('epoch_sessions');

        await store.delete(sessionKey);

        return new Promise((resolve, reject) => {
            tx.oncomplete = () => {
                console.log('[KeyStorageService] ✓ Epoch session key deleted');
                resolve();
            };
            tx.onerror = () => {
                const error = new Error('Failed to delete epoch session key: ' + tx.error);
                console.error('[KeyStorageService]', error);
                reject(error);
            };
        });
    },

    /**
     * Migrate legacy session key to epoch 0
     * Called during upgrade to move existing sessions to epoch-aware storage
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<boolean>} True if migration occurred
     */
    async migrateLegacySessionToEpoch(conversationId) {
        // Check if legacy session exists
        const legacySession = await this.getSessionKey(conversationId);

        if (!legacySession) {
            return false;
        }

        // Check if epoch 0 already exists
        const epochSession = await this.getEpochSessionKey(conversationId, 0);

        if (epochSession) {
            console.log('[KeyStorageService] Epoch 0 already exists for conversation:', conversationId);
            return false;
        }

        // Migrate to epoch 0
        console.log('[KeyStorageService] Migrating legacy session to epoch 0:', conversationId);
        await this.storeEpochSessionKey(
            conversationId,
            0,
            legacySession.sharedSecret,
            legacySession.messageCounter
        );

        console.log('[KeyStorageService] ✓ Legacy session migrated to epoch 0');
        return true;
    }
};

// Make available globally
window.KeyStorageService = KeyStorageService;

console.log('%c[KeyStorageService] Ready', 'color: blue; font-weight: bold');
