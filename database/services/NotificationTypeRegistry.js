/**
 * Notification Type Registry
 * Manages notification types and their metadata
 * Extensible system for adding new notification types without modifying core logic
 */

const NotificationTypeRegistry = {
    /**
     * Registry of notification types
     * @type {Object<string, Object>}
     */
    _types: {},

    /**
     * Initialize default notification types
     */
    _initialize() {
        if (Object.keys(this._types).length > 0) {
            return;
        }

        this.registerType('share_request', {
            name: 'Share Request',
            description: 'Someone wants to share data with you',
            defaultEnabled: true,
            category: 'sharing',
            requiresAction: true,
            preferenceKey: 'share_requests'
        });

        this.registerType('share_accepted', {
            name: 'Share Accepted',
            description: 'Your data share request was accepted',
            defaultEnabled: true,
            category: 'sharing',
            requiresAction: false,
            preferenceKey: 'share_responses'
        });

        this.registerType('share_declined', {
            name: 'Share Declined',
            description: 'Your data share request was declined',
            defaultEnabled: true,
            category: 'sharing',
            requiresAction: false,
            preferenceKey: 'share_responses'
        });

        this.registerType('share_blocked', {
            name: 'Share Blocked',
            description: 'Your data share request was blocked',
            defaultEnabled: true,
            category: 'sharing',
            requiresAction: false,
            preferenceKey: 'share_responses'
        });
    },

    /**
     * Register a new notification type
     * @param {string} type - Notification type identifier
     * @param {Object} config - Type configuration
     * @param {string} config.name - Human-readable name
     * @param {string} config.description - Description of the notification
     * @param {boolean} config.defaultEnabled - Whether this type is enabled by default
     * @param {string} config.category - Category for grouping (e.g., 'sharing', 'system')
     * @param {boolean} config.requiresAction - Whether this notification requires user action
     * @param {string} config.preferenceKey - Key in notification preferences for enabling/disabling
     */
    registerType(type, config) {
        if (!type || typeof type !== 'string') {
            throw new Error('Notification type must be a non-empty string');
        }

        if (!config || typeof config !== 'object') {
            throw new Error('Notification type config must be an object');
        }

        const requiredFields = ['name', 'description', 'category', 'preferenceKey'];
        for (const field of requiredFields) {
            if (!config[field]) {
                throw new Error(`Notification type config must include '${field}'`);
            }
        }

        this._types[type] = {
            type: type,
            name: config.name,
            description: config.description,
            defaultEnabled: config.defaultEnabled !== false,
            category: config.category,
            requiresAction: config.requiresAction === true,
            preferenceKey: config.preferenceKey
        };

        console.log(`[NotificationTypeRegistry] Registered notification type: ${type}`);
    },

    /**
     * Get notification type configuration
     * @param {string} type - Notification type identifier
     * @returns {Object|null} Type configuration or null if not found
     */
    getType(type) {
        this._initialize();
        return this._types[type] || null;
    },

    /**
     * Get all registered notification types
     * @returns {Object<string, Object>} All registered types
     */
    getAllTypes() {
        this._initialize();
        return { ...this._types };
    },

    /**
     * Get notification types by category
     * @param {string} category - Category name
     * @returns {Array<Object>} Array of type configurations
     */
    getTypesByCategory(category) {
        this._initialize();
        return Object.values(this._types).filter(type => type.category === category);
    },

    /**
     * Check if a notification type is registered
     * @param {string} type - Notification type identifier
     * @returns {boolean} True if registered
     */
    isRegistered(type) {
        this._initialize();
        return type in this._types;
    },

    /**
     * Get preference key for a notification type
     * @param {string} type - Notification type identifier
     * @returns {string|null} Preference key or null if not found
     */
    getPreferenceKey(type) {
        const typeConfig = this.getType(type);
        return typeConfig ? typeConfig.preferenceKey : null;
    }
};

// Initialize on load
NotificationTypeRegistry._initialize();

if (typeof window !== 'undefined') {
    window.NotificationTypeRegistry = NotificationTypeRegistry;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationTypeRegistry;
}

