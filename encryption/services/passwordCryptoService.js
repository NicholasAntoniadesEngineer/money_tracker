/**
 * Password Crypto Service
 *
 * Handles password-based encryption using Web Crypto API.
 * Used for:
 * - Encrypting identity key backups with user password
 * - Encrypting recovery keys
 *
 * Algorithms:
 * - Key Derivation: PBKDF2-SHA256 (600,000 iterations - OWASP 2023)
 * - Encryption: AES-256-GCM
 */

const PasswordCryptoService = {
    /**
     * Configuration (set during initialize)
     */
    _config: null,

    /**
     * Initialize the service
     * @param {Object} config - Encryption config object
     */
    initialize(config) {
        this._config = config;
        console.log('[PasswordCryptoService] Initialized');
    },

    /**
     * Get PBKDF2 iterations from config
     * @private
     * @returns {number}
     */
    _getIterations() {
        return this._config?.crypto?.pbkdf2?.iterations || 600000;
    },

    /**
     * Get key length from config
     * @private
     * @returns {number} Key length in bits
     */
    _getKeyLength() {
        return this._config?.crypto?.pbkdf2?.keyLength || 256;
    },

    /**
     * Derive an encryption key from a password
     * @param {string} password - User password
     * @param {Uint8Array} salt - Salt (should be random, stored with ciphertext)
     * @returns {Promise<CryptoKey>} AES-GCM key
     */
    async deriveKeyFromPassword(password, salt) {
        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password);

        // Import password as key material
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBytes,
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        // Derive AES key using PBKDF2
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: this._getIterations(),
                hash: 'SHA-256'
            },
            keyMaterial,
            {
                name: 'AES-GCM',
                length: this._getKeyLength()
            },
            false,
            ['encrypt', 'decrypt']
        );

        return key;
    },

    /**
     * Encrypt data with a password
     * @param {Uint8Array} data - Data to encrypt
     * @param {string} password - User password
     * @returns {Promise<Object>} { ciphertext: Uint8Array, salt: Uint8Array, iv: Uint8Array }
     */
    async encryptWithPassword(data, password) {
        // Generate random salt and IV
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

        // Derive key from password
        const key = await this.deriveKeyFromPassword(password, salt);

        // Encrypt with AES-GCM
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            data
        );

        return {
            ciphertext: new Uint8Array(ciphertext),
            salt: salt,
            iv: iv
        };
    },

    /**
     * Decrypt data with a password
     * @param {Uint8Array} ciphertext - Encrypted data
     * @param {string} password - User password
     * @param {Uint8Array} salt - Salt used during encryption
     * @param {Uint8Array} iv - IV used during encryption
     * @returns {Promise<Uint8Array>} Decrypted data
     * @throws {Error} If decryption fails (wrong password or tampered data)
     */
    async decryptWithPassword(ciphertext, password, salt, iv) {
        // Derive key from password
        const key = await this.deriveKeyFromPassword(password, salt);

        try {
            // Decrypt with AES-GCM
            const plaintext = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                ciphertext
            );

            return new Uint8Array(plaintext);
        } catch (error) {
            throw new Error('Decryption failed - incorrect password or corrupted data');
        }
    },

    /**
     * Encrypt data and return base64-encoded strings
     * @param {Uint8Array} data - Data to encrypt
     * @param {string} password - User password
     * @returns {Promise<Object>} { encryptedData: string, salt: string, iv: string }
     */
    async encryptToBase64(data, password) {
        const result = await this.encryptWithPassword(data, password);

        return {
            encryptedData: this._arrayToBase64(result.ciphertext),
            salt: this._arrayToBase64(result.salt),
            iv: this._arrayToBase64(result.iv)
        };
    },

    /**
     * Decrypt base64-encoded data
     * @param {string} encryptedDataB64 - Base64-encoded ciphertext
     * @param {string} password - User password
     * @param {string} saltB64 - Base64-encoded salt
     * @param {string} ivB64 - Base64-encoded IV
     * @returns {Promise<Uint8Array>} Decrypted data
     */
    async decryptFromBase64(encryptedDataB64, password, saltB64, ivB64) {
        const ciphertext = this._base64ToArray(encryptedDataB64);
        const salt = this._base64ToArray(saltB64);
        const iv = this._base64ToArray(ivB64);

        return await this.decryptWithPassword(ciphertext, password, salt, iv);
    },

    /**
     * Generate a random recovery key (256-bit)
     * @returns {string} Base64-encoded recovery key
     */
    generateRecoveryKey() {
        const key = crypto.getRandomValues(new Uint8Array(32));
        return this._arrayToBase64(key);
    },

    /**
     * Format a recovery key for display (groups of 4 characters)
     * @param {string} recoveryKeyB64 - Base64 recovery key
     * @returns {string} Formatted key (e.g., "ABCD-EFGH-IJKL-...")
     */
    formatRecoveryKey(recoveryKeyB64) {
        // Convert to alphanumeric representation
        const bytes = this._base64ToArray(recoveryKeyB64);
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // Base32-like alphabet

        let result = '';
        for (let i = 0; i < bytes.length; i++) {
            result += chars[bytes[i] % 32];
        }

        // Format as groups of 4
        return result.match(/.{1,4}/g).join('-');
    },

    /**
     * Validate password strength
     * @param {string} password - Password to validate
     * @returns {Object} { valid: boolean, score: number, feedback: string[] }
     */
    validatePasswordStrength(password) {
        const feedback = [];
        let score = 0;

        if (password.length >= 8) score++;
        else feedback.push('Password should be at least 8 characters');

        if (password.length >= 12) score++;

        if (/[a-z]/.test(password)) score++;
        else feedback.push('Add lowercase letters');

        if (/[A-Z]/.test(password)) score++;
        else feedback.push('Add uppercase letters');

        if (/[0-9]/.test(password)) score++;
        else feedback.push('Add numbers');

        if (/[^a-zA-Z0-9]/.test(password)) score++;
        else feedback.push('Add special characters');

        return {
            valid: score >= 4 && password.length >= 8,
            score: score,
            feedback: feedback
        };
    },

    /**
     * Convert Uint8Array to base64
     * @private
     * @param {Uint8Array} array
     * @returns {string}
     */
    _arrayToBase64(array) {
        return btoa(String.fromCharCode.apply(null, array));
    },

    /**
     * Convert base64 to Uint8Array
     * @private
     * @param {string} base64
     * @returns {Uint8Array}
     */
    _base64ToArray(base64) {
        const binary = atob(base64);
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            array[i] = binary.charCodeAt(i);
        }
        return array;
    }
};

if (typeof window !== 'undefined') {
    window.PasswordCryptoService = PasswordCryptoService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = PasswordCryptoService;
}
