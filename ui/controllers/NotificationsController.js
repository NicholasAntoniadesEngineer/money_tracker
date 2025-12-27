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
            await Promise.all([
                this.loadNotifications(),
                this.loadConversations()
            ]);
            
            // Render the combined 'all' view (notifications + conversations)
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
        const newMessageModal = document.getElementById('new-message-modal');
        const closeNewMessageModal = document.getElementById('close-new-message-modal');
        const cancelNewMessageButton = document.getElementById('cancel-new-message-button');
        const sendNewMessageButton = document.getElementById('send-new-message-button');

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

        if (this.currentFilter === 'unread') {
            filteredNotifications = this.notifications.filter(n => !n.read);
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
                
                alert('Share declined');
            } else {
                throw new Error(result.error || 'Failed to decline share');
            }
        } catch (error) {
            console.error('[NotificationsController] Error declining share:', error);
            alert('Error declining share: ' + error.message);
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
        console.log('[NotificationsController] loadConversations() called');
        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.getConversations();
            if (result.success) {
                this.conversations = result.conversations || [];
                this.renderConversations();
            } else {
                throw new Error(result.error || 'Failed to load conversations');
            }
        } catch (error) {
            console.error('[NotificationsController] Error loading conversations:', error);
            const list = document.getElementById('conversations-list');
            if (list) {
                list.innerHTML = `<p style="color: var(--danger-color);">Error loading conversations: ${error.message}</p>`;
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
            previousConversationId: this.currentConversationId
        });
        this.currentConversationId = conversationId;

        const conversationsList = document.getElementById('conversations-list');
        const messageThreadContainer = document.getElementById('message-thread-container');
        const messageThread = document.getElementById('message-thread');

        if (!messageThreadContainer || !messageThread) return;

        // Hide conversations list, show message thread
        if (conversationsList) conversationsList.style.display = 'none';
        messageThreadContainer.style.display = 'block';
        messageThread.innerHTML = '<p>Loading messages...</p>';

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
                    messageIds: messages.map(m => m.id)
                });
                
                // Check for pending shares without messages and create messages for them
                await this.createMessagesForPendingShares(conversationId, conversation, messages);
                
                // Reload messages after potentially creating new ones
                const updatedResult = await window.DatabaseService.getMessages(conversationId);
                const updatedMessages = updatedResult.success ? (updatedResult.messages || []) : messages;
                
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
     * Create messages for pending shares that don't have messages yet
     */
    async createMessagesForPendingShares(conversationId, conversation, existingMessages) {
        try {
            if (typeof window.DatabaseService === 'undefined') {
                return;
            }

            const currentUserId = await window.DatabaseService._getCurrentUserId();
            if (!currentUserId) {
                return;
            }

            const otherUserId = conversation.other_user_id;
            if (!otherUserId) {
                console.warn('[NotificationsController] No other_user_id in conversation');
                return;
            }

            // Find all pending shares between current user and other user
            // This includes shares that might not have conversation_id set yet
            const tableName = window.DatabaseService._getTableName('dataShares');
            
            // Query for shares with conversation_id matching
            const sharesResult1 = await window.DatabaseService.querySelect(tableName, {
                filter: {
                    conversation_id: conversationId,
                    status: 'pending'
                }
            });

            // Query for shares where current user is owner and other user is recipient (without conversation_id)
            const sharesResult2 = await window.DatabaseService.querySelect(tableName, {
                filter: {
                    owner_user_id: currentUserId,
                    shared_with_user_id: otherUserId,
                    status: 'pending'
                }
            });

            // Query for shares where other user is owner and current user is recipient (without conversation_id)
            const sharesResult3 = await window.DatabaseService.querySelect(tableName, {
                filter: {
                    owner_user_id: otherUserId,
                    shared_with_user_id: currentUserId,
                    status: 'pending'
                }
            });

            // Combine results and filter for shares without conversation_id (to avoid duplicates)
            let allPendingShares = [];
            if (sharesResult1.success && sharesResult1.data) {
                allPendingShares = [...allPendingShares, ...sharesResult1.data];
            }
            if (sharesResult2.success && sharesResult2.data) {
                // Only include shares that don't have conversation_id (to avoid duplicates with sharesResult1)
                const sharesWithoutConversationId = sharesResult2.data.filter(share => 
                    !share.conversation_id || share.conversation_id === null
                );
                allPendingShares = [...allPendingShares, ...sharesWithoutConversationId];
            }
            if (sharesResult3.success && sharesResult3.data) {
                // Only include shares that don't have conversation_id (to avoid duplicates with sharesResult1)
                const sharesWithoutConversationId = sharesResult3.data.filter(share => 
                    !share.conversation_id || share.conversation_id === null
                );
                allPendingShares = [...allPendingShares, ...sharesWithoutConversationId];
            }

            // Remove duplicates based on share.id
            const uniqueShares = [];
            const seenIds = new Set();
            for (const share of allPendingShares) {
                if (!seenIds.has(share.id)) {
                    seenIds.add(share.id);
                    uniqueShares.push(share);
                }
            }

            const pendingShares = uniqueShares;
            console.log('[NotificationsController] Found pending shares for conversation:', pendingShares.length, {
                conversationId,
                currentUserId,
                otherUserId,
                shares: pendingShares.map(s => ({ id: s.id, conversation_id: s.conversation_id, owner: s.owner_user_id, recipient: s.shared_with_user_id }))
            });

            // Update shares that don't have conversation_id set
            for (const share of pendingShares) {
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
            const existingShareIds = new Set();
            existingMessages.forEach(msg => {
                if (msg.content && msg.content.startsWith('📤 Share Request')) {
                    const shareIdMatch = msg.content.match(/Share ID: (\d+)/);
                    if (shareIdMatch) {
                        existingShareIds.add(parseInt(shareIdMatch[1], 10));
                    }
                }
            });

            // Create messages for shares that don't have messages yet
            for (const share of pendingShares) {
                if (!existingShareIds.has(share.id)) {
                    console.log('[NotificationsController] Creating message for pending share:', share.id);
                    
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
                    
                    const shareMessageContent = `📤 Share Request\n\n` +
                        `Access Level: ${share.access_level}\n` +
                        `Months: ${monthsList}\n` +
                        `${(share.shared_pots || share.share_all_data) ? 'Pots: Yes\n' : ''}` +
                        `${(share.shared_settings || share.share_all_data) ? 'Settings: Yes\n' : ''}` +
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
                        
                        if (messageResult.success) {
                            console.log('[NotificationsController] ✅ Created message for pending share:', share.id);
                        } else {
                            console.error('[NotificationsController] ❌ Failed to create message for share:', messageResult.error);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[NotificationsController] Error creating messages for pending shares:', error);
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
        const itemsHtmlPromises = sortedMessages.map(async (msg) => {
            const isOwnMessage = msg.sender_id === currentUserId;
            const alignClass = isOwnMessage ? 'right' : 'left';
            const date = new Date(msg.created_at);
            const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Check if this is a share request message (starts with "📤 Share Request")
            const isShareRequest = msg.content && msg.content.startsWith('📤 Share Request');
            
            if (isShareRequest) {
                // Parse share ID from message content
                const shareIdMatch = msg.content.match(/Share ID: (\d+)/);
                const shareId = shareIdMatch ? parseInt(shareIdMatch[1], 10) : null;
                
                let share = null;
                let actionButtons = '';
                
                if (shareId && typeof window.DatabaseService !== 'undefined') {
                    try {
                        const tableName = window.DatabaseService._getTableName('dataShares');
                        const shareResult = await window.DatabaseService.querySelect(tableName, {
                            filter: { id: shareId },
                            limit: 1
                        });
                        if (shareResult.success && shareResult.data && shareResult.data.length > 0) {
                            share = shareResult.data[0];
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
                                actionButtons = `<div style="margin-top: var(--spacing-sm); color: var(--text-color-secondary);"><strong>Status:</strong> ${statusText}</div>`;
                            }
                        }
                    } catch (error) {
                        console.warn('[NotificationsController] Error loading share details:', error);
                    }
                }
                
                // Render share request as a special message
                return `
                    <div class="message-item share-request-message ${alignClass}" style="margin-bottom: var(--spacing-md); text-align: ${alignClass};">
                        <div style="display: inline-block; max-width: 80%; padding: var(--spacing-md); background: ${isOwnMessage ? 'var(--primary-color)' : 'var(--hover-overlay)'}; border: 2px solid ${isOwnMessage ? 'rgba(255,255,255,0.3)' : 'var(--primary-color)'}; border-radius: var(--border-radius); color: ${isOwnMessage ? 'white' : 'var(--text-color)'};">
                            <div style="font-size: 0.9rem; margin-bottom: var(--spacing-xs); font-weight: bold;">📤 Share Request</div>
                            <div style="white-space: pre-line; font-size: 0.9rem;">${msg.content.replace(/Share ID: \d+/, '').trim()}</div>
                            ${actionButtons}
                            <div style="font-size: 0.75rem; margin-top: var(--spacing-sm); opacity: 0.7;">${dateString}</div>
                        </div>
                    </div>
                `;
            } else {
                // Regular message
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
        
        const itemsHtml = await Promise.all(itemsHtmlPromises);

        messageThread.innerHTML = itemsHtml.join('');
        messageThread.scrollTop = messageThread.scrollHeight;
        
        // Setup event listeners for share action buttons
        this.setupShareRequestListeners();
        
        console.log('[NotificationsController] Message thread rendered:', { 
            itemCount: itemsHtml.length,
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

