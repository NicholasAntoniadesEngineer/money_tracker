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

        console.log('[KeyManager] ========== INITIALIZATION STARTED ==========');
        console.log('[KeyManager] User ID:', userId);
        console.log('[KeyManager] Device info:', {
            userAgent: navigator.userAgent.substring(0, 50),
            platform: navigator.platform
        });

        this.currentUserId = userId;

        try {
            // Initialize crypto service
            console.log('[KeyManager] Step 1: Initializing CryptoService...');
            await window.CryptoService.initialize();
            console.log('[KeyManager] ✓ CryptoService initialized');

            // Initialize key storage
            console.log('[KeyManager] Step 2: Initializing KeyStorageService...');
            await window.KeyStorageService.initialize();
            console.log('[KeyManager] ✓ KeyStorageService initialized');

            // Step 3: Check local IndexedDB for keys
            console.log('[KeyManager] Step 3: Checking local IndexedDB for identity keys...');
            let keys = await window.KeyStorageService.getIdentityKeys(userId);

            if (keys && keys.publicKey && keys.secretKey) {
                console.log('[KeyManager] ✓ Found keys in local IndexedDB');
                console.log('[KeyManager] Public key length:', keys.publicKey.length);
                this.initialized = true;

                // Step 4: Sync session keys from database (for multi-device support)
                console.log('[KeyManager] Step 4: Syncing session keys from database...');
                try {
                    await this.syncSessionKeysFromDatabase();
                    console.log('[KeyManager] ✓ Session keys synced from database');
                } catch (error) {
                    console.error('[KeyManager] Failed to sync session keys:', error);
                    // Don't fail initialization if session sync fails
                }

                // Step 5: Back up any local sessions that don't have database backups
                // SKIP THIS DURING INITIALIZATION - it hangs and blocks page load
                // Sessions will be backed up automatically when sending/receiving messages
                console.log('[KeyManager] Step 5: Skipping local session backup during initialization (non-critical, can hang)');
                console.log('[KeyManager] Sessions will be backed up automatically during message operations');

                // Run backup in background (non-blocking) - don't await, ignore errors
                this.backupLocalSessionsToDatabase().catch(error => {
                    console.warn('[KeyManager] Background session backup failed (expected, non-critical):', error.message);
                });

                console.log('[KeyManager] ========== INITIALIZATION COMPLETE (LOCAL KEYS) ==========');
                return keys;
            }

            console.log('[KeyManager] No keys in local IndexedDB');

            // Step 4: Check if user already has keys in database (multi-device scenario)
            console.log('[KeyManager] Step 4: Checking database for existing keys...');
            const existingKeyInDb = await this.checkDatabaseForExistingKey(userId);

            if (existingKeyInDb) {
                console.log('[KeyManager] ⚠ User already has keys in database (different device)');
                console.log('[KeyManager] This device needs to retrieve encrypted backup');

                // TODO: Implement key backup retrieval
                // For now, throw a helpful error
                throw new Error(
                    'Your encryption keys exist on another device. ' +
                    'Please use the device pairing feature to sync your keys to this device. ' +
                    'Direct key generation is not allowed when keys already exist.'
                );
            }

            console.log('[KeyManager] No existing keys found in database');

            // Step 5: Generate new keys (first device)
            console.log('[KeyManager] Step 5: Generating new identity keys (first device)...');
            keys = await this.generateAndStoreIdentityKeys(userId);
            console.log('[KeyManager] ✓ Keys generated and stored locally');

            // Step 6: Upload public key to database
            console.log('[KeyManager] Step 6: Uploading public key to database...');
            await this.uploadPublicKey(userId, keys.publicKey);
            console.log('[KeyManager] ✓ Public key uploaded to database');

            this.initialized = true;

            // Step 7: Sync session keys from database (will be empty for first device, but good for consistency)
            console.log('[KeyManager] Step 7: Syncing session keys from database...');
            try {
                await this.syncSessionKeysFromDatabase();
                console.log('[KeyManager] ✓ Session keys synced (none expected for new user)');
            } catch (error) {
                console.error('[KeyManager] Failed to sync session keys:', error);
                // Don't fail initialization if session sync fails
            }

            // Step 8: Back up any local sessions (will be empty for new user, but good for consistency)
            console.log('[KeyManager] Step 8: Backing up local sessions to database...');
            try {
                await this.backupLocalSessionsToDatabase();
                console.log('[KeyManager] ✓ Local sessions backed up (none expected for new user)');
            } catch (error) {
                console.error('[KeyManager] Failed to backup local sessions:', error);
                // Don't fail initialization if backup fails
            }

            console.log('[KeyManager] ========== INITIALIZATION COMPLETE (NEW KEYS) ==========');

            return keys;

        } catch (error) {
            console.error('[KeyManager] ========== INITIALIZATION FAILED ==========');
            console.error('[KeyManager] Error:', error);
            console.error('[KeyManager] Error stack:', error.stack);
            console.error('[KeyManager] Error details:', {
                message: error.message,
                name: error.name,
                userId: userId
            });
            throw new Error('Failed to initialize key manager: ' + error.message);
        }
    },

    /**
     * Check if user already has a public key in database
     * @param {string} userId - User ID to check
     * @returns {Promise<boolean>} True if key exists in database
     */
    async checkDatabaseForExistingKey(userId) {
        console.log('[KeyManager] Querying database for existing public key...');
        console.log('[KeyManager] User ID:', userId);

        try {
            const result = await window.DatabaseService.querySelect('identity_keys', {
                filter: { user_id: userId },
                limit: 1
            });

            console.log('[KeyManager] Database query result:', {
                hasError: !!result.error,
                hasData: !!result.data,
                dataLength: result.data?.length || 0
            });

            if (result.error) {
                console.error('[KeyManager] Database query error:', result.error);
                // Don't throw - treat as "no key found" to allow first-time setup
                return false;
            }

            const keyExists = result.data && result.data.length > 0;
            console.log('[KeyManager] Key exists in database:', keyExists);

            if (keyExists) {
                console.log('[KeyManager] Found existing key:', {
                    userId: result.data[0].user_id,
                    publicKeyLength: result.data[0].public_key?.length || 0,
                    createdAt: result.data[0].created_at
                });
            }

            return keyExists;

        } catch (error) {
            console.error('[KeyManager] Error checking database for existing key:', error);
            console.error('[KeyManager] Error stack:', error.stack);
            // Don't throw - treat as "no key found" to allow first-time setup
            return false;
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
        console.log('[KeyManager] ========== UPLOADING PUBLIC KEY ==========');
        console.log('[KeyManager] User ID:', userId);
        console.log('[KeyManager] Public key length:', publicKey?.length || 0);

        const publicKeyB64 = window.CryptoService.serializePublicKey(publicKey);
        console.log('[KeyManager] Public key (base64) length:', publicKeyB64?.length || 0);
        console.log('[KeyManager] Public key (base64) preview:', publicKeyB64?.substring(0, 20) + '...');

        try {
            console.log('[KeyManager] Calling DatabaseService.queryInsert...');
            console.log('[KeyManager] Table: identity_keys');
            console.log('[KeyManager] Data:', {
                user_id: userId,
                public_key_length: publicKeyB64.length
            });

            // Insert or update public key in database
            const result = await window.DatabaseService.queryInsert('identity_keys', {
                user_id: userId,
                public_key: publicKeyB64
            });

            console.log('[KeyManager] Database insert result:', {
                hasError: !!result.error,
                hasData: !!result.data,
                errorCode: result.error?.code,
                errorMessage: result.error?.message,
                errorDetails: result.error?.details
            });

            if (result.error) {
                console.error('[KeyManager] Database insert failed');
                console.error('[KeyManager] Error code:', result.error.code);
                console.error('[KeyManager] Error message:', result.error.message);
                console.error('[KeyManager] Error details:', result.error.details);
                console.error('[KeyManager] Full error:', result.error);
                throw new Error(result.error.message || 'Failed to upload public key');
            }

            console.log('[KeyManager] ✓ Public key uploaded successfully');
            console.log('[KeyManager] ========== PUBLIC KEY UPLOAD COMPLETE ==========');

        } catch (error) {
            console.error('[KeyManager] ========== PUBLIC KEY UPLOAD FAILED ==========');
            console.error('[KeyManager] Error:', error);
            console.error('[KeyManager] Error name:', error.name);
            console.error('[KeyManager] Error message:', error.message);
            console.error('[KeyManager] Error stack:', error.stack);
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

        console.log('[KeyManager] ========== ESTABLISHING SESSION ==========');
        console.log('[KeyManager] Conversation ID:', conversationId, '(type:', typeof conversationId + ')');
        console.log('[KeyManager] Other user ID:', otherUserId);

        // Check if session already exists locally (convert to string for IndexedDB)
        const existingSession = await window.KeyStorageService.getSessionKey(conversationId.toString());

        if (existingSession) {
            console.log('[KeyManager] Session already exists locally');
            console.log('[KeyManager] ========== SESSION ESTABLISHMENT COMPLETE ==========');
            return;
        }

        // Fetch other user's public key from database
        console.log('[KeyManager] Fetching other user public key...');
        const theirPublicKey = await this.fetchPublicKey(otherUserId);
        const theirPublicKeyHex = Array.from(theirPublicKey).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('[KeyManager] ✓ Public key fetched');
        console.log('[KeyManager] Their public key (first 32 chars):', theirPublicKeyHex.substring(0, 32));
        console.log('[KeyManager] Their public key (last 32 chars):', theirPublicKeyHex.substring(theirPublicKeyHex.length - 32));

        // Get our secret key from storage
        console.log('[KeyManager] Getting our identity keys...');
        const ourKeys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);

        if (!ourKeys) {
            throw new Error('Our identity keys not found');
        }
        const ourPublicKeyHex = Array.from(ourKeys.publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('[KeyManager] ✓ Identity keys retrieved');
        console.log('[KeyManager] Our public key (first 32 chars):', ourPublicKeyHex.substring(0, 32));
        console.log('[KeyManager] Our public key (last 32 chars):', ourPublicKeyHex.substring(ourPublicKeyHex.length - 32));

        // Perform key agreement (ECDH)
        console.log('[KeyManager] Performing ECDH key agreement...');
        console.log('[KeyManager] Current user:', this.currentUserId);
        console.log('[KeyManager] Other user:', otherUserId);
        const sharedSecret = window.CryptoService.deriveSharedSecret(
            ourKeys.secretKey,
            theirPublicKey
        );
        const derivedSecretHex = Array.from(sharedSecret).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('[KeyManager] ✓ Shared secret derived');
        console.log('[KeyManager] Derived shared secret (first 16 chars):', derivedSecretHex.substring(0, 16));
        console.log('[KeyManager] Derived shared secret (last 16 chars):', derivedSecretHex.substring(derivedSecretHex.length - 16));

        // Store session locally with message counter = 0
        console.log('[KeyManager] Storing session locally (as string)...');
        await window.KeyStorageService.storeSessionKey(conversationId.toString(), sharedSecret, 0);
        console.log('[KeyManager] ✓ Session stored locally');

        // Backup session key to database for multi-device support
        console.log('[KeyManager] Backing up session key to database...');
        await this.backupSessionKeyToDatabase(conversationId, sharedSecret, 0);
        console.log('[KeyManager] ✓ Session key backed up to database');

        console.log('[KeyManager] ========== SESSION ESTABLISHMENT COMPLETE ==========');
    },

    /**
     * Generate a safety number for MITM protection
     * Both users will see the same number if using correct keys
     * Users can verify this out-of-band (phone call, in person) to confirm no MITM
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<Object>} Safety number info
     */
    async getSafetyNumber(conversationId) {
        console.log('[KeyManager] Generating safety number for conversation:', conversationId);

        try {
            // Get conversation to find the other user
            const convResult = await window.DatabaseService.querySelect('conversations', {
                filter: { id: parseInt(conversationId) }
            });

            if (convResult.error || !convResult.data || convResult.data.length === 0) {
                return { success: false, message: 'Conversation not found' };
            }

            const conversation = convResult.data[0];
            const otherUserId = conversation.user1_id === this.currentUserId
                ? conversation.user2_id
                : conversation.user1_id;

            // Get both users' public keys
            const ourKeys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);
            if (!ourKeys) {
                return { success: false, message: 'Your identity keys not found' };
            }

            // Get other user's public key from identity_keys table
            const theirKeyResult = await window.DatabaseService.querySelect('identity_keys', {
                filter: { user_id: otherUserId },
                limit: 1
            });

            if (theirKeyResult.error || !theirKeyResult.data || theirKeyResult.data.length === 0) {
                return { success: false, message: 'Other user\'s public key not found. They may need to initialize encryption first.' };
            }

            const theirPublicKeyBase64 = theirKeyResult.data[0].public_key;
            const theirPublicKey = Uint8Array.from(atob(theirPublicKeyBase64), c => c.charCodeAt(0));

            // Create safety number by hashing both public keys in sorted order
            // This ensures both users get the same number
            const ourKeyHex = Array.from(ourKeys.publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
            const theirKeyHex = Array.from(theirPublicKey).map(b => b.toString(16).padStart(2, '0')).join('');

            // Sort to ensure consistent order
            const [first, second] = [ourKeyHex, theirKeyHex].sort();
            const combined = first + second;

            // Simple hash to create a readable safety number
            // Using first 32 chars of combined keys (formatted as groups)
            const safetyNumber = combined.substring(0, 32)
                .match(/.{1,4}/g)
                .join(' ')
                .toUpperCase();

            // Also create a visual fingerprint (shorter version)
            const fingerprint = combined.substring(0, 16).toUpperCase();

            return {
                success: true,
                safetyNumber: safetyNumber,
                fingerprint: fingerprint,
                ourKeyFingerprint: ourKeyHex.substring(0, 16).toUpperCase(),
                theirKeyFingerprint: theirKeyHex.substring(0, 16).toUpperCase(),
                message: 'Compare this number with your contact to verify no one is intercepting your messages'
            };

        } catch (error) {
            console.error('[KeyManager] Error generating safety number:', error);
            return { success: false, message: error.message };
        }
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

        console.log('[KeyManager] Encrypting message for conversation:', conversationId, '(type:', typeof conversationId + ')');

        // IMPORTANT: IndexedDB uses string keys, so convert conversationId to string
        const convIdStr = String(conversationId);

        // Get session key
        const session = await window.KeyStorageService.getSessionKey(convIdStr);

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

        // Increment counter for next message (local IndexedDB)
        const newCounter = await window.KeyStorageService.incrementMessageCounter(convIdStr);

        // Also update counter in database for multi-device sync
        await this.updateSessionCounterInDatabase(convIdStr, newCounter);

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

        console.log('[KeyManager] ========== DECRYPTING MESSAGE ==========');
        console.log('[KeyManager] Conversation ID:', conversationId, '(type:', typeof conversationId + ')');
        console.log('[KeyManager] Message counter:', encryptedData.counter);
        console.log('[KeyManager] Current user ID:', this.currentUserId);
        console.log('[KeyManager] Timestamp:', new Date().toISOString());

        // Get our identity keys to log for comparison
        const ourKeys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);
        if (ourKeys) {
            const publicKeyHex = Array.from(ourKeys.publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('[KeyManager] Our public key (first 32 chars):', publicKeyHex.substring(0, 32));
            console.log('[KeyManager] Our public key (last 32 chars):', publicKeyHex.substring(publicKeyHex.length - 32));
        }

        // Get session key from IndexedDB
        console.log('[KeyManager] [Decrypt Step 1/6] Checking IndexedDB for session key...');
        const indexedDBCheckStart = Date.now();
        // IMPORTANT: IndexedDB uses string keys, so convert conversationId to string
        let session = await window.KeyStorageService.getSessionKey(conversationId.toString());
        console.log('[KeyManager] IndexedDB lookup took', Date.now() - indexedDBCheckStart, 'ms');

        if (!session) {
            console.log('[KeyManager] [Decrypt Step 2/6] ❌ Session key NOT found in IndexedDB');
            console.log('[KeyManager] Attempting to restore from database backup...');

            try {
                // Try to restore this specific session key from database
                const restored = await this.restoreSessionKeyFromDatabase(conversationId);
                if (restored) {
                    console.log('[KeyManager] ✓ Session key restored from database backup');
                    // Try getting it again from IndexedDB
                    // CRITICAL: Convert to string to match how it was stored
                    console.log('[KeyManager] Retrieving restored session from IndexedDB (conversationId as string)...');
                    session = await window.KeyStorageService.getSessionKey(conversationId.toString());

                    if (session) {
                        console.log('[KeyManager] ✓ Successfully retrieved restored session from IndexedDB');
                    } else {
                        console.error('[KeyManager] ❌ FAILED to retrieve restored session from IndexedDB!');
                        console.error('[KeyManager] This should never happen - session was just stored!');
                    }
                }
            } catch (error) {
                console.error('[KeyManager] Failed to restore session key from database:', error);
            }

            // If still no session, try to derive it from the conversation participants
            if (!session) {
                console.log('[KeyManager] No database backup found, attempting to derive session key from conversation...');
                try {
                    // Get conversation details to find the other user
                    const convResult = await window.DatabaseService.querySelect('conversations', {
                        filter: { id: parseInt(conversationId) }
                    });

                    if (!convResult.error && convResult.data && convResult.data.length > 0) {
                        const conversation = convResult.data[0];
                        const otherUserId = conversation.user1_id === this.currentUserId
                            ? conversation.user2_id
                            : conversation.user1_id;

                        console.log('[KeyManager] Found other user:', otherUserId);
                        console.log('[KeyManager] Establishing session via ECDH...');

                        // Establish session (will derive shared secret and create backup)
                        await this.establishSession(conversationId, otherUserId);

                        // Try getting it again from IndexedDB (convert to string!)
                        console.log('[KeyManager] Retrieving newly established session from IndexedDB...');
                        session = await window.KeyStorageService.getSessionKey(conversationId.toString());

                        if (session) {
                            console.log('[KeyManager] ✓ Session key derived and backed up successfully');
                        } else {
                            console.error('[KeyManager] ❌ Failed to retrieve newly established session!');
                        }
                    } else {
                        console.error('[KeyManager] Could not find conversation details');
                        console.error('[KeyManager] convResult:', JSON.stringify(convResult, null, 2));
                    }
                } catch (deriveError) {
                    console.error('[KeyManager] Failed to derive session key:', deriveError);
                }
            }

            if (!session) {
                console.error('[KeyManager] ❌ No session key found in IndexedDB, database backup, or via derivation');
                console.error('[KeyManager] This means:');
                console.error('[KeyManager]   1. Session not in local IndexedDB');
                console.error('[KeyManager]   2. No backup exists in database for this user/conversation');
                console.error('[KeyManager]   3. Cannot derive session (no conversation details or other user keys)');
                throw new Error('No encryption session found');
            }
        } else {
            console.log('[KeyManager] [Decrypt Step 2/6] ✓ Session key FOUND in IndexedDB');
        }

        // Log the shared secret for debugging
        console.log('[KeyManager] [Decrypt Step 3/6] Logging session details...');
        const sharedSecretHex = Array.from(session.sharedSecret).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('[KeyManager] Shared secret (first 16 chars):', sharedSecretHex.substring(0, 16));
        console.log('[KeyManager] Shared secret (last 16 chars):', sharedSecretHex.substring(sharedSecretHex.length - 16));
        console.log('[KeyManager] Session counter:', session.counter);
        console.log('[KeyManager] Message counter:', encryptedData.counter);

        // Derive the same message key using the counter from the message
        console.log('[KeyManager] [Decrypt Step 4/6] Deriving message key with counter:', encryptedData.counter);
        const messageKey = window.CryptoService.deriveMessageKey(
            session.sharedSecret,
            encryptedData.counter
        );

        // Log the derived message key
        const messageKeyHex = Array.from(messageKey).map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('[KeyManager] Derived message key (first 16 chars):', messageKeyHex.substring(0, 16));
        console.log('[KeyManager] Derived message key (last 16 chars):', messageKeyHex.substring(messageKeyHex.length - 16));

        // Decrypt message with automatic session recovery on authentication failure
        console.log('[KeyManager] [Decrypt Step 5/6] Attempting decryption with derived message key...');
        let plaintext;

        try {
            plaintext = window.CryptoService.decryptMessage(
                encryptedData.ciphertext,
                encryptedData.nonce,
                messageKey
            );
            console.log('[KeyManager] [Decrypt Step 6/6] ✓✓✓ Message decrypted successfully!');
            console.log('[KeyManager] Plaintext length:', plaintext.length, 'characters');

        } catch (decryptError) {
            // Check if this is an authentication failure (stale/mismatched session)
            console.error('[KeyManager] [Decrypt Step 6/6] ❌ Decryption FAILED');
            console.error('[KeyManager] Error:', decryptError.message);

            if (decryptError.message && decryptError.message.includes('authentication check failed')) {
                console.warn('[KeyManager] ========== AUTHENTICATION CHECK FAILED ==========');
                console.warn('[KeyManager] This means the shared secret used to encrypt is DIFFERENT');
                console.warn('[KeyManager] from the shared secret we have locally.');
                console.warn('[KeyManager] Possible causes:');
                console.warn('[KeyManager]   1. Primary device encrypted with different keys');
                console.warn('[KeyManager]   2. Session backup is stale/wrong');
                console.warn('[KeyManager]   3. Message was encrypted by different user');
                console.log('[KeyManager] Attempting to recover by checking for fresh database backup...');

                try {
                    // Clear the stale session from IndexedDB only (don't delete database backup yet!)
                    console.log('[KeyManager] Clearing stale local session from IndexedDB...');
                    await window.KeyStorageService.deleteSessionKey(conversationId);

                    // Try to restore from database backup FIRST (from another device that has working session)
                    console.log('[KeyManager] Checking for session backup in database...');
                    const backupResult = await window.DatabaseService.querySelect('conversation_session_keys', {
                        filter: {
                            user_id: this.currentUserId,
                            conversation_id: parseInt(conversationId)
                        },
                        limit: 1
                    });

                    let freshSession;

                    if (!backupResult.error && backupResult.data && backupResult.data.length > 0) {
                        // Database backup exists - restore from it
                        console.log('[KeyManager] ✓ Found database backup, restoring from it...');
                        const restored = await this.restoreSessionKeyFromDatabase(conversationId);

                        if (restored) {
                            // Important: Ensure conversationId is a string for IndexedDB lookup
                            const conversationIdStr = String(conversationId);
                            console.log('[KeyManager] Attempting to retrieve restored session with ID:', conversationIdStr);

                            freshSession = await window.KeyStorageService.getSessionKey(conversationIdStr);
                            if (freshSession) {
                                console.log('[KeyManager] ✓ Session restored from database backup');

                                // Log the restored shared secret
                                const restoredSecretHex = Array.from(freshSession.sharedSecret).map(b => b.toString(16).padStart(2, '0')).join('');
                                console.log('[KeyManager] Restored shared secret (first 16 chars):', restoredSecretHex.substring(0, 16));
                                console.log('[KeyManager] Restored shared secret (last 16 chars):', restoredSecretHex.substring(restoredSecretHex.length - 16));
                            } else {
                                console.error('[KeyManager] ⚠️  Session restored but could not retrieve from IndexedDB');
                                console.error('[KeyManager] This indicates a storage/retrieval mismatch issue');
                            }
                        } else {
                            console.error('[KeyManager] ⚠️  restoreSessionKeyFromDatabase returned false');
                        }
                    }

                    // If no database backup, fall back to deriving fresh
                    if (!freshSession) {
                        console.log('[KeyManager] No database backup found, attempting to derive fresh session...');
                        console.warn('[KeyManager] ⚠️  WARNING: This may fail if other device has different keys!');

                        // Get conversation details to find the other user
                        const convResult = await window.DatabaseService.querySelect('conversations', {
                            filter: { id: parseInt(conversationId) }
                        });

                        if (convResult.error || !convResult.data || convResult.data.length === 0) {
                            throw new Error('Could not fetch conversation details for session recovery');
                        }

                        const conversation = convResult.data[0];
                        const otherUserId = conversation.user1_id === this.currentUserId
                            ? conversation.user2_id
                            : conversation.user1_id;

                        console.log('[KeyManager] Re-establishing session with user:', otherUserId);

                        // Re-derive the session using CURRENT public keys from database
                        await this.establishSession(conversationId, otherUserId);

                        // Get the fresh session (convert to string for IndexedDB)
                        freshSession = await window.KeyStorageService.getSessionKey(conversationId.toString());
                        if (!freshSession) {
                            throw new Error('Failed to establish fresh session');
                        }

                        console.log('[KeyManager] ✓ Fresh session derived');

                        // Log the new shared secret for comparison
                        const freshSecretHex = Array.from(freshSession.sharedSecret).map(b => b.toString(16).padStart(2, '0')).join('');
                        console.log('[KeyManager] Derived shared secret (first 16 chars):', freshSecretHex.substring(0, 16));
                        console.log('[KeyManager] Derived shared secret (last 16 chars):', freshSecretHex.substring(freshSecretHex.length - 16));
                    }

                    if (!freshSession) {
                        throw new Error('Could not restore or derive session for recovery');
                    }

                    // Derive message key with recovered session
                    const freshMessageKey = window.CryptoService.deriveMessageKey(
                        freshSession.sharedSecret,
                        encryptedData.counter
                    );

                    // Retry decryption with recovered session
                    console.log('[KeyManager] Retrying decryption with recovered session...');
                    plaintext = window.CryptoService.decryptMessage(
                        encryptedData.ciphertext,
                        encryptedData.nonce,
                        freshMessageKey
                    );

                    console.log('[KeyManager] ✓✓ Message decrypted successfully with recovered session!');

                    // Update the session reference for the backup code below
                    session = freshSession;

                } catch (recoveryError) {
                    console.error('[KeyManager] ❌ Session recovery failed:', recoveryError);
                    throw new Error('Decryption failed and session recovery failed: ' + recoveryError.message);
                }
            } else {
                // Different error, re-throw
                console.error('[KeyManager] ❌ Decryption failed:', decryptError);
                throw decryptError;
            }
        }

        // After successful decryption, ensure we have a backup in the database
        // This is crucial for recipients who decrypt messages but never sent any
        // Without this, they won't have a backup for multi-device support
        try {
            // Check if backup already exists (non-blocking check)
            const backupCheck = await window.DatabaseService.querySelect('conversation_session_keys', {
                filter: {
                    user_id: this.currentUserId,
                    conversation_id: parseInt(conversationId)
                },
                limit: 1
            });

            if (!backupCheck.error && (!backupCheck.data || backupCheck.data.length === 0)) {
                console.log('[KeyManager] No backup exists, creating one after successful decryption...');
                await this.backupSessionKeyToDatabase(conversationId, session.sharedSecret, session.counter);
                console.log('[KeyManager] ✓ Backup created for recipient');
            }
        } catch (backupError) {
            // Don't fail decryption if backup fails - just log it
            console.warn('[KeyManager] Failed to create backup after decryption:', backupError);
        }

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
     * ADMIN TOOL: Force re-establish session and backup from PRIMARY device
     * Use this to fix corrupted backups caused by secondary devices with wrong identity keys
     *
     * ONLY RUN THIS ON THE PRIMARY DEVICE!
     *
     * Usage from console:
     *   await window.KeyManager.forceRebackupSession(1);
     *
     * @param {number|string} conversationId - Conversation ID to fix
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async forceRebackupSession(conversationId) {
        console.log('[KeyManager] ========== FORCE RE-BACKUP SESSION (ADMIN TOOL) ==========');
        console.log('[KeyManager] ⚠️  WARNING: Only run this on the PRIMARY device!');
        console.log('[KeyManager] Conversation ID:', conversationId);
        console.log('[KeyManager] Current user:', this.currentUserId);

        if (!this.initialized) {
            return { success: false, message: 'KeyManager not initialized' };
        }

        try {
            // Step 1: Get conversation details to find the other user
            console.log('[KeyManager] Step 1: Fetching conversation details...');
            const convResult = await window.DatabaseService.querySelect('conversations', {
                filter: { id: parseInt(conversationId) }
            });

            if (convResult.error || !convResult.data || convResult.data.length === 0) {
                return { success: false, message: 'Conversation not found' };
            }

            const conversation = convResult.data[0];
            const otherUserId = conversation.user1_id === this.currentUserId
                ? conversation.user2_id
                : conversation.user1_id;

            console.log('[KeyManager] Other user ID:', otherUserId);

            // Step 2: Delete local session key
            console.log('[KeyManager] Step 2: Clearing local session key...');
            try {
                await window.KeyStorageService.deleteSessionKey(conversationId.toString());
                console.log('[KeyManager] ✓ Local session cleared');
            } catch (e) {
                console.log('[KeyManager] No local session to clear');
            }

            // Step 3: Delete database backup (force fresh start)
            console.log('[KeyManager] Step 3: Deleting corrupted database backup...');
            const deleteResult = await window.DatabaseService.queryDelete(
                'conversation_session_keys',
                {
                    user_id: this.currentUserId,
                    conversation_id: parseInt(conversationId)
                }
            );
            if (deleteResult.error) {
                console.warn('[KeyManager] Could not delete backup:', deleteResult.error);
            } else {
                console.log('[KeyManager] ✓ Database backup deleted');
            }

            // Step 4: Fetch other user's public key
            console.log('[KeyManager] Step 4: Fetching other user public key...');
            const theirPublicKey = await this.fetchPublicKey(otherUserId);
            const theirPublicKeyHex = Array.from(theirPublicKey).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('[KeyManager] Their public key (first 32):', theirPublicKeyHex.substring(0, 32));

            // Step 5: Get our identity keys
            console.log('[KeyManager] Step 5: Getting our identity keys...');
            const ourKeys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);
            if (!ourKeys) {
                return { success: false, message: 'Identity keys not found' };
            }
            const ourPublicKeyHex = Array.from(ourKeys.publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('[KeyManager] Our public key (first 32):', ourPublicKeyHex.substring(0, 32));

            // Step 6: Derive shared secret via ECDH
            console.log('[KeyManager] Step 6: Deriving shared secret via ECDH...');
            const sharedSecret = window.CryptoService.deriveSharedSecret(
                ourKeys.secretKey,
                theirPublicKey
            );
            const sharedSecretHex = Array.from(sharedSecret).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('[KeyManager] ✓ Shared secret derived');
            console.log('[KeyManager] Shared secret (first 16):', sharedSecretHex.substring(0, 16));
            console.log('[KeyManager] Shared secret (last 16):', sharedSecretHex.substring(sharedSecretHex.length - 16));

            // Step 7: Store session locally
            console.log('[KeyManager] Step 7: Storing session locally...');
            await window.KeyStorageService.storeSessionKey(conversationId.toString(), sharedSecret, 0);
            console.log('[KeyManager] ✓ Session stored locally');

            // Step 8: Force backup to database (bypassing safety check since we deleted it)
            console.log('[KeyManager] Step 8: Backing up to database...');
            const encrypted = window.CryptoService.encryptSessionKeyForBackup(
                sharedSecret,
                ourKeys.secretKey
            );

            const insertResult = await window.DatabaseService.queryInsert('conversation_session_keys', {
                user_id: this.currentUserId,
                conversation_id: parseInt(conversationId),
                encrypted_session_key: encrypted.encryptedKey,
                encryption_nonce: encrypted.nonce,
                message_counter: 0
            });

            if (insertResult.error) {
                return { success: false, message: 'Failed to backup: ' + insertResult.error.message };
            }

            console.log('[KeyManager] ✓ Session backed up to database');
            console.log('[KeyManager] ========== FORCE RE-BACKUP COMPLETE ==========');
            console.log('[KeyManager] ');
            console.log('[KeyManager] Next steps:');
            console.log('[KeyManager] 1. On the SECONDARY device, clear IndexedDB and reload');
            console.log('[KeyManager] 2. The secondary device will restore the correct backup');
            console.log('[KeyManager] 3. Messages should now decrypt correctly');

            return {
                success: true,
                message: 'Session re-established and backed up. Secondary device should now sync.',
                sharedSecret: sharedSecretHex.substring(0, 16) + '...' + sharedSecretHex.substring(sharedSecretHex.length - 16)
            };

        } catch (error) {
            console.error('[KeyManager] ========== FORCE RE-BACKUP FAILED ==========');
            console.error('[KeyManager] Error:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * ADMIN TOOL: Clear local session and re-sync from database backup
     * Use this on SECONDARY device after primary has fixed the backup
     *
     * Usage from console:
     *   await window.KeyManager.forceSyncFromBackup(1);
     *
     * @param {number|string} conversationId - Conversation ID to sync
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async forceSyncFromBackup(conversationId) {
        console.log('[KeyManager] ========== FORCE SYNC FROM BACKUP (ADMIN TOOL) ==========');
        console.log('[KeyManager] Conversation ID:', conversationId);
        console.log('[KeyManager] Current user:', this.currentUserId);

        if (!this.initialized) {
            return { success: false, message: 'KeyManager not initialized' };
        }

        try {
            // Step 1: Delete local session
            console.log('[KeyManager] Step 1: Clearing local session...');
            try {
                await window.KeyStorageService.deleteSessionKey(conversationId.toString());
                console.log('[KeyManager] ✓ Local session cleared');
            } catch (e) {
                console.log('[KeyManager] No local session to clear');
            }

            // Step 2: Restore from database backup
            console.log('[KeyManager] Step 2: Restoring from database backup...');
            const restored = await this.restoreSessionKeyFromDatabase(conversationId);

            if (!restored) {
                return { success: false, message: 'No backup found in database or decryption failed' };
            }

            // Step 3: Verify the restored session
            console.log('[KeyManager] Step 3: Verifying restored session...');
            const session = await window.KeyStorageService.getSessionKey(conversationId.toString());

            if (!session) {
                return { success: false, message: 'Failed to retrieve restored session' };
            }

            const sharedSecretHex = Array.from(session.sharedSecret).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('[KeyManager] ✓ Session restored successfully');
            console.log('[KeyManager] Shared secret (first 16):', sharedSecretHex.substring(0, 16));
            console.log('[KeyManager] Shared secret (last 16):', sharedSecretHex.substring(sharedSecretHex.length - 16));

            console.log('[KeyManager] ========== FORCE SYNC COMPLETE ==========');
            console.log('[KeyManager] Try opening the conversation now to test decryption.');

            return {
                success: true,
                message: 'Session restored from backup successfully',
                sharedSecret: sharedSecretHex.substring(0, 16) + '...' + sharedSecretHex.substring(sharedSecretHex.length - 16)
            };

        } catch (error) {
            console.error('[KeyManager] ========== FORCE SYNC FAILED ==========');
            console.error('[KeyManager] Error:', error);
            return { success: false, message: error.message };
        }
    },

    /**
     * Backup session key to database (encrypted with identity key)
     * Enables message decryption on other devices
     * @param {string} conversationId - Conversation ID
     * @param {Uint8Array} sharedSecret - Session shared secret
     * @param {number} messageCounter - Current message counter
     * @returns {Promise<void>}
     */
    async backupSessionKeyToDatabase(conversationId, sharedSecret, messageCounter) {
        console.log('[KeyManager] ========== BACKING UP SESSION KEY ==========');
        console.log('[KeyManager] Conversation ID:', conversationId);
        console.log('[KeyManager] Message counter:', messageCounter);

        try {
            // Get our identity keys
            const ourKeys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);
            if (!ourKeys) {
                throw new Error('Identity keys not found');
            }

            // Encrypt session key with our identity secret key
            console.log('[KeyManager] Encrypting session key for backup...');
            const encrypted = window.CryptoService.encryptSessionKeyForBackup(
                sharedSecret,
                ourKeys.secretKey
            );
            console.log('[KeyManager] ✓ Session key encrypted');

            // Upload to database (use upsert to handle duplicates)
            console.log('[KeyManager] Uploading encrypted session key to database...');

            // First check if backup already exists
            const checkResult = await window.DatabaseService.querySelect('conversation_session_keys', {
                filter: {
                    user_id: this.currentUserId,
                    conversation_id: parseInt(conversationId)
                },
                limit: 1
            });

            let result;
            if (!checkResult.error && checkResult.data && checkResult.data.length > 0) {
                // Backup already exists - verify we can decrypt it before overwriting
                const existingBackup = checkResult.data[0];
                console.log('[KeyManager] Backup already exists, verifying before update...');

                try {
                    // Try to decrypt the existing backup
                    const existingSessionKey = window.CryptoService.decryptSessionKeyFromBackup(
                        existingBackup.encrypted_session_key,
                        existingBackup.encryption_nonce,
                        ourKeys.secretKey
                    );

                    // Compare with what we're trying to backup
                    const existingHex = Array.from(existingSessionKey).map(b => b.toString(16).padStart(2, '0')).join('');
                    const newHex = Array.from(sharedSecret).map(b => b.toString(16).padStart(2, '0')).join('');

                    if (existingHex === newHex) {
                        console.log('[KeyManager] ✓ Existing backup matches, updating message counter...');
                    } else {
                        // CRITICAL: Shared secrets don't match!
                        console.error('[KeyManager] ❌ CRITICAL: Existing backup has DIFFERENT shared secret!');
                        console.error('[KeyManager] Existing (first 16):', existingHex.substring(0, 16));
                        console.error('[KeyManager] New (first 16):', newHex.substring(0, 16));
                        console.error('[KeyManager] This device may have different identity keys than the primary device.');
                        console.error('[KeyManager] NOT overwriting backup to preserve message decryption ability.');
                        console.log('[KeyManager] ========== SESSION KEY BACKUP ABORTED ==========');
                        return; // Don't overwrite!
                    }
                } catch (decryptError) {
                    // Can't decrypt existing backup - we have different identity keys!
                    console.error('[KeyManager] ❌ CRITICAL: Cannot decrypt existing backup!');
                    console.error('[KeyManager] Error:', decryptError.message);
                    console.error('[KeyManager] This device has DIFFERENT identity keys than the primary device.');
                    console.error('[KeyManager] You must use device pairing to sync identity keys.');
                    console.error('[KeyManager] NOT overwriting backup to preserve message decryption ability.');
                    console.log('[KeyManager] ========== SESSION KEY BACKUP ABORTED ==========');
                    return; // Don't overwrite!
                }

                // Safe to update - shared secrets match
                result = await window.DatabaseService.queryUpdate(
                    'conversation_session_keys',
                    null, // id - using filter instead
                    {
                        encrypted_session_key: encrypted.encryptedKey,
                        encryption_nonce: encrypted.nonce,
                        message_counter: messageCounter
                    },
                    {
                        user_id: this.currentUserId,
                        conversation_id: parseInt(conversationId)
                    }
                );
            } else {
                // No backup exists, insert new
                console.log('[KeyManager] Creating new backup...');
                result = await window.DatabaseService.queryInsert('conversation_session_keys', {
                    user_id: this.currentUserId,
                    conversation_id: parseInt(conversationId),
                    encrypted_session_key: encrypted.encryptedKey,
                    encryption_nonce: encrypted.nonce,
                    message_counter: messageCounter
                });
            }

            if (result.error) {
                console.error('[KeyManager] Database operation failed:', result.error);
                throw new Error(result.error.message || 'Failed to backup session key');
            }

            console.log('[KeyManager] ✓ Session key backed up to database');
            console.log('[KeyManager] ========== SESSION KEY BACKUP COMPLETE ==========');

        } catch (error) {
            console.error('[KeyManager] ========== SESSION KEY BACKUP FAILED ==========');
            console.error('[KeyManager] Error:', error);
            console.error('[KeyManager] Error stack:', error.stack);
            throw error;
        }
    },

    /**
     * Sync session keys from database to local IndexedDB
     * Called on new device to restore ability to decrypt existing messages
     * @returns {Promise<void>}
     */
    async syncSessionKeysFromDatabase() {
        console.log('[KeyManager] ========== SYNCING SESSION KEYS FROM DATABASE ==========');
        console.log('[KeyManager] User ID:', this.currentUserId);

        try {
            // Get our identity keys
            const ourKeys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);
            if (!ourKeys) {
                throw new Error('Identity keys not found');
            }

            // Log identity key for cross-device comparison
            const ourPublicKeyHex = Array.from(ourKeys.publicKey).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('[KeyManager] *** IDENTITY KEY CHECK ***');
            console.log('[KeyManager] Our public key (first 32 chars):', ourPublicKeyHex.substring(0, 32));
            console.log('[KeyManager] Our public key (last 32 chars):', ourPublicKeyHex.substring(ourPublicKeyHex.length - 32));
            console.log('[KeyManager] Full public key hash:', ourPublicKeyHex.substring(0, 16) + '...' + ourPublicKeyHex.substring(ourPublicKeyHex.length - 16));
            console.log('[KeyManager] *** Compare this with the primary device to ensure keys match! ***');

            // Fetch all backed up session keys from database
            console.log('[KeyManager] Fetching backed up session keys from database...');
            const result = await window.DatabaseService.querySelect('conversation_session_keys', {
                filter: { user_id: this.currentUserId }
            });

            if (result.error) {
                console.error('[KeyManager] Database query failed:', result.error);
                throw new Error(result.error.message || 'Failed to fetch session keys');
            }

            const backedUpKeys = result.data || [];
            console.log('[KeyManager] Found', backedUpKeys.length, 'backed up session keys');

            if (backedUpKeys.length === 0) {
                console.log('[KeyManager] No backed up session keys found');
                console.log('[KeyManager] ========== SESSION KEY SYNC COMPLETE ==========');
                return;
            }

            // Decrypt and restore each session key to local IndexedDB
            let successCount = 0;
            let failCount = 0;

            for (const backup of backedUpKeys) {
                try {
                    console.log('[KeyManager] Restoring session key for conversation:', backup.conversation_id);

                    // Check if session already exists locally
                    const existingSession = await window.KeyStorageService.getSessionKey(
                        backup.conversation_id.toString()
                    );

                    if (existingSession) {
                        // Log existing session details for debugging
                        const existingSecretHex = Array.from(existingSession.sharedSecret).map(b => b.toString(16).padStart(2, '0')).join('');
                        console.log('[KeyManager] Session already exists locally, comparing...');
                        console.log('[KeyManager] Local session shared secret (first 16):', existingSecretHex.substring(0, 16));
                        console.log('[KeyManager] Local session shared secret (last 16):', existingSecretHex.substring(existingSecretHex.length - 16));

                        // Also decrypt the backup to compare
                        try {
                            const backupSessionKey = window.CryptoService.decryptSessionKeyFromBackup(
                                backup.encrypted_session_key,
                                backup.encryption_nonce,
                                ourKeys.secretKey
                            );
                            const backupSecretHex = Array.from(backupSessionKey).map(b => b.toString(16).padStart(2, '0')).join('');
                            console.log('[KeyManager] Backup session shared secret (first 16):', backupSecretHex.substring(0, 16));
                            console.log('[KeyManager] Backup session shared secret (last 16):', backupSecretHex.substring(backupSecretHex.length - 16));

                            // Check if they match
                            const localHex = existingSecretHex;
                            const backupHex = backupSecretHex;
                            if (localHex === backupHex) {
                                console.log('[KeyManager] ✓ Local and backup session keys MATCH');
                            } else {
                                console.error('[KeyManager] ❌ LOCAL AND BACKUP SESSION KEYS DO NOT MATCH!');
                                console.error('[KeyManager] This is a critical issue - the local session has a different shared secret');
                                console.error('[KeyManager] This device may have established its own session instead of using the backup');
                                console.error('[KeyManager] OVERWRITING local session with backup to fix decryption...');

                                // Overwrite local session with backup
                                await window.KeyStorageService.storeSessionKey(
                                    backup.conversation_id.toString(),
                                    backupSessionKey,
                                    backup.message_counter || 0
                                );
                                console.log('[KeyManager] ✓ Local session OVERWRITTEN with backup');
                            }
                        } catch (decryptError) {
                            console.error('[KeyManager] ❌ Failed to decrypt backup for comparison:', decryptError.message);
                            console.error('[KeyManager] This suggests identity keys on this device are DIFFERENT from the primary device!');
                            console.error('[KeyManager] Device pairing may be required to sync identity keys.');
                        }

                        successCount++;
                        continue;
                    }

                    // Decrypt session key from backup
                    console.log('[KeyManager] Decrypting session key from backup...');
                    const sessionKey = window.CryptoService.decryptSessionKeyFromBackup(
                        backup.encrypted_session_key,
                        backup.encryption_nonce,
                        ourKeys.secretKey
                    );

                    // Log the restored shared secret
                    const restoredSecretHex = Array.from(sessionKey).map(b => b.toString(16).padStart(2, '0')).join('');
                    console.log('[KeyManager] Restored shared secret (first 16):', restoredSecretHex.substring(0, 16));
                    console.log('[KeyManager] Restored shared secret (last 16):', restoredSecretHex.substring(restoredSecretHex.length - 16));

                    // Store in local IndexedDB
                    await window.KeyStorageService.storeSessionKey(
                        backup.conversation_id.toString(),
                        sessionKey,
                        backup.message_counter || 0
                    );

                    console.log('[KeyManager] ✓ Session key restored for conversation:', backup.conversation_id);
                    successCount++;

                } catch (error) {
                    console.error('[KeyManager] Failed to restore session key for conversation:', backup.conversation_id);
                    console.error('[KeyManager] Error:', error);
                    failCount++;
                }
            }

            console.log('[KeyManager] Session key sync results:');
            console.log('[KeyManager] - Success:', successCount);
            console.log('[KeyManager] - Failed:', failCount);
            console.log('[KeyManager] ========== SESSION KEY SYNC COMPLETE ==========');

        } catch (error) {
            console.error('[KeyManager] ========== SESSION KEY SYNC FAILED ==========');
            console.error('[KeyManager] Error:', error);
            console.error('[KeyManager] Error stack:', error.stack);
            throw error;
        }
    },

    /**
     * Back up any local session keys that don't have database backups
     * This ensures primary devices share their sessions with new devices
     * Called during initialization to sync existing sessions to database
     * @returns {Promise<void>}
     */
    async backupLocalSessionsToDatabase() {
        const backupStartTime = Date.now();
        console.log('[KeyManager] ========== BACKING UP LOCAL SESSIONS TO DATABASE ==========');
        console.log('[KeyManager] User ID:', this.currentUserId);
        console.log('[KeyManager] Backup started at:', new Date().toISOString());

        try {
            // Get statistics from IndexedDB to see how many sessions we have locally
            console.log('[KeyManager] [Step 1/5] Getting IndexedDB stats...');
            const step1Start = Date.now();
            const stats = await window.KeyStorageService.getStats();
            console.log('[KeyManager] ✓ [Step 1/5] Completed in', Date.now() - step1Start, 'ms');
            console.log('[KeyManager] Local IndexedDB has', stats.sessionKeys, 'session keys');

            if (stats.sessionKeys === 0) {
                console.log('[KeyManager] No local session keys to back up');
                console.log('[KeyManager] ========== LOCAL SESSION BACKUP COMPLETE ==========');
                return;
            }

            // Get all backed up session keys from database
            console.log('[KeyManager] [Step 2/5] Fetching existing database backups...');
            console.log('[KeyManager] About to call DatabaseService.querySelect for conversation_session_keys');
            const step2Start = Date.now();

            const result = await window.DatabaseService.querySelect('conversation_session_keys', {
                filter: { user_id: this.currentUserId }
            });

            console.log('[KeyManager] ✓ [Step 2/5] Database query completed in', Date.now() - step2Start, 'ms');

            if (result.error) {
                console.error('[KeyManager] Database query failed:', result.error);
                throw new Error(result.error.message || 'Failed to fetch existing backups');
            }

            const existingBackups = result.data || [];
            console.log('[KeyManager] Found', existingBackups.length, 'existing database backups');
            console.log('[KeyManager] Existing backup conversation IDs:', existingBackups.map(b => b.conversation_id));

            // Create a Set of conversation IDs that already have backups
            console.log('[KeyManager] [Step 3/5] Creating backup ID set...');
            const backedUpConversationIds = new Set(
                existingBackups.map(backup => backup.conversation_id)
            );
            console.log('[KeyManager] ✓ [Step 3/5] Backup ID set created with', backedUpConversationIds.size, 'IDs');

            // Get all conversations for this user to find which ones need backups
            console.log('[KeyManager] [Step 4/5] Fetching all conversations from database...');
            console.log('[KeyManager] About to call DatabaseService.querySelect for conversations table');
            const step4Start = Date.now();

            const conversationsResult = await window.DatabaseService.querySelect('conversations', {});

            console.log('[KeyManager] ✓ [Step 4/5] Conversations query completed in', Date.now() - step4Start, 'ms');

            if (conversationsResult.error) {
                console.error('[KeyManager] Failed to fetch conversations:', conversationsResult.error);
                throw new Error('Failed to fetch conversations');
            }

            const allConversations = conversationsResult.data || [];
            console.log('[KeyManager] Fetched', allConversations.length, 'total conversations from database');

            // Filter to only conversations where this user is a participant
            const conversations = allConversations.filter(conv =>
                conv.user1_id === this.currentUserId || conv.user2_id === this.currentUserId
            );
            console.log('[KeyManager] Filtered to', conversations.length, 'conversations for this user');
            console.log('[KeyManager] User\'s conversation IDs:', conversations.map(c => c.id));

            let backupCount = 0;

            // For each conversation, check if we have a local session and if it needs backing up
            console.log('[KeyManager] [Step 5/5] Processing', conversations.length, 'conversations for backup...');
            const step5Start = Date.now();

            for (let i = 0; i < conversations.length; i++) {
                const conversation = conversations[i];
                const conversationId = conversation.id.toString();

                console.log(`[KeyManager] [${i + 1}/${conversations.length}] Processing conversation:`, conversationId);

                try {
                    // Check if we have a local session for this conversation
                    console.log('[KeyManager]   - Checking for local session in IndexedDB...');
                    const localSession = await window.KeyStorageService.getSessionKey(conversationId);

                    if (!localSession) {
                        console.log('[KeyManager]   - No local session found, skipping');
                        continue;
                    }

                    console.log('[KeyManager]   - Local session found');

                    // Always back up local session (will update if backup exists, insert if not)
                    // This ensures the most recent local session is always in the database
                    if (backedUpConversationIds.has(conversation.id)) {
                        console.log('[KeyManager]   - Existing backup found, will update');
                    } else {
                        console.log('[KeyManager]   - No existing backup, will create new');
                    }

                    console.log('[KeyManager]   - Calling backupSessionKeyToDatabase()...');
                    const backupStart = Date.now();

                    await this.backupSessionKeyToDatabase(
                        conversationId,
                        localSession.sharedSecret,
                        localSession.messageCounter || 0
                    );

                    console.log('[KeyManager]   ✓ Backup completed in', Date.now() - backupStart, 'ms');
                    backupCount++;

                } catch (error) {
                    console.error('[KeyManager]   ✗ Failed to backup session for conversation:', conversationId);
                    console.error('[KeyManager]   Error:', error.message);
                    console.error('[KeyManager]   Stack:', error.stack);
                    // Continue with other conversations
                }
            }

            console.log('[KeyManager] ✓ [Step 5/5] Completed processing all conversations in', Date.now() - step5Start, 'ms');
            console.log('[KeyManager] Total backup duration:', Date.now() - backupStartTime, 'ms');
            console.log('[KeyManager] Local session backup results:');
            console.log('[KeyManager] - Backed up/updated:', backupCount, 'of', conversations.length);
            console.log('[KeyManager] ========== LOCAL SESSION BACKUP COMPLETE ==========');

        } catch (error) {
            const failureDuration = Date.now() - backupStartTime;
            console.error('[KeyManager] ========== LOCAL SESSION BACKUP FAILED ==========');
            console.error('[KeyManager] Failed after:', failureDuration, 'ms');
            console.error('[KeyManager] Error type:', error.constructor.name);
            console.error('[KeyManager] Error message:', error.message);
            console.error('[KeyManager] Error stack:', error.stack);
            console.error('[KeyManager] Backup started at:', new Date(backupStartTime).toISOString());
            console.error('[KeyManager] Failed at:', new Date().toISOString());
            // Don't throw - this is not critical for initialization
            console.warn('[KeyManager] Continuing despite backup failure (non-critical)...');
        }
    },

    /**
     * Restore a single session key from database backup
     * Used as fallback when trying to decrypt a message but session key is missing from IndexedDB
     * @param {string} conversationId - Conversation ID
     * @returns {Promise<boolean>} True if session key was restored, false otherwise
     */
    async restoreSessionKeyFromDatabase(conversationId) {
        console.log('[KeyManager] ========== RESTORING SESSION KEY FROM DATABASE ==========');
        console.log('[KeyManager] Conversation ID:', conversationId);
        console.log('[KeyManager] User ID:', this.currentUserId);

        try {
            // Get our identity keys
            const ourKeys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);
            if (!ourKeys) {
                console.error('[KeyManager] Identity keys not found in IndexedDB');
                return false;
            }

            // Fetch this specific session key backup from database
            console.log('[KeyManager] Fetching session key backup from database...');
            const result = await window.DatabaseService.querySelect('conversation_session_keys', {
                filter: {
                    user_id: this.currentUserId,
                    conversation_id: parseInt(conversationId)
                }
            });

            if (result.error) {
                console.error('[KeyManager] Database query failed:', result.error);
                return false;
            }

            const backups = result.data || [];
            console.log('[KeyManager] Found', backups.length, 'backup(s) for this conversation');

            if (backups.length === 0) {
                console.log('[KeyManager] No backup found for conversation:', conversationId);
                return false;
            }

            const backup = backups[0];

            // Decrypt session key
            console.log('[KeyManager] Decrypting session key from backup...');
            console.log('[KeyManager] Backup details:', {
                conversation_id: backup.conversation_id,
                message_counter: backup.message_counter,
                created_at: backup.created_at,
                updated_at: backup.updated_at
            });

            const sessionKey = window.CryptoService.decryptSessionKeyFromBackup(
                backup.encrypted_session_key,
                backup.encryption_nonce,
                ourKeys.secretKey
            );

            // Log the restored shared secret for comparison
            const restoredSecretHex = Array.from(sessionKey).map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('[KeyManager] Restored shared secret (first 16 chars):', restoredSecretHex.substring(0, 16));
            console.log('[KeyManager] Restored shared secret (last 16 chars):', restoredSecretHex.substring(restoredSecretHex.length - 16));

            // Store in local IndexedDB
            console.log('[KeyManager] Storing restored session in IndexedDB...');
            await window.KeyStorageService.storeSessionKey(
                backup.conversation_id.toString(),
                sessionKey,
                backup.message_counter || 0
            );

            console.log('[KeyManager] ✓ Session key restored successfully');
            console.log('[KeyManager] ========== SESSION KEY RESTORE COMPLETE ==========');
            return true;

        } catch (error) {
            console.error('[KeyManager] ========== SESSION KEY RESTORE FAILED ==========');
            console.error('[KeyManager] Error:', error);
            console.error('[KeyManager] Error stack:', error.stack);
            return false;
        }
    },

    /**
     * Update session counter in database after incrementing locally
     * Keeps database in sync with local state
     * @param {string} conversationId - Conversation ID
     * @param {number} newCounter - New message counter value
     * @returns {Promise<void>}
     */
    async updateSessionCounterInDatabase(conversationId, newCounter) {
        console.log('[KeyManager] ========== UPDATING SESSION COUNTER IN DATABASE ==========');
        console.log('[KeyManager] Conversation ID:', conversationId, '(type:', typeof conversationId, ')');
        console.log('[KeyManager] New counter value:', newCounter, '(type:', typeof newCounter, ')');
        console.log('[KeyManager] Current user ID:', this.currentUserId);

        try {
            const filter = {
                user_id: this.currentUserId,
                conversation_id: parseInt(conversationId)
            };
            const updateData = { message_counter: newCounter };

            console.log('[KeyManager] Filter for update:', JSON.stringify(filter, null, 2));
            console.log('[KeyManager] Update data:', JSON.stringify(updateData, null, 2));
            console.log('[KeyManager] Calling queryUpdate with signature: (table, id=null, updateData, filter)');

            const result = await window.DatabaseService.queryUpdate(
                'conversation_session_keys',
                null, // No id, using filter instead
                updateData, // updateData
                filter // filter
            );

            console.log('[KeyManager] queryUpdate completed');
            console.log('[KeyManager] Result:', {
                hasError: !!result.error,
                hasData: !!result.data,
                dataType: typeof result.data,
                isArray: Array.isArray(result.data),
                dataLength: Array.isArray(result.data) ? result.data.length : 'N/A'
            });

            if (result.error) {
                console.error('[KeyManager] ❌ Failed to update counter in database');
                console.error('[KeyManager] Error details:', {
                    message: result.error.message,
                    code: result.error.code,
                    status: result.error.status,
                    fullError: result.error
                });
                // Don't throw - local counter is already updated, database sync can fail without breaking encryption
            } else {
                console.log('[KeyManager] ✅ Counter successfully updated in database');
                if (result.data && result.data.length > 0) {
                    console.log('[KeyManager] Updated row:', {
                        id: result.data[0].id,
                        user_id: result.data[0].user_id,
                        conversation_id: result.data[0].conversation_id,
                        message_counter: result.data[0].message_counter
                    });
                }
            }

        } catch (error) {
            console.error('[KeyManager] ❌ Exception updating counter in database');
            console.error('[KeyManager] Exception:', error);
            console.error('[KeyManager] Exception stack:', error.stack);
            // Don't throw - local counter is already updated
        }

        console.log('[KeyManager] ========== SESSION COUNTER UPDATE COMPLETE ==========');
    },

    /**
     * Create encrypted backups of identity keys with both password and recovery key
     * @param {string} password - User login password (min 8 characters)
     * @param {string} recoveryKey - 24-word recovery key
     * @returns {Promise<void>}
     */
    async createDualBackup(password, recoveryKey) {
        console.log('[KeyManager] ========== CREATING DUAL BACKUP ==========');

        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }

        if (!password || password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }

        if (!recoveryKey) {
            throw new Error('Recovery key required');
        }

        try {
            // Get identity keys
            const keys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);
            if (!keys) {
                throw new Error('Identity keys not found');
            }

            console.log('[KeyManager] Encrypting keys with password...');

            // Encrypt keys with password
            const passwordEncrypted = await window.CryptoService.encryptIdentityKeysWithPassword(
                keys.publicKey,
                keys.secretKey,
                password
            );

            console.log('[KeyManager] ✓ Keys encrypted with password');
            console.log('[KeyManager] Encrypting keys with recovery key...');

            // Encrypt keys with recovery key
            const recoveryEncrypted = await window.CryptoService.encryptIdentityKeysWithRecoveryKey(
                keys.publicKey,
                keys.secretKey,
                recoveryKey
            );

            console.log('[KeyManager] ✓ Keys encrypted with recovery key');
            console.log('[KeyManager] Uploading dual encrypted backup to database...');

            // Upload to database with both encryptions
            const result = await window.DatabaseService.queryInsert('identity_key_backups', {
                user_id: this.currentUserId,
                encrypted_data: passwordEncrypted.encryptedData,
                salt: passwordEncrypted.salt,
                iv: passwordEncrypted.iv,
                recovery_encrypted_data: recoveryEncrypted.encryptedData,
                recovery_salt: recoveryEncrypted.salt,
                recovery_iv: recoveryEncrypted.iv
            });

            if (result.error) {
                console.error('[KeyManager] Database insert failed:', result.error);
                throw new Error(result.error.message || 'Failed to save backup');
            }

            console.log('[KeyManager] ✓ Dual backup saved to database');
            console.log('[KeyManager] ========== DUAL BACKUP COMPLETE ==========');

        } catch (error) {
            console.error('[KeyManager] ========== DUAL BACKUP FAILED ==========');
            console.error('[KeyManager] Error:', error);
            console.error('[KeyManager] Error stack:', error.stack);
            throw error;
        }
    },

    /**
     * Restore identity keys from password-encrypted backup
     * @param {string} password - User password
     * @returns {Promise<void>}
     */
    async restoreFromPasswordBackup(password) {
        console.log('[KeyManager] ========== RESTORING FROM PASSWORD BACKUP ==========');
        console.log('[KeyManager] User ID:', this.currentUserId);

        if (!password) {
            throw new Error('Password required');
        }

        try {
            // Fetch encrypted backup from database
            console.log('[KeyManager] Fetching encrypted backup from database...');
            const result = await window.DatabaseService.querySelect('identity_key_backups', {
                filter: { user_id: this.currentUserId },
                limit: 1
            });

            if (result.error) {
                console.error('[KeyManager] Database query failed:', result.error);
                throw new Error(result.error.message || 'Failed to fetch backup');
            }

            if (!result.data || result.data.length === 0) {
                throw new Error('No password backup found for this account');
            }

            const backup = result.data[0];
            console.log('[KeyManager] ✓ Backup found');
            console.log('[KeyManager] Decrypting with password...');

            // Decrypt keys with password
            const keys = await window.CryptoService.decryptIdentityKeysWithPassword(
                backup.encrypted_data,
                backup.salt,
                backup.iv,
                password
            );

            console.log('[KeyManager] ✓ Keys decrypted successfully');
            console.log('[KeyManager] Storing keys locally...');

            // Store in local IndexedDB
            await window.KeyStorageService.storeIdentityKeys(
                this.currentUserId,
                keys.publicKey,
                keys.secretKey
            );

            console.log('[KeyManager] ✓ Keys stored in IndexedDB');
            console.log('[KeyManager] Syncing session keys from database...');

            // Sync session keys
            await this.syncSessionKeysFromDatabase();

            console.log('[KeyManager] ✓ Session keys synced');
            console.log('[KeyManager] ========== PASSWORD RESTORE COMPLETE ==========');

        } catch (error) {
            console.error('[KeyManager] ========== PASSWORD RESTORE FAILED ==========');
            console.error('[KeyManager] Error:', error);
            console.error('[KeyManager] Error stack:', error.stack);
            throw error;
        }
    },

    /**
     * Generate QR code data for device pairing
     * @returns {Promise<string>} QR code data (JSON string)
     */
    async generateQRCodeForPairing() {
        console.log('[KeyManager] ========== GENERATING QR CODE DATA ==========');

        if (!this.initialized) {
            throw new Error('KeyManager not initialized');
        }

        try {
            // Get identity keys
            const keys = await window.KeyStorageService.getIdentityKeys(this.currentUserId);
            if (!keys) {
                throw new Error('Identity keys not found');
            }

            console.log('[KeyManager] Generating QR code data...');

            const qrData = window.CryptoService.generateQRCodeData(
                keys.publicKey,
                keys.secretKey,
                this.currentUserId
            );

            console.log('[KeyManager] ✓ QR code data generated');
            console.log('[KeyManager] ========== QR CODE GENERATION COMPLETE ==========');

            return qrData;

        } catch (error) {
            console.error('[KeyManager] ========== QR CODE GENERATION FAILED ==========');
            console.error('[KeyManager] Error:', error);
            throw error;
        }
    },

    /**
     * Restore keys from scanned QR code
     * @param {string} qrCodeData - JSON string from QR code
     * @returns {Promise<void>}
     */
    async restoreFromQRCode(qrCodeData) {
        console.log('[KeyManager] ========== RESTORING FROM QR CODE ==========');

        try {
            console.log('[KeyManager] Parsing QR code data...');

            const parsedData = window.CryptoService.parseQRCodeData(qrCodeData);

            console.log('[KeyManager] ✓ QR code data parsed');
            console.log('[KeyManager] User ID from QR:', parsedData.userId);
            console.log('[KeyManager] Current user ID:', this.currentUserId);

            if (parsedData.userId !== this.currentUserId) {
                throw new Error('QR code is for a different user account');
            }

            console.log('[KeyManager] Storing keys locally...');

            // Store in local IndexedDB
            await window.KeyStorageService.storeIdentityKeys(
                this.currentUserId,
                parsedData.publicKey,
                parsedData.secretKey
            );

            console.log('[KeyManager] ✓ Keys stored in IndexedDB');
            console.log('[KeyManager] Syncing session keys from database...');

            // Sync session keys
            await this.syncSessionKeysFromDatabase();

            console.log('[KeyManager] ✓ Session keys synced');
            console.log('[KeyManager] ========== QR CODE RESTORE COMPLETE ==========');

        } catch (error) {
            console.error('[KeyManager] ========== QR CODE RESTORE FAILED ==========');
            console.error('[KeyManager] Error:', error);
            console.error('[KeyManager] Error stack:', error.stack);
            throw error;
        }
    },

    /**
     * Restore identity keys from recovery key backup
     * @param {string} recoveryKey - 24-word recovery key
     * @returns {Promise<void>}
     */
    async restoreFromRecoveryKeyBackup(recoveryKey) {
        console.log('[KeyManager] ========== RESTORING FROM RECOVERY KEY ==========');
        console.log('[KeyManager] User ID:', this.currentUserId);

        if (!recoveryKey) {
            throw new Error('Recovery key required');
        }

        try {
            // Fetch encrypted backup from database
            console.log('[KeyManager] Fetching encrypted backup from database...');
            const result = await window.DatabaseService.querySelect('identity_key_backups', {
                filter: { user_id: this.currentUserId },
                limit: 1
            });

            if (result.error) {
                console.error('[KeyManager] Database query failed:', result.error);
                throw new Error(result.error.message || 'Failed to fetch backup');
            }

            if (!result.data || result.data.length === 0) {
                throw new Error('No recovery key backup found for this account');
            }

            const backup = result.data[0];
            console.log('[KeyManager] ✓ Backup found');
            console.log('[KeyManager] Decrypting with recovery key...');

            // Decrypt keys with recovery key
            const keys = await window.CryptoService.decryptIdentityKeysWithRecoveryKey(
                backup.recovery_encrypted_data,
                backup.recovery_salt,
                backup.recovery_iv,
                recoveryKey
            );

            console.log('[KeyManager] ✓ Keys decrypted successfully');
            console.log('[KeyManager] Storing keys locally...');

            // Store in local IndexedDB
            await window.KeyStorageService.storeIdentityKeys(
                this.currentUserId,
                keys.publicKey,
                keys.secretKey
            );

            console.log('[KeyManager] ✓ Keys stored in IndexedDB');
            console.log('[KeyManager] Syncing session keys from database...');

            // Sync session keys
            await this.syncSessionKeysFromDatabase();

            console.log('[KeyManager] ✓ Session keys synced');
            console.log('[KeyManager] ========== RECOVERY KEY RESTORE COMPLETE ==========');

        } catch (error) {
            console.error('[KeyManager] ========== RECOVERY KEY RESTORE FAILED ==========');
            console.error('[KeyManager] Error:', error);
            console.error('[KeyManager] Error stack:', error.stack);
            throw error;
        }
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
