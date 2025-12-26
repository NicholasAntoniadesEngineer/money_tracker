/**
 * Notification Processor
 * Orchestrates notification creation, preference checking, and delivery
 * Facade pattern - coordinates between services, single entry point for notification creation
 */

const NotificationProcessor = {
    /**
     * Process notification - main entry point
     * Validates, checks preferences, creates notification, and delivers it
     * @param {string} userId - Recipient user ID
     * @param {string} type - Notification type
     * @param {Object} data - Notification data
     * @param {number|null} data.shareId - Share ID (optional)
     * @param {string} data.fromUserId - User who triggered the notification
     * @param {string|null} data.message - Optional message
     * @returns {Promise<{success: boolean, notification: Object|null, error: string|null}>}
     */
    async processNotification(userId, type, data) {
        try {
            console.log('[NotificationProcessor] processNotification() called', { userId, type, data });

            if (!userId || typeof userId !== 'string') {
                throw new Error('userId is required and must be a string');
            }

            if (!type || typeof type !== 'string') {
                throw new Error('type is required and must be a string');
            }

            if (!data || typeof data !== 'object') {
                throw new Error('data is required and must be an object');
            }

            if (!data.fromUserId || typeof data.fromUserId !== 'string') {
                throw new Error('data.fromUserId is required and must be a string');
            }

            if (typeof window.NotificationTypeRegistry === 'undefined') {
                throw new Error('NotificationTypeRegistry not available');
            }

            const typeConfig = window.NotificationTypeRegistry.getType(type);
            if (!typeConfig) {
                throw new Error(`Notification type '${type}' is not registered`);
            }

            if (typeof window.NotificationPreferenceService === 'undefined') {
                throw new Error('NotificationPreferenceService not available');
            }

            const shouldCreateResult = await window.NotificationPreferenceService.shouldCreateNotification(userId, type);
            if (!shouldCreateResult.shouldCreate) {
                console.log('[NotificationProcessor] Notification not created due to preferences:', shouldCreateResult.reason);
                return {
                    success: false,
                    notification: null,
                    error: shouldCreateResult.reason || 'Notification creation blocked by preferences'
                };
            }

            if (typeof window.NotificationService === 'undefined') {
                throw new Error('NotificationService not available');
            }

            const notificationData = {
                user_id: userId,
                type: type,
                share_id: data.shareId || null,
                from_user_id: data.fromUserId,
                message: data.message || null
            };

            const createResult = await window.NotificationService.createNotification(notificationData);
            if (!createResult.success || !createResult.notification) {
                return {
                    success: false,
                    notification: null,
                    error: createResult.error || 'Failed to create notification'
                };
            }

            if (typeof window.NotificationChannelService === 'undefined') {
                console.warn('[NotificationProcessor] NotificationChannelService not available, skipping delivery');
                return {
                    success: true,
                    notification: createResult.notification,
                    error: null
                };
            }

            const availableChannelsResult = await window.NotificationChannelService.getAvailableChannels(userId);
            const channels = availableChannelsResult.channels || ['in_app'];

            const deliveryResult = await window.NotificationChannelService.sendNotification(
                userId,
                createResult.notification,
                channels
            );

            if (!deliveryResult.success) {
                console.warn('[NotificationProcessor] Notification created but delivery failed:', deliveryResult.error);
            }

            return {
                success: true,
                notification: createResult.notification,
                error: null
            };
        } catch (error) {
            console.error('[NotificationProcessor] Exception processing notification:', error);
            return {
                success: false,
                notification: null,
                error: error.message || 'An unexpected error occurred'
            };
        }
    },

    /**
     * Create and deliver notification - high-level method
     * Convenience method that handles full flow for share-related notifications
     * @param {string} userId - Recipient user ID
     * @param {string} type - Notification type
     * @param {number|null} shareId - Share ID (optional)
     * @param {string} fromUserId - User who triggered the notification
     * @param {string|null} message - Optional message
     * @returns {Promise<{success: boolean, notification: Object|null, error: string|null}>}
     */
    async createAndDeliver(userId, type, shareId, fromUserId, message = null) {
        return await this.processNotification(userId, type, {
            shareId: shareId,
            fromUserId: fromUserId,
            message: message
        });
    }
};

if (typeof window !== 'undefined') {
    window.NotificationProcessor = NotificationProcessor;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationProcessor;
}

