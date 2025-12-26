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
            this.updateFilterDropdown(); // Set initial dropdown value
            await this.loadNotifications();
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
                    this.switchView('notifications');
                    this.renderNotifications();
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
            backToConversationsButton.addEventListener('click', () => {
                this.handleBackToConversations();
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
                this.renderNotifications();
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
                // Delete the notification instead of just marking as read
                if (notificationId && typeof window.NotificationService !== 'undefined') {
                    const deleteResult = await window.NotificationService.deleteNotification(notificationId);
                    if (!deleteResult.success) {
                        console.warn('[NotificationsController] Failed to delete notification after accepting share:', deleteResult.error);
                    }
                }
                await this.loadNotifications();
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
                // Delete the notification instead of just marking as read
                if (notificationId && typeof window.NotificationService !== 'undefined') {
                    const deleteResult = await window.NotificationService.deleteNotification(notificationId);
                    if (!deleteResult.success) {
                        console.warn('[NotificationsController] Failed to delete notification after declining share:', deleteResult.error);
                    }
                }
                await this.loadNotifications();
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
                // Go back to conversations list
                this.handleBackToConversations();
                // Reload conversations to refresh the list
                await this.loadConversations();
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
                this.renderNotifications();
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
    handleBackToConversations() {
        console.log('[NotificationsController] handleBackToConversations() called');
        const conversationsList = document.getElementById('conversations-list');
        const messageThreadContainer = document.getElementById('message-thread-container');

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

            // Set partner name and show block button
            const partnerNameElement = document.getElementById('conversation-partner-name');
            const blockButton = document.getElementById('block-user-conversation-btn');
            if (partnerNameElement) {
                partnerNameElement.textContent = conversation.other_user_email || 'Unknown User';
            }
            if (blockButton) {
                blockButton.style.display = 'inline-block';
                blockButton.dataset.userId = conversation.other_user_id;
                blockButton.dataset.userEmail = conversation.other_user_email || 'Unknown User';
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
                await this.renderMessageThread(messages);

                // Mark conversation as read
                console.log('[NotificationsController] Marking conversation as read:', conversationId);
                const markReadResult = await window.DatabaseService.markConversationAsRead(conversationId);
                console.log('[NotificationsController] Mark as read result:', markReadResult);
                await this.loadConversations(); // Refresh to update unread counts
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
     * Render message thread
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

        // Reverse messages to show oldest first
        const sortedMessages = [...messages].reverse();
        console.log('[NotificationsController] Sorted messages (oldest first):', sortedMessages.length);

        const currentUserId = await window.DatabaseService?._getCurrentUserId?.() || null;
        console.log('[NotificationsController] Current user ID for message rendering:', currentUserId);

        const messagesHtml = sortedMessages.map(msg => {
            const isOwnMessage = msg.sender_id === currentUserId;
            const alignClass = isOwnMessage ? 'right' : 'left';
            const date = new Date(msg.created_at);
            const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="message-item ${alignClass}" style="margin-bottom: var(--spacing-md); text-align: ${alignClass};">
                    <div style="display: inline-block; max-width: 70%; padding: var(--spacing-sm) var(--spacing-md); background: ${isOwnMessage ? 'var(--primary-color)' : 'var(--surface-color)'}; color: ${isOwnMessage ? 'white' : 'var(--text-color)'}; border-radius: var(--border-radius);">
                        <div style="font-size: 0.85rem; margin-bottom: var(--spacing-xs); opacity: 0.8;">${msg.sender_email}</div>
                        <div>${msg.content}</div>
                        <div style="font-size: 0.75rem; margin-top: var(--spacing-xs); opacity: 0.7;">${dateString}</div>
                    </div>
                </div>
            `;
        });

        messageThread.innerHTML = messagesHtml.join('');
        messageThread.scrollTop = messageThread.scrollHeight;
        console.log('[NotificationsController] Message thread rendered:', { 
            messageCount: messagesHtml.length,
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

