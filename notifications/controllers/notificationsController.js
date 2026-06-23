/**
 * Notifications Controller
 * Handles the notifications page UI and interactions
 */

const NotificationsController = {
    currentFilter: 'all',
    currentCategory: null, // 'sharing', 'payments', 'messaging', or null for all
    currentView: 'notifications', // 'notifications' or 'messages'
    currentConversationId: null,
    // Performance optimizations
    emailCache: new Map(), // Cache user emails to avoid repeated lookups
    shareCache: new Map(), // Cache share details to avoid repeated queries
    enableVerboseLogging: false, // Set to true for debugging
    notifications: [],
    conversations: [],
    // Loading guards to prevent duplicate concurrent calls
    isLoadingConversations: false,
    isLoadingNotifications: false,
    conversationsLoadPromise: null, // Cache the promise to reuse for concurrent calls
    notificationsLoadPromise: null, // Cache the promise to reuse for concurrent calls
    isOpeningConversation: false, // Guard to prevent multiple simultaneous opens
    openingConversationId: null, // Track which conversation is being opened
    conversationListenersAttached: false, // Track if conversation item listeners are attached

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
                window.location.href = '../../auth/views/auth.html';
                return;
            }

            console.log('[NotificationsController] User authenticated, proceeding with initialization');
            this.setupEventListeners();
            
            // Always start with 'all' filter
            this.currentFilter = 'all';
            this.currentCategory = null;
            this.currentView = 'notifications';
            
            // Load notifications only (conversations are now in messenger view)
            await this.loadNotifications();
            
            // Render the notifications view
            this.renderAllView();
            
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
                    // Navigate to messenger view instead of showing messages in notifications
                    const messengerUrl = window.Header && typeof window.Header.getModulePath === 'function'
                        ? window.Header.getModulePath('messaging') + 'messenger.html'
                        : '../../messaging/views/messenger.html';
                    window.location.href = messengerUrl;
                }
            });
        }

        if (markAllRead) {
            markAllRead.addEventListener('click', () => {
                this.handleMarkAllRead();
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
     * Escape HTML to prevent XSS when interpolating untrusted strings (decrypted
     * peer message content, emails, statuses) into innerHTML. Escapes the five
     * HTML-significant chars so it is safe in both text and attribute contexts.
     */
    _escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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

        // Build HTML with notifications only (conversations are in messenger view)
        let html = '';

        // Batch fetch all user emails before rendering
        if (filteredNotifications.length > 0) {
            const userIds = filteredNotifications
                .map(n => n.from_user_id)
                .filter(id => id);
            await this.batchFetchUserEmails(userIds);
        }

        // Add notifications section if there are any
        if (filteredNotifications.length > 0) {
            const notificationsHtml = await Promise.all(
                filteredNotifications.map(notification => this.renderNotificationItem(notification))
            );
            html += notificationsHtml.join('');
        }

        // Show message if nothing to display
        if (filteredNotifications.length === 0) {
            html = '<p>No notifications found.</p>';
        }

        notificationsList.innerHTML = html;

        // Setup listeners for notifications
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
                    // Navigate to messenger view with conversation ID
                    const messengerUrl = window.Header && typeof window.Header.getModulePath === 'function'
                        ? window.Header.getModulePath('messaging') + 'messenger.html?conversationId=' + conversationId
                        : '../../messaging/views/messenger.html?conversationId=' + conversationId;
                    window.location.href = messengerUrl;
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

            // Determine icon class based on notification type
            let iconClass = 'fa-bell';
            let iconTypeClass = '';
            if (notification.type === 'share_request' || notification.type === 'share_accepted') {
                iconClass = 'fa-share-alt';
                iconTypeClass = 'sharing';
            } else if (notification.type === 'message_received') {
                iconClass = 'fa-comment';
                iconTypeClass = 'message';
            } else if (notification.type === 'payment_success' || notification.type === 'subscription_updated') {
                iconClass = 'fa-credit-card';
                iconTypeClass = 'payments';
            }

            // Get initials from email for avatar
            const initials = fromUserEmail ? fromUserEmail.charAt(0).toUpperCase() : '?';

            let actionButtons = '';
            let replyButton = '';
            if (notification.type === 'share_request' && notification.share_id && !notification.read) {
                actionButtons = `
                    <div class="notification-actions">
                        <button class="btn btn-action btn-sm accept-share-btn" data-share-id="${notification.share_id}" data-notification-id="${notification.id}">Accept</button>
                        <button class="btn btn-secondary btn-sm decline-share-btn" data-share-id="${notification.share_id}" data-notification-id="${notification.id}">Decline</button>
                        <button class="btn btn-danger btn-sm block-user-btn" data-user-id="${notification.from_user_id}" data-notification-id="${notification.id}">Block</button>
                    </div>
                `;
            } else if (notification.type === 'message_received' && notification.conversation_id) {
                replyButton = `<button class="btn btn-action btn-sm reply-message-btn" data-conversation-id="${notification.conversation_id}" data-notification-id="${notification.id}">Reply</button>`;
            }

            const date = new Date(notification.created_at);
            const dateString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="notification-item ${readClass}" data-notification-id="${notification.id}">
                    <div class="notification-icon ${iconTypeClass}">
                        <i class="fas ${iconClass}"></i>
                    </div>
                    <div class="notification-content">
                        <div class="notification-header">
                            <span class="notification-title">${this._escapeHtml(typeName)}</span>
                            ${!notification.read ? '<span class="notification-badge">New</span>' : ''}
                        </div>
                        <p class="notification-message">From: ${this._escapeHtml(fromUserEmail)}${notification.message ? ' - ' + this._escapeHtml(notification.message) : ''}</p>
                        ${actionButtons}
                    </div>
                    <div class="notification-meta">
                        <span class="notification-time">${dateString}</span>
                        <div class="notification-actions">
                            ${replyButton}
                            <button class="btn btn-sm btn-secondary delete-notification-btn" data-notification-id="${notification.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('[NotificationsController] Error rendering notification item:', error);
            return `<div class="notification-item">
                <div class="notification-icon"><i class="fas fa-exclamation"></i></div>
                <div class="notification-content">
                    <p class="notification-message">Error loading notification: ${error.message}</p>
                </div>
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
                return;
            }

            // Check if share is blocked
            if (share.status === 'blocked') {
                alert('This share has been blocked and cannot be updated.');
                await this.loadNotifications();
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
            } catch (reloadError) {
                console.error('[NotificationsController] Error reloading after decline error:', reloadError);
            }
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

