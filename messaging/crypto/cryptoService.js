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

        // Precompute shared secret for performance
        const sharedSecret = this.nacl.box.before(theirPublicKey, ourSecretKey);

        console.log('[CryptoService] Derived shared secret');

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
    }
};

// Make available globally
window.CryptoService = CryptoService;

console.log('%c[CryptoService] Ready', 'color: blue; font-weight: bold');
