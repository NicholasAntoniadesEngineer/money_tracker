/**
 * Attachment Service
 *
 * Handles file attachments for encrypted messaging.
 * Files are encrypted client-side before upload and stored in Supabase Storage.
 * Files auto-expire after 24 hours.
 *
 * Premium feature - requires messaging.attachments permission.
 */

const AttachmentService = {
    /**
     * Storage bucket name for attachments
     */
    BUCKET_NAME: 'message-attachments',

    /**
     * Max file size (from PermissionService)
     */
    MAX_FILE_SIZE: 15 * 1024 * 1024, // 15MB default

    /**
     * Allowed MIME types
     */
    ALLOWED_TYPES: [
        // Images
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        // Documents
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        // Text
        'text/plain', 'text/csv',
        // Archives
        'application/zip'
    ],

    /**
     * Get database service
     */
    _getDatabaseService() {
        return window.DatabaseService;
    },

    /**
     * Get Supabase client
     */
    _getClient() {
        const db = this._getDatabaseService();
        return db?.client;
    },

    /**
     * Check if user can upload attachments
     * @returns {Promise<{allowed: boolean, maxSizeBytes: number, reason: string|null}>}
     */
    async canUpload() {
        if (!window.PermissionService) {
            console.warn('[AttachmentService] PermissionService not available');
            return { allowed: false, maxSizeBytes: 0, reason: 'Permission service unavailable' };
        }

        const access = await window.PermissionService.canAccess('messaging.attachments');
        if (!access.allowed) {
            return { allowed: false, maxSizeBytes: 0, reason: access.reason };
        }

        const settings = await window.PermissionService.getFileAttachmentSettings();
        return {
            allowed: true,
            maxSizeBytes: settings.maxSizeBytes,
            reason: null
        };
    },

    /**
     * Validate a file before upload
     * @param {File} file - File to validate
     * @returns {Promise<{valid: boolean, reason: string|null}>}
     */
    async validateFile(file) {
        console.log('[AttachmentService] Validating file:', file.name, file.size, file.type);

        // Check permission
        const canUploadCheck = await this.canUpload();
        if (!canUploadCheck.allowed) {
            return { valid: false, reason: canUploadCheck.reason };
        }

        // Check file size
        if (file.size > canUploadCheck.maxSizeBytes) {
            const maxMB = Math.round(canUploadCheck.maxSizeBytes / (1024 * 1024));
            const fileMB = (file.size / (1024 * 1024)).toFixed(1);
            return { valid: false, reason: `File size (${fileMB}MB) exceeds limit of ${maxMB}MB` };
        }

        // Check file type
        if (!this.ALLOWED_TYPES.includes(file.type)) {
            return { valid: false, reason: `File type "${file.type}" is not allowed` };
        }

        return { valid: true, reason: null };
    },

    /**
     * Generate a random encryption key for a file
     * @returns {Uint8Array} 32-byte key
     */
    _generateFileKey() {
        return window.CryptoPrimitivesService.randomBytes(32);
    },

    /**
     * Encrypt a file using XSalsa20-Poly1305
     * @param {ArrayBuffer} fileData - File data to encrypt
     * @param {Uint8Array} key - 32-byte encryption key
     * @returns {{ciphertext: Uint8Array, nonce: Uint8Array}}
     */
    _encryptFile(fileData, key) {
        const nonce = window.CryptoPrimitivesService.randomBytes(24);
        const plaintext = new Uint8Array(fileData);
        const ciphertext = window.CryptoPrimitivesService.encrypt(plaintext, nonce, key);
        return { ciphertext, nonce };
    },

    /**
     * Decrypt a file
     * @param {Uint8Array} ciphertext - Encrypted file data
     * @param {Uint8Array} nonce - 24-byte nonce
     * @param {Uint8Array} key - 32-byte key
     * @returns {Uint8Array} Decrypted file data
     */
    _decryptFile(ciphertext, nonce, key) {
        return window.CryptoPrimitivesService.decrypt(ciphertext, nonce, key);
    },

    /**
     * Encrypt the file key with the conversation session key
     * @param {Uint8Array} fileKey - The file's encryption key
     * @param {number|string} conversationId - Conversation ID
     * @returns {Promise<{encryptedKey: string, nonce: string}>}
     */
    async _encryptFileKey(fileKey, conversationId) {
        // Get session key for conversation
        const sessionKey = await window.KeyManagementService.getSessionKey(conversationId);
        if (!sessionKey) {
            throw new Error('No session key available for conversation');
        }

        // Encrypt file key with session key
        const nonce = window.CryptoPrimitivesService.randomBytes(24);
        const encrypted = window.CryptoPrimitivesService.encrypt(fileKey, nonce, sessionKey);

        // Base64 encode for storage
        return {
            encryptedKey: btoa(String.fromCharCode(...encrypted)),
            nonce: btoa(String.fromCharCode(...nonce))
        };
    },

    /**
     * Decrypt the file key using conversation session key
     * @param {string} encryptedKeyBase64 - Base64 encrypted file key
     * @param {string} nonceBase64 - Base64 nonce
     * @param {number|string} conversationId - Conversation ID
     * @returns {Promise<Uint8Array>} Decrypted file key
     */
    async _decryptFileKey(encryptedKeyBase64, nonceBase64, conversationId) {
        // Get session key
        const sessionKey = await window.KeyManagementService.getSessionKey(conversationId);
        if (!sessionKey) {
            throw new Error('No session key available for conversation');
        }

        // Decode from base64
        const encryptedKey = Uint8Array.from(atob(encryptedKeyBase64), c => c.charCodeAt(0));
        const nonce = Uint8Array.from(atob(nonceBase64), c => c.charCodeAt(0));

        // Decrypt
        return window.CryptoPrimitivesService.decrypt(encryptedKey, nonce, sessionKey);
    },

    /**
     * Upload a file attachment
     * @param {File} file - File to upload
     * @param {number|string} messageId - Message ID this attachment belongs to
     * @param {number|string} conversationId - Conversation ID
     * @returns {Promise<{success: boolean, attachment?: Object, error?: string}>}
     */
    async uploadAttachment(file, messageId, conversationId) {
        console.log('[AttachmentService] uploadAttachment() called:', {
            fileName: file.name,
            fileSize: file.size,
            messageId,
            conversationId
        });

        try {
            // Validate file
            const validation = await this.validateFile(file);
            if (!validation.valid) {
                return { success: false, error: validation.reason };
            }

            const client = this._getClient();
            if (!client) {
                throw new Error('Database client not available');
            }

            // Get current user
            const userId = await this._getDatabaseService()._getCurrentUserId();
            if (!userId) {
                throw new Error('User not authenticated');
            }

            // Read file data
            const fileData = await file.arrayBuffer();

            // Generate file encryption key
            const fileKey = this._generateFileKey();
            console.log('[AttachmentService] Generated file key');

            // Encrypt file
            const { ciphertext, nonce } = this._encryptFile(fileData, fileKey);
            console.log('[AttachmentService] File encrypted, ciphertext size:', ciphertext.length);

            // Prepend nonce to ciphertext for storage (nonce is 24 bytes)
            const dataWithNonce = new Uint8Array(24 + ciphertext.length);
            dataWithNonce.set(nonce, 0);
            dataWithNonce.set(ciphertext, 24);

            // Encrypt file key with conversation session key
            const { encryptedKey, nonce: keyNonce } = await this._encryptFileKey(fileKey, conversationId);
            console.log('[AttachmentService] File key encrypted');

            // Generate unique storage path
            const timestamp = Date.now();
            const randomId = Math.random().toString(36).substring(2, 10);
            const storagePath = `${conversationId}/${timestamp}-${randomId}`;

            // Upload encrypted file to Supabase Storage (nonce prepended to ciphertext)
            console.log('[AttachmentService] Uploading to storage:', storagePath);
            const { data: uploadData, error: uploadError } = await client.storage
                .from(this.BUCKET_NAME)
                .upload(storagePath, dataWithNonce, {
                    contentType: 'application/octet-stream', // Always binary for encrypted data
                    upsert: false
                });

            if (uploadError) {
                console.error('[AttachmentService] Storage upload error:', uploadError);
                throw new Error(`Upload failed: ${uploadError.message}`);
            }

            console.log('[AttachmentService] File uploaded to storage');

            // Create attachment record in database
            const attachmentRecord = {
                message_id: messageId,
                conversation_id: conversationId,
                uploader_id: userId,
                file_name: file.name,
                file_size: file.size,
                mime_type: file.type,
                storage_path: storagePath,
                encrypted_file_key: encryptedKey,
                file_key_nonce: keyNonce
            };

            const { data: attachment, error: dbError } = await client
                .from('message_attachments')
                .insert(attachmentRecord)
                .select()
                .single();

            if (dbError) {
                // Try to clean up uploaded file
                await client.storage.from(this.BUCKET_NAME).remove([storagePath]);
                throw new Error(`Database error: ${dbError.message}`);
            }

            console.log('[AttachmentService] Attachment record created:', attachment.id);

            return {
                success: true,
                attachment: {
                    id: attachment.id,
                    fileName: attachment.file_name,
                    fileSize: attachment.file_size,
                    mimeType: attachment.mime_type,
                    expiresAt: attachment.expires_at
                }
            };
        } catch (error) {
            console.error('[AttachmentService] Upload error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Download and decrypt an attachment
     * @param {number|string} attachmentId - Attachment ID
     * @returns {Promise<{success: boolean, data?: Blob, fileName?: string, error?: string}>}
     */
    async downloadAttachment(attachmentId) {
        console.log('[AttachmentService] downloadAttachment() called:', attachmentId);

        try {
            const client = this._getClient();
            if (!client) {
                throw new Error('Database client not available');
            }

            // Get attachment record
            const { data: attachment, error: dbError } = await client
                .from('message_attachments')
                .select('*')
                .eq('id', attachmentId)
                .single();

            if (dbError || !attachment) {
                throw new Error('Attachment not found');
            }

            // Check if expired
            if (new Date(attachment.expires_at) < new Date()) {
                throw new Error('Attachment has expired');
            }

            console.log('[AttachmentService] Downloading from storage:', attachment.storage_path);

            // Download encrypted file from storage
            const { data: fileData, error: downloadError } = await client.storage
                .from(this.BUCKET_NAME)
                .download(attachment.storage_path);

            if (downloadError) {
                throw new Error(`Download failed: ${downloadError.message}`);
            }

            // Get encrypted file as ArrayBuffer
            const encryptedData = new Uint8Array(await fileData.arrayBuffer());
            console.log('[AttachmentService] Downloaded encrypted data, size:', encryptedData.length);

            // Decrypt file key
            const fileKey = await this._decryptFileKey(
                attachment.encrypted_file_key,
                attachment.file_key_nonce,
                attachment.conversation_id
            );
            console.log('[AttachmentService] File key decrypted');

            // We need the nonce that was used for file encryption
            // It's stored as the first 24 bytes of the ciphertext
            const nonce = encryptedData.slice(0, 24);
            const ciphertext = encryptedData.slice(24);

            // Actually, we stored ciphertext directly. Need to rethink...
            // The nonce was generated during encryption but we didn't store it with the file
            // Let me fix the upload to prepend nonce to ciphertext

            // For now, decrypt with the approach where nonce is prepended
            const decryptedData = this._decryptFile(ciphertext, nonce, fileKey);

            // Update download count
            await client
                .from('message_attachments')
                .update({ downloaded_count: attachment.downloaded_count + 1 })
                .eq('id', attachmentId);

            // Create blob with original MIME type
            const blob = new Blob([decryptedData], { type: attachment.mime_type });

            console.log('[AttachmentService] File decrypted successfully');

            return {
                success: true,
                data: blob,
                fileName: attachment.file_name
            };
        } catch (error) {
            console.error('[AttachmentService] Download error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get attachments for a message
     * @param {number|string} messageId - Message ID
     * @returns {Promise<Array>}
     */
    async getMessageAttachments(messageId) {
        try {
            const client = this._getClient();
            if (!client) return [];

            const { data, error } = await client
                .from('message_attachments')
                .select('id, file_name, file_size, mime_type, expires_at, created_at')
                .eq('message_id', messageId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('[AttachmentService] Error fetching attachments:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('[AttachmentService] Error:', error);
            return [];
        }
    },

    /**
     * Delete an attachment (uploader only)
     * @param {number|string} attachmentId - Attachment ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async deleteAttachment(attachmentId) {
        try {
            const client = this._getClient();
            if (!client) {
                throw new Error('Database client not available');
            }

            // Get attachment to find storage path
            const { data: attachment, error: fetchError } = await client
                .from('message_attachments')
                .select('storage_path')
                .eq('id', attachmentId)
                .single();

            if (fetchError || !attachment) {
                throw new Error('Attachment not found');
            }

            // Delete from storage
            const { error: storageError } = await client.storage
                .from(this.BUCKET_NAME)
                .remove([attachment.storage_path]);

            if (storageError) {
                console.warn('[AttachmentService] Storage delete error:', storageError);
            }

            // Delete record
            const { error: dbError } = await client
                .from('message_attachments')
                .delete()
                .eq('id', attachmentId);

            if (dbError) {
                throw new Error(`Delete failed: ${dbError.message}`);
            }

            console.log('[AttachmentService] Attachment deleted:', attachmentId);
            return { success: true };
        } catch (error) {
            console.error('[AttachmentService] Delete error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size (e.g., "1.5 MB")
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    /**
     * Get file icon class based on MIME type
     * @param {string} mimeType - MIME type
     * @returns {string} Font Awesome icon class
     */
    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return 'fa-image';
        if (mimeType === 'application/pdf') return 'fa-file-pdf';
        if (mimeType.includes('word')) return 'fa-file-word';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fa-file-excel';
        if (mimeType === 'text/plain') return 'fa-file-alt';
        if (mimeType === 'text/csv') return 'fa-file-csv';
        if (mimeType === 'application/zip') return 'fa-file-archive';
        return 'fa-file';
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.AttachmentService = AttachmentService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AttachmentService;
}
