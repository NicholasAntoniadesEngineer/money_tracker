/**
 * Key Manager
 *
 * High-level key management service
 * Orchestrates CryptoService and KeyStorageService to provide:
 * - User key initialization
 * - Session establishment
 * - Message encryption/decryption
 * - Security code generation
 * - Public key distribution
 *
 * This is the main interface used by MessagingService
 */

const KeyManager = {
    currentUserId: null,
    initialized: false,

    /**
     * Initialize key manager for current user
     * Generates and stores keys if they don't exist
     * @param {string} userId - Current user ID
     * @returns {Promise<Object>} User's key pair
     */
    async initialize(userId) {
        if (!userId) {
            throw new Error('User ID required');
        }

        console.log('[KeyManager] Initializing for user:', userId);

        this.currentUserId = userId;

        try {
            // Initialize crypto service
            await window.CryptoService.initialize();

            // Initialize key storage
            await window.KeyStorageService.initialize();

            // Check if user has identity keys
            let keys = await window.KeyStorageService.getIdentityKeys(userId);

            if (!keys) {
                console.log('[KeyManager] No keys found, checking for encrypted backup...');

                // Check if user has encrypted backup in database
                let restoredFromBackup = false;
                if (window.KeyBackupService) {
                    const hasBackup = await window.KeyBackupService.hasBackup(userId);

                    if (hasBackup) {
                        console.log('[KeyManager] Encrypted backup found, attempting restoration...');

                        // Try to get password from session (just logged in)
                        let password = window.PasswordManager ? window.PasswordManager.retrieve() : null;

                        // If no password in session, prompt user
                        if (!password && window.PasswordManager) {
                            password = await window.PasswordManager.promptForPassword(
                                'Enter your password to restore encryption keys:'
                            );
                        }

                        if (password) {
                            try {
                                const restoreResult = await window.KeyBackupService.restoreFromBackup(userId, password);

                                if (restoreResult.success) {
                                    // Store restored keys in localStorage
                                    await window.KeyStorageService.storeIdentityKeys(
                                        userId,
                                        restoreResult.keys.publicKey,
                                        restoreResult.keys.secretKey
                                    );

                                    keys = restoreResult.keys;
                                    restoredFromBackup = true;
                                    console.log('[KeyManager] ✓ Keys restored from encrypted backup');
                                } else {
                                    console.warn('[KeyManager] Failed to restore from backup:', restoreResult.error);
                                    if (restoreResult.wrongPassword) {
                                        throw new Error('Incorrect password. Cannot restore encryption keys.');
                                    }
                                }
                            } catch (error) {
                                console.error('[KeyManager] Error restoring from backup:', error);
                                throw error;
                            }
                        } else {
                            console.warn('[KeyManager] No password provided, cannot restore from backup');
                        }
                    }
                }

                // If not restored from backup, generate new keys
                if (!restoredFromBackup) {
                    console.log('[KeyManager] Generating new identity keys...');

                    // Generate and store new identity keys
                    keys = await this.generateAndStoreIdentityKeys(userId);

                    // Upload public key to database for others to fetch
                    await this.uploadPublicKey(userId, keys.publicKey);

                    // Create encrypted backup if password is available
                    if (window.KeyBackupService && window.PasswordManager) {
                        const password = window.PasswordManager.retrieve();

                        if (password) {
                            console.log('[KeyManager] Creating encrypted backup of new keys...');

                            try {
                                const backupResult = await window.KeyBackupService.createBackup(
                                    userId,
                                    keys.publicKey,
                                    keys.secretKey,
                                    password
                                );

                                if (backupResult.success) {
                                    console.log('[KeyManager] ✓ Encrypted backup created successfully');

                                    // Clear password from memory after use
                                    window.PasswordManager.markUsedAndClear();
                                } else {
                                    console.warn('[KeyManager] Failed to create backup:', backupResult.error);
                                }
                            } catch (error) {
                                console.error('[KeyManager] Error creating backup:', error);
                                // Don't fail key generation if backup fails
                            }
                        } else {
                            console.warn('[KeyManager] No password available for backup - keys will only be stored locally');
                            console.warn('[KeyManager] If localStorage is cleared, keys will be lost!');
                        }
                    }

                    console.log('[KeyManager] ✓ New identity keys created and uploaded');
                }
            } else {
                console.log('[KeyManager] ✓ Existing identity keys found');
            }

            this.initialized = true;
            console.log('[KeyManager] ✓ Initialized successfully');

            return keys;

        } catch (error) {
            console.error('[KeyManager] Initialization failed:', error);
            throw new Error('Failed to initialize key manager: ' + error.message);
        }
    },

    /**
     * Generate and store new identity keys
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Key pair with publicKey and secretKey
     */
    async generateAndStoreIdentityKeys(userId) {
        console.log('[KeyManager] Generating identity key pair...');

        const keyPair = window.CryptoService.generateIdentityKeyPair();

        await window.KeyStorageService.storeIdentityKeys(
            userId,
            keyPair.publicKey,
            keyPair.secretKey
        );

        return keyPair;
    },

    /**
     * Upload public key to database for others to fetch
     * @param {string} userId - User ID
     * @param {Uint8Array} publicKey - Public key
     * @returns {Promise<void>}
     */
    async uploadPublicKey(userId, publicKey) {
        console.log('[KeyManager] Uploading public key to database...');

        const publicKeyB64 = window.CryptoService.serializePublicKey(publicKey);

        try {
            // Insert or update public key in database
            const result = await window.DatabaseService.queryInsert('identity_keys', {
                user_id: userId,
                public_key: publicKeyB64
            });

            if (result.error) {
                throw new Error(result.error.message || 'Failed to upload public key');
            }

            console.log('[KeyManager] ✓ Public key uploaded');

        } catch (error) {
            console.error('[KeyManager] Failed to upload public key:', error);
            throw error;
        }
    },

    /**
     * Fetch another user's public key from database
     * @param {string} userId - User ID to fetch key for
     * @returns {Promise<Uint8Array>} Public key
     */
    async fetchPublicKey(userId) {
        console.log('[KeyManager] Fetching public key for user:', userId);

        const result = await window.DatabaseService.querySelect('identity_keys', {
            filter: { user_id: userId },
            limit: 1
        });

        if (result.error) {
            throw new Error('Failed to fetch public key: ' + result.error.message);
        }

        if (!result.data || result.data.length === 0) {
            throw new Error('User has not set up encryption yet. Ask them to log into messenger first.');
        }

        const publicKeyB64 = result.data[0].public_key;
        const publicKey = window.CryptoService.deserializePublicKey(publicKeyB64);

        console.log('[KeyManager] ✓ Public key fetched');

        return publicKey;
    },

    /**
     * Establish encrypted session for a conversation
     * Performs key agreement and stores shared secret
     * @param {string} conversationId - Conversation ID
     * @param {string} otherUserId - Other user's ID
     * @returns {Promise<void>}
     */
    async establishSession(conversationId, otherUserId) {
        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }

        console.log('[KeyManager] Establishing session for conversation:', conversationId);

        // Check if session already exists
        const existingSession = await window.KeyStorageService.getSessionKey(conversationId);

        if (existingSession) {
            console.log('[KeyManager] Session already exists');
            return;
        }

        // Fetch other user's public key from database
        const theirPublicKey = await this.fetchPublicKey(otherUserId);

        // Get our secret key from storage
        const ourKeys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);

        if (!ourKeys) {
            throw new Error('Our identity keys not found');
        }

        // Perform key agreement (ECDH)
        const sharedSecret = window.CryptoService.deriveSharedSecret(
            ourKeys.secretKey,
            theirPublicKey
        );

        // Store session with message counter = 0
        await window.KeyStorageService.storeSessionKey(conversationId, sharedSecret, 0);

        console.log('[KeyManager] ✓ Session established');
    },

    /**
     * Encrypt a message for sending
     * @param {string} conversationId - Conversation ID
     * @param {string} plaintext - Message to encrypt
     * @returns {Promise<Object>} Encrypted data with ciphertext, nonce, and counter
     */
    async encryptMessage(conversationId, plaintext) {
        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }

        if (!plaintext || !plaintext.trim()) {
            throw new Error('Cannot encrypt empty message');
        }

        console.log('[KeyManager] Encrypting message for conversation:', conversationId);

        // Get session key
        const session = await window.KeyStorageService.getSessionKey(conversationId);

        if (!session) {
            throw new Error('No encryption session - call establishSession first');
        }

        // Derive message-specific key (forward secrecy)
        const messageKey = window.CryptoService.deriveMessageKey(
            session.sharedSecret,
            session.messageCounter
        );

        // Encrypt message
        const encrypted = window.CryptoService.encryptMessage(plaintext.trim(), messageKey);

        // Store the current counter before incrementing
        const currentCounter = session.messageCounter;

        // Increment counter for next message
        await window.KeyStorageService.incrementMessageCounter(conversationId);

        console.log('[KeyManager] ✓ Message encrypted with counter:', currentCounter);

        return {
            ciphertext: encrypted.ciphertext,
            nonce: encrypted.nonce,
            counter: currentCounter
        };
    },

    /**
     * Decrypt a received message
     * @param {string} conversationId - Conversation ID
     * @param {Object} encryptedData - Object with ciphertext, nonce, and counter
     * @returns {Promise<string>} Decrypted plaintext
     */
    async decryptMessage(conversationId, encryptedData) {
        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }

        if (!encryptedData || !encryptedData.ciphertext || !encryptedData.nonce) {
            throw new Error('Invalid encrypted data');
        }

        if (typeof encryptedData.counter !== 'number') {
            throw new Error('Invalid message counter');
        }

        console.log('[KeyManager] Decrypting message for conversation:', conversationId);

        // Get session key
        const session = await window.KeyStorageService.getSessionKey(conversationId);

        if (!session) {
            throw new Error('No encryption session found');
        }

        // Derive the same message key using the counter from the message
        const messageKey = window.CryptoService.deriveMessageKey(
            session.sharedSecret,
            encryptedData.counter
        );

        // Decrypt message
        const plaintext = window.CryptoService.decryptMessage(
            encryptedData.ciphertext,
            encryptedData.nonce,
            messageKey
        );

        console.log('[KeyManager] ✓ Message decrypted');

        return plaintext;
    },

    /**
     * Generate security code for key verification
     * Users compare these codes to verify they're talking to the right person
     * @param {string} otherUserId - Other user's ID
     * @returns {Promise<string>} Security code (e.g., "12345 67890 11121 31415 16171 81920")
     */
    async generateSecurityCode(otherUserId) {
        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }

        console.log('[KeyManager] Generating security code for user:', otherUserId);

        // Get our public key
        const ourKeys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);

        if (!ourKeys) {
            throw new Error('Our identity keys not found');
        }

        // Fetch their public key
        const theirPublicKey = await this.fetchPublicKey(otherUserId);

        // Order keys consistently (lower user ID first)
        // This ensures both users generate the same code
        const [key1, key2] = this.currentUserId < otherUserId
            ? [ourKeys.publicKey, theirPublicKey]
            : [theirPublicKey, ourKeys.publicKey];

        const securityCode = window.CryptoService.generateSecurityCode(key1, key2);

        console.log('[KeyManager] ✓ Security code generated');

        return securityCode;
    },

    /**
     * Delete session for a conversation
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<void>}
     */
    async deleteSession(conversationId) {
        console.log('[KeyManager] Deleting session for conversation:', conversationId);

        await window.KeyStorageService.deleteSessionKey(conversationId);

        console.log('[KeyManager] ✓ Session deleted');
    },

    /**
     * Get encryption statistics
     * @returns {Promise<Object>} Stats object
     */
    async getStats() {
        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }

        const stats = await window.KeyStorageService.getStats();

        return {
            ...stats,
            currentUserId: this.currentUserId,
            initialized: this.initialized
        };
    },

    /**
     * Reset all encryption keys (use with extreme caution!)
     * This will make all existing encrypted messages unreadable
     * @returns {Promise<void>}
     */
    async resetAllKeys() {
        console.warn('[KeyManager] Resetting all keys - encrypted messages will be UNREADABLE!');

        if (confirm('This will delete ALL encryption keys and make encrypted messages unreadable. Are you sure?')) {
            await window.KeyStorageService.clearAllKeys();

            this.initialized = false;
            this.currentUserId = null;

            console.log('[KeyManager] ✓ All keys reset');

            alert('All encryption keys have been cleared. Please refresh the page.');
        }
    }
};

// Make available globally
window.KeyManager = KeyManager;

console.log('%c[KeyManager] Ready', 'color: blue; font-weight: bold');
