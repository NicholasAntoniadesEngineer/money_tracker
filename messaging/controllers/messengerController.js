/**
 * Messenger Controller
 * Handles the messenger page UI and interactions
 */

const MessengerController = {
    currentConversationId: null,
    // Performance optimizations
    emailCache: new Map(), // Cache user emails to avoid repeated lookups
    shareCache: new Map(), // Cache share details to avoid repeated queries
    enableVerboseLogging: false, // Set to true for debugging
    conversations: [],
    // Loading guards to prevent duplicate concurrent calls
    isLoadingConversations: false,
    conversationsLoadPromise: null, // Cache the promise to reuse for concurrent calls
    isOpeningConversation: false, // Guard to prevent multiple simultaneous opens
    openingConversationId: null, // Track which conversation is being opened
    isInitializing: false,

    /**
     * Initialize the messenger page
     */
    async init() {
        // Guard: Prevent multiple initializations
        if (this.isInitializing) {
            if (this.enableVerboseLogging) {
                console.log('[MessengerController] init() - already initializing, ignoring duplicate call');
            }
            return;
        }
        this.isInitializing = true;

        try {
            if (this.enableVerboseLogging) {
                console.log('[MessengerController] init() called');
            }

            // Wait for AuthService to be available and initialized
            if (!window.AuthService) {
                console.warn('[MessengerController] AuthService not available, waiting...');
                await new Promise((resolve) => {
                    const checkAuth = setInterval(() => {
                        if (window.AuthService) {
                            clearInterval(checkAuth);
                            resolve();
                        }
                    }, 100);
                    setTimeout(() => {
                        clearInterval(checkAuth);
                        resolve();
                    }, 5000); // Max 5 second wait
                });
            }

            // Wait for auth state to be determined (session check completes)
            console.log('[MessengerController] Waiting for auth state to be determined...');
            let authCheckAttempts = 0;
            const maxAuthChecks = 50; // 5 seconds max wait (50 * 100ms)
            while (authCheckAttempts < maxAuthChecks) {
                if (window.AuthService && window.AuthService.isAuthenticated()) {
                    console.log(`[MessengerController] User authenticated after ${authCheckAttempts} checks`);
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                authCheckAttempts++;
            }

            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                console.warn('[MessengerController] User not authenticated after waiting, redirecting to auth');
                window.location.href = '../../auth/views/auth.html';
                return;
            }

            console.log('[MessengerController] User authenticated, proceeding with initialization');

            // Initialize end-to-end encryption
            console.log('[MessengerController] Initializing E2E encryption...');
            const currentUser = window.AuthService.getCurrentUser();
            const currentUserId = currentUser?.id;

            if (!currentUserId) {
                console.error('[MessengerController] No user ID found!');
                throw new Error('User ID not available');
            }

            try {
                // Initialize crypto library first
                if (window.CryptoLibraryLoader && typeof window.CryptoLibraryLoader.load === 'function') {
                    await window.CryptoLibraryLoader.load();
                }
                if (window.CryptoPrimitivesService && typeof window.CryptoPrimitivesService.initialize === 'function') {
                    await window.CryptoPrimitivesService.initialize();
                }

                // Prepare config with services
                if (window.MoneyTrackerEncryptionConfig && typeof window.MoneyTrackerEncryptionConfig.prepareWithServices === 'function') {
                    window.MoneyTrackerEncryptionConfig.prepareWithServices();
                }

                // Initialize the full EncryptionModule (required for sendMessage encryption)
                console.log('[MessengerController] Checking EncryptionModule availability:', {
                    hasEncryptionModule: !!window.EncryptionModule,
                    hasInitialize: !!(window.EncryptionModule && typeof window.EncryptionModule.initialize === 'function'),
                    isAlreadyInitialized: !!(window.EncryptionModule && window.EncryptionModule.isInitialized && window.EncryptionModule.isInitialized())
                });

                if (window.EncryptionModule && typeof window.EncryptionModule.initialize === 'function') {
                    // Check if already initialized
                    if (window.EncryptionModule.isInitialized && window.EncryptionModule.isInitialized()) {
                        console.log('[MessengerController] EncryptionModule already initialized, skipping initialize()');
                    } else {
                        console.log('[MessengerController] Calling EncryptionModule.initialize()...');
                        const initResult = await window.EncryptionModule.initialize(window.MoneyTrackerEncryptionConfig);
                        console.log('[MessengerController] EncryptionModule.initialize() result:', initResult);
                    }

                    console.log('[MessengerController] Calling EncryptionModule.initializeForUser()...');
                    let userResult = await window.EncryptionModule.initializeForUser(currentUserId);
                    console.log('[MessengerController] EncryptionModule.initializeForUser() result:', userResult);

                    // Handle key mismatch that requires restore
                    if (!userResult.success && userResult.needsRestore && userResult.hasBackup) {
                        console.log('[MessengerController] Key mismatch detected - prompting for password to restore...');
                        const password = prompt(
                            'Your encryption keys need to be restored.\n\n' +
                            'Please enter your encryption password to restore your keys and decrypt your messages:'
                        );

                        if (password) {
                            console.log('[MessengerController] Attempting key restoration...');
                            const restoreResult = await window.EncryptionModule.restoreFromPassword(password);
                            console.log('[MessengerController] Restore result:', restoreResult);

                            if (restoreResult.success) {
                                console.log('[MessengerController] Keys restored successfully, re-initializing...');
                                userResult = await window.EncryptionModule.initializeForUser(currentUserId);
                                console.log('[MessengerController] Re-initialization result:', userResult);
                            } else {
                                console.error('[MessengerController] Key restoration failed:', restoreResult.error);
                                alert('Failed to restore encryption keys. Please check your password and try again.');
                            }
                        } else {
                            console.warn('[MessengerController] User cancelled password prompt');
                        }
                    }

                    console.log('[MessengerController] ✓ EncryptionModule initialized');
                } else {
                    console.error('[MessengerController] EncryptionModule not available!', {
                        windowEncryptionModule: window.EncryptionModule,
                        typeofInitialize: window.EncryptionModule ? typeof window.EncryptionModule.initialize : 'N/A'
                    });
                }

                console.log('[MessengerController] ✓ E2E encryption initialized');
            } catch (encryptionError) {
                console.error('[MessengerController] ✗ Encryption initialization failed:', encryptionError);

                // Check if this is an identity key mismatch error
                if (encryptionError.message && encryptionError.message.includes('IDENTITY KEY MISMATCH')) {
                    console.error('[MessengerController] Identity key mismatch detected - redirecting to device pairing');

                    // Show a detailed alert with instructions
                    const userChoice = confirm(
                        'ENCRYPTION KEY MISMATCH DETECTED\n\n' +
                        'This device has different encryption keys than your other devices. ' +
                        'Messages from other devices cannot be decrypted here.\n\n' +
                        'To fix this:\n' +
                        '1. Go to your PRIMARY device (where messages work)\n' +
                        '2. Open Settings → Security → Pair New Device\n' +
                        '3. Use QR code or Recovery Key to sync keys to this device\n\n' +
                        'Click OK to go to Device Pairing, or Cancel to stay here.'
                    );

                    if (userChoice) {
                        // Redirect to device pairing page
                        window.location.href = 'device-pairing.html';
                    }
                    return;
                }

                alert('Failed to initialize secure messaging. Please refresh the page.');
                return;
            }

            console.log('[MessengerController] ========== POST-ENCRYPTION INITIALIZATION ==========');
            console.log('[MessengerController] Step 1: Setting up event listeners...');
            this.setupEventListeners();
            console.log('[MessengerController] ✓ Event listeners set up');

            // Check URL for conversation ID parameter
            const urlParams = new URLSearchParams(window.location.search);
            const conversationIdParam = urlParams.get('conversationId');
            console.log('[MessengerController] URL conversation ID param:', conversationIdParam);

            // Load conversations
            console.log('[MessengerController] Step 2: Loading conversations...');
            await this.loadConversations();
            console.log('[MessengerController] ✓ Conversations loaded');
            
            // If conversation ID in URL, open that conversation
            if (conversationIdParam) {
                console.log('[MessengerController] Step 3: Opening conversation from URL param...');
                const conversationId = parseInt(conversationIdParam, 10);
                if (conversationId && this.conversations.find(c => c.id === conversationId)) {
                    await this.openConversation(conversationId);
                    console.log('[MessengerController] ✓ Conversation opened from URL');
                } else {
                    console.warn('[MessengerController] Conversation ID in URL not found:', conversationId);
                }
            }

            console.log('[MessengerController] ========== INITIALIZATION COMPLETE ==========');
            console.log('[MessengerController] Total conversations:', this.conversations.length);
        } catch (error) {
            console.error('[MessengerController] ========== INITIALIZATION FAILED ==========');
            console.error('[MessengerController] Error:', error);
            console.error('[MessengerController] Error stack:', error.stack);
            alert('Error loading messenger. Please check console for details.');
        } finally {
            this.isInitializing = false;
            console.log('[MessengerController] isInitializing set to false');
        }
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const newMessageButton = document.getElementById('new-message-button');
        const sendMessageButton = document.getElementById('send-message-button');
        const shareDataButton = document.getElementById('share-data-button');
        const newMessageModal = document.getElementById('new-message-modal');
        const closeNewMessageModal = document.getElementById('close-new-message-modal');
        const cancelNewMessageButton = document.getElementById('cancel-new-message-button');
        const sendNewMessageButton = document.getElementById('send-new-message-button');
        const shareDataModal = document.getElementById('share-data-modal');
        const closeShareDataModal = document.getElementById('close-share-data-modal');
        const cancelShareDataButton = document.getElementById('cancel-share-data-button');
        const saveShareDataButton = document.getElementById('save-share-data-button');

        // New message modal
        if (newMessageButton) {
            newMessageButton.addEventListener('click', () => {
                this.showNewMessageModal();
            });
        }

        if (closeNewMessageModal) {
            closeNewMessageModal.addEventListener('click', () => {
                this.hideNewMessageModal();
            });
        }

        if (cancelNewMessageButton) {
            cancelNewMessageButton.addEventListener('click', () => {
                this.hideNewMessageModal();
            });
        }

        if (sendNewMessageButton) {
            sendNewMessageButton.addEventListener('click', () => {
                this.handleSendNewMessage();
            });
        }

        // Close modal when clicking outside
        if (newMessageModal) {
            newMessageModal.addEventListener('click', (e) => {
                if (e.target === newMessageModal) {
                    this.hideNewMessageModal();
                }
            });
        }

        // Send message button
        if (sendMessageButton) {
            sendMessageButton.addEventListener('click', () => {
                this.handleSendMessage();
            });
        }

        // Enter key to send message
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }

        // Back to conversations button
        const backToConversationsButton = document.getElementById('back-to-conversations');
        if (backToConversationsButton) {
            backToConversationsButton.addEventListener('click', async () => {
                try {
                    await this.handleBackToConversations();
                } catch (error) {
                    console.error('[MessengerController] Error in handleBackToConversations:', error);
                }
            });
        }

        // Block user button in conversation
        const blockUserConversationBtn = document.getElementById('block-user-conversation-btn');
        if (blockUserConversationBtn) {
            blockUserConversationBtn.addEventListener('click', () => {
                const userId = blockUserConversationBtn.dataset.userId;
                const userEmail = blockUserConversationBtn.dataset.userEmail;
                if (userId) {
                    this.handleBlockUserFromConversation(userId, userEmail);
                }
            });
        }

        // Add friend button in conversation
        const addFriendConversationBtn = document.getElementById('add-friend-conversation-btn');
        if (addFriendConversationBtn) {
            addFriendConversationBtn.addEventListener('click', () => {
                const userId = addFriendConversationBtn.dataset.userId;
                const userEmail = addFriendConversationBtn.dataset.userEmail;
                if (userId) {
                    this.handleAddFriendFromConversation(userId, userEmail, addFriendConversationBtn);
                }
            });
        }

        // Share data button
        if (shareDataButton) {
            shareDataButton.addEventListener('click', () => {
                this.handleShareDataClick();
            });
        }

        // Share data modal
        if (closeShareDataModal) {
            closeShareDataModal.addEventListener('click', () => {
                this.hideShareDataModal();
            });
        }

        if (cancelShareDataButton) {
            cancelShareDataButton.addEventListener('click', () => {
                this.hideShareDataModal();
            });
        }

        if (saveShareDataButton) {
            saveShareDataButton.addEventListener('click', () => {
                this.handleSaveShareData();
            });
        }

        // Close share data modal when clicking outside
        if (shareDataModal) {
            shareDataModal.addEventListener('click', (e) => {
                if (e.target === shareDataModal) {
                    this.hideShareDataModal();
                }
            });
        }
    },

    /**
     * Load conversations for the current user
     * Prevents duplicate concurrent calls by reusing the same promise
     */
    async loadConversations() {
        console.log('[MessengerController] ========== LOAD CONVERSATIONS CALLED ==========');

        // If already loading, return the existing promise
        if (this.conversationsLoadPromise) {
            console.log('[MessengerController] loadConversations() - reusing existing promise');
            return this.conversationsLoadPromise;
        }

        // If currently loading, wait for it to complete
        if (this.isLoadingConversations) {
            console.log('[MessengerController] loadConversations() - waiting for existing load');
            while (this.isLoadingConversations && this.conversationsLoadPromise) {
                await this.conversationsLoadPromise;
            }
            return;
        }

        // Start loading
        console.log('[MessengerController] Starting fresh load of conversations...');
        this.isLoadingConversations = true;
        this.conversationsLoadPromise = (async () => {
            try {
                console.log('[MessengerController] Checking DatabaseService availability...');
                if (typeof window.DatabaseService === 'undefined') {
                    throw new Error('DatabaseService not available');
                }
                console.log('[MessengerController] ✓ DatabaseService available');

                console.log('[MessengerController] Calling DatabaseService.getConversations()...');
                const result = await window.DatabaseService.getConversations();
                console.log('[MessengerController] getConversations() result:', {
                    success: result.success,
                    hasConversations: !!result.conversations,
                    conversationCount: result.conversations?.length || 0,
                    error: result.error
                });

                if (result.success) {
                    this.conversations = result.conversations || [];
                    console.log('[MessengerController] Conversations stored, calling renderConversations()...');
                    this.renderConversations();
                    console.log('[MessengerController] ✓ renderConversations() completed');
                } else {
                    throw new Error(result.error || 'Failed to load conversations');
                }
            } catch (error) {
                console.error('[MessengerController] ✗ Error loading conversations:', error);
                console.error('[MessengerController] Error stack:', error.stack);
                const list = document.getElementById('conversations-list');
                if (list) {
                    list.innerHTML = `<p style="color: var(--danger-color);">Error loading conversations: ${error.message}</p>`;
                }
            } finally {
                // Clear loading state
                console.log('[MessengerController] Clearing loading state');
                this.isLoadingConversations = false;
                this.conversationsLoadPromise = null;
            }
        })();

        return this.conversationsLoadPromise;
    },

    /**
     * Render conversations list
     */
    renderConversations() {
        console.log('[MessengerController] ========== RENDER CONVERSATIONS CALLED ==========');
        console.log('[MessengerController] Conversation count:', this.conversations.length);
        console.log('[MessengerController] Conversations:', this.conversations.map(c => ({
            id: c.id,
            other_user_email: c.other_user_email,
            unread_count: c.unread_count
        })));

        const list = document.getElementById('conversations-list');
        if (!list) {
            console.error('[MessengerController] ✗ conversations-list element not found in DOM!');
            console.log('[MessengerController] Available elements with id:',
                Array.from(document.querySelectorAll('[id]')).map(el => el.id));
            return;
        }
        console.log('[MessengerController] ✓ conversations-list element found');

        if (this.conversations.length === 0) {
            console.log('[MessengerController] No conversations found, showing empty message');
            list.innerHTML = '<p>No conversations yet. Start a new conversation to begin messaging.</p>';
            return;
        }

        console.log('[MessengerController] Generating HTML for', this.conversations.length, 'conversations...');
        const conversationsHtml = this.conversations.map(conv => {
            const unreadBadge = conv.unread_count > 0
                ? `<span style="background: var(--primary-color); color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.75rem; margin-left: var(--spacing-xs);">${conv.unread_count}</span>`
                : '';
            const lastMessageDate = conv.last_message_at
                ? new Date(conv.last_message_at).toLocaleDateString()
                : '';

            return `
                <div class="conversation-item" data-conversation-id="${conv.id}" style="padding: var(--spacing-md); border: var(--border-width-standard) solid var(--border-color); border-radius: var(--border-radius); margin-bottom: var(--spacing-sm); cursor: pointer; background: ${conv.unread_count > 0 ? 'var(--hover-overlay)' : 'var(--surface-color)'};">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong>${conv.other_user_email}</strong>
                            ${unreadBadge}
                        </div>
                        <span style="font-size: 0.85rem; color: var(--text-color-secondary);">${lastMessageDate}</span>
                    </div>
                </div>
            `;
        });

        console.log('[MessengerController] Injecting HTML into conversations-list...');
        list.innerHTML = conversationsHtml.join('');
        console.log('[MessengerController] ✓ HTML injected');

        // Setup click listeners (clone and replace to remove old listeners)
        console.log('[MessengerController] Setting up click listeners...');
        const newList = list.cloneNode(true);
        list.parentNode.replaceChild(newList, list);

        // Attach listeners to the new list
        const conversationItems = newList.querySelectorAll('.conversation-item');
        console.log('[MessengerController] Found', conversationItems.length, 'conversation items');

        conversationItems.forEach(item => {
            item.addEventListener('click', () => {
                const conversationId = parseInt(item.dataset.conversationId, 10);
                console.log('[MessengerController] Conversation clicked:', conversationId);
                this.openConversation(conversationId);
            });
        });

        console.log('[MessengerController] ✓ Click listeners attached');
        console.log('[MessengerController] ========== RENDER CONVERSATIONS COMPLETE ==========');
    },

    /**
     * Handle back to conversations button click
     */
    async handleBackToConversations() {
        const conversationsList = document.getElementById('conversations-list');
        const messageThreadContainer = document.getElementById('message-thread-container');

        // Hide message thread, show conversations list
        if (conversationsList) {
            conversationsList.style.display = 'block';
        }
        if (messageThreadContainer) {
            messageThreadContainer.style.display = 'none';
        }

        // Clear current conversation ID
        this.currentConversationId = null;
        
        // Clear message input
        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.value = '';
        }

        // Hide share data button
        const shareDataButton = document.getElementById('share-data-button');
        if (shareDataButton) {
            shareDataButton.style.display = 'none';
        }

        // Reload conversations
        await this.loadConversations();

        // Update notification count in header
        if (typeof window.Header !== 'undefined') {
            window.Header.updateNotificationCount();
        }
    },

    /**
     * Open a conversation thread
     */
    async openConversation(conversationId) {
        console.log('[MessengerController] ========== OPEN CONVERSATION CALLED ==========');
        console.log('[MessengerController] Conversation ID:', conversationId, '(type:', typeof conversationId + ')');
        console.log('[MessengerController] Timestamp:', new Date().toISOString());

        // Guard: Prevent multiple simultaneous opens
        if (this.isOpeningConversation) {
            console.log('[MessengerController] Already opening a conversation, ignoring duplicate call');
            return;
        }

        // Guard: If already opening the same conversation, ignore
        if (this.openingConversationId === conversationId && this.currentConversationId === conversationId) {
            console.log('[MessengerController] Already viewing this conversation, ignoring');
            return;
        }

        this.isOpeningConversation = true;
        this.openingConversationId = conversationId;

        try {
            console.log('[MessengerController] Setting currentConversationId to:', conversationId);
            this.currentConversationId = conversationId;

            const conversationsList = document.getElementById('conversations-list');
            const messageThreadContainer = document.getElementById('message-thread-container');
            const messageThread = document.getElementById('message-thread');

            if (!messageThreadContainer || !messageThread) {
                return;
            }

            // Hide conversations list, show message thread
            if (conversationsList) conversationsList.style.display = 'none';
            messageThreadContainer.style.display = 'block';
            messageThread.innerHTML = '<p>Loading messages...</p>';

            // Show share data button
            const shareDataButton = document.getElementById('share-data-button');
            if (shareDataButton) {
                shareDataButton.style.display = 'inline-block';
            }

            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            // Find conversation to get partner info
            const conversation = this.conversations.find(c => c.id === conversationId);
            if (!conversation) {
                throw new Error('Conversation not found');
            }

            // Set partner name and show action buttons
            const partnerNameElement = document.getElementById('conversation-partner-name');
            const blockButton = document.getElementById('block-user-conversation-btn');
            const addFriendButton = document.getElementById('add-friend-conversation-btn');
            
            if (partnerNameElement) {
                partnerNameElement.textContent = conversation.other_user_email || 'Unknown User';
            }
            
            if (blockButton) {
                blockButton.style.display = 'inline-block';
                blockButton.dataset.userId = conversation.other_user_id;
                blockButton.dataset.userEmail = conversation.other_user_email || 'Unknown User';
            }
            
            // Start friend check in parallel (non-blocking)
            let friendCheckPromise = Promise.resolve();
            if (addFriendButton && conversation.other_user_id) {
                addFriendButton.style.display = 'inline-block';
                addFriendButton.dataset.userId = conversation.other_user_id;
                addFriendButton.dataset.userEmail = conversation.other_user_email || 'Unknown User';
                
                // Check if already a friend (non-blocking - will update button after messages load)
                friendCheckPromise = (async () => {
                    if (window.DatabaseService) {
                        try {
                            const isFriendResult = await window.DatabaseService.isFriend(conversation.other_user_id);
                            if (isFriendResult.success && isFriendResult.isFriend) {
                                addFriendButton.textContent = 'Remove from Friends';
                                addFriendButton.classList.remove('btn-action');
                                addFriendButton.classList.add('btn-secondary');
                            } else {
                                addFriendButton.textContent = 'Add to Friends';
                                addFriendButton.classList.remove('btn-secondary');
                                addFriendButton.classList.add('btn-action');
                            }
                        } catch (error) {
                            console.warn('[MessengerController] Error checking friend status:', error);
                        }
                    }
                })();
            }

            console.log('[MessengerController] ========== FETCHING MESSAGES ==========');
            console.log('[MessengerController] Fetching messages for conversation:', conversationId);
            console.log('[MessengerController] Calling DatabaseService.getMessages()...');

            const getMessagesStart = Date.now();
            const result = await window.DatabaseService.getMessages(conversationId);
            console.log('[MessengerController] getMessages() completed in', Date.now() - getMessagesStart, 'ms');

            if (result.success) {
                const messages = result.messages || [];
                console.log('[MessengerController] ✓ Messages loaded successfully');
                console.log('[MessengerController] Message count:', messages.length);

                // Log each message's decryption status
                messages.forEach((msg, i) => {
                    const isDecrypted = !msg.content.includes('[ERROR:');
                    console.log(`[MessengerController] Message ${i + 1}/${messages.length}:`, {
                        id: msg.id,
                        sender: msg.sender_email,
                        decrypted: isDecrypted,
                        contentPreview: msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '')
                    });
                });

                // Render messages immediately - don't wait for share message creation
                console.log('[MessengerController] Rendering message thread...');
                await this.renderMessageThread(messages);
                console.log('[MessengerController] ✓ Message thread rendered');
                
                // Create messages for shares in background (non-blocking)
                // This will update the conversation if new share messages are created
                this.createMessagesForShares(conversationId, conversation, messages).then(sharesCreated => {
                    if (sharesCreated > 0) {
                        // Reload and re-render if new messages were created
                        window.DatabaseService.getMessages(conversationId).then(updatedResult => {
                            if (updatedResult.success && updatedResult.messages) {
                                this.renderMessageThread(updatedResult.messages);
                            }
                        }).catch(error => {
                            if (this.enableVerboseLogging) {
                                console.warn('[MessengerController] Error reloading messages after share creation:', error);
                            }
                        });
                    }
                }).catch(error => {
                    if (this.enableVerboseLogging) {
                        console.warn('[MessengerController] Error creating share messages:', error);
                    }
                });

                // Do all the read/update operations in parallel (non-blocking for UI)
                Promise.all([
                    // Mark conversation as read
                    (async () => {
                        try {
                            if (this.enableVerboseLogging) {
                                console.log('[MessengerController] Marking conversation as read:', conversationId);
                            }
                            await window.DatabaseService.markConversationAsRead(conversationId);
                        } catch (error) {
                            console.warn('[MessengerController] Error marking conversation as read:', error);
                        }
                    })(),
                    // Mark related notifications as read
                    (async () => {
                        try {
                            if (typeof window.NotificationService !== 'undefined' && typeof window.DatabaseService !== 'undefined') {
                                const currentUserId = await window.DatabaseService._getCurrentUserId();
                                if (currentUserId) {
                                    const otherUserId = conversation.other_user_id;
                                    await window.NotificationService.markConversationNotificationsAsRead(currentUserId, conversationId, otherUserId);
                                }
                            }
                        } catch (error) {
                            console.warn('[MessengerController] Error marking notifications as read:', error);
                        }
                    })(),
                    // Update friend button (already started)
                    friendCheckPromise
                ]).catch(error => {
                    console.warn('[MessengerController] Error in parallel operations:', error);
                });
                
                // Reload conversations to update unread counts
                this.loadConversations().then(() => {
                    // Update notification count in header after refresh
                    if (typeof window.Header !== 'undefined') {
                        window.Header.updateNotificationCount();
                    }
                }).catch(error => {
                    if (this.enableVerboseLogging) {
                        console.warn('[MessengerController] Error refreshing conversations:', error);
                    }
                });
            } else {
                console.error('[MessengerController] Failed to load messages:', result.error);
                throw new Error(result.error || 'Failed to load messages');
            }
        } catch (error) {
            console.error('[MessengerController] Error opening conversation:', error);
            const messageThread = document.getElementById('message-thread');
            if (messageThread) {
                messageThread.innerHTML = `<p style="color: var(--danger-color);">Error loading messages: ${error.message}</p>`;
            }
        } finally {
            // Clear opening guard
            this.isOpeningConversation = false;
            this.openingConversationId = null;
        }
    },

    /**
     * Create messages for shares that don't have messages yet
     * This includes all shares (pending, accepted, declined) to show full history
     */
    async createMessagesForShares(conversationId, conversation, existingMessages) {
        if (this.enableVerboseLogging) {
            console.log('[MessengerController] createMessagesForShares() started', { conversationId, messageCount: existingMessages.length });
        }
        
        try {
            if (typeof window.DatabaseService === 'undefined') {
                console.warn('[MessengerController] DatabaseService not available');
                return 0;
            }

            const currentUserId = await window.DatabaseService._getCurrentUserId();
            if (!currentUserId) {
                console.warn('[MessengerController] Current user ID not available');
                return 0;
            }

            const otherUserId = conversation.other_user_id;
            if (!otherUserId) {
                console.warn('[MessengerController] No other_user_id in conversation');
                return 0;
            }

            // Find all shares between current user and other user (regardless of status)
            // This includes shares that might not have conversation_id set yet
            const tableName = window.DatabaseService._getTableName('dataShares');
            
            // Run all three queries in parallel for better performance
            const [sharesResult1, sharesResult2, sharesResult3] = await Promise.all([
                // Query for shares with conversation_id matching (all statuses)
                window.DatabaseService.querySelect(tableName, {
                    filter: {
                        conversation_id: conversationId
                    }
                }),
                // Query for shares where current user is owner and other user is recipient (without conversation_id)
                window.DatabaseService.querySelect(tableName, {
                    filter: {
                        owner_user_id: currentUserId,
                        shared_with_user_id: otherUserId
                    }
                }),
                // Query for shares where other user is owner and current user is recipient (without conversation_id)
                window.DatabaseService.querySelect(tableName, {
                    filter: {
                        owner_user_id: otherUserId,
                        shared_with_user_id: currentUserId
                    }
                })
            ]);

            // Combine results and filter for shares without conversation_id (to avoid duplicates)
            let allRawShares = [];
            if (sharesResult1.data && !sharesResult1.error) {
                allRawShares = [...allRawShares, ...sharesResult1.data];
            }
            if (sharesResult2.data && !sharesResult2.error) {
                // Only include shares that don't have conversation_id (to avoid duplicates with sharesResult1)
                const sharesWithoutConversationId = sharesResult2.data.filter(share => 
                    !share.conversation_id || share.conversation_id === null
                );
                allRawShares = [...allRawShares, ...sharesWithoutConversationId];
            }
            if (sharesResult3.data && !sharesResult3.error) {
                // Only include shares that don't have conversation_id (to avoid duplicates with sharesResult1)
                const sharesWithoutConversationId = sharesResult3.data.filter(share => 
                    !share.conversation_id || share.conversation_id === null
                );
                allRawShares = [...allRawShares, ...sharesWithoutConversationId];
            }

            // Remove duplicates based on share.id
            const uniqueShares = [];
            const seenIds = new Set();
            for (const share of allRawShares) {
                if (!seenIds.has(share.id)) {
                    seenIds.add(share.id);
                    uniqueShares.push(share);
                }
            }

            const allShares = uniqueShares;

            // Update shares that don't have conversation_id set (in parallel)
            const sharesToUpdate = allShares.filter(share => !share.conversation_id || share.conversation_id === null);
            if (sharesToUpdate.length > 0) {
                await Promise.all(sharesToUpdate.map(async (share) => {
                    try {
                        const updateResult = await window.DatabaseService.queryUpdate(tableName, share.id, {
                            conversation_id: conversationId
                        });
                        if (updateResult.success || !updateResult.error) {
                            share.conversation_id = conversationId;
                        }
                    } catch (error) {
                        if (this.enableVerboseLogging) {
                            console.warn('[MessengerController] Error updating share conversation_id:', share.id, error);
                        }
                    }
                }));
            }

            // Check which shares already have messages
            const existingShareIds = new Set();
            existingMessages.forEach(msg => {
                if (msg.content && msg.content.startsWith('📤 Share Request')) {
                    const shareIdMatch = msg.content.match(/Share ID: (\d+)/);
                    if (shareIdMatch) {
                        const shareId = parseInt(shareIdMatch[1], 10);
                        existingShareIds.add(shareId);
                    }
                }
            });

            // Create messages for shares that don't have messages yet (regardless of status)
            // Process in parallel for better performance
            const sharesToCreateMessages = allShares.filter(share => !existingShareIds.has(share.id));
            const messagePromises = sharesToCreateMessages.map(async (share) => {
                try {
                    // Parse shared_months
                    let parsedSharedMonths = [];
                    if (share.shared_months) {
                        if (typeof share.shared_months === 'string') {
                            try {
                                parsedSharedMonths = JSON.parse(share.shared_months);
                            } catch (e) {
                                if (this.enableVerboseLogging) {
                                    console.warn('[MessengerController] Error parsing shared_months:', e);
                                }
                            }
                        } else {
                            parsedSharedMonths = share.shared_months;
                        }
                    }
                    
                    // Format share details for the message
                    const monthsList = parsedSharedMonths.map(m => {
                        if (m.type === 'range') {
                            return `${m.startMonth}/${m.startYear} - ${m.endMonth}/${m.endYear}`;
                        } else {
                            return `${m.month}/${m.year}`;
                        }
                    }).join(', ') || (share.share_all_data ? 'All months' : 'None');
                    
                    // Include status in message if not pending
                    const statusText = share.status !== 'pending' ? `\nStatus: ${share.status.charAt(0).toUpperCase() + share.status.slice(1)}` : '';
                    
                    const shareMessageContent = `📤 Share Request\n\n` +
                        `Access Level: ${share.access_level}\n` +
                        `Months: ${monthsList}\n` +
                        `${(share.shared_pots || share.share_all_data) ? 'Pots: Yes\n' : ''}` +
                        `${(share.shared_settings || share.share_all_data) ? 'Settings: Yes\n' : ''}` +
                        `${statusText}\n` +
                        `\nShare ID: ${share.id}`;
                    
                    // Determine sender and recipient
                    const senderId = share.owner_user_id;
                    const recipientId = share.shared_with_user_id;
                    
                    if (typeof window.MessagingService !== 'undefined') {
                        const messageResult = await window.MessagingService.sendMessage(
                            conversationId,
                            senderId,
                            recipientId,
                            shareMessageContent
                        );
                        
                        return messageResult.success ? 1 : 0;
                    }
                    return 0;
                } catch (error) {
                    if (this.enableVerboseLogging) {
                        console.error('[MessengerController] Error creating message for share:', share.id, error);
                    }
                    return 0;
                }
            });
            
            const results = await Promise.all(messagePromises);
            const messagesCreated = results.reduce((sum, count) => sum + count, 0);
            const messagesSkipped = allShares.length - sharesToCreateMessages.length;
            
            if (this.enableVerboseLogging && messagesCreated > 0) {
                console.log('[MessengerController] createMessagesForShares complete:', { created: messagesCreated, skipped: messagesSkipped });
            }
            return messagesCreated;
        } catch (error) {
            console.error('[MessengerController] ========== ERROR in createMessagesForShares() ==========');
            console.error('[MessengerController] Error:', error);
            console.error('[MessengerController] Error stack:', error.stack);
            return 0;
        }
    },

    /**
     * Batch fetch share details for multiple share IDs
     */
    async batchFetchShareDetails(shareIds) {
        const uniqueShareIds = [...new Set(shareIds.filter(id => id !== null && id !== undefined))];
        const uncachedShareIds = uniqueShareIds.filter(id => !this.shareCache.has(id));
        
        if (uncachedShareIds.length === 0) {
            return; // All shares already cached
        }

        if (typeof window.DatabaseService === 'undefined') {
            return;
        }

        const tableName = window.DatabaseService._getTableName('dataShares');
        
        // Fetch all uncached shares in parallel
        const sharePromises = uncachedShareIds.map(async (shareId) => {
            try {
                const shareResult = await window.DatabaseService.querySelect(tableName, {
                    filter: { id: shareId },
                    limit: 1
                });
                
                if (shareResult.data && shareResult.data.length > 0 && !shareResult.error) {
                    this.shareCache.set(shareId, shareResult.data[0]);
                } else {
                    this.shareCache.set(shareId, null);
                }
            } catch (error) {
                this.shareCache.set(shareId, null);
            }
        });

        await Promise.all(sharePromises);
    },

    /**
     * Get share from cache
     */
    getShareFromCache(shareId) {
        if (!shareId) return null;
        return this.shareCache.get(shareId) || null;
    },

    /**
     * Batch fetch user emails for multiple user IDs
     */
    async batchFetchUserEmails(userIds) {
        const uniqueUserIds = [...new Set(userIds.filter(id => id))];
        const uncachedUserIds = uniqueUserIds.filter(id => !this.emailCache.has(id));
        
        if (uncachedUserIds.length === 0) {
            return; // All emails already cached
        }

        // Fetch all uncached emails in parallel
        const emailPromises = uncachedUserIds.map(async (userId) => {
            try {
                if (typeof window.DatabaseService !== 'undefined') {
                    const emailResult = await window.DatabaseService.getUserEmailById(userId);
                    if (emailResult.success && emailResult.email) {
                        this.emailCache.set(userId, emailResult.email);
                    } else {
                        this.emailCache.set(userId, 'Unknown User');
                    }
                }
            } catch (error) {
                this.emailCache.set(userId, 'Unknown User');
            }
        });

        await Promise.all(emailPromises);
    },

    /**
     * Get user email from cache or return default
     */
    getUserEmail(userId) {
        if (!userId) return 'Unknown User';
        return this.emailCache.get(userId) || 'Unknown User';
    },

    /**
     * Render message thread with messages (including share request messages)
     */
    async renderMessageThread(messages) {
        if (this.enableVerboseLogging) {
            console.log('[MessengerController] renderMessageThread() called', { messageCount: messages.length });
        }
        
        const messageThread = document.getElementById('message-thread');
        if (!messageThread) {
            console.warn('[MessengerController] message-thread element not found');
            return;
        }

        const currentUserId = await window.DatabaseService?._getCurrentUserId?.() || null;
        
        // Reverse messages to show oldest first
        const sortedMessages = [...messages].reverse();

        // Identify all share request messages and batch fetch their share details
        const shareIds = [];
        sortedMessages.forEach(msg => {
            if (msg.content && msg.content.startsWith('📤 Share Request')) {
                const shareIdMatch = msg.content.match(/Share ID: (\d+)/);
                if (shareIdMatch) {
                    shareIds.push(parseInt(shareIdMatch[1], 10));
                }
            }
        });

        // Batch fetch all share details before rendering
        if (shareIds.length > 0) {
            await this.batchFetchShareDetails(shareIds);
        }

        // Batch fetch all sender emails
        const senderIds = [...new Set(sortedMessages.map(m => m.sender_id).filter(id => id))];
        await this.batchFetchUserEmails(senderIds);

        // Render messages
        let shareRequestMessageCount = 0;
        let regularMessageCount = 0;
        
        const itemsHtmlPromises = sortedMessages.map(async (msg, index) => {
            const isOwnMessage = msg.sender_id === currentUserId;
            const alignClass = isOwnMessage ? 'right' : 'left';
            const date = new Date(msg.created_at);
            const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Check if this is a share request message (starts with "📤 Share Request")
            const isShareRequest = msg.content && msg.content.startsWith('📤 Share Request');
            
            if (isShareRequest) {
                shareRequestMessageCount++;
                
                // Parse share ID from message content
                const shareIdMatch = msg.content.match(/Share ID: (\d+)/);
                const shareId = shareIdMatch ? parseInt(shareIdMatch[1], 10) : null;
                
                let share = null;
                let actionButtons = '';
                
                if (shareId) {
                    // Get share from cache (already fetched in batch)
                    share = this.getShareFromCache(shareId);
                    
                    if (share) {
                        // Parse shared_months if it's a string
                        if (typeof share.shared_months === 'string') {
                            try {
                                share.shared_months = JSON.parse(share.shared_months);
                            } catch (e) {
                                if (this.enableVerboseLogging) {
                                    console.warn('[MessengerController] Error parsing shared_months:', e);
                                }
                                share.shared_months = [];
                            }
                        }
                        
                        // Show action buttons if share is pending and current user is recipient
                        if (share.status === 'pending' && share.shared_with_user_id === currentUserId) {
                            actionButtons = `
                                <div style="margin-top: var(--spacing-sm); display: flex; gap: var(--spacing-xs); flex-wrap: wrap; max-width: 100%;">
                                    <button class="btn btn-sm btn-primary accept-share-conversation-btn" data-share-id="${share.id}" style="flex: 0 1 auto; min-width: 0; max-width: 100%;">Accept</button>
                                    <button class="btn btn-sm btn-secondary decline-share-conversation-btn" data-share-id="${share.id}" style="flex: 0 1 auto; min-width: 0; max-width: 100%;">Decline</button>
                                    <button class="btn btn-sm btn-danger block-user-conversation-share-btn" data-user-id="${share.owner_user_id}" style="flex: 0 1 auto; min-width: 0; max-width: 100%;">Block</button>
                                </div>
                            `;
                        } else if (share.status !== 'pending') {
                            // Show status for non-pending shares
                            const statusText = share.status === 'accepted' ? 'Accepted' : share.status === 'declined' ? 'Declined' : share.status;
                            actionButtons = `<div style="margin-top: var(--spacing-sm); color: var(--text-color-secondary);"><strong>Status:</strong> ${statusText}</div>`;
                        }
                    }
                }
                
                // Render share request as a special message
                const shareRequestHtml = `
                    <div class="message-item share-request-message ${alignClass}" style="margin-bottom: var(--spacing-md); text-align: ${alignClass};">
                        <div style="display: inline-block; max-width: 80%; padding: var(--spacing-md); background: ${isOwnMessage ? 'var(--primary-color)' : 'var(--hover-overlay)'}; border: 2px solid ${isOwnMessage ? 'rgba(255,255,255,0.3)' : 'var(--primary-color)'}; border-radius: var(--border-radius); color: ${isOwnMessage ? 'white' : 'var(--text-color)'};">
                            <div style="white-space: pre-line; font-size: 0.9rem;">${msg.content.replace(/Share ID: \d+/, '').trim()}</div>
                            ${actionButtons}
                            <div style="font-size: 0.75rem; margin-top: var(--spacing-sm); opacity: 0.7;">${dateString}</div>
                        </div>
                    </div>
                `;
                return shareRequestHtml;
            } else {
                // Regular message - use cached email
                regularMessageCount++;
                const senderEmail = this.getUserEmail(msg.sender_id);

                // Build debug info HTML if debug mode is enabled
                let debugInfoHtml = '';
                if (window.ENCRYPTION_DEBUG_MODE && msg._debugInfo) {
                    const debug = msg._debugInfo;
                    const statusColor = debug.decryptSuccess ? '#4CAF50' : '#F44336';
                    const statusIcon = debug.decryptSuccess ? '✓' : '✗';
                    debugInfoHtml = `
                        <div class="message-debug-info" style="font-size: 0.7rem; margin-top: var(--spacing-sm); padding: var(--spacing-xs); background: rgba(0,0,0,0.15); border-radius: 4px; font-family: monospace;">
                            <div style="color: ${statusColor}; font-weight: bold;">${statusIcon} Decryption: ${debug.decryptSuccess ? 'Success' : 'Failed'}</div>
                            ${debug.decryptError ? `<div style="color: #F44336;">Error: ${debug.decryptError}</div>` : ''}
                            <div>Epoch: ${debug.epoch}</div>
                            <div>Counter: ${debug.counter !== undefined ? debug.counter : 'N/A'}</div>
                            <div>Message ID: ${debug.messageId}</div>
                            <div>Ciphertext: ${debug.ciphertextLength} chars</div>
                            <div>Nonce: ${debug.nonceLength} chars</div>
                        </div>
                    `;
                }

                return `
                    <div class="message-item ${alignClass}" style="margin-bottom: var(--spacing-md); text-align: ${alignClass};">
                        <div style="display: inline-block; max-width: 70%; padding: var(--spacing-sm) var(--spacing-md); background: ${isOwnMessage ? 'var(--primary-color)' : 'var(--surface-color)'}; color: ${isOwnMessage ? 'white' : 'var(--text-color)'}; border-radius: var(--border-radius);">
                            <div style="font-size: 0.85rem; margin-bottom: var(--spacing-xs); opacity: 0.8;">${senderEmail}</div>
                            <div style="white-space: pre-line;">${msg.content}</div>
                            <div style="font-size: 0.75rem; margin-top: var(--spacing-xs); opacity: 0.7;">${dateString}</div>
                            ${debugInfoHtml}
                        </div>
                    </div>
                `;
            }
        });
        
        const itemsHtml = await Promise.all(itemsHtmlPromises);
        messageThread.innerHTML = itemsHtml.join('');
        messageThread.scrollTop = messageThread.scrollHeight;
        
        // Setup event listeners for share action buttons
        this.setupShareRequestListeners();
    },

    /**
     * Setup event listeners for share request buttons in conversation view
     */
    setupShareRequestListeners() {
        const messageThread = document.getElementById('message-thread');
        if (!messageThread) {
            return;
        }

        messageThread.addEventListener('click', async (e) => {
            if (e.target.classList.contains('accept-share-conversation-btn')) {
                e.stopPropagation();
                const shareId = parseInt(e.target.dataset.shareId, 10);
                if (shareId) {
                    await this.handleAcceptShare(shareId);
                    // Refresh conversation to show updated share status
                    if (this.currentConversationId) {
                        await this.openConversation(this.currentConversationId);
                    }
                }
            }

            if (e.target.classList.contains('decline-share-conversation-btn')) {
                e.stopPropagation();
                const shareId = parseInt(e.target.dataset.shareId, 10);
                if (shareId) {
                    await this.handleDeclineShare(shareId);
                    // Refresh conversation to show updated share status
                    if (this.currentConversationId) {
                        await this.openConversation(this.currentConversationId);
                    }
                }
            }

            if (e.target.classList.contains('block-user-conversation-share-btn')) {
                e.stopPropagation();
                const userId = e.target.dataset.userId;
                if (userId) {
                    await this.handleBlockUser(userId);
                    // Refresh conversation
                    if (this.currentConversationId) {
                        await this.openConversation(this.currentConversationId);
                    }
                }
            }
        });
    },

    /**
     * Handle accept share
     */
    async handleAcceptShare(shareId, notificationId) {
        console.log('[MessengerController] handleAcceptShare() called', { shareId, notificationId });

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.updateShareStatus(shareId, 'accepted');

            if (result.success) {
                // Mark all notifications for this share as read
                if (typeof window.NotificationService !== 'undefined' && typeof window.DatabaseService !== 'undefined') {
                    const currentUserId = await window.DatabaseService._getCurrentUserId();
                    if (currentUserId) {
                        console.log('[MessengerController] Marking share notifications as read:', shareId);
                        const markReadResult = await window.NotificationService.markShareNotificationsAsRead(currentUserId, shareId);
                        console.log('[MessengerController] Share notifications marked as read:', markReadResult);
                    }
                    
                    // Also try to delete the specific notification if provided
                    if (notificationId) {
                        const deleteResult = await window.NotificationService.deleteNotification(notificationId);
                        if (!deleteResult.success) {
                            console.warn('[MessengerController] Failed to delete notification after accepting share:', deleteResult.error);
                        }
                    }
                }
                
                // Update notification count in header
                if (typeof window.Header !== 'undefined') {
                    window.Header.updateNotificationCount();
                }
                
                alert('Share accepted successfully');
            } else {
                throw new Error(result.error || 'Failed to accept share');
            }
        } catch (error) {
            console.error('[MessengerController] Error accepting share:', error);
            alert('Error accepting share: ' + error.message);
        }
    },

    /**
     * Handle decline share
     */
    async handleDeclineShare(shareId, notificationId) {
        console.log('[MessengerController] handleDeclineShare() called', { shareId, notificationId });

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            // First, check the current share status to prevent invalid transitions
            const tableName = window.DatabaseService._getTableName('dataShares');
            const shareResult = await window.DatabaseService.querySelect(tableName, {
                filter: { id: shareId },
                limit: 1
            });

            if (shareResult.error || !shareResult.data || shareResult.data.length === 0) {
                throw new Error('Share not found');
            }

            const share = shareResult.data[0];
            console.log('[MessengerController] Current share status:', share.status);

            // Check if share is already declined
            if (share.status === 'declined') {
                alert('This share has already been declined. You can only re-accept it.');
                return;
            }

            // Check if share is blocked
            if (share.status === 'blocked') {
                alert('This share has been blocked and cannot be updated.');
                return;
            }

            const result = await window.DatabaseService.updateShareStatus(shareId, 'declined');

            if (result.success) {
                // Mark all notifications for this share as read
                if (typeof window.NotificationService !== 'undefined' && typeof window.DatabaseService !== 'undefined') {
                    const currentUserId = await window.DatabaseService._getCurrentUserId();
                    if (currentUserId) {
                        console.log('[MessengerController] Marking share notifications as read:', shareId);
                        const markReadResult = await window.NotificationService.markShareNotificationsAsRead(currentUserId, shareId);
                        console.log('[MessengerController] Share notifications marked as read:', markReadResult);
                    }
                    
                    // Also try to delete the specific notification if provided
                    if (notificationId) {
                        const deleteResult = await window.NotificationService.deleteNotification(notificationId);
                        if (!deleteResult.success) {
                            console.warn('[MessengerController] Failed to delete notification after declining share:', deleteResult.error);
                        }
                    }
                }
                
                // Update notification count in header
                if (typeof window.Header !== 'undefined') {
                    window.Header.updateNotificationCount();
                }
                
                alert('Share declined');
            } else {
                // Handle specific error messages
                const errorMessage = result.error || 'Failed to decline share';
                if (errorMessage.includes('Declined shares can only be re-accepted')) {
                    alert('This share has already been declined. You can only re-accept it.');
                } else if (errorMessage.includes('Cannot update blocked shares')) {
                    alert('This share has been blocked and cannot be updated.');
                } else {
                    throw new Error(errorMessage);
                }
            }
        } catch (error) {
            console.error('[MessengerController] Error declining share:', error);
            const errorMessage = error.message || 'Unknown error';
            if (errorMessage.includes('Declined shares can only be re-accepted')) {
                alert('This share has already been declined. You can only re-accept it.');
            } else {
                alert('Error declining share: ' + errorMessage);
            }
        }
    },

    /**
     * Handle block user
     */
    async handleBlockUser(userId) {
        console.log('[MessengerController] handleBlockUser() called', { userId });

        if (!confirm('Are you sure you want to block this user? This will decline all pending shares from them.')) {
            return;
        }

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.blockUser(userId);

            if (result.success) {
                alert('User blocked successfully');
                // Go back to conversations list and refresh
                await this.handleBackToConversations();
            } else {
                throw new Error(result.error || 'Failed to block user');
            }
        } catch (error) {
            console.error('[MessengerController] Error blocking user:', error);
            alert('Error blocking user: ' + error.message);
        }
    },

    /**
     * Handle add/remove friend from conversation view
     */
    async handleAddFriendFromConversation(userId, userEmail, buttonElement) {
        console.log('[MessengerController] handleAddFriendFromConversation() called', { userId, userEmail });

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            // Check if already a friend
            const isFriendResult = await window.DatabaseService.isFriend(userId);
            if (!isFriendResult.success) {
                throw new Error(isFriendResult.error || 'Failed to check friend status');
            }

            if (isFriendResult.isFriend) {
                // Remove from friends
                if (!confirm(`Remove ${userEmail || 'this user'} from your friends list?`)) {
                    return;
                }

                const result = await window.DatabaseService.removeFriend(userId);
                if (result.success) {
                    buttonElement.textContent = 'Add to Friends';
                    buttonElement.classList.remove('btn-secondary');
                    buttonElement.classList.add('btn-action');
                    alert('Removed from friends list');
                } else {
                    throw new Error(result.error || 'Failed to remove friend');
                }
            } else {
                // Add to friends
                const result = await window.DatabaseService.addFriend(userId);
                if (result.success) {
                    buttonElement.textContent = 'Remove from Friends';
                    buttonElement.classList.remove('btn-action');
                    buttonElement.classList.add('btn-secondary');
                    alert('Added to friends list');
                } else {
                    throw new Error(result.error || 'Failed to add friend');
                }
            }
        } catch (error) {
            console.error('[MessengerController] Error handling add friend from conversation:', error);
            alert('Error: ' + error.message);
        }
    },

    /**
     * Handle block user from conversation view
     */
    async handleBlockUserFromConversation(userId, userEmail) {
        console.log('[MessengerController] handleBlockUserFromConversation() called', { userId, userEmail });

        if (!confirm(`Are you sure you want to block ${userEmail || 'this user'}? This will decline all pending shares from them and prevent them from messaging you.`)) {
            return;
        }

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.blockUser(userId);

            if (result.success) {
                alert('User blocked successfully');
                // Go back to conversations list and refresh
                await this.handleBackToConversations();
            } else {
                throw new Error(result.error || 'Failed to block user');
            }
        } catch (error) {
            console.error('[MessengerController] Error blocking user from conversation:', error);
            alert('Error blocking user: ' + error.message);
        }
    },

    /**
     * Handle sending a message
     */
    async handleSendMessage() {
        console.log('[MessengerController] handleSendMessage() called', { 
            conversationId: this.currentConversationId 
        });
        const messageInput = document.getElementById('message-input');
        if (!messageInput || !this.currentConversationId) {
            console.warn('[MessengerController] Cannot send message:', { 
                hasInput: !!messageInput, 
                hasConversationId: !!this.currentConversationId 
            });
            return;
        }

        const content = messageInput.value.trim();
        if (!content) {
            console.warn('[MessengerController] Message content is empty');
            return;
        }
        console.log('[MessengerController] Sending message:', { 
            conversationId: this.currentConversationId,
            contentLength: content.length,
            contentPreview: content.substring(0, 50)
        });

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            // Get conversation to find recipient
            const conversation = this.conversations.find(c => c.id === this.currentConversationId);
            if (!conversation) {
                throw new Error('Conversation not found');
            }

            const currentUserId = await window.DatabaseService._getCurrentUserId();
            if (!currentUserId) {
                throw new Error('User not authenticated');
            }

            // Use MessagingService directly
            if (typeof window.MessagingService === 'undefined') {
                throw new Error('MessagingService not available');
            }

            const result = await window.MessagingService.sendMessage(
                this.currentConversationId,
                currentUserId,
                conversation.other_user_id,
                content
            );

            if (result.success && result.message) {
                // SECURITY: Verify the message was actually encrypted before displaying
                // This provides defense-in-depth against encryption failures
                const msg = result.message;
                if (!msg.is_encrypted || !msg.encrypted_content || msg.content) {
                    console.error('[MessengerController] SECURITY: Message encryption verification failed!', {
                        is_encrypted: msg.is_encrypted,
                        hasEncryptedContent: !!msg.encrypted_content,
                        hasPlaintextContent: !!msg.content
                    });
                    throw new Error('Message encryption verification failed - message may not be secure');
                }

                console.log('[MessengerController] ✓ Message encryption verified:', {
                    is_encrypted: msg.is_encrypted,
                    ciphertextLength: msg.encrypted_content?.length,
                    counter: msg.message_counter
                });

                messageInput.value = '';

                // Append the new message to the thread without reloading everything
                // Use original plaintext content for sender's view (result.message contains only ciphertext)
                const messageForDisplay = {
                    ...result.message,
                    content: content  // Use plaintext for display only (never stored/transmitted)
                };
                await this.appendMessageToThread(messageForDisplay, conversation);
            } else {
                throw new Error(result.error || 'Failed to send message');
            }
        } catch (error) {
            console.error('[MessengerController] Error sending message:', error);
            alert(`Error sending message: ${error.message}`);
        }
    },

    /**
     * Append a single message to the thread without reloading everything
     */
    async appendMessageToThread(message, conversation) {
        console.log('[MessengerController] appendMessageToThread() called', { 
            messageId: message.id, 
            conversationId: conversation.id 
        });

        try {
            const messageThread = document.getElementById('message-thread');
            if (!messageThread) {
                console.warn('[MessengerController] Message thread container not found, falling back to reload');
                await this.openConversation(this.currentConversationId);
                return;
            }

            const currentUserId = await window.DatabaseService._getCurrentUserId();
            if (!currentUserId) {
                console.warn('[MessengerController] User not authenticated, falling back to reload');
                await this.openConversation(this.currentConversationId);
                return;
            }

            // Get sender email - if it's our message, use current user email, otherwise use conversation partner email
            const isOwnMessage = message.sender_id === currentUserId;
            let senderEmail = 'Unknown';
            
            if (isOwnMessage) {
                // Get current user email
                const currentUser = await window.AuthService.getCurrentUser();
                senderEmail = currentUser?.email || 'You';
            } else {
                // Use conversation partner email
                senderEmail = conversation.other_user_email || 'Unknown';
            }

            const alignClass = isOwnMessage ? 'right' : 'left';

            // Format date
            const date = new Date(message.created_at);
            const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Build debug info HTML if debug mode is enabled
            let debugInfoHtml = '';
            if (window.ENCRYPTION_DEBUG_MODE && message._debugInfo) {
                const debug = message._debugInfo;
                const statusColor = debug.decryptSuccess ? '#4CAF50' : '#F44336';
                const statusIcon = debug.decryptSuccess ? '✓' : '✗';
                const typeLabel = debug.isSentMessage ? ' (Sent)' : '';
                debugInfoHtml = `
                    <div class="message-debug-info" style="font-size: 0.7rem; margin-top: var(--spacing-sm); padding: var(--spacing-xs); background: rgba(0,0,0,0.15); border-radius: 4px; font-family: monospace;">
                        <div style="color: ${statusColor}; font-weight: bold;">${statusIcon} Encryption${typeLabel}: ${debug.decryptSuccess ? 'Success' : 'Failed'}</div>
                        ${debug.decryptError ? `<div style="color: #F44336;">Error: ${debug.decryptError}</div>` : ''}
                        <div>Epoch: ${debug.epoch}</div>
                        <div>Counter: ${debug.counter !== undefined ? debug.counter : 'N/A'}</div>
                        <div>Message ID: ${debug.messageId}</div>
                        <div>Ciphertext: ${debug.ciphertextLength} chars</div>
                        <div>Nonce: ${debug.nonceLength} chars</div>
                    </div>
                `;
            }

            // Generate HTML for the new message (regular message only, not share requests)
            const messageHtml = `
                <div class="message-item ${alignClass}" style="margin-bottom: var(--spacing-md); text-align: ${alignClass};">
                    <div style="display: inline-block; max-width: 70%; padding: var(--spacing-sm) var(--spacing-md); background: ${isOwnMessage ? 'var(--primary-color)' : 'var(--surface-color)'}; color: ${isOwnMessage ? 'white' : 'var(--text-color)'}; border-radius: var(--border-radius);">
                        <div style="font-size: 0.85rem; margin-bottom: var(--spacing-xs); opacity: 0.8;">${senderEmail}</div>
                        <div style="white-space: pre-line;">${message.content}</div>
                        <div style="font-size: 0.75rem; margin-top: var(--spacing-xs); opacity: 0.7;">${dateString}</div>
                        ${debugInfoHtml}
                    </div>
                </div>
            `;

            // Append to thread
            messageThread.insertAdjacentHTML('beforeend', messageHtml);
            
            // Scroll to bottom
            messageThread.scrollTop = messageThread.scrollHeight;
            
            console.log('[MessengerController] Message appended to thread successfully');
        } catch (error) {
            console.error('[MessengerController] Error appending message to thread:', error);
            // Fall back to full reload on error
            await this.openConversation(this.currentConversationId);
        }
    },

    /**
     * Show new message modal
     */
    showNewMessageModal() {
        console.log('[MessengerController] showNewMessageModal() called');
        const modal = document.getElementById('new-message-modal');
        const recipientInput = document.getElementById('recipient-email-input');
        const messageInput = document.getElementById('new-message-content');
        
        if (modal) {
            modal.style.display = 'flex';
            // Clear form
            if (recipientInput) recipientInput.value = '';
            if (messageInput) messageInput.value = '';
            // Focus on recipient input
            if (recipientInput) {
                setTimeout(() => recipientInput.focus(), 100);
            }
        }
    },

    /**
     * Hide new message modal
     */
    hideNewMessageModal() {
        console.log('[MessengerController] hideNewMessageModal() called');
        const modal = document.getElementById('new-message-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    /**
     * Handle sending a new message from the modal
     */
    async handleSendNewMessage() {
        console.log('[MessengerController] handleSendNewMessage() called');
        const recipientEmailInput = document.getElementById('recipient-email-input');
        const messageContentInput = document.getElementById('new-message-content');
        
        if (!recipientEmailInput || !messageContentInput) {
            alert('Message form not found');
            return;
        }

        const recipientEmail = recipientEmailInput.value.trim();
        const messageContent = messageContentInput.value.trim();

        if (!recipientEmail) {
            alert('Please enter a recipient email address');
            recipientEmailInput.focus();
            return;
        }

        if (!messageContent) {
            alert('Please enter a message');
            messageContentInput.focus();
            return;
        }

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            console.log('[MessengerController] Sending new message:', { recipientEmail, contentLength: messageContent.length });

            // Send message (this will create conversation if needed)
            const result = await window.DatabaseService.sendMessage(recipientEmail, messageContent);
            if (result.success) {
                // Close modal and clear form
                this.hideNewMessageModal();
                recipientEmailInput.value = '';
                messageContentInput.value = '';
                
                // Reload conversations and open the new one
                await this.loadConversations();
                // Find the conversation that was just created/used
                const conversation = this.conversations.find(c => 
                    c.other_user_email.toLowerCase() === recipientEmail.toLowerCase()
                );
                if (conversation) {
                    await this.openConversation(conversation.id);
                } else {
                    // If conversation not found, just reload the list
                    console.log('[MessengerController] Conversation not found after sending, reloading list');
                }
            } else {
                throw new Error(result.error || 'Failed to start conversation');
            }
        } catch (error) {
            console.error('[MessengerController] Error sending new message:', error);
            alert(`Error: ${error.message}`);
        }
    },

    /**
     * Handle share data button click
     */
    async handleShareDataClick() {
        console.log('[MessengerController] handleShareDataClick() called');
        
        if (!this.currentConversationId) {
            console.warn('[MessengerController] No conversation open, cannot share data');
            return;
        }

        const conversation = this.conversations.find(c => c.id === this.currentConversationId);
        if (!conversation) {
            console.error('[MessengerController] Conversation not found');
            return;
        }

        const otherUserEmail = conversation.other_user_email;
        if (!otherUserEmail) {
            console.error('[MessengerController] No email found for conversation partner');
            return;
        }

        // Set email in modal (readonly since it's from the conversation)
        const emailInput = document.getElementById('share-data-email');
        if (emailInput) {
            emailInput.value = otherUserEmail;
        }

        // Load months for selection
        await this.loadShareDataMonths();

        // Show modal
        this.showShareDataModal();
    },

    /**
     * Load months for share data modal
     */
    async loadShareDataMonths() {
        console.log('[MessengerController] loadShareDataMonths() called');
        
        try {
            if (typeof window.DatabaseService === 'undefined') {
                console.error('[MessengerController] DatabaseService not available');
                return;
            }

            const allMonths = await window.DatabaseService.getAllMonths(false, false);
            const monthKeys = Object.keys(allMonths).sort((a, b) => {
                const [yearA, monthA] = a.split('-').map(Number);
                const [yearB, monthB] = b.split('-').map(Number);
                if (yearA !== yearB) return yearB - yearA;
                return monthB - monthA;
            });

            const monthsContainer = document.getElementById('share-data-months-checkboxes');
            if (!monthsContainer) {
                console.warn('[MessengerController] share-data-months-checkboxes container not found');
                return;
            }

            monthsContainer.innerHTML = '';

            monthKeys.forEach(monthKey => {
                const monthData = allMonths[monthKey];
                if (monthData && !monthData.isShared) {
                    const monthName = new Date(monthData.year, monthData.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                    const checkbox = document.createElement('label');
                    checkbox.style.display = 'flex';
                    checkbox.style.alignItems = 'center';
                    checkbox.style.gap = 'var(--spacing-sm)';
                    checkbox.innerHTML = `
                        <input type="checkbox" class="share-month-checkbox" data-year="${monthData.year}" data-month="${monthData.month}">
                        <span>${monthName}</span>
                    `;
                    monthsContainer.appendChild(checkbox);
                }
            });

            console.log('[MessengerController] Loaded', monthKeys.length, 'months for sharing');
        } catch (error) {
            console.error('[MessengerController] Error loading months for sharing:', error);
        }
    },

    /**
     * Get selected months from share data modal
     */
    getSelectedShareDataMonths() {
        const checkboxes = document.querySelectorAll('.share-month-checkbox:checked');
        return Array.from(checkboxes).map(checkbox => ({
            type: 'single',
            year: parseInt(checkbox.dataset.year, 10),
            month: parseInt(checkbox.dataset.month, 10)
        }));
    },

    /**
     * Show share data modal
     */
    showShareDataModal() {
        const modal = document.getElementById('share-data-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    },

    /**
     * Hide share data modal
     */
    hideShareDataModal() {
        const modal = document.getElementById('share-data-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    /**
     * Handle save share data
     */
    async handleSaveShareData() {
        console.log('[MessengerController] handleSaveShareData() called');

        if (!this.currentConversationId) {
            console.error('[MessengerController] No conversation open');
            alert('No conversation open');
            return;
        }

        // Wait for payments module and SubscriptionGuard to be available
        if (window.waitForPaymentsInit) {
            console.log('[MessengerController] Waiting for payments module initialization...');
            try {
                await window.waitForPaymentsInit();
                console.log('[MessengerController] Payments module initialized');
            } catch (error) {
                console.warn('[MessengerController] Payments module initialization failed:', error);
            }
        }

        // Wait for SubscriptionGuard to be available
        if (!window.SubscriptionGuard) {
            console.warn('[MessengerController] SubscriptionGuard not available, waiting...');
            let waitCount = 0;
            const maxWait = 50; // Wait up to 5 seconds
            while (!window.SubscriptionGuard && waitCount < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            if (!window.SubscriptionGuard) {
                console.error('[MessengerController] SubscriptionGuard not available after waiting');
                alert('Subscription service not available. Please refresh the page.');
                return;
            }
        }

        const conversation = this.conversations.find(c => c.id === this.currentConversationId);
        if (!conversation) {
            console.error('[MessengerController] Conversation not found');
            return;
        }

        const emailInput = document.getElementById('share-data-email');
        const accessLevelSelect = document.getElementById('share-data-access-level');
        const shareAllDataCheckbox = document.getElementById('share-data-all-data');
        const shareMonthsCheckbox = document.getElementById('share-data-months');
        const sharePotsCheckbox = document.getElementById('share-data-pots');
        const shareSettingsCheckbox = document.getElementById('share-data-settings');
        const statusDiv = document.getElementById('share-data-form-status');

        if (!emailInput || !accessLevelSelect) {
            console.error('[MessengerController] Share form elements not found');
            return;
        }

        const email = emailInput.value.trim();
        const accessLevel = accessLevelSelect.value;
        const shareAllData = shareAllDataCheckbox ? shareAllDataCheckbox.checked : false;
        const shareMonths = shareMonthsCheckbox ? shareMonthsCheckbox.checked : false;
        const sharePots = sharePotsCheckbox ? sharePotsCheckbox.checked : false;
        const shareSettings = shareSettingsCheckbox ? shareSettingsCheckbox.checked : false;

        if (!email) {
            alert('Email is required');
            return;
        }

        if (!shareMonths && !sharePots && !shareSettings && !shareAllData) {
            alert('Please select at least one thing to share');
            return;
        }

        let selectedMonths = [];

        if (shareAllData) {
            if (typeof window.DatabaseService === 'undefined') {
                alert('DatabaseService not available');
                return;
            }
            
            try {
                const allMonths = await window.DatabaseService.getAllMonths(false, false);
                const monthKeys = Object.keys(allMonths);
                selectedMonths = monthKeys.map(monthKey => {
                    const monthData = allMonths[monthKey];
                    if (monthData && !monthData.isShared) {
                        return { type: 'single', year: monthData.year, month: monthData.month };
                    }
                    return null;
                }).filter(m => m !== null);
            } catch (error) {
                console.error('[MessengerController] Error loading all months:', error);
                alert('Error loading your months. Please try again.');
                return;
            }
        } else if (shareMonths) {
            selectedMonths = this.getSelectedShareDataMonths();
            if (selectedMonths.length === 0) {
                alert('Please select at least one month');
                return;
            }
        }

        if (statusDiv) {
            statusDiv.innerHTML = '<p>Saving share...</p>';
        }

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            console.log('[MessengerController] Creating data share:', {
                email,
                accessLevel,
                selectedMonthsCount: selectedMonths.length,
                sharePots,
                shareSettings,
                shareAllData,
                conversationId: this.currentConversationId
            });

            const result = await window.DatabaseService.createDataShare(
                email,
                accessLevel,
                selectedMonths,
                sharePots,
                shareSettings,
                shareAllData
            );

            if (result.success && result.share) {
                // Link the share to the conversation
                const tableName = window.DatabaseService._getTableName('dataShares');
                const updateResult = await window.DatabaseService.queryUpdate(
                    tableName,
                    result.share.id,
                    { conversation_id: this.currentConversationId }
                );

                if (updateResult.error) {
                    console.warn('[MessengerController] Failed to link share to conversation:', updateResult.error);
                } else {
                    console.log('[MessengerController] Share linked to conversation:', this.currentConversationId);
                }

                if (statusDiv) {
                    statusDiv.innerHTML = '<p style="color: var(--success-color);">Share created successfully!</p>';
                }

                // Close modal after a short delay
                setTimeout(() => {
                    this.hideShareDataModal();
                    // Reload messages to show the share request message
                    if (this.currentConversationId) {
                        this.openConversation(this.currentConversationId);
                    }
                }, 1500);
            } else {
                const errorMessage = result.error || 'Failed to create share';
                if (statusDiv) {
                    statusDiv.innerHTML = `<p style="color: var(--error-color);">Error: ${errorMessage}</p>`;
                } else {
                    alert(`Error: ${errorMessage}`);
                }
            }
        } catch (error) {
            console.error('[MessengerController] Error saving share:', error);
            if (statusDiv) {
                statusDiv.innerHTML = `<p style="color: var(--error-color);">Error: ${error.message}</p>`;
            } else {
                alert(`Error: ${error.message}`);
            }
        }
    }
};

if (typeof window !== 'undefined') {
    window.MessengerController = MessengerController;
    console.log('[MessengerController] MessengerController assigned to window.MessengerController');
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessengerController;
}

