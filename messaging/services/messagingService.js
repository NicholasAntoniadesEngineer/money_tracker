/**
 * Messaging Service
 * Handles conversation and message management
 * Provides methods for sending messages, managing conversations, and real-time subscriptions
 */

const MessagingService = {
    /**
     * Encryption facade (set during initialization)
     * @type {Object|null}
     */
    _encryptionFacade: null,

    /**
     * Get database service (requires config)
     * @returns {Object} Database service
     * @throws {Error} If DatabaseConfigHelper is not available or database service is not configured
     */
    _getDatabaseService() {
        if (typeof DatabaseConfigHelper === 'undefined') {
            throw new Error('DatabaseConfigHelper not available. Ensure database-config-helper.js is loaded and DatabaseModule.initialize() has been called.');
        }
        return DatabaseConfigHelper.getDatabaseService(this);
    },

    /**
     * Get table name (requires config)
     * @param {string} tableKey - Table key
     * @returns {string} Table name
     * @throws {Error} If DatabaseConfigHelper is not available or table name is not configured
     */
    _getTableName(tableKey) {
        if (typeof DatabaseConfigHelper === 'undefined') {
            throw new Error('DatabaseConfigHelper not available. Ensure database-config-helper.js is loaded and DatabaseModule.initialize() has been called.');
        }
        return DatabaseConfigHelper.getTableName(this, tableKey);
    },

    /**
     * Get the encryption facade from EncryptionModule
     * @returns {Object} Encryption facade
     * @throws {Error} If EncryptionModule is not initialized
     */
    _getEncryptionFacade() {
        if (this._encryptionFacade) {
            return this._encryptionFacade;
        }

        if (typeof EncryptionModule !== 'undefined' && EncryptionModule.isInitialized()) {
            this._encryptionFacade = EncryptionModule.getFacade();
            return this._encryptionFacade;
        }

        throw new Error('[MessagingService] EncryptionModule not initialized. Call initEncryptionModule() first.');
    },

    /**
     * Set the encryption facade (called by EncryptionModule initialization)
     * @param {Object} facade - The encryption facade to use
     */
    setEncryptionFacade(facade) {
        this._encryptionFacade = facade;
        console.log('[MessagingService] Encryption facade set');
    },

    /**
     * Get or create a conversation between two users
     * Ensures user1_id < user2_id for consistent ordering
     * @param {string} user1Id - First user ID
     * @param {string} user2Id - Second user ID
     * @returns {Promise<{success: boolean, conversation: Object|null, error: string|null}>}
     */
    async getOrCreateConversation(user1Id, user2Id) {
        console.log('[MessagingService] getOrCreateConversation() called', { user1Id, user2Id });
        try {
            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            // Ensure consistent ordering (user1_id < user2_id)
            const [orderedUser1, orderedUser2] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];

            const conversationsTableName = this._getTableName('conversations');

            // Check if conversation already exists
            const existingResult = await databaseService.querySelect(conversationsTableName, {
                filter: {
                    user1_id: orderedUser1,
                    user2_id: orderedUser2
                },
                limit: 1
            });

            if (existingResult.error) {
                console.error('[MessagingService] Error checking for existing conversation:', existingResult.error);
                return {
                    success: false,
                    conversation: null,
                    error: existingResult.error.message || 'Failed to check for existing conversation'
                };
            }

            if (existingResult.data && existingResult.data.length > 0) {
                console.log('[MessagingService] Existing conversation found:', existingResult.data[0].id);
                return {
                    success: true,
                    conversation: existingResult.data[0],
                    error: null
                };
            }

            // Create new conversation
            const conversationData = {
                user1_id: orderedUser1,
                user2_id: orderedUser2,
                last_message_at: new Date().toISOString()
            };

            console.log('[MessagingService] Creating conversation with data:', conversationData);
            const createResult = await databaseService.queryInsert(conversationsTableName, conversationData);
            console.log('[MessagingService] Conversation insert result:', {
                hasError: !!createResult.error,
                error: createResult.error,
                hasData: !!createResult.data,
                dataType: typeof createResult.data,
                isArray: Array.isArray(createResult.data),
                dataLength: Array.isArray(createResult.data) ? createResult.data.length : 'N/A',
                firstItem: Array.isArray(createResult.data) && createResult.data.length > 0 ? createResult.data[0] : createResult.data
            });

            if (createResult.error) {
                console.error('[MessagingService] Error creating conversation:', createResult.error);
                return {
                    success: false,
                    conversation: null,
                    error: createResult.error.message || 'Failed to create conversation'
                };
            }

            // queryInsert returns { data: Array, error: null }
            const createdConversation = Array.isArray(createResult.data) && createResult.data.length > 0 
                ? createResult.data[0] 
                : createResult.data;
            
            console.log('[MessagingService] Conversation created successfully:', {
                conversationId: createdConversation?.id,
                user1Id: createdConversation?.user1_id,
                user2Id: createdConversation?.user2_id,
                fullData: createdConversation
            });
            
            if (!createdConversation || !createdConversation.id) {
                console.error('[MessagingService] Conversation created but missing ID:', createResult);
                return {
                    success: false,
                    conversation: null,
                    error: 'Conversation created but ID not returned. This may be due to RLS policies blocking the return representation.'
                };
            }
            
            return {
                success: true,
                conversation: createdConversation,
                error: null
            };
        } catch (error) {
            console.error('[MessagingService] Exception in getOrCreateConversation:', error);
            return {
                success: false,
                conversation: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Send a message
     * @param {string} conversationId - Conversation ID
     * @param {string} senderId - Sender user ID
     * @param {string} recipientId - Recipient user ID
     * @param {string} content - Message content
     * @returns {Promise<{success: boolean, message: Object|null, error: string|null}>}
     */
    async sendMessage(conversationId, senderId, recipientId, content) {
        console.log('[MessagingService] sendMessage() called', { conversationId, senderId, recipientId, contentLength: content?.length });
        try {
            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            // Check if recipient has blocked sender
            if (window.DataSharingService) {
                const isBlockedResult = await window.DataSharingService.checkIfBlocked(recipientId, senderId);
                if (isBlockedResult.isBlocked) {
                    console.warn('[MessagingService] Cannot send message: Recipient has blocked sender');
                    return {
                        success: false,
                        message: null,
                        error: 'You have been blocked by this user.'
                    };
                }
            }

            // Sanitize content (basic check - prevent empty messages)
            if (!content || typeof content !== 'string' || content.trim().length === 0) {
                return {
                    success: false,
                    message: null,
                    error: 'Message content cannot be empty'
                };
            }

            const messagesTableName = this._getTableName('messages');
            const conversationsTableName = this._getTableName('conversations');

            // Get encryption facade - encryption is required
            const encryptionFacade = this._getEncryptionFacade();

            if (!encryptionFacade.isEncryptionEnabled()) {
                throw new Error('[MessagingService] Encryption is not enabled. Cannot send messages without encryption.');
            }

            // Encrypt message using E2E encryption
            let messageData;
            try {
                console.log('[MessagingService] Encrypting message...');

                // Encrypt the message using facade
                const encryptedData = await encryptionFacade.encryptMessage(
                    conversationId,
                    content.trim(),
                    recipientId
                );

                // Create encrypted message
                messageData = {
                    conversation_id: conversationId,
                    sender_id: senderId,
                    recipient_id: recipientId,
                    encrypted_content: encryptedData.ciphertext,
                    encryption_nonce: encryptedData.nonce,
                    message_counter: encryptedData.counter,
                    key_epoch: encryptedData.epoch || 0,
                    is_encrypted: true,
                    read: false
                };

                console.log('[MessagingService] Message encrypted, inserting...', {
                    conversationId,
                    senderId,
                    recipientId,
                    counter: encryptedData.counter,
                    epoch: encryptedData.epoch || 0,
                    ciphertextLength: encryptedData.ciphertext?.length || 0
                });

            } catch (encryptionError) {
                console.error('[MessagingService] Encryption error:', encryptionError);
                return {
                    success: false,
                    message: null,
                    error: 'Failed to encrypt message: ' + encryptionError.message
                };
            }
            
            const messageResult = await databaseService.queryInsert(messagesTableName, messageData);

            if (messageResult.error) {
                console.error('[MessagingService] Error creating message:', messageResult.error);
                return {
                    success: false,
                    message: null,
                    error: messageResult.error.message || 'Failed to create message'
                };
            }

            // queryInsert returns { data: Array, error: null }
            const newMessage = Array.isArray(messageResult.data) && messageResult.data.length > 0 
                ? messageResult.data[0] 
                : messageResult.data;
            
            console.log('[MessagingService] Message created:', {
                messageId: newMessage?.id,
                conversationId: newMessage?.conversation_id,
                senderId: newMessage?.sender_id,
                recipientId: newMessage?.recipient_id,
                fullData: newMessage
            });
            
            if (!newMessage || !newMessage.id) {
                console.error('[MessagingService] Message created but missing ID:', messageResult);
                return {
                    success: false,
                    message: null,
                    error: 'Message created but ID not returned. This may be due to RLS policies blocking the return representation.'
                };
            }

            // Update conversation last_message_at
            await databaseService.queryUpdate(conversationsTableName, conversationId, {
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

            console.log('[MessagingService] Message created successfully:', newMessage.id);

            // Create notification for recipient via NotificationProcessor
            console.log('[MessagingService] Checking for NotificationProcessor availability...', {
                hasNotificationProcessor: typeof window.NotificationProcessor !== 'undefined',
                recipientId: recipientId,
                senderId: senderId,
                conversationId: conversationId
            });

            if (typeof window.NotificationProcessor === 'undefined') {
                console.error('[MessagingService] NotificationProcessor not available - notification will not be created');
            } else {
                try {
                    console.log('[MessagingService] Fetching user emails for notification...');
                    const fromUserEmailResult = await databaseService.getUserEmailById(senderId);
                    const toUserEmailResult = await databaseService.getUserEmailById(recipientId);
                    
                    console.log('[MessagingService] User email lookup results:', {
                        fromUserEmailSuccess: fromUserEmailResult.success,
                        fromUserEmail: fromUserEmailResult.success ? fromUserEmailResult.email : 'Failed',
                        toUserEmailSuccess: toUserEmailResult.success,
                        toUserEmail: toUserEmailResult.success ? toUserEmailResult.email : 'Failed'
                    });

                    const messageData = {
                        fromUserEmail: fromUserEmailResult.success ? fromUserEmailResult.email : 'Unknown User',
                        toUserEmail: toUserEmailResult.success ? toUserEmailResult.email : 'Unknown User',
                        messagePreview: content.trim().substring(0, 100) // First 100 chars as preview
                    };

                    console.log('[MessagingService] Creating notification via NotificationProcessor...', {
                        recipientId: recipientId,
                        type: 'message_received',
                        senderId: senderId,
                        conversationId: conversationId,
                        messageData: messageData
                    });

                    const notificationResult = await window.NotificationProcessor.createAndDeliver(
                        recipientId,
                        'message_received',
                        null, // No share_id
                        senderId,
                        null, // Let template generate message
                        messageData,
                        conversationId, // Pass conversation_id for notification
                        null, // payment_id
                        null, // subscription_id
                        null  // invoice_id
                    );

                    console.log('[MessagingService] Notification creation result:', {
                        success: notificationResult.success,
                        hasNotification: !!notificationResult.notification,
                        notificationId: notificationResult.notification?.id,
                        error: notificationResult.error
                    });

                    if (!notificationResult.success) {
                        console.error('[MessagingService] Failed to create message_received notification:', {
                            error: notificationResult.error,
                            recipientId: recipientId,
                            senderId: senderId,
                            conversationId: conversationId
                        });
                    } else {
                        console.log('[MessagingService] Successfully created message notification:', notificationResult.notification?.id);
                    }
                } catch (error) {
                    console.error('[MessagingService] Exception while creating message notification:', {
                        error: error.message,
                        stack: error.stack,
                        recipientId: recipientId,
                        senderId: senderId,
                        conversationId: conversationId
                    });
                }
            }

            // Add debug info for sent message if debug mode is enabled
            const returnMessage = { ...newMessage };
            if (window.ENCRYPTION_DEBUG_MODE) {
                returnMessage._debugInfo = {
                    decryptSuccess: true, // Sent message - we have the plaintext
                    epoch: messageData.key_epoch,
                    counter: messageData.message_counter,
                    messageId: newMessage.id,
                    ciphertextLength: messageData.encrypted_content?.length || 0,
                    nonceLength: messageData.encryption_nonce?.length || 0,
                    isSentMessage: true
                };
                console.log('[MessagingService] Debug info attached to sent message:', returnMessage._debugInfo);
            }

            return {
                success: true,
                message: returnMessage,
                error: null
            };
        } catch (error) {
            console.error('[MessagingService] Exception in sendMessage:', error);
            return {
                success: false,
                message: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Get all conversations for a user
     * @param {string} userId - User ID
     * @returns {Promise<{success: boolean, conversations: Array|null, error: string|null}>}
     */
    async getConversations(userId) {
        console.log('[MessagingService] getConversations() called', { userId });
        try {
            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const conversationsTableName = this._getTableName('conversations');

            // Get conversations where user is either user1 or user2
            const result = await databaseService.querySelect(conversationsTableName, {
                filter: {
                    $or: [
                        { user1_id: userId },
                        { user2_id: userId }
                    ]
                },
                order: [{ column: 'last_message_at', ascending: false }]
            });

            if (result.error) {
                console.error('[MessagingService] Error getting conversations:', result.error);
                return {
                    success: false,
                    conversations: null,
                    error: result.error.message || 'Failed to get conversations'
                };
            }

            const conversations = result.data || [];

            // Batch fetch unread counts for all conversations in a single query
            // Query all unread messages for this user, then group by conversation_id
            const unreadCountsMap = new Map();
            
            if (conversations.length > 0) {
                const messagesTableName = this._getTableName('messages');
                const conversationIds = conversations.map(conv => conv.id);
                
                // Use $or to filter by multiple conversation_ids in a single query
                const unreadResult = await databaseService.querySelect(messagesTableName, {
                    filter: {
                        recipient_id: userId,
                        read: false,
                        $or: conversationIds.map(id => ({ conversation_id: id }))
                    }
                });

                if (unreadResult.success && unreadResult.data) {
                    // Group unread messages by conversation_id and count
                    unreadResult.data.forEach(msg => {
                        const currentCount = unreadCountsMap.get(msg.conversation_id) || 0;
                        unreadCountsMap.set(msg.conversation_id, currentCount + 1);
                    });
                }
            }

            // Batch fetch all user emails in parallel
            const otherUserIds = conversations.map(conv => 
                conv.user1_id === userId ? conv.user2_id : conv.user1_id
            );
            const uniqueUserIds = [...new Set(otherUserIds)];
            
            // Fetch all emails in parallel
            const emailResults = await Promise.all(
                uniqueUserIds.map(userId => 
                    databaseService.getUserEmailById(userId).then(result => ({
                        userId,
                        email: result.success ? result.email : 'Unknown User'
                    }))
                )
            );
            
            // Create email map
            const emailMap = new Map();
            emailResults.forEach(({ userId, email }) => {
                emailMap.set(userId, email);
            });

            // Build conversations with details
            const conversationsWithDetails = conversations.map(conv => {
                const otherUserId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
                return {
                    ...conv,
                    other_user_id: otherUserId,
                    other_user_email: emailMap.get(otherUserId) || 'Unknown User',
                    unread_count: unreadCountsMap.get(conv.id) || 0
                };
            });

            console.log(`[MessagingService] Found ${conversationsWithDetails.length} conversations`);
            return {
                success: true,
                conversations: conversationsWithDetails,
                error: null
            };
        } catch (error) {
            console.error('[MessagingService] Exception in getConversations:', error);
            return {
                success: false,
                conversations: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Get messages in a conversation
     * @param {string} conversationId - Conversation ID
     * @param {Object} options - Query options
     * @param {number} options.limit - Limit number of messages
     * @param {number} options.offset - Offset for pagination
     * @returns {Promise<{success: boolean, messages: Array|null, error: string|null}>}
     */
    async getMessages(conversationId, options = {}) {
        console.log('[MessagingService] getMessages() called', { conversationId, options });
        try {
            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const messagesTableName = this._getTableName('messages');

            const queryOptions = {
                filter: { conversation_id: conversationId },
                order: [{ column: 'created_at', ascending: false }]
            };

            if (options.limit) {
                queryOptions.limit = options.limit;
            }
            if (options.offset) {
                queryOptions.offset = options.offset;
            }

            const result = await databaseService.querySelect(messagesTableName, queryOptions);

            if (result.error) {
                console.error('[MessagingService] Error getting messages:', result.error);
                return {
                    success: false,
                    messages: null,
                    error: result.error.message || 'Failed to get messages'
                };
            }

            const messages = result.data || [];
            console.log(`[MessagingService] Found ${messages.length} messages in conversation ${conversationId}`);

            // Get encryption facade - encryption is required
            const encryptionFacade = this._getEncryptionFacade();

            if (!encryptionFacade.isEncryptionEnabled()) {
                throw new Error('[MessagingService] Encryption is not enabled. Cannot read messages without encryption.');
            }

            // Process messages - all messages must be encrypted
            const messagesWithEmailsAndDecrypted = await Promise.all(messages.map(async (msg) => {
                // Fetch sender email
                const senderEmailResult = await databaseService.getUserEmailById(msg.sender_id);
                const sender_email = senderEmailResult.success ? senderEmailResult.email : 'Unknown User';

                let content;
                let decryptSuccess = false;
                let decryptError = null;

                // Validate message has encryption data
                if (!msg.encrypted_content || !msg.encryption_nonce) {
                    console.error('[MessagingService] Message missing encryption data:', msg.id);
                    content = '[ERROR: Message corrupted - missing encryption data]';
                    decryptError = 'Missing encryption data';
                } else {
                    // Decrypt the message
                    try {
                        console.log('[MessagingService] Decrypting message:', {
                            message_id: msg.id,
                            conversation_id: conversationId,
                            sender_id: msg.sender_id,
                            message_counter: msg.message_counter,
                            created_at: msg.created_at,
                            ciphertext_length: msg.encrypted_content?.length,
                            nonce_length: msg.encryption_nonce?.length
                        });

                        // Decrypt the message using facade
                        // Pass both sender_id and recipient_id so ECDH can use the correct public key
                        const decryptedContent = await encryptionFacade.decryptMessage(
                            conversationId,
                            {
                                ciphertext: msg.encrypted_content,
                                nonce: msg.encryption_nonce,
                                counter: msg.message_counter,
                                epoch: msg.key_epoch || 0
                            },
                            msg.sender_id,
                            msg.recipient_id
                        );
                        content = decryptedContent;
                        decryptSuccess = true;
                        console.log('[MessagingService] Message', msg.id, 'decrypted successfully');

                    } catch (decryptionError) {
                        console.error('[MessagingService] ❌ DECRYPTION FAILED for message:', msg.id);
                        console.error('[MessagingService] Error:', decryptionError.message);
                        console.error('[MessagingService] This device may not have the correct keys to decrypt this message');
                        console.error('[MessagingService] Try restoring keys via Device Pairing on this device');

                        // Show error - don't delete messages as other devices may be able to decrypt them
                        content = '[Cannot decrypt on this device - try Device Pairing to restore keys]';
                        decryptSuccess = false;
                        decryptError = decryptionError.message;
                    }
                }

                // Build debug info for this message
                const debugInfo = {
                    messageId: msg.id,
                    epoch: msg.key_epoch || 0,
                    counter: msg.message_counter,
                    isEncrypted: msg.is_encrypted,
                    decryptSuccess: decryptSuccess,
                    decryptError: decryptError || null,
                    ciphertextLength: msg.encrypted_content ? msg.encrypted_content.length : 0,
                    nonceLength: msg.encryption_nonce ? msg.encryption_nonce.length : 0,
                    timestamp: msg.created_at
                };

                // Log debug info if debug mode is enabled
                if (window.ENCRYPTION_DEBUG_MODE) {
                    console.log('[MessagingService] Debug info for message', msg.id + ':', JSON.stringify(debugInfo, null, 2));
                }

                return {
                    ...msg,
                    content, // Decrypted content
                    sender_email,
                    _debugInfo: debugInfo // Debug info (prefixed with _ to indicate internal)
                };
            }));

            return {
                success: true,
                messages: messagesWithEmailsAndDecrypted,
                error: null
            };
        } catch (error) {
            console.error('[MessagingService] Exception in getMessages:', error);
            return {
                success: false,
                messages: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Mark a message as read
     * @param {string} messageId - Message ID
     * @param {string} userId - User ID (must be the recipient)
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async markMessageAsRead(messageId, userId) {
        console.log('[MessagingService] markMessageAsRead() called', { messageId, userId });
        try {
            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const messagesTableName = this._getTableName('messages');

            // First, verify the message exists and user is the recipient
            const messageResult = await databaseService.querySelect(messagesTableName, {
                filter: { id: messageId },
                limit: 1
            });

            if (messageResult.error || !messageResult.data || messageResult.data.length === 0) {
                return {
                    success: false,
                    error: 'Message not found'
                };
            }

            const message = messageResult.data[0];
            if (message.recipient_id !== userId) {
                return {
                    success: false,
                    error: 'Not authorized to mark this message as read'
                };
            }

            // Update message
            const updateResult = await databaseService.queryUpdate(messagesTableName, messageId, {
                read: true,
                read_at: new Date().toISOString()
            });

            if (updateResult.error) {
                console.error('[MessagingService] Error marking message as read:', updateResult.error);
                return {
                    success: false,
                    error: updateResult.error.message || 'Failed to mark message as read'
                };
            }

            console.log('[MessagingService] Message marked as read successfully');
            return {
                success: true,
                error: null
            };
        } catch (error) {
            console.error('[MessagingService] Exception in markMessageAsRead:', error);
            return {
                success: false,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Mark all messages in a conversation as read
     * @param {string} conversationId - Conversation ID
     * @param {string} userId - User ID (must be a participant)
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async markConversationAsRead(conversationId, userId) {
        console.log('[MessagingService] markConversationAsRead() called', { conversationId, userId });
        try {
            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const messagesTableName = this._getTableName('messages');

            // Update all unread messages where user is recipient
            const updateResult = await databaseService.queryUpdate(messagesTableName, null, {
                read: true,
                read_at: new Date().toISOString()
            }, {
                conversation_id: conversationId,
                recipient_id: userId,
                read: false
            });

            if (updateResult.error) {
                console.error('[MessagingService] Error marking conversation as read:', updateResult.error);
                return {
                    success: false,
                    error: updateResult.error.message || 'Failed to mark conversation as read'
                };
            }

            console.log('[MessagingService] Conversation marked as read successfully');
            return {
                success: true,
                error: null
            };
        } catch (error) {
            console.error('[MessagingService] Exception in markConversationAsRead:', error);
            return {
                success: false,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Get unread message count for a specific conversation
     * @param {string} conversationId - Conversation ID
     * @param {string} userId - User ID
     * @returns {Promise<{success: boolean, count: number, error: string|null}>}
     */
    async getUnreadCountForConversation(conversationId, userId) {
        console.log('[MessagingService] getUnreadCountForConversation() called', { conversationId, userId });
        try {
            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const messagesTableName = this._getTableName('messages');

            const result = await databaseService.querySelect(messagesTableName, {
                filter: {
                    conversation_id: conversationId,
                    recipient_id: userId,
                    read: false
                },
                count: 'exact'
            });

            if (result.error) {
                console.error('[MessagingService] Error getting unread count:', result.error);
                return {
                    success: false,
                    count: 0,
                    error: result.error.message || 'Failed to get unread count'
                };
            }

            const count = result.count || 0;
            console.log(`[MessagingService] Unread count for conversation ${conversationId}: ${count}`);
            return {
                success: true,
                count: count,
                error: null
            };
        } catch (error) {
            console.error('[MessagingService] Exception in getUnreadCountForConversation:', error);
            return {
                success: false,
                count: 0,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Get total unread message count for a user
     * @param {string} userId - User ID
     * @returns {Promise<{success: boolean, count: number, error: string|null}>}
     */
    async getUnreadCount(userId) {
        console.log('[MessagingService] ========== getUnreadCount() CALLED ==========');
        console.log('[MessagingService] getUnreadCount() - Start time:', new Date().toISOString());
        console.log('[MessagingService] getUnreadCount() - Parameters:', { userId });
        
        try {
            console.log('[MessagingService] Getting DatabaseService...');
            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                console.error('[MessagingService] DatabaseService not available');
                throw new Error('DatabaseService not available');
            }
            console.log('[MessagingService] DatabaseService obtained');

            const messagesTableName = this._getTableName('messages');
            console.log('[MessagingService] Messages table name:', messagesTableName);

            console.log('[MessagingService] Preparing querySelect with filter:', {
                recipient_id: userId,
                read: false
            });
            const queryStartTime = Date.now();
            
            const result = await databaseService.querySelect(messagesTableName, {
                filter: {
                    recipient_id: userId,
                    read: false
                },
                count: 'exact'
            });

            const queryDuration = Date.now() - queryStartTime;
            console.log('[MessagingService] querySelect completed in', queryDuration, 'ms');
            console.log('[MessagingService] querySelect result:', {
                hasError: !!result.error,
                error: result.error,
                hasCount: result.count !== undefined && result.count !== null,
                count: result.count,
                hasData: !!result.data,
                dataLength: result.data?.length,
                dataSample: result.data?.slice(0, 2)?.map(m => ({
                    id: m.id,
                    sender_id: m.sender_id,
                    recipient_id: m.recipient_id,
                    read: m.read,
                    content_preview: m.content?.substring(0, 50)
                }))
            });

            if (result.error) {
                console.error('[MessagingService] Error getting unread count:', {
                    error: result.error,
                    message: result.error.message,
                    code: result.error.code,
                    details: result.error.details
                });
                return {
                    success: false,
                    count: 0,
                    error: result.error.message || 'Failed to get unread count'
                };
            }

            // Extract count from result - prefer result.count, fallback to data length
            let count = result.count;
            if (count === null || count === undefined) {
                // If count wasn't in result, use data length as fallback
                if (result.data && Array.isArray(result.data)) {
                    count = result.data.length;
                    console.log('[MessagingService] Count not in result, using data length as fallback:', count);
                } else {
                    count = 0;
                }
            }
            
            console.log(`[MessagingService] Total unread count for user ${userId}: ${count}`);
            console.log('[MessagingService] Final count calculation:', {
                resultCount: result.count,
                dataLength: result.data?.length,
                finalCount: count
            });
            console.log('[MessagingService] ========== getUnreadCount() COMPLETE ==========');
            return {
                success: true,
                count: count,
                error: null
            };
        } catch (error) {
            console.error('[MessagingService] Exception in getUnreadCount:', {
                error: error.message,
                stack: error.stack,
                userId: userId
            });
            return {
                success: false,
                count: 0,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Subscribe to real-time message updates for a user
     * @param {string} userId - User ID
     * @param {Function} callback - Callback function to call when messages change
     * @returns {Promise<{success: boolean, subscription: Object|null, error: string|null}>}
     */
    async subscribeToMessages(userId, callback) {
        console.log('[MessagingService] subscribeToMessages() called', { userId });
        try {
            const databaseService = this._getDatabaseService();
            if (!databaseService || !databaseService.client) {
                throw new Error('DatabaseService or client not available');
            }

            const messagesTableName = this._getTableName('messages');

            if (!databaseService.client.channel || typeof databaseService.client.channel !== 'function') {
                console.warn('[MessagingService] Real-time not available, skipping subscription');
                return {
                    success: false,
                    subscription: null,
                    error: 'Real-time subscriptions not available'
                };
            }

            const channel = databaseService.client.channel(`messages:${userId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: messagesTableName,
                    filter: `recipient_id=eq.${userId}`
                }, (payload) => {
                    console.log('[MessagingService] Real-time message update:', payload);
                    if (callback) {
                        callback(payload);
                    }
                })
                .subscribe();

            console.log(`[MessagingService] Subscribed to messages for user ${userId}`);
            return {
                success: true,
                subscription: channel,
                error: null
            };
        } catch (error) {
            console.error('[MessagingService] Exception subscribing to messages:', error);
            return {
                success: false,
                subscription: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    }
};

if (typeof window !== 'undefined') {
    window.MessagingService = MessagingService;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessagingService;
}

