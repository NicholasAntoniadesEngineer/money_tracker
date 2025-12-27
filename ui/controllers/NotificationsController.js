/**
 * Notifications Controller
 * Handles the notifications page UI and interactions
 */

const NotificationsController = {
    currentFilter: 'all',
    currentCategory: null, // 'sharing', 'payments', 'messaging', or null for all
    currentView: 'notifications', // 'notifications' or 'messages'
    currentConversationId: null,
    notifications: [],
    conversations: [],

    /**
     * Initialize the notifications page
     */
    async init() {
        console.log('[NotificationsController] init() called');

        try {
            // Wait for AuthService to be available and initialized
            if (!window.AuthService) {
                console.warn('[NotificationsController] AuthService not available, waiting...');
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
            console.log('[NotificationsController] Waiting for auth state to be determined...');
            let authCheckAttempts = 0;
            const maxAuthChecks = 50; // 5 seconds max wait (50 * 100ms)
            while (authCheckAttempts < maxAuthChecks) {
                if (window.AuthService && window.AuthService.isAuthenticated()) {
                    console.log(`[NotificationsController] User authenticated after ${authCheckAttempts} checks`);
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
                authCheckAttempts++;
            }

            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                console.warn('[NotificationsController] User not authenticated after waiting, redirecting to auth');
                window.location.href = '../views/auth.html';
                return;
            }

            console.log('[NotificationsController] User authenticated, proceeding with initialization');
            this.setupEventListeners();
            
            // Always start with 'all' filter
            this.currentFilter = 'all';
            this.currentCategory = null;
            this.currentView = 'notifications';
            
            // Load both notifications and conversations
            // Note: loadConversations() won't call renderConversations() when currentView is 'notifications'
            // so we need to call renderAllView() after both complete
            await Promise.all([
                this.loadNotifications(),
                this.loadConversations()
            ]);
            
            // Render the combined 'all' view (notifications + conversations)
            // This must be called after loadConversations() completes to ensure conversations are available
            this.renderAllView();
            
            this.updateFilterDropdown(); // Set initial dropdown value to 'all'
        } catch (error) {
            console.error('[NotificationsController] Error initializing:', error);
            alert('Error loading notifications. Please check console for details.');
        }
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const filterDropdown = document.getElementById('filter-dropdown');
        const markAllRead = document.getElementById('mark-all-read-button');
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

        // Filter dropdown
        if (filterDropdown) {
            filterDropdown.addEventListener('change', (e) => {
                const value = e.target.value;
                if (value === 'all') {
                    this.currentFilter = 'all';
                    this.currentCategory = null;
                    this.currentView = 'notifications';
                    this.renderAllView();
                } else if (value === 'unread') {
                    this.currentFilter = 'unread';
                    this.currentCategory = null;
                    this.currentView = 'notifications';
                    this.switchView('notifications');
                    this.renderNotifications();
                } else if (value === 'sharing') {
                    this.currentFilter = 'all';
                    this.currentCategory = 'sharing';
                    this.currentView = 'notifications';
                    this.switchView('notifications');
                    this.renderNotifications();
                } else if (value === 'payments') {
                    this.currentFilter = 'all';
                    this.currentCategory = 'payments';
                    this.currentView = 'notifications';
                    this.switchView('notifications');
                    this.renderNotifications();
                } else if (value === 'messaging') {
                    this.currentFilter = 'all';
                    this.currentCategory = 'messaging';
                    this.currentView = 'messages';
                    this.switchView('messages');
                    this.loadConversations();
                }
            });
        }

        if (markAllRead) {
            markAllRead.addEventListener('click', () => {
                this.handleMarkAllRead();
            });
        }

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

        if (sendMessageButton) {
            sendMessageButton.addEventListener('click', () => {
                this.handleSendMessage();
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

        // Share all data checkbox - toggle month selection
        const shareAllDataCheckbox = document.getElementById('share-data-all-data');
        if (shareAllDataCheckbox) {
            shareAllDataCheckbox.addEventListener('change', (e) => {
                const monthsContainer = document.getElementById('share-data-months-container');
                if (monthsContainer) {
                    monthsContainer.style.display = e.target.checked ? 'none' : 'block';
                }
            });
        }

        // Keyboard shortcuts for modal
        const recipientInput = document.getElementById('recipient-email-input');
        const newMessageContent = document.getElementById('new-message-content');
        
        if (recipientInput) {
            recipientInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.hideNewMessageModal();
                }
            });
        }

        if (newMessageContent) {
            newMessageContent.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.hideNewMessageModal();
                } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    this.handleSendNewMessage();
                }
            });
        }

        const messageInput = document.getElementById('message-input');
        if (messageInput) {
            messageInput.addEventListener('keypress', (e) => {
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
                    console.error('[NotificationsController] Error in handleBackToConversations:', error);
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
        },

    /**
     * Update filter dropdown value
     */
    updateFilterDropdown() {
        const filterDropdown = document.getElementById('filter-dropdown');
        if (!filterDropdown) return;

        if (this.currentView === 'messages') {
            filterDropdown.value = 'messaging';
        } else if (this.currentCategory === 'sharing') {
            filterDropdown.value = 'sharing';
        } else if (this.currentCategory === 'payments') {
            filterDropdown.value = 'payments';
        } else if (this.currentFilter === 'unread') {
            filterDropdown.value = 'unread';
        } else {
            filterDropdown.value = 'all';
        }
    },

    /**
     * Switch between notifications and messages view
     */
    switchView(view) {
        const notificationsView = document.getElementById('notifications-view');
        const messagesView = document.getElementById('messages-view');

        if (view === 'messages') {
            if (notificationsView) notificationsView.style.display = 'none';
            if (messagesView) messagesView.style.display = 'block';
        } else {
            if (notificationsView) notificationsView.style.display = 'block';
            if (messagesView) messagesView.style.display = 'none';
        }
    },

    /**
     * Load notifications from database
     */
    async loadNotifications() {
        console.log('[NotificationsController] loadNotifications() called');

        try {
            if (typeof window.NotificationService === 'undefined') {
                throw new Error('NotificationService not available');
            }

            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const currentUserId = await window.DatabaseService._getCurrentUserId();
            if (!currentUserId) {
                throw new Error('User not authenticated');
            }

            const result = await window.NotificationService.getNotifications(currentUserId, {
                unreadOnly: false,
                orderBy: 'created_at',
                ascending: false
            });

            if (result.success) {
                this.notifications = result.notifications || [];
                console.log('[NotificationsController] Loaded', this.notifications.length, 'notifications');
                console.log('[NotificationsController] Notification types:', this.notifications.map(n => ({
                    id: n.id,
                    type: n.type,
                    read: n.read,
                    share_id: n.share_id,
                    from_user_id: n.from_user_id
                })));
                console.log('[NotificationsController] Share request notifications:', this.notifications.filter(n => n.type === 'share_request').map(n => ({
                    id: n.id,
                    share_id: n.share_id,
                    read: n.read,
                    message: n.message
                })));
                if (this.currentFilter === 'all' && !this.currentCategory) {
                    this.renderAllView();
                } else {
                    this.renderNotifications();
                }
            } else {
                throw new Error(result.error || 'Failed to load notifications');
            }
        } catch (error) {
            console.error('[NotificationsController] Error loading notifications:', error);
            const list = document.getElementById('notifications-list');
            if (list) {
                list.innerHTML = `<p style="color: var(--danger-color);">Error loading notifications: ${error.message}</p>`;
            }
        }
    },

    /**
     * Render notifications list
     */
    async renderNotifications() {
        console.log('[NotificationsController] renderNotifications() called', { filter: this.currentFilter, count: this.notifications.length });

        const list = document.getElementById('notifications-list');
        if (!list) {
            return;
        }

        let filteredNotifications = this.notifications;

        // Filter out share_request notifications that have a conversation_id
        // These are shown as messages in the conversation thread instead
        filteredNotifications = filteredNotifications.filter(n => {
            if (n.type === 'share_request' && n.conversation_id) {
                console.log('[NotificationsController] Filtering out share_request notification with conversation_id:', n.id, 'conversation_id:', n.conversation_id);
                return false;
            }
            return true;
        });

        if (this.currentFilter === 'unread') {
            filteredNotifications = filteredNotifications.filter(n => !n.read);
        }

        // Filter by category if specified
        if (this.currentCategory) {
            filteredNotifications = filteredNotifications.filter(n => {
                const typeConfig = typeof window.NotificationTypeRegistry !== 'undefined'
                    ? window.NotificationTypeRegistry.getType(n.type)
                    : null;
                return typeConfig && typeConfig.category === this.currentCategory;
            });
        }

        if (filteredNotifications.length === 0) {
            list.innerHTML = '<p>No notifications found.</p>';
            return;
        }

        const notificationsHtml = await Promise.all(
            filteredNotifications.map(notification => this.renderNotificationItem(notification))
        );

        list.innerHTML = notificationsHtml.join('');

        this.setupNotificationItemListeners();
    },

    /**
     * Render combined 'all' view showing both notifications and conversations
     */
    async renderAllView() {
        console.log('[NotificationsController] renderAllView() called', { 
            notificationsCount: this.notifications?.length || 0,
            conversationsCount: this.conversations?.length || 0,
            currentFilter: this.currentFilter,
            currentCategory: this.currentCategory,
            notifications: this.notifications?.map(n => ({ id: n.id, type: n.type, read: n.read, share_id: n.share_id }))
        });

        const notificationsView = document.getElementById('notifications-view');
        const messagesView = document.getElementById('messages-view');
        const notificationsList = document.getElementById('notifications-list');
        const conversationsList = document.getElementById('conversations-list');

        if (!notificationsView || !notificationsList) {
            return;
        }

        // Show notifications view
        if (notificationsView) notificationsView.style.display = 'block';
        if (messagesView) messagesView.style.display = 'none';

        // Filter notifications (no category filter for 'all')
        let filteredNotifications = this.notifications || [];
        console.log('[NotificationsController] renderAllView - Before filtering:', {
            totalNotifications: filteredNotifications.length,
            currentFilter: this.currentFilter,
            notificationTypes: filteredNotifications.map(n => n.type),
            shareRequestCount: filteredNotifications.filter(n => n.type === 'share_request').length
        });
        
        // Filter out share_request notifications that have a conversation_id
        // These are shown as messages in the conversation thread instead
        filteredNotifications = filteredNotifications.filter(n => {
            if (n.type === 'share_request' && n.conversation_id) {
                console.log('[NotificationsController] Filtering out share_request notification with conversation_id:', n.id, 'conversation_id:', n.conversation_id);
                return false;
            }
            return true;
        });
        
        if (this.currentFilter === 'unread') {
            filteredNotifications = filteredNotifications.filter(n => !n.read);
            console.log('[NotificationsController] renderAllView - After unread filter:', {
                unreadCount: filteredNotifications.length,
                unreadTypes: filteredNotifications.map(n => n.type)
            });
        }
        
        console.log('[NotificationsController] renderAllView - Final filtered notifications:', {
            count: filteredNotifications.length,
            types: filteredNotifications.map(n => n.type),
            shareRequests: filteredNotifications.filter(n => n.type === 'share_request').map(n => ({ id: n.id, share_id: n.share_id, read: n.read }))
        });

        // Build combined HTML with both notifications and conversations
        let html = '';

        // Add conversations section if there are any
        if (this.conversations && this.conversations.length > 0) {
            html += '<div class="notifications-section-header" style="margin-bottom: var(--spacing-md);">';
            html += '<h3 style="margin: 0 0 var(--spacing-sm) 0;">Conversations</h3>';
            html += '</div>';

            const conversationsHtml = await Promise.all(
                this.conversations.map(conversation => this.renderConversationItem(conversation))
            );
            html += conversationsHtml.join('');
        }

        // Add notifications section if there are any
        if (filteredNotifications.length > 0) {
            html += '<div class="notifications-section-header" style="margin-top: var(--spacing-lg); margin-bottom: var(--spacing-md);">';
            html += '<h3 style="margin: 0 0 var(--spacing-sm) 0;">Notifications</h3>';
            html += '</div>';

            const notificationsHtml = await Promise.all(
                filteredNotifications.map(notification => this.renderNotificationItem(notification))
            );
            html += notificationsHtml.join('');
        }

        // Show message if nothing to display
        if ((!this.conversations || this.conversations.length === 0) && filteredNotifications.length === 0) {
            html = '<p>No notifications or conversations found.</p>';
        }

        notificationsList.innerHTML = html;

        // Setup listeners for both notifications and conversations
        this.setupNotificationItemListeners();
        this.setupConversationItemListeners();
    },

    /**
     * Render a single conversation item for the all view
     */
    async renderConversationItem(conversation) {
        const unreadBadge = conversation.unread_count > 0 
            ? `<span class="badge badge-primary" style="margin-left: var(--spacing-xs);">${conversation.unread_count}</span>`
            : '';
        
        return `
            <div class="notification-item conversation-item" data-conversation-id="${conversation.id}" style="padding: var(--spacing-md); border: var(--border-width-standard) solid var(--border-color); border-radius: var(--border-radius); margin-bottom: var(--spacing-sm); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${conversation.other_user_email || 'Unknown User'}</strong>${unreadBadge}
                    ${conversation.last_message ? `<div style="color: var(--text-color-secondary); font-size: 0.9em; margin-top: var(--spacing-xs);">${conversation.last_message.substring(0, 100)}${conversation.last_message.length > 100 ? '...' : ''}</div>` : ''}
                </div>
                <div style="color: var(--text-color-secondary); font-size: 0.85em;">
                    ${conversation.last_message_at ? new Date(conversation.last_message_at).toLocaleDateString() : ''}
                </div>
            </div>
        `;
    },

    /**
     * Setup event listeners for conversation items in the all view
     */
    setupConversationItemListeners() {
        const list = document.getElementById('notifications-list');
        if (!list) {
            return;
        }

        // Use event delegation for conversation items
        list.addEventListener('click', async (e) => {
            const conversationItem = e.target.closest('.conversation-item');
            if (conversationItem) {
                const conversationId = parseInt(conversationItem.dataset.conversationId, 10);
                if (conversationId) {
                    // Switch to messages view and open the conversation
                    this.currentView = 'messages';
                    this.currentCategory = 'messaging';
                    this.switchView('messages');
                    await this.loadConversations();
                    await this.openConversation(conversationId);
                }
            }
        });
    },

    /**
     * Setup event listeners for notification items
     */
    setupNotificationItemListeners() {
        const list = document.getElementById('notifications-list');
        if (!list) {
            return;
        }

        list.addEventListener('click', async (e) => {
            const target = e.target;
            const notificationItem = target.closest('.notification-item');
            if (notificationItem) {
                const notificationId = parseInt(notificationItem.dataset.notificationId, 10);
                if (notificationId && !target.closest('.notification-actions') && !target.closest('.delete-notification-btn')) {
                    await this.handleNotificationClick(notificationId);
                }
            }

            if (target.classList.contains('accept-share-btn')) {
                e.stopPropagation();
                const shareId = parseInt(target.dataset.shareId, 10);
                const notificationId = parseInt(target.dataset.notificationId, 10);
                if (shareId && notificationId) {
                    await this.handleAcceptShare(shareId, notificationId);
                }
            }

            if (target.classList.contains('decline-share-btn')) {
                e.stopPropagation();
                const shareId = parseInt(target.dataset.shareId, 10);
                const notificationId = parseInt(target.dataset.notificationId, 10);
                if (shareId && notificationId) {
                    await this.handleDeclineShare(shareId, notificationId);
                }
            }

            if (target.classList.contains('block-user-btn')) {
                e.stopPropagation();
                const userId = target.dataset.userId;
                const notificationId = parseInt(target.dataset.notificationId, 10);
                if (userId && notificationId) {
                    await this.handleBlockUser(userId, notificationId);
                }
            }

            if (target.classList.contains('delete-notification-btn')) {
                e.stopPropagation();
                const notificationId = parseInt(target.dataset.notificationId, 10);
                if (notificationId) {
                    await this.handleDeleteNotification(notificationId);
                }
            }

            if (target.classList.contains('reply-message-btn')) {
                e.stopPropagation();
                const conversationId = parseInt(target.dataset.conversationId, 10);
                const notificationId = parseInt(target.dataset.notificationId, 10);
                if (conversationId && notificationId) {
                    await this.handleNotificationClick(notificationId);
                    this.currentView = 'messages';
                    this.currentCategory = 'messaging';
                    this.switchView('messages');
                    this.updateFilterDropdown();
                    await this.loadConversations();
                    await this.openConversation(conversationId);
                }
            }
        });
    },

    /**
     * Render a single notification item
     */
    async renderNotificationItem(notification) {
        try {
            let fromUserEmail = 'Unknown User';
            if (notification.from_user_id && typeof window.DatabaseService !== 'undefined') {
                const emailResult = await window.DatabaseService.getUserEmailById(notification.from_user_id);
                if (emailResult.success && emailResult.email) {
                    fromUserEmail = emailResult.email;
                }
            }

            const typeConfig = typeof window.NotificationTypeRegistry !== 'undefined' 
                ? window.NotificationTypeRegistry.getType(notification.type)
                : null;

            const typeName = typeConfig ? typeConfig.name : notification.type;
            const readClass = notification.read ? 'read' : 'unread';
            const readIcon = notification.read ? 'fa-check-circle' : 'fa-circle';

            let actionButtons = '';
            if (notification.type === 'share_request' && notification.share_id && !notification.read) {
                actionButtons = `
                    <div class="notification-actions" style="margin-top: var(--spacing-sm); display: flex; gap: var(--spacing-xs);">
                        <button class="btn btn-primary btn-sm accept-share-btn" data-share-id="${notification.share_id}" data-notification-id="${notification.id}">Accept</button>
                        <button class="btn btn-secondary btn-sm decline-share-btn" data-share-id="${notification.share_id}" data-notification-id="${notification.id}">Decline</button>
                        <button class="btn btn-danger btn-sm block-user-btn" data-user-id="${notification.from_user_id}" data-notification-id="${notification.id}">Block</button>
                    </div>
                `;
            } else if (notification.type === 'message_received' && notification.conversation_id) {
                actionButtons = `
                    <div class="notification-actions" style="margin-top: var(--spacing-sm); display: flex; gap: var(--spacing-xs);">
                        <button class="btn btn-primary btn-sm reply-message-btn" data-conversation-id="${notification.conversation_id}" data-notification-id="${notification.id}">Reply</button>
                    </div>
                `;
            }

            const date = new Date(notification.created_at);
            const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="notification-item ${readClass}" data-notification-id="${notification.id}" style="padding: var(--spacing-md); border: var(--border-width-standard) solid var(--border-color); border-radius: var(--border-radius); margin-bottom: var(--spacing-sm); background: ${notification.read ? 'var(--surface-color)' : 'var(--hover-overlay)'};">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--spacing-xs);">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: var(--spacing-xs); margin-bottom: var(--spacing-xs);">
                                <i class="fa-regular ${readIcon}" style="color: ${notification.read ? 'var(--text-color-secondary)' : 'var(--primary-color)'};"></i>
                                <strong>${typeName}</strong>
                            </div>
                            <p style="margin: 0; color: var(--text-primary);">From: ${fromUserEmail}</p>
                            ${notification.message ? `<p style="margin: var(--spacing-xs) 0 0 0; color: var(--text-color-secondary);">${notification.message}</p>` : ''}
                            ${actionButtons}
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: end; gap: var(--spacing-xs);">
                            <span style="font-size: 0.85rem; color: var(--text-color-secondary);">${dateString}</span>
                            <button class="btn btn-sm btn-secondary delete-notification-btn" data-notification-id="${notification.id}" style="padding: 2px 8px;">Delete</button>
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('[NotificationsController] Error rendering notification item:', error);
            return `<div class="notification-item" style="padding: var(--spacing-md); border: var(--border-width-standard) solid var(--border-color); border-radius: var(--border-radius); margin-bottom: var(--spacing-sm);">
                <p>Error loading notification: ${error.message}</p>
            </div>`;
        }
    },

    /**
     * Handle mark all as read
     */
    async handleMarkAllRead() {
        console.log('[NotificationsController] handleMarkAllRead() called');

        try {
            if (typeof window.NotificationService === 'undefined') {
                throw new Error('NotificationService not available');
            }

            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const currentUserId = await window.DatabaseService._getCurrentUserId();
            if (!currentUserId) {
                throw new Error('User not authenticated');
            }

            const result = await window.NotificationService.markAllAsRead(currentUserId);

            if (result.success) {
                console.log('[NotificationsController] Marked', result.count, 'notifications as read');
                await this.loadNotifications();
                if (typeof window.Header !== 'undefined') {
                    window.Header.updateNotificationCount();
                }
            } else {
                throw new Error(result.error || 'Failed to mark all as read');
            }
        } catch (error) {
            console.error('[NotificationsController] Error marking all as read:', error);
            alert('Error marking notifications as read: ' + error.message);
        }
    },

    /**
     * Handle notification item click (mark as read)
     */
    async handleNotificationClick(notificationId) {
        console.log('[NotificationsController] handleNotificationClick() called', { notificationId });

        try {
            if (typeof window.NotificationService === 'undefined') {
                return;
            }

            const notification = this.notifications.find(n => n.id === notificationId);
            if (!notification || notification.read) {
                return;
            }

            const result = await window.NotificationService.markAsRead(notificationId);
            if (result.success) {
                notification.read = true;
                this.renderNotifications();
                if (typeof window.Header !== 'undefined') {
                    window.Header.updateNotificationCount();
                }
            }
        } catch (error) {
            console.error('[NotificationsController] Error marking notification as read:', error);
        }
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
        console.log('[NotificationsController] handleAcceptShare() called', { shareId, notificationId });

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
                        console.log('[NotificationsController] Marking share notifications as read:', shareId);
                        const markReadResult = await window.NotificationService.markShareNotificationsAsRead(currentUserId, shareId);
                        console.log('[NotificationsController] Share notifications marked as read:', markReadResult);
                    }
                    
                    // Also try to delete the specific notification if provided
                    if (notificationId) {
                        const deleteResult = await window.NotificationService.deleteNotification(notificationId);
                        if (!deleteResult.success) {
                            console.warn('[NotificationsController] Failed to delete notification after accepting share:', deleteResult.error);
                        }
                    }
                }
                await this.loadNotifications();
                
                // Update notification count in header
                if (typeof window.Header !== 'undefined') {
                    window.Header.updateNotificationCount();
                }
                
                alert('Share accepted successfully');
            } else {
                throw new Error(result.error || 'Failed to accept share');
            }
        } catch (error) {
            console.error('[NotificationsController] Error accepting share:', error);
            alert('Error accepting share: ' + error.message);
        }
    },

    /**
     * Handle decline share
     */
    async handleDeclineShare(shareId, notificationId) {
        console.log('[NotificationsController] handleDeclineShare() called', { shareId, notificationId });

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
            console.log('[NotificationsController] Current share status:', share.status);

            // Check if share is already declined
            if (share.status === 'declined') {
                alert('This share has already been declined. You can only re-accept it.');
                // Reload to update the UI
                await this.loadNotifications();
                if (this.currentView === 'messages') {
                    await this.loadConversations();
                }
                return;
            }

            // Check if share is blocked
            if (share.status === 'blocked') {
                alert('This share has been blocked and cannot be updated.');
                await this.loadNotifications();
                if (this.currentView === 'messages') {
                    await this.loadConversations();
                }
                return;
            }

            const result = await window.DatabaseService.updateShareStatus(shareId, 'declined');

            if (result.success) {
                // Mark all notifications for this share as read
                if (typeof window.NotificationService !== 'undefined' && typeof window.DatabaseService !== 'undefined') {
                    const currentUserId = await window.DatabaseService._getCurrentUserId();
                    if (currentUserId) {
                        console.log('[NotificationsController] Marking share notifications as read:', shareId);
                        const markReadResult = await window.NotificationService.markShareNotificationsAsRead(currentUserId, shareId);
                        console.log('[NotificationsController] Share notifications marked as read:', markReadResult);
                    }
                    
                    // Also try to delete the specific notification if provided
                    if (notificationId) {
                        const deleteResult = await window.NotificationService.deleteNotification(notificationId);
                        if (!deleteResult.success) {
                            console.warn('[NotificationsController] Failed to delete notification after declining share:', deleteResult.error);
                        }
                    }
                }
                await this.loadNotifications();
                
                // Update notification count in header
                if (typeof window.Header !== 'undefined') {
                    window.Header.updateNotificationCount();
                }
                
                // Reload conversations if in messages view
                if (this.currentView === 'messages') {
                    await this.loadConversations();
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
                
                // Reload to update the UI
                await this.loadNotifications();
                if (this.currentView === 'messages') {
                    await this.loadConversations();
                }
            }
        } catch (error) {
            console.error('[NotificationsController] Error declining share:', error);
            const errorMessage = error.message || 'Unknown error';
            if (errorMessage.includes('Declined shares can only be re-accepted')) {
                alert('This share has already been declined. You can only re-accept it.');
            } else {
                alert('Error declining share: ' + errorMessage);
            }
            
            // Reload to update the UI even on error
            try {
                await this.loadNotifications();
                if (this.currentView === 'messages') {
                    await this.loadConversations();
                }
            } catch (reloadError) {
                console.error('[NotificationsController] Error reloading after decline error:', reloadError);
            }
        }
    },

    /**
     * Handle add/remove friend from conversation view
     */
    async handleAddFriendFromConversation(userId, userEmail, buttonElement) {
        console.log('[NotificationsController] handleAddFriendFromConversation() called', { userId, userEmail });

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
            console.error('[NotificationsController] Error handling add friend from conversation:', error);
            alert('Error: ' + error.message);
        }
    },

    /**
     * Handle block user from conversation view
     */
    async handleBlockUserFromConversation(userId, userEmail) {
        console.log('[NotificationsController] handleBlockUserFromConversation() called', { userId, userEmail });

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
            console.error('[NotificationsController] Error blocking user from conversation:', error);
            alert('Error blocking user: ' + error.message);
        }
    },

    /**
     * Handle block user
     */
    async handleBlockUser(userId, notificationId) {
        console.log('[NotificationsController] handleBlockUser() called', { userId, notificationId });

        if (!confirm('Are you sure you want to block this user? This will decline all pending shares from them.')) {
            return;
        }

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.blockUser(userId);

            if (result.success) {
                await this.handleNotificationClick(notificationId);
                await this.loadNotifications();
                alert('User blocked successfully');
            } else {
                throw new Error(result.error || 'Failed to block user');
            }
        } catch (error) {
            console.error('[NotificationsController] Error blocking user:', error);
            alert('Error blocking user: ' + error.message);
        }
    },

    /**
     * Handle delete notification
     */
    async handleDeleteNotification(notificationId) {
        console.log('[NotificationsController] handleDeleteNotification() called', { notificationId });

        try {
            if (typeof window.NotificationService === 'undefined') {
                throw new Error('NotificationService not available');
            }

            const result = await window.NotificationService.deleteNotification(notificationId);

            if (result.success) {
                this.notifications = this.notifications.filter(n => n.id !== notificationId);
                if (this.currentFilter === 'all' && !this.currentCategory) {
                    this.renderAllView();
                } else {
                    this.renderNotifications();
                }
                if (typeof window.Header !== 'undefined') {
                    window.Header.updateNotificationCount();
                }
            } else {
                throw new Error(result.error || 'Failed to delete notification');
            }
        } catch (error) {
            console.error('[NotificationsController] Error deleting notification:', error);
            alert('Error deleting notification: ' + error.message);
        }
    },

    /**
     * Load conversations for the current user
     */
    async loadConversations() {
        console.log('[NotificationsController] loadConversations() called', { currentView: this.currentView });
        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.getConversations();
            if (result.success) {
                this.conversations = result.conversations || [];
                console.log('[NotificationsController] Conversations loaded:', { count: this.conversations.length, currentView: this.currentView });
                
                // Only render conversations list if we're in the messages view
                // Otherwise, let the caller handle rendering via renderAllView()
                if (this.currentView === 'messages') {
                    console.log('[NotificationsController] Rendering conversations list (messages view)');
                    this.renderConversations();
                } else {
                    console.log('[NotificationsController] Skipping renderConversations() - will be handled by renderAllView()');
                }
            } else {
                throw new Error(result.error || 'Failed to load conversations');
            }
        } catch (error) {
            console.error('[NotificationsController] Error loading conversations:', error);
            // Only show error in conversations-list if we're in messages view
            if (this.currentView === 'messages') {
                const list = document.getElementById('conversations-list');
                if (list) {
                    list.innerHTML = `<p style="color: var(--danger-color);">Error loading conversations: ${error.message}</p>`;
                }
            }
        }
    },

    /**
     * Render conversations list
     */
    renderConversations() {
        console.log('[NotificationsController] renderConversations() called', { 
            count: this.conversations.length,
            conversations: this.conversations.map(c => ({ id: c.id, other_user_email: c.other_user_email, unread_count: c.unread_count }))
        });
        const list = document.getElementById('conversations-list');
        if (!list) {
            console.warn('[NotificationsController] conversations-list element not found');
            return;
        }

        if (this.conversations.length === 0) {
            list.innerHTML = '<p>No conversations yet. Start a new conversation to begin messaging.</p>';
            return;
        }

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

        list.innerHTML = conversationsHtml.join('');

        // Setup click listeners
        list.querySelectorAll('.conversation-item').forEach(item => {
            item.addEventListener('click', () => {
                const conversationId = parseInt(item.dataset.conversationId, 10);
                this.openConversation(conversationId);
            });
        });
    },

    /**
     * Handle back to conversations button click
     */
    async handleBackToConversations() {
        console.log('[NotificationsController] handleBackToConversations() called');
        
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

        // Reset filter state to 'all' view
        this.currentFilter = 'all';
        this.currentCategory = null;
        this.currentView = 'notifications';
        
        // Update filter dropdown to 'all'
        const filterDropdown = document.getElementById('filter-dropdown');
        if (filterDropdown) {
            filterDropdown.value = 'all';
        }

        // Switch to notifications view
        console.log('[NotificationsController] Switching back to notifications view');
        this.switchView('notifications');

        // Reload conversations to get fresh data
        console.log('[NotificationsController] Reloading conversations...');
        await this.loadConversations();

        // Reload notifications to ensure everything is fresh
        console.log('[NotificationsController] Reloading notifications...');
        await this.loadNotifications();

        // Explicitly render the all view to ensure it's displayed
        console.log('[NotificationsController] Rendering all view...');
        this.renderAllView();

        // Update notification count in header
        if (typeof window.Header !== 'undefined') {
            window.Header.updateNotificationCount();
        }

        console.log('[NotificationsController] handleBackToConversations() complete - view refreshed');
    },

    /**
     * Open a conversation thread
     */
    async openConversation(conversationId) {
        console.log('[NotificationsController] openConversation() called', { 
            conversationId,
            previousConversationId: this.currentConversationId,
            currentView: this.currentView
        });
        this.currentConversationId = conversationId;
        
        // Ensure we're in messages view when opening a conversation
        if (this.currentView !== 'messages') {
            console.log('[NotificationsController] Setting currentView to messages for conversation');
            this.currentView = 'messages';
        }

        const conversationsList = document.getElementById('conversations-list');
        const messageThreadContainer = document.getElementById('message-thread-container');
        const messageThread = document.getElementById('message-thread');

        if (!messageThreadContainer || !messageThread) return;

        // Hide conversations list, show message thread
        if (conversationsList) conversationsList.style.display = 'none';
        messageThreadContainer.style.display = 'block';
        messageThread.innerHTML = '<p>Loading messages...</p>';

        // Show share data button
        const shareDataButton = document.getElementById('share-data-button');
        if (shareDataButton) {
            shareDataButton.style.display = 'inline-block';
        }

        try {
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
            
            // Check if user is already a friend and update button accordingly
            if (addFriendButton && conversation.other_user_id) {
                addFriendButton.style.display = 'inline-block';
                addFriendButton.dataset.userId = conversation.other_user_id;
                addFriendButton.dataset.userEmail = conversation.other_user_email || 'Unknown User';
                
                // Check if already a friend
                if (window.DatabaseService) {
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
                }
            }

            console.log('[NotificationsController] Fetching messages for conversation:', conversationId);
            const result = await window.DatabaseService.getMessages(conversationId);
            if (result.success) {
                const messages = result.messages || [];
                console.log('[NotificationsController] Loaded messages:', { 
                    conversationId, 
                    messageCount: messages.length,
                    messageIds: messages.map(m => m.id),
                    messageTypes: messages.map(m => m.content?.startsWith('📤 Share Request') ? 'share_request' : 'regular')
                });
                
                // Check for shares without messages and create messages for them (all statuses)
                console.log('[NotificationsController] ========== CALLING createMessagesForShares() ==========');
                await this.createMessagesForShares(conversationId, conversation, messages);
                console.log('[NotificationsController] ========== createMessagesForShares() RETURNED ==========');
                
                // Reload messages after potentially creating new ones
                console.log('[NotificationsController] Reloading messages after potential share message creation...');
                const updatedResult = await window.DatabaseService.getMessages(conversationId);
                const updatedMessages = updatedResult.success ? (updatedResult.messages || []) : messages;
                console.log('[NotificationsController] Reloaded messages:', {
                    success: updatedResult.success,
                    messageCount: updatedMessages.length,
                    messageIds: updatedMessages.map(m => m.id),
                    messageTypes: updatedMessages.map(m => m.content?.startsWith('📤 Share Request') ? 'share_request' : 'regular'),
                    newMessagesCount: updatedMessages.length - messages.length
                });
                
                await this.renderMessageThread(updatedMessages);

                // Mark conversation as read
                console.log('[NotificationsController] Marking conversation as read:', conversationId);
                const markReadResult = await window.DatabaseService.markConversationAsRead(conversationId);
                console.log('[NotificationsController] Mark as read result:', markReadResult);
                
                // Mark related notifications as read
                if (typeof window.NotificationService !== 'undefined' && typeof window.DatabaseService !== 'undefined') {
                    const currentUserId = await window.DatabaseService._getCurrentUserId();
                    if (currentUserId) {
                        console.log('[NotificationsController] Marking conversation notifications as read:', conversationId);
                        const otherUserId = conversation.other_user_id;
                        console.log('[NotificationsController] Conversation partner user ID:', otherUserId);
                        const notificationResult = await window.NotificationService.markConversationNotificationsAsRead(currentUserId, conversationId, otherUserId);
                        console.log('[NotificationsController] Conversation notifications marked as read:', notificationResult);
                    }
                }
                
                await this.loadConversations(); // Refresh to update unread counts
                await this.loadNotifications(); // Refresh notifications to update read status
                
                // Update notification count in header
                if (typeof window.Header !== 'undefined') {
                    window.Header.updateNotificationCount();
                }
            } else {
                console.error('[NotificationsController] Failed to load messages:', result.error);
                throw new Error(result.error || 'Failed to load messages');
            }
        } catch (error) {
            console.error('[NotificationsController] Error opening conversation:', error);
            messageThread.innerHTML = `<p style="color: var(--danger-color);">Error loading messages: ${error.message}</p>`;
        }
    },

    /**
     * Create messages for shares that don't have messages yet
     * This includes all shares (pending, accepted, declined) to show full history
     */
    async createMessagesForShares(conversationId, conversation, existingMessages) {
        console.log('[NotificationsController] ========== createMessagesForShares() STARTED ==========');
        console.log('[NotificationsController] Parameters:', {
            conversationId,
            conversation: {
                id: conversation.id,
                other_user_id: conversation.other_user_id,
                other_user_email: conversation.other_user_email
            },
            existingMessagesCount: existingMessages.length,
            existingMessageIds: existingMessages.map(m => m.id)
        });
        
        try {
            if (typeof window.DatabaseService === 'undefined') {
                console.warn('[NotificationsController] DatabaseService not available');
                return;
            }

            const currentUserId = await window.DatabaseService._getCurrentUserId();
            if (!currentUserId) {
                console.warn('[NotificationsController] Current user ID not available');
                return;
            }

            const otherUserId = conversation.other_user_id;
            if (!otherUserId) {
                console.warn('[NotificationsController] No other_user_id in conversation');
                return;
            }

            console.log('[NotificationsController] User IDs:', {
                currentUserId,
                otherUserId,
                conversationId
            });

            // Find all shares between current user and other user (regardless of status)
            // This includes shares that might not have conversation_id set yet
            const tableName = window.DatabaseService._getTableName('dataShares');
            console.log('[NotificationsController] Data shares table name:', tableName);
            
            // Query for shares with conversation_id matching (all statuses)
            console.log('[NotificationsController] Query 1: Finding shares with conversation_id:', conversationId);
            const sharesResult1 = await window.DatabaseService.querySelect(tableName, {
                filter: {
                    conversation_id: conversationId
                }
            });
            console.log('[NotificationsController] Query 1 result:', {
                success: sharesResult1.success,
                hasError: !!sharesResult1.error,
                error: sharesResult1.error,
                hasData: !!sharesResult1.data,
                count: sharesResult1.data?.length || 0,
                shares: sharesResult1.data?.map(s => ({ id: s.id, status: s.status, conversation_id: s.conversation_id })) || []
            });

            // Query for shares where current user is owner and other user is recipient (without conversation_id)
            console.log('[NotificationsController] Query 2: Finding shares where current user is owner');
            const sharesResult2 = await window.DatabaseService.querySelect(tableName, {
                filter: {
                    owner_user_id: currentUserId,
                    shared_with_user_id: otherUserId
                }
            });
            console.log('[NotificationsController] Query 2 result:', {
                success: sharesResult2.success,
                hasError: !!sharesResult2.error,
                error: sharesResult2.error,
                hasData: !!sharesResult2.data,
                count: sharesResult2.data?.length || 0,
                shares: sharesResult2.data?.map(s => ({ id: s.id, status: s.status, conversation_id: s.conversation_id })) || []
            });

            // Query for shares where other user is owner and current user is recipient (without conversation_id)
            console.log('[NotificationsController] Query 3: Finding shares where other user is owner');
            const sharesResult3 = await window.DatabaseService.querySelect(tableName, {
                filter: {
                    owner_user_id: otherUserId,
                    shared_with_user_id: currentUserId
                }
            });
            console.log('[NotificationsController] Query 3 result:', {
                success: sharesResult3.success,
                hasError: !!sharesResult3.error,
                error: sharesResult3.error,
                hasData: !!sharesResult3.data,
                count: sharesResult3.data?.length || 0,
                shares: sharesResult3.data?.map(s => ({ id: s.id, status: s.status, conversation_id: s.conversation_id })) || []
            });

            // Combine results and filter for shares without conversation_id (to avoid duplicates)
            let allRawShares = [];
            if (sharesResult1.data && !sharesResult1.error) {
                console.log('[NotificationsController] Adding', sharesResult1.data.length, 'shares from query 1');
                allRawShares = [...allRawShares, ...sharesResult1.data];
            }
            if (sharesResult2.data && !sharesResult2.error) {
                // Only include shares that don't have conversation_id (to avoid duplicates with sharesResult1)
                const sharesWithoutConversationId = sharesResult2.data.filter(share => 
                    !share.conversation_id || share.conversation_id === null
                );
                console.log('[NotificationsController] Adding', sharesWithoutConversationId.length, 'shares from query 2 (without conversation_id)');
                allRawShares = [...allRawShares, ...sharesWithoutConversationId];
            }
            if (sharesResult3.data && !sharesResult3.error) {
                // Only include shares that don't have conversation_id (to avoid duplicates with sharesResult1)
                const sharesWithoutConversationId = sharesResult3.data.filter(share => 
                    !share.conversation_id || share.conversation_id === null
                );
                console.log('[NotificationsController] Adding', sharesWithoutConversationId.length, 'shares from query 3 (without conversation_id)');
                allRawShares = [...allRawShares, ...sharesWithoutConversationId];
            }

            console.log('[NotificationsController] Total shares before deduplication:', allRawShares.length);

            // Remove duplicates based on share.id
            const uniqueShares = [];
            const seenIds = new Set();
            for (const share of allRawShares) {
                if (!seenIds.has(share.id)) {
                    seenIds.add(share.id);
                    uniqueShares.push(share);
                } else {
                    console.log('[NotificationsController] Skipping duplicate share:', share.id);
                }
            }

            const allShares = uniqueShares;
            console.log('[NotificationsController] ========== SHARES FOUND ==========');
            console.log('[NotificationsController] Total unique shares:', allShares.length);
            console.log('[NotificationsController] Share details:', allShares.map(s => ({
                id: s.id,
                conversation_id: s.conversation_id,
                status: s.status,
                owner: s.owner_user_id,
                recipient: s.shared_with_user_id,
                access_level: s.access_level
            })));

            // Update shares that don't have conversation_id set
            for (const share of allShares) {
                if (!share.conversation_id || share.conversation_id === null) {
                    console.log('[NotificationsController] Updating share to set conversation_id:', share.id);
                    try {
                        const updateResult = await window.DatabaseService.queryUpdate(tableName, share.id, {
                            conversation_id: conversationId
                        });
                        if (updateResult.success || !updateResult.error) {
                            share.conversation_id = conversationId;
                            console.log('[NotificationsController] ✅ Updated share conversation_id:', share.id);
                        } else {
                            console.warn('[NotificationsController] ⚠️ Failed to update share conversation_id:', updateResult.error);
                        }
                    } catch (error) {
                        console.warn('[NotificationsController] ⚠️ Error updating share conversation_id:', error);
                    }
                }
            }

            // Check which shares already have messages
            console.log('[NotificationsController] ========== CHECKING EXISTING MESSAGES ==========');
            console.log('[NotificationsController] Existing messages count:', existingMessages.length);
            const existingShareIds = new Set();
            existingMessages.forEach(msg => {
                if (msg.content && msg.content.startsWith('📤 Share Request')) {
                    const shareIdMatch = msg.content.match(/Share ID: (\d+)/);
                    if (shareIdMatch) {
                        const shareId = parseInt(shareIdMatch[1], 10);
                        existingShareIds.add(shareId);
                        console.log('[NotificationsController] Found existing share request message for share ID:', shareId);
                    }
                }
            });
            console.log('[NotificationsController] Share IDs that already have messages:', Array.from(existingShareIds));

            // Create messages for shares that don't have messages yet (regardless of status)
            console.log('[NotificationsController] ========== CREATING MESSAGES FOR SHARES ==========');
            let messagesCreated = 0;
            let messagesSkipped = 0;
            for (const share of allShares) {
                if (!existingShareIds.has(share.id)) {
                    console.log('[NotificationsController] ========== CREATING MESSAGE FOR SHARE ==========');
                    console.log('[NotificationsController] Share details:', {
                        id: share.id,
                        status: share.status,
                        conversation_id: share.conversation_id,
                        owner: share.owner_user_id,
                        recipient: share.shared_with_user_id,
                        access_level: share.access_level,
                        share_all_data: share.share_all_data
                    });
                    
                    // Parse shared_months
                    let parsedSharedMonths = [];
                    if (share.shared_months) {
                        if (typeof share.shared_months === 'string') {
                            try {
                                parsedSharedMonths = JSON.parse(share.shared_months);
                            } catch (e) {
                                console.warn('[NotificationsController] Error parsing shared_months:', e);
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
                    
                    console.log('[NotificationsController] Message content preview:', shareMessageContent.substring(0, 100) + '...');
                    console.log('[NotificationsController] Sender ID:', senderId);
                    console.log('[NotificationsController] Recipient ID:', recipientId);
                    
                    if (typeof window.MessagingService !== 'undefined') {
                        console.log('[NotificationsController] Calling MessagingService.sendMessage()...');
                        const messageResult = await window.MessagingService.sendMessage(
                            conversationId,
                            senderId,
                            recipientId,
                            shareMessageContent
                        );
                        
                        if (messageResult.success) {
                            messagesCreated++;
                            console.log('[NotificationsController] ✅ SUCCESS: Created message for share:', share.id, 'status:', share.status);
                            console.log('[NotificationsController] Message result:', {
                                success: messageResult.success,
                                messageId: messageResult.message?.id,
                                error: messageResult.error
                            });
                        } else {
                            console.error('[NotificationsController] ❌ FAILED: Failed to create message for share:', share.id);
                            console.error('[NotificationsController] Error details:', messageResult.error);
                        }
                    } else {
                        console.error('[NotificationsController] ❌ MessagingService not available');
                    }
                } else {
                    messagesSkipped++;
                    console.log('[NotificationsController] ⏭️ SKIPPED: Share', share.id, 'already has a message');
                }
            }
            
            console.log('[NotificationsController] ========== MESSAGE CREATION SUMMARY ==========');
            console.log('[NotificationsController] Total shares processed:', allShares.length);
            console.log('[NotificationsController] Messages created:', messagesCreated);
            console.log('[NotificationsController] Messages skipped (already exist):', messagesSkipped);
            console.log('[NotificationsController] ========== createMessagesForShares() COMPLETE ==========');
        } catch (error) {
            console.error('[NotificationsController] ========== ERROR in createMessagesForShares() ==========');
            console.error('[NotificationsController] Error:', error);
            console.error('[NotificationsController] Error stack:', error.stack);
        }
    },

    /**
     * Render message thread with messages (including share request messages)
     */
    async renderMessageThread(messages) {
        console.log('[NotificationsController] renderMessageThread() called', { 
            messageCount: messages.length,
            messageIds: messages.map(m => m.id)
        });
        const messageThread = document.getElementById('message-thread');
        if (!messageThread) {
            console.warn('[NotificationsController] message-thread element not found');
            return;
        }

        const currentUserId = await window.DatabaseService?._getCurrentUserId?.() || null;
        console.log('[NotificationsController] Current user ID for message rendering:', currentUserId);
        
        // Reverse messages to show oldest first
        const sortedMessages = [...messages].reverse();
        console.log('[NotificationsController] Sorted messages (oldest first):', sortedMessages.length);

        // Render messages - detect share request messages and render them specially
        console.log('[NotificationsController] ========== RENDERING MESSAGES ==========');
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
                console.log('[NotificationsController] ========== RENDERING SHARE REQUEST MESSAGE ==========');
                console.log('[NotificationsController] Message index:', index);
                console.log('[NotificationsController] Message ID:', msg.id);
                console.log('[NotificationsController] Message content preview:', msg.content.substring(0, 150));
                
                // Parse share ID from message content
                const shareIdMatch = msg.content.match(/Share ID: (\d+)/);
                const shareId = shareIdMatch ? parseInt(shareIdMatch[1], 10) : null;
                console.log('[NotificationsController] Extracted share ID:', shareId);
                
                let share = null;
                let actionButtons = '';
                
                if (shareId && typeof window.DatabaseService !== 'undefined') {
                    try {
                        console.log('[NotificationsController] Loading share details from database for share ID:', shareId);
                        const tableName = window.DatabaseService._getTableName('dataShares');
                        const shareResult = await window.DatabaseService.querySelect(tableName, {
                            filter: { id: shareId },
                            limit: 1
                        });
                        console.log('[NotificationsController] Share query result:', {
                            success: shareResult.success,
                            hasError: !!shareResult.error,
                            error: shareResult.error,
                            hasData: !!shareResult.data,
                            found: shareResult.data?.length > 0,
                            share: shareResult.data?.[0] ? {
                                id: shareResult.data[0].id,
                                status: shareResult.data[0].status,
                                conversation_id: shareResult.data[0].conversation_id
                            } : null
                        });
                        
                        if (shareResult.data && shareResult.data.length > 0 && !shareResult.error) {
                            share = shareResult.data[0];
                            console.log('[NotificationsController] Share loaded:', {
                                id: share.id,
                                status: share.status,
                                owner: share.owner_user_id,
                                recipient: share.shared_with_user_id,
                                currentUserId: currentUserId,
                                isRecipient: share.shared_with_user_id === currentUserId
                            });
                            
                            // Parse shared_months if it's a string
                            if (typeof share.shared_months === 'string') {
                                try {
                                    share.shared_months = JSON.parse(share.shared_months);
                                } catch (e) {
                                    console.warn('[NotificationsController] Error parsing shared_months:', e);
                                    share.shared_months = [];
                                }
                            }
                            
                            // Show action buttons if share is pending and current user is recipient
                            if (share.status === 'pending' && share.shared_with_user_id === currentUserId) {
                                console.log('[NotificationsController] Adding action buttons (pending share, user is recipient)');
                                actionButtons = `
                                    <div style="margin-top: var(--spacing-sm); display: flex; gap: var(--spacing-xs);">
                                        <button class="btn btn-sm btn-primary accept-share-conversation-btn" data-share-id="${share.id}">Accept</button>
                                        <button class="btn btn-sm btn-secondary decline-share-conversation-btn" data-share-id="${share.id}">Decline</button>
                                        <button class="btn btn-sm btn-danger block-user-conversation-share-btn" data-user-id="${share.owner_user_id}">Block</button>
                                    </div>
                                `;
                            } else if (share.status !== 'pending') {
                                // Show status for non-pending shares
                                const statusText = share.status === 'accepted' ? 'Accepted' : share.status === 'declined' ? 'Declined' : share.status;
                                console.log('[NotificationsController] Adding status display (non-pending share):', statusText);
                                actionButtons = `<div style="margin-top: var(--spacing-sm); color: var(--text-color-secondary);"><strong>Status:</strong> ${statusText}</div>`;
                            } else {
                                console.log('[NotificationsController] No action buttons (share is pending but user is not recipient)');
                            }
                        } else {
                            console.warn('[NotificationsController] Share not found in database for share ID:', shareId);
                        }
                    } catch (error) {
                        console.error('[NotificationsController] Error loading share details:', error);
                        console.error('[NotificationsController] Error stack:', error.stack);
                    }
                } else {
                    console.warn('[NotificationsController] Cannot load share details:', {
                        hasShareId: !!shareId,
                        hasDatabaseService: typeof window.DatabaseService !== 'undefined'
                    });
                }
                
                // Render share request as a special message
                console.log('[NotificationsController] Rendering share request message HTML for share ID:', shareId);
                const shareRequestHtml = `
                    <div class="message-item share-request-message ${alignClass}" style="margin-bottom: var(--spacing-md); text-align: ${alignClass};">
                        <div style="display: inline-block; max-width: 80%; padding: var(--spacing-md); background: ${isOwnMessage ? 'var(--primary-color)' : 'var(--hover-overlay)'}; border: 2px solid ${isOwnMessage ? 'rgba(255,255,255,0.3)' : 'var(--primary-color)'}; border-radius: var(--border-radius); color: ${isOwnMessage ? 'white' : 'var(--text-color)'};">
                            <div style="white-space: pre-line; font-size: 0.9rem;">${msg.content.replace(/Share ID: \d+/, '').trim()}</div>
                            ${actionButtons}
                            <div style="font-size: 0.75rem; margin-top: var(--spacing-sm); opacity: 0.7;">${dateString}</div>
                        </div>
                    </div>
                `;
                console.log('[NotificationsController] ✅ Share request message HTML generated');
                return shareRequestHtml;
            } else {
                // Regular message
                regularMessageCount++;
                return `
                    <div class="message-item ${alignClass}" style="margin-bottom: var(--spacing-md); text-align: ${alignClass};">
                        <div style="display: inline-block; max-width: 70%; padding: var(--spacing-sm) var(--spacing-md); background: ${isOwnMessage ? 'var(--primary-color)' : 'var(--surface-color)'}; color: ${isOwnMessage ? 'white' : 'var(--text-color)'}; border-radius: var(--border-radius);">
                            <div style="font-size: 0.85rem; margin-bottom: var(--spacing-xs); opacity: 0.8;">${msg.sender_email}</div>
                            <div style="white-space: pre-line;">${msg.content}</div>
                            <div style="font-size: 0.75rem; margin-top: var(--spacing-xs); opacity: 0.7;">${dateString}</div>
                        </div>
                    </div>
                `;
            }
        });
        
        console.log('[NotificationsController] ========== GENERATING HTML FOR ALL MESSAGES ==========');
        const itemsHtml = await Promise.all(itemsHtmlPromises);
        console.log('[NotificationsController] HTML generation complete:', {
            totalItems: itemsHtml.length,
            shareRequestMessages: shareRequestMessageCount,
            regularMessages: regularMessageCount
        });

        console.log('[NotificationsController] ========== INSERTING HTML INTO DOM ==========');
        messageThread.innerHTML = itemsHtml.join('');
        messageThread.scrollTop = messageThread.scrollHeight;
        console.log('[NotificationsController] HTML inserted, scroll position set');
        
        // Setup event listeners for share action buttons
        console.log('[NotificationsController] Setting up share request listeners...');
        this.setupShareRequestListeners();
        console.log('[NotificationsController] Share request listeners set up');
        
        console.log('[NotificationsController] ========== MESSAGE THREAD RENDERING COMPLETE ==========');
        console.log('[NotificationsController] Final render summary:', { 
            itemCount: itemsHtml.length,
            shareRequestCount: shareRequestMessageCount,
            regularMessageCount: regularMessageCount,
            scrollPosition: messageThread.scrollTop,
            scrollHeight: messageThread.scrollHeight
        });
    },

    /**
     * Handle sending a message
     */
    async handleSendMessage() {
        console.log('[NotificationsController] handleSendMessage() called', { 
            conversationId: this.currentConversationId 
        });
        const messageInput = document.getElementById('message-input');
        if (!messageInput || !this.currentConversationId) {
            console.warn('[NotificationsController] Cannot send message:', { 
                hasInput: !!messageInput, 
                hasConversationId: !!this.currentConversationId 
            });
            return;
        }

        const content = messageInput.value.trim();
        if (!content) {
            console.warn('[NotificationsController] Message content is empty');
            return;
        }
        console.log('[NotificationsController] Sending message:', { 
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

            if (result.success) {
                messageInput.value = '';
                // Reload messages to show the new one
                await this.openConversation(this.currentConversationId);
            } else {
                throw new Error(result.error || 'Failed to send message');
            }
        } catch (error) {
            console.error('[NotificationsController] Error sending message:', error);
            alert(`Error sending message: ${error.message}`);
        }
    },

    /**
     * Show new message modal
     */
    showNewMessageModal() {
        console.log('[NotificationsController] showNewMessageModal() called');
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
        console.log('[NotificationsController] hideNewMessageModal() called');
        const modal = document.getElementById('new-message-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    /**
     * Handle sending a new message from the modal
     */
    async handleSendNewMessage() {
        console.log('[NotificationsController] handleSendNewMessage() called');
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

            console.log('[NotificationsController] Sending new message:', { recipientEmail, contentLength: messageContent.length });

            // Send message (this will create conversation if needed)
            const result = await window.DatabaseService.sendMessage(recipientEmail, messageContent);
            if (result.success) {
                // Close modal and clear form
                this.hideNewMessageModal();
                recipientEmailInput.value = '';
                messageContentInput.value = '';
                
                // Switch to messages view if not already there
                if (this.currentView !== 'messages') {
                    this.currentView = 'messages';
                    this.currentCategory = 'messaging';
                    const filterDropdown = document.getElementById('filter-dropdown');
                    if (filterDropdown) filterDropdown.value = 'messaging';
                    this.switchView('messages');
                }
                
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
                    console.log('[NotificationsController] Conversation not found after sending, reloading list');
                }
            } else {
                throw new Error(result.error || 'Failed to start conversation');
            }
        } catch (error) {
            console.error('[NotificationsController] Error sending new message:', error);
            alert(`Error: ${error.message}`);
        }
    },

    /**
     * Handle share data button click
     */
    async handleShareDataClick() {
        console.log('[NotificationsController] handleShareDataClick() called');
        
        if (!this.currentConversationId) {
            console.warn('[NotificationsController] No conversation open, cannot share data');
            return;
        }

        const conversation = this.conversations.find(c => c.id === this.currentConversationId);
        if (!conversation) {
            console.error('[NotificationsController] Conversation not found');
            return;
        }

        const otherUserEmail = conversation.other_user_email;
        if (!otherUserEmail) {
            console.error('[NotificationsController] No email found for conversation partner');
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
        console.log('[NotificationsController] loadShareDataMonths() called');
        
        try {
            if (typeof window.DatabaseService === 'undefined') {
                console.error('[NotificationsController] DatabaseService not available');
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
                console.warn('[NotificationsController] share-data-months-checkboxes container not found');
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

            console.log('[NotificationsController] Loaded', monthKeys.length, 'months for sharing');
        } catch (error) {
            console.error('[NotificationsController] Error loading months for sharing:', error);
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
        console.log('[NotificationsController] handleSaveShareData() called');

        if (!this.currentConversationId) {
            console.error('[NotificationsController] No conversation open');
            alert('No conversation open');
            return;
        }

        // Wait for payments module and SubscriptionGuard to be available
        if (window.waitForPaymentsInit) {
            console.log('[NotificationsController] Waiting for payments module initialization...');
            try {
                await window.waitForPaymentsInit();
                console.log('[NotificationsController] Payments module initialized');
            } catch (error) {
                console.warn('[NotificationsController] Payments module initialization failed:', error);
            }
        }

        // Wait for SubscriptionGuard to be available
        if (!window.SubscriptionGuard) {
            console.warn('[NotificationsController] SubscriptionGuard not available, waiting...');
            let waitCount = 0;
            const maxWait = 50; // Wait up to 5 seconds
            while (!window.SubscriptionGuard && waitCount < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            if (!window.SubscriptionGuard) {
                console.error('[NotificationsController] SubscriptionGuard not available after waiting');
                alert('Subscription service not available. Please refresh the page.');
                return;
            }
        }

        const conversation = this.conversations.find(c => c.id === this.currentConversationId);
        if (!conversation) {
            console.error('[NotificationsController] Conversation not found');
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
            console.error('[NotificationsController] Share form elements not found');
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
                console.error('[NotificationsController] Error loading all months:', error);
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

            console.log('[NotificationsController] Creating data share:', {
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
                    console.warn('[NotificationsController] Failed to link share to conversation:', updateResult.error);
                } else {
                    console.log('[NotificationsController] Share linked to conversation:', this.currentConversationId);
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
            console.error('[NotificationsController] Error saving share:', error);
            if (statusDiv) {
                statusDiv.innerHTML = `<p style="color: var(--error-color);">Error: ${error.message}</p>`;
            } else {
                alert(`Error: ${error.message}`);
            }
        }
    }
};

if (typeof window !== 'undefined') {
    window.NotificationsController = NotificationsController;
}

// Export to window for global access
if (typeof window !== 'undefined') {
    window.NotificationsController = NotificationsController;
    console.log('[NotificationsController] NotificationsController assigned to window.NotificationsController');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationsController;
}

