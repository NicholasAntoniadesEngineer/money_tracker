/**
 * Password-Based Cryptography Service
 *
 * Provides secure password-based key derivation and encryption/decryption
 * using Web Crypto API (native browser crypto, no external dependencies)
 *
 * Security Best Practices:
 * - PBKDF2-SHA256 with 600,000 iterations (OWASP 2023 recommendation)
 * - AES-256-GCM for authenticated encryption (prevents tampering)
 * - Unique salt per user (prevents rainbow table attacks)
 * - Password never stored (only used for derivation, then discarded)
 * - Constant-time operations via Web Crypto API
 */

const PasswordCrypto = {
    // Security constants (OWASP 2023 recommendations)
    PBKDF2_ITERATIONS: 600000, // High iteration count for key derivation
    SALT_LENGTH: 16, // 128 bits
    NONCE_LENGTH: 12, // 96 bits for AES-GCM
    KEY_LENGTH: 256, // AES-256

    /**
     * Generate a cryptographically secure random salt
     * @returns {Uint8Array} Random salt bytes
     */
    generateSalt() {
        return window.crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
    },

    /**
     * Generate a cryptographically secure random nonce for AES-GCM
     * @returns {Uint8Array} Random nonce bytes
     */
    generateNonce() {
        return window.crypto.getRandomValues(new Uint8Array(this.NONCE_LENGTH));
    },

    /**
     * Derive an encryption key from a password using PBKDF2
     *
     * @param {string} password - User's password
     * @param {Uint8Array} salt - Unique salt (16 bytes)
     * @returns {Promise<CryptoKey>} Derived encryption key
     */
    async deriveKeyFromPassword(password, salt) {
        console.log('[PasswordCrypto] Deriving key from password...');

        // Import password as key material
        const passwordKey = await window.crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false, // Not extractable
            ['deriveBits', 'deriveKey']
        );

        // Derive AES-GCM key using PBKDF2
        const derivedKey = await window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: this.PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            passwordKey,
            {
                name: 'AES-GCM',
                length: this.KEY_LENGTH
            },
            false, // Not extractable (more secure)
            ['encrypt', 'decrypt']
        );

        console.log('[PasswordCrypto] Key derivation complete');
        return derivedKey;
    },

    /**
     * Encrypt data using AES-256-GCM with a password-derived key
     *
     * @param {string} plaintext - Data to encrypt (will be encoded to bytes)
     * @param {string} password - User's password
     * @param {Uint8Array} salt - Unique salt (will generate if not provided)
     * @param {Uint8Array} nonce - Nonce for AES-GCM (will generate if not provided)
     * @returns {Promise<Object>} Encrypted data with metadata
     */
    async encryptWithPassword(plaintext, password, salt = null, nonce = null) {
        console.log('[PasswordCrypto] Encrypting with password...');

        // Generate salt and nonce if not provided
        if (!salt) {
            salt = this.generateSalt();
        }
        if (!nonce) {
            nonce = this.generateNonce();
        }

        // Derive encryption key from password
        const key = await this.deriveKeyFromPassword(password, salt);

        // Encrypt plaintext using AES-GCM
        const plaintextBytes = new TextEncoder().encode(plaintext);
        const ciphertext = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: nonce
            },
            key,
            plaintextBytes
        );

        console.log('[PasswordCrypto] Encryption complete');

        // Return encrypted data with all necessary parameters for decryption
        return {
            ciphertext: new Uint8Array(ciphertext),
            salt: salt,
            nonce: nonce,
            algorithm: 'AES-256-GCM',
            kdf: 'PBKDF2-SHA256',
            iterations: this.PBKDF2_ITERATIONS
        };
    },

    /**
     * Decrypt data using AES-256-GCM with a password-derived key
     *
     * @param {Uint8Array} ciphertext - Encrypted data
     * @param {string} password - User's password
     * @param {Uint8Array} salt - Salt used during encryption
     * @param {Uint8Array} nonce - Nonce used during encryption
     * @returns {Promise<string>} Decrypted plaintext
     */
    async decryptWithPassword(ciphertext, password, salt, nonce) {
        console.log('[PasswordCrypto] Decrypting with password...');

        try {
            // Derive the same encryption key from password
            const key = await this.deriveKeyFromPassword(password, salt);

            // Decrypt ciphertext using AES-GCM
            const plaintextBytes = await window.crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: nonce
                },
                key,
                ciphertext
            );

            const plaintext = new TextDecoder().decode(plaintextBytes);
            console.log('[PasswordCrypto] Decryption complete');
            return plaintext;

        } catch (error) {
            console.error('[PasswordCrypto] Decryption failed:', error);
            // AES-GCM will throw if authentication fails (tampering detected) or wrong password
            throw new Error('Decryption failed. Invalid password or corrupted data.');
        }
    },

    /**
     * Convert Uint8Array to Base64 string (for database storage)
     * @param {Uint8Array} bytes - Byte array
     * @returns {string} Base64 string
     */
    bytesToBase64(bytes) {
        return btoa(String.fromCharCode(...bytes));
    },

    /**
     * Convert Base64 string to Uint8Array (from database)
     * @param {string} base64 - Base64 string
     * @returns {Uint8Array} Byte array
     */
    base64ToBytes(base64) {
        return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    },

    /**
     * Encrypt private key with password for backup
     * Convenience method that handles encoding/decoding
     *
     * @param {string} privateKey - Private key to encrypt
     * @param {string} password - User's password
     * @returns {Promise<Object>} Encrypted backup data (Base64 encoded)
     */
    async createKeyBackup(privateKey, password) {
        console.log('[PasswordCrypto] Creating encrypted key backup...');

        const encrypted = await this.encryptWithPassword(privateKey, password);

        // Convert binary data to Base64 for database storage
        return {
            encrypted_private_key: this.bytesToBase64(encrypted.ciphertext),
            kdf_salt: this.bytesToBase64(encrypted.salt),
            encryption_nonce: this.bytesToBase64(encrypted.nonce),
            kdf_algorithm: encrypted.kdf,
            encryption_algorithm: encrypted.algorithm,
            kdf_iterations: encrypted.iterations
        };
    },

    /**
     * Restore private key from encrypted backup
     * Convenience method that handles encoding/decoding
     *
     * @param {Object} backup - Encrypted backup data (from database)
     * @param {string} password - User's password
     * @returns {Promise<string>} Decrypted private key
     */
    async restoreKeyFromBackup(backup, password) {
        console.log('[PasswordCrypto] Restoring key from encrypted backup...');

        // Convert Base64 back to binary
        const ciphertext = this.base64ToBytes(backup.encrypted_private_key);
        const salt = this.base64ToBytes(backup.kdf_salt);
        const nonce = this.base64ToBytes(backup.encryption_nonce);

        // Decrypt private key
        const privateKey = await this.decryptWithPassword(ciphertext, password, salt, nonce);

        console.log('[PasswordCrypto] Key restoration complete');
        return privateKey;
    },

    /**
     * Verify password by attempting to decrypt a test value
     * Used to check if password is correct before attempting full restore
     *
     * @param {string} password - Password to verify
     * @param {Object} backup - Encrypted backup data
     * @returns {Promise<boolean>} True if password is correct
     */
    async verifyPassword(password, backup) {
        try {
            await this.restoreKeyFromBackup(backup, password);
            return true;
        } catch (error) {
            return false;
        }
    }
};

// Make available globally
window.PasswordCrypto = PasswordCrypto;

console.log('[PasswordCrypto] Password-based cryptography service loaded');
console.log('[PasswordCrypto] Using PBKDF2-SHA256 with', PasswordCrypto.PBKDF2_ITERATIONS, 'iterations');
console.log('[PasswordCrypto] Using AES-256-GCM for authenticated encryption');
