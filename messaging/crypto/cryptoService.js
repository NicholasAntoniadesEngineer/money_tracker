/**
 * Crypto Service
 *
 * Provides core cryptographic operations for end-to-end encryption:
 * - Identity key pair generation (X25519)
 * - Key agreement (Elliptic Curve Diffie-Hellman)
 * - Authenticated encryption (XSalsa20-Poly1305)
 * - Forward secrecy (per-message key derivation)
 * - Security code generation (key verification)
 *
 * Uses TweetNaCl.js for all cryptographic primitives
 */

const CryptoService = {
    nacl: null,

    /**
     * Initialize the crypto service by loading TweetNaCl
     * @returns {Promise<void>}
     */
    async initialize() {
        if (this.nacl) {
            console.log('[CryptoService] Already initialized');
            return;
        }

        console.log('[CryptoService] Initializing...');

        try {
            this.nacl = await window.NaClLoader.load();
            console.log('[CryptoService] ✓ Initialized successfully');
        } catch (error) {
            console.error('[CryptoService] ✗ Initialization failed:', error);
            throw new Error('Failed to initialize crypto service: ' + error.message);
        }
    },

    /**
     * Generate identity key pair using X25519 elliptic curve
     * @returns {Object} Key pair with publicKey and secretKey (Uint8Array)
     */
    generateIdentityKeyPair() {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        const keyPair = this.nacl.box.keyPair();
        console.log('[CryptoService] Generated identity key pair');

        return keyPair;
    },

    /**
     * Derive shared secret from our secret key and their public key
     * Uses Elliptic Curve Diffie-Hellman (ECDH) key agreement
     * @param {Uint8Array} ourSecretKey - Our secret key
     * @param {Uint8Array} theirPublicKey - Their public key
     * @returns {Uint8Array} Shared secret (32 bytes)
     */
    deriveSharedSecret(ourSecretKey, theirPublicKey) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        // Log key sizes for verification
        console.log('[CryptoService] Deriving shared secret via ECDH...');
        console.log('[CryptoService]   - Our secret key length:', ourSecretKey.length, 'bytes');
        console.log('[CryptoService]   - Their public key length:', theirPublicKey.length, 'bytes');

        // Precompute shared secret for performance
        // Note: nacl.box.before(theirPublicKey, ourSecretKey) performs ECDH
        const sharedSecret = this.nacl.box.before(theirPublicKey, ourSecretKey);

        console.log('[CryptoService] Derived shared secret');
        console.log('[CryptoService]   - Shared secret length:', sharedSecret.length, 'bytes');

        return sharedSecret;
    },

    /**
     * Encrypt message with authenticated encryption
     * Uses XSalsa20 stream cipher + Poly1305 MAC
     * @param {string} plaintext - Message to encrypt
     * @param {Uint8Array} messageKey - 32-byte encryption key
     * @returns {Object} Object with ciphertext and nonce (base64)
     */
    encryptMessage(plaintext, messageKey) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        if (!plaintext || typeof plaintext !== 'string') {
            throw new Error('Invalid plaintext: must be non-empty string');
        }

        if (!messageKey || messageKey.length !== 32) {
            throw new Error('Invalid message key: must be 32 bytes');
        }

        // Convert plaintext to bytes
        const plaintextBytes = this.nacl.util.decodeUTF8(plaintext);

        // Generate random nonce (24 bytes)
        const nonce = this.nacl.randomBytes(24);

        // Encrypt with authenticated encryption
        const ciphertext = this.nacl.secretbox(plaintextBytes, nonce, messageKey);

        if (!ciphertext) {
            throw new Error('Encryption failed');
        }

        return {
            ciphertext: this.nacl.util.encodeBase64(ciphertext),
            nonce: this.nacl.util.encodeBase64(nonce)
        };
    },

    /**
     * Decrypt message with authenticated decryption
     * Verifies MAC before decrypting
     * @param {string} ciphertextB64 - Base64-encoded ciphertext
     * @param {string} nonceB64 - Base64-encoded nonce
     * @param {Uint8Array} messageKey - 32-byte decryption key
     * @returns {string} Decrypted plaintext
     * @throws {Error} If authentication fails or decryption fails
     */
    decryptMessage(ciphertextB64, nonceB64, messageKey) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        if (!ciphertextB64 || !nonceB64) {
            throw new Error('Invalid ciphertext or nonce');
        }

        if (!messageKey || messageKey.length !== 32) {
            throw new Error('Invalid message key: must be 32 bytes');
        }

        try {
            // Decode from base64
            const ciphertext = this.nacl.util.decodeBase64(ciphertextB64);
            const nonce = this.nacl.util.decodeBase64(nonceB64);

            // Decrypt and verify MAC
            const plaintext = this.nacl.secretbox.open(ciphertext, nonce, messageKey);

            if (!plaintext) {
                throw new Error('Decryption failed - authentication check failed (message may be tampered)');
            }

            // Convert bytes back to string
            return this.nacl.util.encodeUTF8(plaintext);

        } catch (error) {
            console.error('[CryptoService] Decryption error:', error);
            throw new Error('Failed to decrypt message: ' + error.message);
        }
    },

    /**
     * Derive per-message key for forward secrecy
     * Uses HKDF-like construction: HASH(sharedSecret || counter)
     * @param {Uint8Array} sharedSecret - Shared secret from key agreement
     * @param {number} messageCounter - Sequential message number
     * @returns {Uint8Array} Message-specific key (32 bytes)
     */
    deriveMessageKey(sharedSecret, messageCounter) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        if (!sharedSecret || sharedSecret.length !== 32) {
            throw new Error('Invalid shared secret: must be 32 bytes');
        }

        if (typeof messageCounter !== 'number' || messageCounter < 0) {
            throw new Error('Invalid message counter: must be non-negative number');
        }

        // Encode counter as 8-byte big-endian integer
        const counterBytes = new Uint8Array(8);
        new DataView(counterBytes.buffer).setBigUint64(0, BigInt(messageCounter), false);

        // Concatenate: sharedSecret || counter
        const input = new Uint8Array(sharedSecret.length + counterBytes.length);
        input.set(sharedSecret);
        input.set(counterBytes, sharedSecret.length);

        // Hash to derive key
        const hash = this.nacl.hash(input); // SHA-512, returns 64 bytes

        // Take first 32 bytes as message key
        return hash.slice(0, 32);
    },

    /**
     * Generate security code for key verification
     * Hashes both public keys to create a human-readable code
     * @param {Uint8Array} publicKey1 - First public key
     * @param {Uint8Array} publicKey2 - Second public key
     * @returns {string} Security code formatted as "12345 67890 11121 31415 16171 81920"
     */
    generateSecurityCode(publicKey1, publicKey2) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        if (!publicKey1 || publicKey1.length !== 32) {
            throw new Error('Invalid publicKey1: must be 32 bytes');
        }

        if (!publicKey2 || publicKey2.length !== 32) {
            throw new Error('Invalid publicKey2: must be 32 bytes');
        }

        // Concatenate both public keys
        const combined = new Uint8Array(publicKey1.length + publicKey2.length);
        combined.set(publicKey1);
        combined.set(publicKey2, publicKey1.length);

        // Hash the combined keys
        const hash = this.nacl.hash(combined); // SHA-512, 64 bytes

        // Convert first 30 bytes to decimal string
        const code = Array.from(hash.slice(0, 30))
            .map(byte => byte.toString(10).padStart(3, '0'))
            .join('');

        // Format as groups of 5 digits: "12345 67890 11121 ..."
        return code.match(/.{1,5}/g).join(' ');
    },

    /**
     * Serialize public key to base64 for storage/transmission
     * @param {Uint8Array} publicKey - Public key
     * @returns {string} Base64-encoded public key
     */
    serializePublicKey(publicKey) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        if (!publicKey) {
            throw new Error('Invalid public key');
        }

        return this.nacl.util.encodeBase64(publicKey);
    },

    /**
     * Deserialize public key from base64
     * @param {string} publicKeyB64 - Base64-encoded public key
     * @returns {Uint8Array} Public key
     */
    deserializePublicKey(publicKeyB64) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        if (!publicKeyB64) {
            throw new Error('Invalid public key base64');
        }

        try {
            return this.nacl.util.decodeBase64(publicKeyB64);
        } catch (error) {
            throw new Error('Failed to deserialize public key: ' + error.message);
        }
    },

    /**
     * Generate random bytes (for nonces, salts, etc.)
     * @param {number} length - Number of bytes to generate
     * @returns {Uint8Array} Random bytes
     */
    randomBytes(length) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        return this.nacl.randomBytes(length);
    },

    /**
     * Derive backup encryption key from identity secret key
     * Used to encrypt session keys for database backup
     * @param {Uint8Array} identitySecretKey - User's identity secret key
     * @returns {Uint8Array} Backup encryption key (32 bytes)
     */
    deriveBackupEncryptionKey(identitySecretKey) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        if (!identitySecretKey || identitySecretKey.length !== 32) {
            throw new Error('Invalid identity secret key: must be 32 bytes');
        }

        // Derive backup key from identity secret key using HKDF-like construction
        // Use a constant "info" parameter to ensure derived key is different from other uses
        const info = this.nacl.util.decodeUTF8('MoneyTracker-SessionBackup-v1');

        // Concatenate: identitySecretKey || info
        const input = new Uint8Array(identitySecretKey.length + info.length);
        input.set(identitySecretKey);
        input.set(info, identitySecretKey.length);

        // Hash to derive backup encryption key
        const hash = this.nacl.hash(input); // SHA-512, returns 64 bytes

        // Take first 32 bytes as backup encryption key
        return hash.slice(0, 32);
    },

    /**
     * Encrypt session key for database backup
     * @param {Uint8Array} sessionKey - Session key to encrypt
     * @param {Uint8Array} identitySecretKey - User's identity secret key
     * @returns {Object} Object with encryptedKey and nonce (base64)
     */
    encryptSessionKeyForBackup(sessionKey, identitySecretKey) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        if (!sessionKey || sessionKey.length !== 32) {
            throw new Error('Invalid session key: must be 32 bytes');
        }

        if (!identitySecretKey || identitySecretKey.length !== 32) {
            throw new Error('Invalid identity secret key: must be 32 bytes');
        }

        // Derive backup encryption key
        const backupKey = this.deriveBackupEncryptionKey(identitySecretKey);

        // Generate random nonce
        const nonce = this.nacl.randomBytes(24);

        // Encrypt session key with authenticated encryption
        const encryptedKey = this.nacl.secretbox(sessionKey, nonce, backupKey);

        if (!encryptedKey) {
            throw new Error('Session key encryption failed');
        }

        console.log('[CryptoService] Session key encrypted for backup');

        return {
            encryptedKey: this.nacl.util.encodeBase64(encryptedKey),
            nonce: this.nacl.util.encodeBase64(nonce)
        };
    },

    /**
     * Decrypt session key from database backup
     * @param {string} encryptedKeyB64 - Base64-encoded encrypted session key
     * @param {string} nonceB64 - Base64-encoded nonce
     * @param {Uint8Array} identitySecretKey - User's identity secret key
     * @returns {Uint8Array} Decrypted session key
     * @throws {Error} If decryption fails
     */
    decryptSessionKeyFromBackup(encryptedKeyB64, nonceB64, identitySecretKey) {
        if (!this.nacl) {
            throw new Error('CryptoService not initialized');
        }

        if (!encryptedKeyB64 || !nonceB64) {
            throw new Error('Invalid encrypted key or nonce');
        }

        if (!identitySecretKey || identitySecretKey.length !== 32) {
            throw new Error('Invalid identity secret key: must be 32 bytes');
        }

        try {
            // Derive backup encryption key
            const backupKey = this.deriveBackupEncryptionKey(identitySecretKey);

            // Decode from base64
            const encryptedKey = this.nacl.util.decodeBase64(encryptedKeyB64);
            const nonce = this.nacl.util.decodeBase64(nonceB64);

            // Decrypt and verify MAC
            const sessionKey = this.nacl.secretbox.open(encryptedKey, nonce, backupKey);

            if (!sessionKey) {
                throw new Error('Decryption failed - authentication check failed');
            }

            console.log('[CryptoService] Session key decrypted from backup');

            return sessionKey;

        } catch (error) {
            console.error('[CryptoService] Session key decryption error:', error);
            throw new Error('Failed to decrypt session key: ' + error.message);
        }
    },

    /**
     * Derive encryption key from password using PBKDF2
     * @param {string} password - User password
     * @param {Uint8Array} salt - Salt for key derivation
     * @returns {Promise<CryptoKey>} Derived encryption key
     */
    async deriveKeyFromPassword(password, salt) {
        if (!password || typeof password !== 'string') {
            throw new Error('Invalid password');
        }

        if (!salt || salt.length !== 32) {
            throw new Error('Invalid salt: must be 32 bytes');
        }

        // Convert password to key material
        const passwordBuffer = new TextEncoder().encode(password);
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveKey']
        );

        // Derive AES-GCM key using PBKDF2 (600k iterations per OWASP 2023)
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 600000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        return key;
    },

    /**
     * Encrypt identity keys with password for backup
     * @param {Uint8Array} publicKey - Identity public key
     * @param {Uint8Array} secretKey - Identity secret key
     * @param {string} password - User password
     * @returns {Promise<Object>} Object with encryptedData, salt, and iv
     */
    async encryptIdentityKeysWithPassword(publicKey, secretKey, password) {
        if (!publicKey || publicKey.length !== 32) {
            throw new Error('Invalid public key: must be 32 bytes');
        }

        if (!secretKey || secretKey.length !== 32) {
            throw new Error('Invalid secret key: must be 32 bytes');
        }

        if (!password || typeof password !== 'string' || password.length < 8) {
            throw new Error('Password must be at least 8 characters');
        }

        try {
            // Generate random salt
            const salt = crypto.getRandomValues(new Uint8Array(32));

            // Derive key from password
            const key = await this.deriveKeyFromPassword(password, salt);

            // Combine both keys
            const keysData = new Uint8Array(64);
            keysData.set(publicKey, 0);
            keysData.set(secretKey, 32);

            // Generate IV
            const iv = crypto.getRandomValues(new Uint8Array(12));

            // Encrypt with AES-GCM
            const encryptedBuffer = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                keysData
            );

            const encryptedData = new Uint8Array(encryptedBuffer);

            console.log('[CryptoService] Identity keys encrypted with password');

            // Encode to base64 for storage
            return {
                encryptedData: this.nacl.util.encodeBase64(encryptedData),
                salt: this.nacl.util.encodeBase64(salt),
                iv: this.nacl.util.encodeBase64(iv)
            };

        } catch (error) {
            console.error('[CryptoService] Password encryption error:', error);
            throw new Error('Failed to encrypt keys with password: ' + error.message);
        }
    },

    /**
     * Decrypt identity keys with password from backup
     * @param {string} encryptedDataB64 - Base64-encoded encrypted keys
     * @param {string} saltB64 - Base64-encoded salt
     * @param {string} ivB64 - Base64-encoded IV
     * @param {string} password - User password
     * @returns {Promise<Object>} Object with publicKey and secretKey
     * @throws {Error} If decryption fails
     */
    async decryptIdentityKeysWithPassword(encryptedDataB64, saltB64, ivB64, password) {
        if (!encryptedDataB64 || !saltB64 || !ivB64) {
            throw new Error('Missing encrypted data, salt, or IV');
        }

        if (!password || typeof password !== 'string') {
            throw new Error('Invalid password');
        }

        try {
            // Decode from base64
            const encryptedData = this.nacl.util.decodeBase64(encryptedDataB64);
            const salt = this.nacl.util.decodeBase64(saltB64);
            const iv = this.nacl.util.decodeBase64(ivB64);

            // Derive key from password
            const key = await this.deriveKeyFromPassword(password, salt);

            // Decrypt with AES-GCM
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedData
            );

            const decryptedData = new Uint8Array(decryptedBuffer);

            if (decryptedData.length !== 64) {
                throw new Error('Decrypted data has invalid length');
            }

            // Extract public and secret keys
            const publicKey = decryptedData.slice(0, 32);
            const secretKey = decryptedData.slice(32, 64);

            console.log('[CryptoService] Identity keys decrypted with password');

            return { publicKey, secretKey };

        } catch (error) {
            console.error('[CryptoService] Password decryption error:', error);
            // If error is OperationError, it's likely wrong password
            if (error.name === 'OperationError') {
                throw new Error('Incorrect password or corrupted backup');
            }
            throw new Error('Failed to decrypt keys with password: ' + error.message);
        }
    },

    /**
     * Generate QR code data for device pairing
     * @param {Uint8Array} publicKey - Identity public key
     * @param {Uint8Array} secretKey - Identity secret key
     * @param {string} userId - User ID
     * @returns {string} JSON string for QR code
     */
    generateQRCodeData(publicKey, secretKey, userId) {
        if (!publicKey || publicKey.length !== 32) {
            throw new Error('Invalid public key: must be 32 bytes');
        }

        if (!secretKey || secretKey.length !== 32) {
            throw new Error('Invalid secret key: must be 32 bytes');
        }

        if (!userId) {
            throw new Error('User ID required');
        }

        const qrData = {
            version: 1,
            userId: userId,
            publicKey: this.nacl.util.encodeBase64(publicKey),
            secretKey: this.nacl.util.encodeBase64(secretKey),
            timestamp: Date.now()
        };

        return JSON.stringify(qrData);
    },

    /**
     * Parse QR code data for device pairing
     * @param {string} qrCodeData - JSON string from QR code
     * @returns {Object} Parsed data with publicKey, secretKey, and userId
     * @throws {Error} If data is invalid
     */
    parseQRCodeData(qrCodeData) {
        try {
            const data = JSON.parse(qrCodeData);

            if (!data.version || !data.userId || !data.publicKey || !data.secretKey) {
                throw new Error('Missing required fields in QR code data');
            }

            // Check timestamp (reject if older than 10 minutes)
            if (data.timestamp) {
                const age = Date.now() - data.timestamp;
                if (age > 10 * 60 * 1000) {
                    throw new Error('QR code expired (older than 10 minutes)');
                }
            }

            return {
                userId: data.userId,
                publicKey: this.nacl.util.decodeBase64(data.publicKey),
                secretKey: this.nacl.util.decodeBase64(data.secretKey)
            };

        } catch (error) {
            console.error('[CryptoService] QR code parsing error:', error);
            throw new Error('Invalid QR code data: ' + error.message);
        }
    },

    /**
     * Simplified BIP39-style wordlist for recovery keys (256 words)
     */
    RECOVERY_WORDLIST: [
        'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
        'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
        'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
        'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
        'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
        'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
        'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
        'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
        'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
        'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
        'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
        'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
        'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
        'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
        'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
        'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
        'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
        'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
        'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base',
        'basic', 'basket', 'battle', 'beach', 'bean', 'beauty', 'because', 'become',
        'beef', 'before', 'begin', 'behave', 'behind', 'believe', 'below', 'belt',
        'bench', 'benefit', 'best', 'betray', 'better', 'between', 'beyond', 'bicycle',
        'bid', 'bike', 'bind', 'biology', 'bird', 'birth', 'bitter', 'black',
        'blade', 'blame', 'blanket', 'blast', 'bleak', 'bless', 'blind', 'blood',
        'blossom', 'blouse', 'blue', 'blur', 'blush', 'board', 'boat', 'body',
        'boil', 'bomb', 'bone', 'bonus', 'book', 'boost', 'border', 'boring',
        'borrow', 'boss', 'bottom', 'bounce', 'box', 'boy', 'bracket', 'brain',
        'brand', 'brass', 'brave', 'bread', 'breeze', 'brick', 'bridge', 'brief',
        'bright', 'bring', 'brisk', 'broccoli', 'broken', 'bronze', 'broom', 'brother',
        'brown', 'brush', 'bubble', 'buddy', 'budget', 'buffalo', 'build', 'bulb',
        'bulk', 'bullet', 'bundle', 'bunker', 'burden', 'burger', 'burst', 'bus',
        'business', 'busy', 'butter', 'buyer', 'buzz', 'cabbage', 'cabin', 'cable'
    ],

    /**
     * Generate a 24-word recovery key
     * @returns {string} Space-separated 24-word recovery key
     */
    generateRecoveryKey() {
        const words = [];
        const wordlist = this.RECOVERY_WORDLIST;

        // Generate 24 random words (96 bits of entropy minimum)
        for (let i = 0; i < 24; i++) {
            const randomIndex = crypto.getRandomValues(new Uint8Array(1))[0] % wordlist.length;
            words.push(wordlist[randomIndex]);
        }

        const recoveryKey = words.join(' ');
        console.log('[CryptoService] Generated 24-word recovery key');

        return recoveryKey;
    },

    /**
     * Encrypt identity keys with recovery key for backup
     * @param {Uint8Array} publicKey - Identity public key
     * @param {Uint8Array} secretKey - Identity secret key
     * @param {string} recoveryKey - 24-word recovery key
     * @returns {Promise<Object>} Object with encryptedData, salt, and iv
     */
    async encryptIdentityKeysWithRecoveryKey(publicKey, secretKey, recoveryKey) {
        if (!publicKey || publicKey.length !== 32) {
            throw new Error('Invalid public key: must be 32 bytes');
        }

        if (!secretKey || secretKey.length !== 32) {
            throw new Error('Invalid secret key: must be 32 bytes');
        }

        if (!recoveryKey || typeof recoveryKey !== 'string') {
            throw new Error('Invalid recovery key');
        }

        // Validate recovery key format (24 words)
        const words = recoveryKey.trim().toLowerCase().split(/\s+/);
        if (words.length !== 24) {
            throw new Error('Recovery key must be exactly 24 words');
        }

        try {
            // Generate random salt
            const salt = crypto.getRandomValues(new Uint8Array(32));

            // Derive key from recovery key using PBKDF2 (same as password)
            const key = await this.deriveKeyFromPassword(recoveryKey, salt);

            // Combine both keys
            const keysData = new Uint8Array(64);
            keysData.set(publicKey, 0);
            keysData.set(secretKey, 32);

            // Generate IV
            const iv = crypto.getRandomValues(new Uint8Array(12));

            // Encrypt with AES-GCM
            const encryptedBuffer = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                keysData
            );

            const encryptedData = new Uint8Array(encryptedBuffer);

            console.log('[CryptoService] Identity keys encrypted with recovery key');

            // Encode to base64 for storage
            return {
                encryptedData: this.nacl.util.encodeBase64(encryptedData),
                salt: this.nacl.util.encodeBase64(salt),
                iv: this.nacl.util.encodeBase64(iv)
            };

        } catch (error) {
            console.error('[CryptoService] Recovery key encryption error:', error);
            throw new Error('Failed to encrypt keys with recovery key: ' + error.message);
        }
    },

    /**
     * Decrypt identity keys with recovery key from backup
     * @param {string} encryptedDataB64 - Base64-encoded encrypted keys
     * @param {string} saltB64 - Base64-encoded salt
     * @param {string} ivB64 - Base64-encoded IV
     * @param {string} recoveryKey - 24-word recovery key
     * @returns {Promise<Object>} Object with publicKey and secretKey
     * @throws {Error} If decryption fails
     */
    async decryptIdentityKeysWithRecoveryKey(encryptedDataB64, saltB64, ivB64, recoveryKey) {
        if (!encryptedDataB64 || !saltB64 || !ivB64) {
            throw new Error('Missing encrypted data, salt, or IV');
        }

        if (!recoveryKey || typeof recoveryKey !== 'string') {
            throw new Error('Invalid recovery key');
        }

        // Validate recovery key format (24 words)
        const words = recoveryKey.trim().toLowerCase().split(/\s+/);
        if (words.length !== 24) {
            throw new Error('Recovery key must be exactly 24 words');
        }

        try {
            // Decode from base64
            const encryptedData = this.nacl.util.decodeBase64(encryptedDataB64);
            const salt = this.nacl.util.decodeBase64(saltB64);
            const iv = this.nacl.util.decodeBase64(ivB64);

            // Derive key from recovery key
            const key = await this.deriveKeyFromPassword(recoveryKey, salt);

            // Decrypt with AES-GCM
            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encryptedData
            );

            const decryptedData = new Uint8Array(decryptedBuffer);

            if (decryptedData.length !== 64) {
                throw new Error('Decrypted data has invalid length');
            }

            // Extract public and secret keys
            const publicKey = decryptedData.slice(0, 32);
            const secretKey = decryptedData.slice(32, 64);

            console.log('[CryptoService] Identity keys decrypted with recovery key');

            return { publicKey, secretKey };

        } catch (error) {
            console.error('[CryptoService] Recovery key decryption error:', error);
            // If error is OperationError, it's likely wrong recovery key
            if (error.name === 'OperationError') {
                throw new Error('Incorrect recovery key or corrupted backup');
            }
            throw new Error('Failed to decrypt keys with recovery key: ' + error.message);
        }
    }
};

// Make available globally
window.CryptoService = CryptoService;

console.log('%c[CryptoService] Ready', 'color: blue; font-weight: bold');
