/**
 * Key Backup Service
 *
 * Manages encrypted backup and restoration of E2E encryption keys
 * Keys are encrypted with user's password and stored in database
 *
 * Features:
 * - Password-encrypted key backup to database
 * - Automatic key restoration on login
 * - Recovery code generation and validation
 * - Device tracking for security audit
 */

const KeyBackupService = {
    TABLE_NAME: 'user_key_backups',

    /**
     * Check if user has an encrypted key backup in database
     *
     * @param {string} userId - User ID
     * @returns {Promise<boolean>} True if backup exists
     */
    async hasBackup(userId) {
        console.log('[KeyBackupService] Checking for key backup...', userId);

        try {
            const result = await window.DatabaseService.querySelect(this.TABLE_NAME, {
                filter: { user_id: userId },
                limit: 1
            });

            const hasBackup = result.data && result.data.length > 0 && !result.error;
            console.log('[KeyBackupService] Backup exists:', hasBackup);
            return hasBackup;

        } catch (error) {
            console.error('[KeyBackupService] Error checking backup:', error);
            return false;
        }
    },

    /**
     * Get encrypted key backup from database
     *
     * @param {string} userId - User ID
     * @returns {Promise<Object|null>} Encrypted backup data or null
     */
    async getBackup(userId) {
        console.log('[KeyBackupService] Retrieving key backup...', userId);

        try {
            const result = await window.DatabaseService.querySelect(this.TABLE_NAME, {
                filter: { user_id: userId },
                limit: 1
            });

            if (result.error || !result.data || result.data.length === 0) {
                console.log('[KeyBackupService] No backup found');
                return null;
            }

            const backup = result.data[0];
            console.log('[KeyBackupService] Backup retrieved successfully');

            // Update last accessed timestamp
            await this._updateLastAccessed(userId);

            return backup;

        } catch (error) {
            console.error('[KeyBackupService] Error retrieving backup:', error);
            return null;
        }
    },

    /**
     * Create encrypted backup of user's keys
     *
     * @param {string} userId - User ID
     * @param {string} publicKey - Public key (stored plaintext)
     * @param {string} privateKey - Private key (will be encrypted)
     * @param {string} password - User's password for encryption
     * @returns {Promise<Object>} Result with success status
     */
    async createBackup(userId, publicKey, privateKey, password) {
        console.log('[KeyBackupService] Creating encrypted key backup...');

        try {
            // Encrypt private key with password
            const encryptedData = await window.PasswordCrypto.createKeyBackup(privateKey, password);

            // Get device info
            const deviceInfo = window.DevicePairingService
                ? window.DevicePairingService.getDeviceName()
                : 'Unknown Device';

            // Prepare backup data
            const backupData = {
                user_id: userId,
                public_key: publicKey,
                encrypted_private_key: encryptedData.encrypted_private_key,
                kdf_algorithm: encryptedData.kdf_algorithm,
                kdf_salt: encryptedData.kdf_salt,
                kdf_iterations: encryptedData.kdf_iterations,
                encryption_algorithm: encryptedData.encryption_algorithm,
                encryption_nonce: encryptedData.encryption_nonce,
                backup_device_info: deviceInfo
            };

            // Check if backup already exists
            const existingBackup = await this.hasBackup(userId);

            if (existingBackup) {
                // Update existing backup
                console.log('[KeyBackupService] Updating existing backup...');
                const result = await window.DatabaseService.queryUpdate(
                    this.TABLE_NAME,
                    userId,
                    backupData
                );

                if (result.error) {
                    throw new Error(result.error);
                }
            } else {
                // Insert new backup
                console.log('[KeyBackupService] Creating new backup...');
                const result = await window.DatabaseService.queryInsert(
                    this.TABLE_NAME,
                    backupData
                );

                if (result.error) {
                    throw new Error(result.error);
                }
            }

            console.log('[KeyBackupService] ✓ Key backup created successfully');
            return { success: true };

        } catch (error) {
            console.error('[KeyBackupService] ✗ Failed to create backup:', error);
            return {
                success: false,
                error: error.message || 'Failed to create key backup'
            };
        }
    },

    /**
     * Restore keys from encrypted backup using password
     *
     * @param {string} userId - User ID
     * @param {string} password - User's password for decryption
     * @returns {Promise<Object>} Result with keys or error
     */
    async restoreFromBackup(userId, password) {
        console.log('[KeyBackupService] Restoring keys from backup...');

        try {
            // Get encrypted backup from database
            const backup = await this.getBackup(userId);

            if (!backup) {
                return {
                    success: false,
                    error: 'No backup found for this user'
                };
            }

            // Decrypt private key using password
            const privateKey = await window.PasswordCrypto.restoreKeyFromBackup(backup, password);

            console.log('[KeyBackupService] ✓ Keys restored successfully');
            return {
                success: true,
                keys: {
                    publicKey: backup.public_key,
                    secretKey: privateKey
                }
            };

        } catch (error) {
            console.error('[KeyBackupService] ✗ Failed to restore keys:', error);

            // Check if error is due to wrong password
            if (error.message.includes('Decryption failed')) {
                return {
                    success: false,
                    error: 'Incorrect password. Please try again.',
                    wrongPassword: true
                };
            }

            return {
                success: false,
                error: error.message || 'Failed to restore keys from backup'
            };
        }
    },

    /**
     * Delete key backup (use with caution!)
     *
     * @param {string} userId - User ID
     * @returns {Promise<Object>} Result with success status
     */
    async deleteBackup(userId) {
        console.log('[KeyBackupService] Deleting key backup...');

        try {
            const result = await window.DatabaseService.queryDelete(this.TABLE_NAME, userId);

            if (result.error) {
                throw new Error(result.error);
            }

            console.log('[KeyBackupService] Backup deleted');
            return { success: true };

        } catch (error) {
            console.error('[KeyBackupService] Failed to delete backup:', error);
            return {
                success: false,
                error: error.message || 'Failed to delete backup'
            };
        }
    },

    /**
     * Update backup with new password
     * Used when user changes their password
     *
     * @param {string} userId - User ID
     * @param {string} oldPassword - Current password
     * @param {string} newPassword - New password
     * @returns {Promise<Object>} Result with success status
     */
    async reencryptWithNewPassword(userId, oldPassword, newPassword) {
        console.log('[KeyBackupService] Re-encrypting backup with new password...');

        try {
            // Restore keys with old password
            const restoreResult = await this.restoreFromBackup(userId, oldPassword);

            if (!restoreResult.success) {
                return restoreResult; // Return error from restore
            }

            const { publicKey, secretKey } = restoreResult.keys;

            // Create new backup with new password
            const backupResult = await this.createBackup(userId, publicKey, secretKey, newPassword);

            if (!backupResult.success) {
                return backupResult; // Return error from backup
            }

            console.log('[KeyBackupService] ✓ Backup re-encrypted successfully');
            return { success: true };

        } catch (error) {
            console.error('[KeyBackupService] ✗ Failed to re-encrypt backup:', error);
            return {
                success: false,
                error: error.message || 'Failed to re-encrypt backup'
            };
        }
    },

    /**
     * Generate recovery codes for backup access
     * Similar to 2FA backup codes
     *
     * @param {number} count - Number of codes to generate (default: 10)
     * @returns {Array<string>} Array of recovery codes
     */
    generateRecoveryCodes(count = 10) {
        console.log('[KeyBackupService] Generating recovery codes...');

        const codes = [];
        for (let i = 0; i < count; i++) {
            // Generate 16-character alphanumeric code
            const code = Array.from(
                window.crypto.getRandomValues(new Uint8Array(8))
            ).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

            // Format as XXXX-XXXX-XXXX-XXXX
            const formatted = code.match(/.{1,4}/g).join('-');
            codes.push(formatted);
        }

        console.log('[KeyBackupService] Generated', count, 'recovery codes');
        return codes;
    },

    /**
     * Update last accessed timestamp (internal helper)
     * @private
     */
    async _updateLastAccessed(userId) {
        try {
            await window.DatabaseService.queryUpdate(
                this.TABLE_NAME,
                userId,
                { last_accessed_at: new Date().toISOString() }
            );
        } catch (error) {
            console.warn('[KeyBackupService] Failed to update last accessed:', error);
        }
    }
};

// Make available globally
window.KeyBackupService = KeyBackupService;

console.log('[KeyBackupService] Key backup service loaded');
