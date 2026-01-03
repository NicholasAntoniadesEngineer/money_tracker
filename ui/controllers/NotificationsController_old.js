/**
 * Notifications Controller
 * Handles the notifications page UI and interactions
 */

const NotificationsController = {
    currentFilter: 'all',
    currentCategory: null, // 'sharing', 'payments', or null for all
    // Performance optimizations
    enableVerboseLogging: false, // Set to true for debugging
    notifications: [],
    // Loading guards to prevent duplicate concurrent calls
    isLoadingNotifications: false,
    notificationsLoadPromise: null, // Cache the promise to reuse for concurrent calls

    /**
     * Initialize the notifications page
     */
    async init() {
        // Guard: Prevent multiple initializations
        if (this.isInitializing) {
            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] init() - already initializing, ignoring duplicate call');
            }
            return;
        }
        this.isInitializing = true;

        try {
            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] init() called');
            }

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

            // Load notifications
            await this.loadNotifications();

            // Render the notifications view
            this.renderNotifications();
            
            this.updateFilterDropdown(); // Set initial dropdown value to 'all'
        } catch (error) {
            console.error('[NotificationsController] Error initializing:', error);
            alert('Error loading notifications. Please check console for details.');
        } finally {
            this.isInitializing = false;
        }
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const filterDropdown = document.getElementById('filter-dropdown');
        const markAllRead = document.getElementById('mark-all-read-button');

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
            });
        }

        if (markAllRead) {
            markAllRead.addEventListener('click', () => {
                this.handleMarkAllRead();
            });
        }

        },

    /**
     * Update filter dropdown value
     */
    updateFilterDropdown() {
        const filterDropdown = document.getElementById('filter-dropdown');
        if (!filterDropdown) return;

        if (this.currentCategory === 'sharing') {
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
     * Prevents duplicate concurrent calls by reusing the same promise
     */
    async loadNotifications() {
        // If already loading, return the existing promise
        if (this.notificationsLoadPromise) {
            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] loadNotifications() - reusing existing promise');
            }
            return this.notificationsLoadPromise;
        }

        // If currently loading, wait for it to complete
        if (this.isLoadingNotifications) {
            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] loadNotifications() - waiting for existing load');
            }
            while (this.isLoadingNotifications && this.notificationsLoadPromise) {
                await this.notificationsLoadPromise;
            }
            return;
        }

        // Start loading
        this.isLoadingNotifications = true;
        this.notificationsLoadPromise = (async () => {
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
            } finally {
                // Clear loading state
                this.isLoadingNotifications = false;
                this.notificationsLoadPromise = null;
            }
        })();

        return this.notificationsLoadPromise;
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
     * Render notifications list
     */
    async renderNotifications() {
        if (this.enableVerboseLogging) {
            console.log('[NotificationsController] renderNotifications() called', { filter: this.currentFilter, count: this.notifications.length });
        }

        const list = document.getElementById('notifications-list');
        if (!list) {
            return;
        }

        let filteredNotifications = this.notifications;

        // Filter out share_request notifications that have a conversation_id
        // These are shown as messages in the conversation thread instead
        filteredNotifications = filteredNotifications.filter(n => {
            if (n.type === 'share_request' && n.conversation_id) {
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

        // Batch fetch all user emails before rendering
        const userIds = filteredNotifications
            .map(n => n.from_user_id)
            .filter(id => id);
        await this.batchFetchUserEmails(userIds);

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
            <div class="notification-item conversation-item" data-conversation-id="${conversation.id}" style="padding: var(--spacing-md); border: var(--border-width-standard) solid var(--border-color); border-radius: var(--border-radius); margin-bottom: var(--spacing-sm); cursor: pointer; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--spacing-sm);">
                <div style="flex: 1 1 auto; min-width: 0; max-width: 100%;">
                    <strong>${conversation.other_user_email || 'Unknown User'}</strong>${unreadBadge}
                    ${conversation.last_message ? `<div style="color: var(--text-color-secondary); font-size: 0.9em; margin-top: var(--spacing-xs); word-wrap: break-word;">${conversation.last_message.substring(0, 100)}${conversation.last_message.length > 100 ? '...' : ''}</div>` : ''}
                </div>
                <div style="color: var(--text-color-secondary); font-size: 0.85em; flex-shrink: 0;">
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
            // Use cached email (should be pre-fetched in batch)
            const fromUserEmail = this.getUserEmail(notification.from_user_id);

            const typeConfig = typeof window.NotificationTypeRegistry !== 'undefined' 
                ? window.NotificationTypeRegistry.getType(notification.type)
                : null;

            const typeName = typeConfig ? typeConfig.name : notification.type;
            const readClass = notification.read ? 'read' : 'unread';
            const readIcon = notification.read ? 'fa-check-circle' : 'fa-circle';

            let actionButtons = '';
            let replyButton = '';
            if (notification.type === 'share_request' && notification.share_id && !notification.read) {
                actionButtons = `
                    <div class="notification-actions" style="margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap; max-width: 100%;">
                        <button class="btn btn-primary btn-sm accept-share-btn" data-share-id="${notification.share_id}" data-notification-id="${notification.id}" style="padding: 4px 8px; font-size: 0.75rem; flex: 0 1 auto; min-width: 0; max-width: 100%;">Accept</button>
                        <button class="btn btn-secondary btn-sm decline-share-btn" data-share-id="${notification.share_id}" data-notification-id="${notification.id}" style="padding: 4px 8px; font-size: 0.75rem; flex: 0 1 auto; min-width: 0; max-width: 100%;">Decline</button>
                        <button class="btn btn-danger btn-sm block-user-btn" data-user-id="${notification.from_user_id}" data-notification-id="${notification.id}" style="padding: 4px 8px; font-size: 0.75rem; flex: 0 1 auto; min-width: 0; max-width: 100%;">Block</button>
                    </div>
                `;
            } else if (notification.type === 'message_received' && notification.conversation_id) {
                replyButton = `<button class="btn btn-primary btn-sm reply-message-btn" data-conversation-id="${notification.conversation_id}" data-notification-id="${notification.id}" style="padding: 2px 6px; font-size: 0.75rem; flex: 0 1 auto; min-width: 0; max-width: 100%;">Reply</button>`;
            }

            const date = new Date(notification.created_at);
            const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="notification-item ${readClass}" data-notification-id="${notification.id}" style="padding: var(--spacing-sm); border: var(--border-width-standard) solid var(--border-color); border-radius: var(--border-radius); margin-bottom: var(--spacing-xs); background: ${notification.read ? 'var(--surface-color)' : 'var(--hover-overlay)'};">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0;">
                        <div style="flex: 1;">
                            <div style="display: flex; align-items: center; gap: var(--spacing-xs); margin-bottom: 2px;">
                                <i class="fa-regular ${readIcon}" style="color: ${notification.read ? 'var(--text-color-secondary)' : 'var(--primary-color)'}; font-size: 0.85rem;"></i>
                                <strong style="font-size: 0.9rem;">${typeName}</strong>
                            </div>
                            <p style="margin: 0; color: var(--text-primary); font-size: 0.85rem; line-height: 1.3;">From: ${fromUserEmail}</p>
                            ${notification.message ? `<p style="margin: 2px 0 0 0; color: var(--text-color-secondary); font-size: 0.85rem; line-height: 1.3;">${notification.message}</p>` : ''}
                            ${actionButtons}
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: end; gap: 2px; margin-left: var(--spacing-sm); flex-shrink: 0;">
                            <span style="font-size: 0.75rem; color: var(--text-color-secondary);">${dateString}</span>
                            <div style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap; max-width: 100%;">
                                ${replyButton}
                                <button class="btn btn-sm btn-secondary delete-notification-btn" data-notification-id="${notification.id}" style="padding: 2px 6px; font-size: 0.75rem; flex: 0 1 auto; min-width: 0; max-width: 100%;">Delete</button>
                            </div>
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
     * Prevents duplicate concurrent calls by reusing the same promise
     */
    async loadConversations() {
        // If already loading, return the existing promise
        if (this.conversationsLoadPromise) {
            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] loadConversations() - reusing existing promise');
            }
            return this.conversationsLoadPromise;
        }

        // If currently loading, wait for it to complete
        if (this.isLoadingConversations) {
            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] loadConversations() - waiting for existing load');
            }
            while (this.isLoadingConversations && this.conversationsLoadPromise) {
                await this.conversationsLoadPromise;
            }
            return;
        }

        // Start loading
        this.isLoadingConversations = true;
        this.conversationsLoadPromise = (async () => {
            try {
                if (typeof window.DatabaseService === 'undefined') {
                    throw new Error('DatabaseService not available');
                }

                const result = await window.DatabaseService.getConversations();
                if (result.success) {
                    this.conversations = result.conversations || [];
                    
                    // Only render conversations list if we're in the messages view
                    // Otherwise, let the caller handle rendering via renderAllView()
                    if (this.currentView === 'messages') {
                        this.renderConversations();
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
            } finally {
                // Clear loading state
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
        if (this.enableVerboseLogging) {
            console.log('[NotificationsController] renderConversations() called', { 
                count: this.conversations.length,
                conversations: this.conversations.map(c => ({ id: c.id, other_user_email: c.other_user_email, unread_count: c.unread_count }))
            });
        }
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

        // Setup click listeners (clone and replace to remove old listeners)
        const newList = list.cloneNode(true);
        list.parentNode.replaceChild(newList, list);
        
        // Attach listeners to the new list
        newList.querySelectorAll('.conversation-item').forEach(item => {
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
        this.switchView('notifications');

        // Reload both in parallel (guards prevent duplicates)
        await Promise.all([
            this.loadConversations(),
            this.loadNotifications()
        ]);

        // Explicitly render the all view to ensure it's displayed
        this.renderAllView();

        // Update notification count in header
        if (typeof window.Header !== 'undefined') {
            window.Header.updateNotificationCount();
        }
    },

    /**
     * Open a conversation thread
     */
    async openConversation(conversationId) {
        // Guard: Prevent multiple simultaneous opens
        if (this.isOpeningConversation) {
            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] openConversation() - already opening, ignoring duplicate call');
            }
            return;
        }

        // Guard: If already opening the same conversation, ignore
        if (this.openingConversationId === conversationId && this.currentConversationId === conversationId) {
            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] openConversation() - already open, ignoring');
            }
            return;
        }

        this.isOpeningConversation = true;
        this.openingConversationId = conversationId;

        try {
            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] openConversation() called', { 
                    conversationId,
                    previousConversationId: this.currentConversationId,
                    currentView: this.currentView
                });
            }
            this.currentConversationId = conversationId;
            
            // Ensure we're in messages view when opening a conversation
            if (this.currentView !== 'messages') {
                this.currentView = 'messages';
            }

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
                            console.warn('[NotificationsController] Error checking friend status:', error);
                        }
                    }
                })();
            }

            if (this.enableVerboseLogging) {
                console.log('[NotificationsController] Fetching messages for conversation:', conversationId);
            }
            const result = await window.DatabaseService.getMessages(conversationId);
            if (result.success) {
                const messages = result.messages || [];
                if (this.enableVerboseLogging) {
                    console.log('[NotificationsController] Loaded messages:', { 
                        conversationId, 
                        messageCount: messages.length,
                        messageIds: messages.map(m => m.id),
                        messageTypes: messages.map(m => m.content?.startsWith('📤 Share Request') ? 'share_request' : 'regular')
                    });
                }
                
                // Render messages immediately - don't wait for share message creation
                await this.renderMessageThread(messages);
                
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
                                console.warn('[NotificationsController] Error reloading messages after share creation:', error);
                            }
                        });
                    }
                }).catch(error => {
                    if (this.enableVerboseLogging) {
                        console.warn('[NotificationsController] Error creating share messages:', error);
                    }
                });

                // Do all the read/update operations in parallel (non-blocking for UI)
                Promise.all([
                    // Mark conversation as read
                    (async () => {
                        try {
                            if (this.enableVerboseLogging) {
                                console.log('[NotificationsController] Marking conversation as read:', conversationId);
                            }
                            await window.DatabaseService.markConversationAsRead(conversationId);
                        } catch (error) {
                            console.warn('[NotificationsController] Error marking conversation as read:', error);
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
                            console.warn('[NotificationsController] Error marking notifications as read:', error);
                        }
                    })(),
                    // Update friend button (already started)
                    friendCheckPromise
                ]).catch(error => {
                    console.warn('[NotificationsController] Error in parallel operations:', error);
                });
                
                // Only refresh if conversations list might have changed (e.g., new messages)
                // Skip if we just loaded - avoid unnecessary refresh
                // The conversations list is already up to date from the initial load
                // Only refresh notifications to update unread counts
                this.loadNotifications().then(() => {
                    // Update notification count in header after refresh
                    if (typeof window.Header !== 'undefined') {
                        window.Header.updateNotificationCount();
                    }
                }).catch(error => {
                    if (this.enableVerboseLogging) {
                        console.warn('[NotificationsController] Error refreshing notifications:', error);
                    }
                });
            } else {
                console.error('[NotificationsController] Failed to load messages:', result.error);
                throw new Error(result.error || 'Failed to load messages');
            }
        } catch (error) {
            console.error('[NotificationsController] Error opening conversation:', error);
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
            console.log('[NotificationsController] createMessagesForShares() started', { conversationId, messageCount: existingMessages.length });
        }
        
        try {
            if (typeof window.DatabaseService === 'undefined') {
                console.warn('[NotificationsController] DatabaseService not available');
                return 0;
            }

            const currentUserId = await window.DatabaseService._getCurrentUserId();
            if (!currentUserId) {
                console.warn('[NotificationsController] Current user ID not available');
                return 0;
            }

            const otherUserId = conversation.other_user_id;
            if (!otherUserId) {
                console.warn('[NotificationsController] No other_user_id in conversation');
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
                            console.warn('[NotificationsController] Error updating share conversation_id:', share.id, error);
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
                                    console.warn('[NotificationsController] Error parsing shared_months:', e);
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
                        console.error('[NotificationsController] Error creating message for share:', share.id, error);
                    }
                    return 0;
                }
            });
            
            const results = await Promise.all(messagePromises);
            const messagesCreated = results.reduce((sum, count) => sum + count, 0);
            const messagesSkipped = allShares.length - sharesToCreateMessages.length;
            
            if (this.enableVerboseLogging && messagesCreated > 0) {
                console.log('[NotificationsController] createMessagesForShares complete:', { created: messagesCreated, skipped: messagesSkipped });
            }
            return messagesCreated;
        } catch (error) {
            console.error('[NotificationsController] ========== ERROR in createMessagesForShares() ==========');
            console.error('[NotificationsController] Error:', error);
            console.error('[NotificationsController] Error stack:', error.stack);
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
     * Render message thread with messages (including share request messages)
     */
    async renderMessageThread(messages) {
        if (this.enableVerboseLogging) {
            console.log('[NotificationsController] renderMessageThread() called', { messageCount: messages.length });
        }
        
        const messageThread = document.getElementById('message-thread');
        if (!messageThread) {
            console.warn('[NotificationsController] message-thread element not found');
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
                                    console.warn('[NotificationsController] Error parsing shared_months:', e);
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
                return `
                    <div class="message-item ${alignClass}" style="margin-bottom: var(--spacing-md); text-align: ${alignClass};">
                        <div style="display: inline-block; max-width: 70%; padding: var(--spacing-sm) var(--spacing-md); background: ${isOwnMessage ? 'var(--primary-color)' : 'var(--surface-color)'}; color: ${isOwnMessage ? 'white' : 'var(--text-color)'}; border-radius: var(--border-radius);">
                            <div style="font-size: 0.85rem; margin-bottom: var(--spacing-xs); opacity: 0.8;">${senderEmail}</div>
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

            if (result.success && result.message) {
                messageInput.value = '';
                
                // Append the new message to the thread without reloading everything
                await this.appendMessageToThread(result.message, conversation);
            } else {
                throw new Error(result.error || 'Failed to send message');
            }
        } catch (error) {
            console.error('[NotificationsController] Error sending message:', error);
            alert(`Error sending message: ${error.message}`);
        }
    },

    /**
     * Append a single message to the thread without reloading everything
     */
    async appendMessageToThread(message, conversation) {
        console.log('[NotificationsController] appendMessageToThread() called', { 
            messageId: message.id, 
            conversationId: conversation.id 
        });

        try {
            const messageThread = document.getElementById('message-thread');
            if (!messageThread) {
                console.warn('[NotificationsController] Message thread container not found, falling back to reload');
                await this.openConversation(this.currentConversationId);
                return;
            }

            const currentUserId = await window.DatabaseService._getCurrentUserId();
            if (!currentUserId) {
                console.warn('[NotificationsController] User not authenticated, falling back to reload');
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

            // Generate HTML for the new message (regular message only, not share requests)
            const messageHtml = `
                <div class="message-item ${alignClass}" style="margin-bottom: var(--spacing-md); text-align: ${alignClass};">
                    <div style="display: inline-block; max-width: 70%; padding: var(--spacing-sm) var(--spacing-md); background: ${isOwnMessage ? 'var(--primary-color)' : 'var(--surface-color)'}; color: ${isOwnMessage ? 'white' : 'var(--text-color)'}; border-radius: var(--border-radius);">
                        <div style="font-size: 0.85rem; margin-bottom: var(--spacing-xs); opacity: 0.8;">${senderEmail}</div>
                        <div style="white-space: pre-line;">${message.content}</div>
                        <div style="font-size: 0.75rem; margin-top: var(--spacing-xs); opacity: 0.7;">${dateString}</div>
                    </div>
                </div>
            `;

            // Append to thread
            messageThread.insertAdjacentHTML('beforeend', messageHtml);
            
            // Scroll to bottom
            messageThread.scrollTop = messageThread.scrollHeight;
            
            console.log('[NotificationsController] Message appended to thread successfully');
        } catch (error) {
            console.error('[NotificationsController] Error appending message to thread:', error);
            // Fall back to full reload on error
            await this.openConversation(this.currentConversationId);
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

