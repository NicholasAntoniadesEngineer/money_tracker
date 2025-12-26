/**
 * Notification Service
 * Core notification CRUD operations - pure data access layer
 * No business logic or preference checking - that's handled by NotificationProcessor
 */

const NotificationService = {
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
     * Create a notification record
     * Low-level method - no business logic or preference checking
     * @param {Object} notificationData - Notification data
     * @param {string} notificationData.user_id - Recipient user ID
     * @param {string} notificationData.type - Notification type
     * @param {number|null} notificationData.share_id - Share ID (optional)
     * @param {string} notificationData.from_user_id - User who triggered the notification
     * @param {string|null} notificationData.message - Optional message
     * @returns {Promise<{success: boolean, notification: Object|null, error: string|null}>}
     */
    async createNotification(notificationData) {
        try {
            console.log('[NotificationService] createNotification() called', { type: notificationData.type, userId: notificationData.user_id });

            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const tableName = this._getTableName('notifications');

            const insertData = {
                user_id: notificationData.user_id,
                type: notificationData.type,
                from_user_id: notificationData.from_user_id,
                read: false
            };

            if (notificationData.share_id !== null && notificationData.share_id !== undefined) {
                insertData.share_id = notificationData.share_id;
            }

            if (notificationData.message) {
                insertData.message = notificationData.message;
            }

            const result = await databaseService.queryInsert(tableName, insertData);

            if (result.error) {
                console.error('[NotificationService] Error creating notification:', result.error);
                return {
                    success: false,
                    notification: null,
                    error: result.error.message || 'Failed to create notification'
                };
            }

            console.log('[NotificationService] Notification created successfully:', result.data?.id);
            return {
                success: true,
                notification: result.data,
                error: null
            };
        } catch (error) {
            console.error('[NotificationService] Exception creating notification:', error);
            return {
                success: false,
                notification: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Get user's notifications
     * @param {string} userId - User ID
     * @param {Object} options - Query options
     * @param {boolean} options.unreadOnly - Only return unread notifications
     * @param {number} options.limit - Maximum number of notifications to return
     * @param {number} options.offset - Offset for pagination
     * @param {string} options.orderBy - Column to order by (default: 'created_at')
     * @param {boolean} options.ascending - Order ascending (default: false)
     * @returns {Promise<{success: boolean, notifications: Array, error: string|null}>}
     */
    async getNotifications(userId, options = {}) {
        try {
            console.log('[NotificationService] getNotifications() called', { userId, options });

            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const tableName = this._getTableName('notifications');

            const filter = {
                user_id: userId
            };

            if (options.unreadOnly) {
                filter.read = false;
            }

            const queryOptions = {
                filter: filter,
                order: [{
                    column: options.orderBy || 'created_at',
                    ascending: options.ascending !== undefined ? options.ascending : false
                }]
            };

            if (options.limit) {
                queryOptions.limit = options.limit;
            }

            if (options.offset) {
                queryOptions.offset = options.offset;
            }

            const result = await databaseService.querySelect(tableName, queryOptions);

            if (result.error) {
                console.error('[NotificationService] Error getting notifications:', result.error);
                return {
                    success: false,
                    notifications: [],
                    error: result.error.message || 'Failed to get notifications'
                };
            }

            return {
                success: true,
                notifications: result.data || [],
                error: null
            };
        } catch (error) {
            console.error('[NotificationService] Exception getting notifications:', error);
            return {
                success: false,
                notifications: [],
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Mark notification as read
     * @param {number} notificationId - Notification ID
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async markAsRead(notificationId) {
        try {
            console.log('[NotificationService] markAsRead() called', { notificationId });

            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const tableName = this._getTableName('notifications');

            const result = await databaseService.queryUpdate(tableName, notificationId, {
                read: true
            });

            if (result.error) {
                console.error('[NotificationService] Error marking notification as read:', result.error);
                return {
                    success: false,
                    error: result.error.message || 'Failed to mark notification as read'
                };
            }

            return {
                success: true,
                error: null
            };
        } catch (error) {
            console.error('[NotificationService] Exception marking notification as read:', error);
            return {
                success: false,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Mark all notifications as read for a user
     * @param {string} userId - User ID
     * @returns {Promise<{success: boolean, count: number, error: string|null}>}
     */
    async markAllAsRead(userId) {
        try {
            console.log('[NotificationService] markAllAsRead() called', { userId });

            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const tableName = this._getTableName('notifications');

            const unreadResult = await this.getNotifications(userId, { unreadOnly: true });
            if (!unreadResult.success) {
                return unreadResult;
            }

            const unreadNotifications = unreadResult.notifications;
            let updatedCount = 0;

            for (const notification of unreadNotifications) {
                const result = await this.markAsRead(notification.id);
                if (result.success) {
                    updatedCount++;
                }
            }

            return {
                success: true,
                count: updatedCount,
                error: null
            };
        } catch (error) {
            console.error('[NotificationService] Exception marking all notifications as read:', error);
            return {
                success: false,
                count: 0,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Delete a notification
     * @param {number} notificationId - Notification ID
     * @returns {Promise<{success: boolean, error: string|null}>}
     */
    async deleteNotification(notificationId) {
        try {
            console.log('[NotificationService] deleteNotification() called', { notificationId });

            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const tableName = this._getTableName('notifications');

            const result = await databaseService.queryDelete(tableName, notificationId);

            if (result.error) {
                console.error('[NotificationService] Error deleting notification:', result.error);
                return {
                    success: false,
                    error: result.error.message || 'Failed to delete notification'
                };
            }

            return {
                success: true,
                error: null
            };
        } catch (error) {
            console.error('[NotificationService] Exception deleting notification:', error);
            return {
                success: false,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Get count of unread notifications for a user
     * @param {string} userId - User ID
     * @returns {Promise<{success: boolean, count: number, error: string|null}>}
     */
    async getUnreadCount(userId) {
        try {
            console.log('[NotificationService] getUnreadCount() called', { userId });

            const result = await this.getNotifications(userId, { unreadOnly: true });

            if (!result.success) {
                return {
                    success: false,
                    count: 0,
                    error: result.error
                };
            }

            return {
                success: true,
                count: result.notifications.length,
                error: null
            };
        } catch (error) {
            console.error('[NotificationService] Exception getting unread count:', error);
            return {
                success: false,
                count: 0,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Get a single notification by ID
     * @param {number} notificationId - Notification ID
     * @returns {Promise<{success: boolean, notification: Object|null, error: string|null}>}
     */
    async getNotificationById(notificationId) {
        try {
            console.log('[NotificationService] getNotificationById() called', { notificationId });

            const databaseService = this._getDatabaseService();
            if (!databaseService) {
                throw new Error('DatabaseService not available');
            }

            const tableName = this._getTableName('notifications');

            const result = await databaseService.querySelect(tableName, {
                filter: {
                    id: notificationId
                },
                limit: 1
            });

            if (result.error) {
                console.error('[NotificationService] Error getting notification:', result.error);
                return {
                    success: false,
                    notification: null,
                    error: result.error.message || 'Failed to get notification'
                };
            }

            const notification = result.data && result.data.length > 0 ? result.data[0] : null;

            return {
                success: true,
                notification: notification,
                error: null
            };
        } catch (error) {
            console.error('[NotificationService] Exception getting notification:', error);
            return {
                success: false,
                notification: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Subscribe to real-time notification updates
     * @param {string} userId - User ID
     * @param {Function} callback - Callback function to call when notifications change
     * @returns {Promise<{success: boolean, subscription: Object|null, error: string|null}>}
     */
    async subscribeToNotifications(userId, callback) {
        try {
            console.log('[NotificationService] subscribeToNotifications() called', { userId });

            const databaseService = this._getDatabaseService();
            if (!databaseService || !databaseService.client) {
                throw new Error('DatabaseService or client not available');
            }

            const tableName = this._getTableName('notifications');

            if (!databaseService.client.channel || typeof databaseService.client.channel !== 'function') {
                console.warn('[NotificationService] Real-time not available, skipping subscription');
                return {
                    success: false,
                    subscription: null,
                    error: 'Real-time subscriptions not available'
                };
            }

            const channel = databaseService.client.channel(`notifications:${userId}`)
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: tableName,
                    filter: `user_id=eq.${userId}`
                }, (payload) => {
                    console.log('[NotificationService] Real-time notification update:', payload);
                    if (callback) {
                        callback(payload);
                    }
                })
                .subscribe();

            return {
                success: true,
                subscription: channel,
                error: null
            };
        } catch (error) {
            console.error('[NotificationService] Exception subscribing to notifications:', error);
            return {
                success: false,
                subscription: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    }
};

if (typeof window !== 'undefined') {
    window.NotificationService = NotificationService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationService;
}

