/**
 * Notifications Controller
 * Handles the notifications page UI and interactions
 */

const NotificationsController = {
    currentFilter: 'all',
    notifications: [],

    /**
     * Initialize the notifications page
     */
    async init() {
        console.log('[NotificationsController] init() called');

        try {
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                console.warn('[NotificationsController] User not authenticated, redirecting to auth');
                window.location.href = '../views/auth.html';
                return;
            }

            this.setupEventListeners();
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
        const filterAll = document.getElementById('filter-all');
        const filterUnread = document.getElementById('filter-unread');
        const markAllRead = document.getElementById('mark-all-read-button');

        if (filterAll) {
            filterAll.addEventListener('click', () => {
                this.currentFilter = 'all';
                this.updateFilterButtons();
                this.renderNotifications();
            });
        }

        if (filterUnread) {
            filterUnread.addEventListener('click', () => {
                this.currentFilter = 'unread';
                this.updateFilterButtons();
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
     * Update filter button states
     */
    updateFilterButtons() {
        const filterAll = document.getElementById('filter-all');
        const filterUnread = document.getElementById('filter-unread');

        if (filterAll && filterUnread) {
            if (this.currentFilter === 'all') {
                filterAll.classList.add('active');
                filterUnread.classList.remove('active');
            } else {
                filterAll.classList.remove('active');
                filterUnread.classList.add('active');
            }
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
                await this.handleNotificationClick(notificationId);
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
                await this.handleNotificationClick(notificationId);
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
    }
};

if (typeof window !== 'undefined') {
    window.NotificationsController = NotificationsController;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationsController;
}

