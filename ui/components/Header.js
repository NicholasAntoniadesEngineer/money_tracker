/**
 * Shared Header Component
 * Renders consistent navigation header across all pages
 */

class Header {
    static updateInProgress = false;
    static lastUpdateState = null;
    static initialized = false;
    static sessionValidationInterval = null;
    static authStateCache = null;
    static authStateCacheTimestamp = null;
    static AUTH_STATE_CACHE_DURATION = 30000; // 30 seconds
    static SESSION_VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes
    
    /**
     * Check if we're on the auth page
     * @returns {boolean} True if on auth page
     */
    static isAuthPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || '';
        return filename.includes('auth.html') || path.includes('/auth.html');
    }

    /**
     * Get the current page name from the current URL
     */
    static getCurrentPage() {
        const path = window.location.pathname;
        const filename = path.split('/').pop() || 'index.html';
        
        if (filename === 'index.html' || filename === '') {
            return 'Home';
        } else if (filename.includes('monthly-budget')) {
            return 'Monthly Budget';
        } else if (filename.includes('pots')) {
            return 'Pots & Investments';
        } else if (filename.includes('settings')) {
            return 'Settings';
        } else if (filename.includes('import')) {
            return 'Settings';
        }
        return 'Home';
    }

    /**
     * Get the base path for navigation links
     */
    static getBasePath() {
        const path = window.location.pathname;
        
        // If we're in payments/views/, we need to go up to ui/views/
        if (path.includes('/payments/views/')) {
            return '../../ui/views/';
        }
        
        // If we're in ui/views/, we're already in the right place
        if (path.includes('/ui/views/')) {
            return '';
        }
        
        // If we're in payments/ but not in views/, go to ui/views/
        if (path.includes('/payments/')) {
            return '../ui/views/';
        }
        
        // If we're at root or in ui/ but not in views/, paths go to views/
        if (path.includes('/ui/')) {
        return 'views/';
        }
        
        // Default: assume we're at root level
        return 'ui/views/';
    }

    /**
     * Get user initials from email
     */
    static getUserInitials(email) {
        if (!email || typeof email !== 'string') {
            return 'U';
        }
        const emailParts = email.trim().split('@');
        const namePart = emailParts[0] || '';
        if (namePart.length === 0) {
            return 'U';
        }
        if (namePart.length === 1) {
            return namePart.toUpperCase();
        }
        return namePart.substring(0, 2).toUpperCase();
    }

    /**
     * Render the header HTML
     */
    static render() {
        // Don't render navigation on auth page
        if (this.isAuthPage()) {
            return '';
        }
        
        const currentPage = this.getCurrentPage();
        const basePath = this.getBasePath();
        const path = window.location.pathname;
        const isInPaymentsViews = path.includes('/payments/views/');
        const isInUiViews = path.includes('/ui/views/');
        const isInViews = isInPaymentsViews || isInUiViews;
        
        // Determine Home link based on current location
        let homeHref;
        if (isInPaymentsViews) {
            homeHref = '../../ui/index.html';
        } else if (isInUiViews) {
            homeHref = '../index.html';
        } else if (path.includes('/payments/')) {
            homeHref = '../ui/index.html';
        } else if (path.includes('/ui/')) {
            homeHref = 'index.html';
        } else {
            homeHref = 'ui/index.html';
        }
        
        const navItems = [
            { name: 'Home', href: homeHref, page: 'Home' },
            { name: 'Monthly Budget', href: basePath + 'monthly-budget.html', page: 'Monthly Budget' },
            { name: 'Pots & Investments', href: basePath + 'pots.html', page: 'Pots & Investments' }
        ];

        const navLinks = navItems.map(item => {
            const isActive = item.page === currentPage;
            const activeClass = isActive ? ' active' : '';
            const ariaCurrent = isActive ? ' aria-current="page"' : '';
            return `<li><a href="${item.href}" class="nav-link${activeClass}"${ariaCurrent}>${item.name}</a></li>`;
        }).join('\n                ');

        // Get user info if authenticated
        // Be resilient to session check timeouts - check both method and direct state
        let userInfoHtml = '';
        if (window.AuthService) {
            const methodCheck = window.AuthService.isAuthenticated();
            const directCheck = window.AuthService.currentUser !== null && window.AuthService.session !== null;
            const isAuthenticated = methodCheck || directCheck;
            
            if (isAuthenticated) {
                const user = window.AuthService.getCurrentUser() || window.AuthService.currentUser;
                const userEmail = user?.email || 'User';
                const userInitials = this.getUserInitials(userEmail);
                const settingsHref = basePath + 'settings.html';
                userInfoHtml = `
                <div class="header-user-menu">
                    <button class="user-avatar-button" id="user-avatar-button" aria-label="User menu" aria-expanded="false">
                        <span class="user-initials">${userInitials}</span>
                        <span class="avatar-notification-badge" id="avatar-notification-badge" style="display: none;">0</span>
                    </button>
                    <div class="user-dropdown-menu" id="user-dropdown-menu">
                        <div class="user-dropdown-item user-dropdown-username">
                            <i class="fa-regular fa-user user-dropdown-icon"></i>
                            <span>${userEmail}</span>
                        </div>
                        <a href="${settingsHref}" class="user-dropdown-item user-dropdown-settings">
                            <i class="fa-regular fa-gear user-dropdown-icon"></i>
                            <span>Settings</span>
                        </a>
                        <button class="user-dropdown-item user-dropdown-notifications" id="header-notifications-button" aria-label="Notifications">
                            <i class="fa-regular fa-bell user-dropdown-icon"></i>
                            <span>Notifications</span>
                            <span class="notification-count-badge" id="header-notification-count" style="display: none;">0</span>
                        </button>
                        <button class="user-dropdown-item user-dropdown-signout" id="header-signout-button" aria-label="Sign out">
                            <i class="fa-solid fa-right-from-bracket user-dropdown-icon"></i>
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>`;
            }
        }

        return `
    <header class="main-header">
        <nav class="main-navigation" role="navigation" aria-label="Main navigation">
            <div class="header-title-group">
                <h1 class="site-title" id="header-app-title" role="button" tabindex="0" aria-label="Go to home page">Money Tracker</h1>
                <button class="hamburger-menu" aria-label="Toggle navigation menu" aria-expanded="false">
                    <span class="hamburger-line"></span>
                    <span class="hamburger-line"></span>
                    <span class="hamburger-line"></span>
                </button>
            </div>
            <ul class="nav-list">
                ${navLinks}
            </ul>
            ${userInfoHtml}
        </nav>
    </header>`;
    }

    /**
     * Initialize and inject header into the page
     */
    static async init() {
        console.log('[Header] ========== HEADER INIT STARTED ==========');
        console.log('[Header] init() called');
        
        // Prevent multiple initializations
        if (this.initialized) {
            console.log('[Header] Already initialized, skipping duplicate init');
            return;
        }
        
        // Don't initialize header on auth page
        if (this.isAuthPage()) {
            console.log('[Header] On auth page, skipping header initialization');
            return;
        }
        
        // Wait for SupabaseConfig to be available before initializing AuthService
        if (window.AuthService && !window.AuthService.client) {
            console.log('[Header] AuthService available but client not initialized, waiting for SupabaseConfig...');
            
            // Wait for SupabaseConfig to be available (with timeout)
            let waitCount = 0;
            const maxWait = 50; // Wait up to 5 seconds (50 * 100ms)
            while (!window.SupabaseConfig && waitCount < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            
            if (!window.SupabaseConfig) {
                console.warn('[Header] SupabaseConfig not available after waiting, skipping AuthService initialization');
            } else {
                console.log('[Header] SupabaseConfig available, initializing AuthService...');
            try {
                await window.AuthService.initialize();
                console.log('[Header] AuthService initialized');
            } catch (error) {
                console.warn('[Header] AuthService initialization failed:', error);
                }
            }
        } else {
            console.log('[Header] AuthService status:', {
                hasAuthService: !!window.AuthService,
                hasClient: !!window.AuthService?.client,
                hasSupabaseConfig: !!window.SupabaseConfig
            });
        }
        
        // Find where to insert the header (before main or body's first child)
        const main = document.querySelector('main');
        const body = document.body;
        
        console.log('[Header] Finding insertion point:', {
            hasMain: !!main,
            hasBody: !!body
        });
        
        const headerHtml = this.render();
        if (!headerHtml) {
            console.log('[Header] No header to render, skipping');
            return;
        }
        
        try {
            if (main) {
                // Insert before main element
                console.log('[Header] Inserting header before main element');
                main.insertAdjacentHTML('beforebegin', headerHtml);
            } else if (body) {
                // Insert as first child of body
                console.log('[Header] Inserting header as first child of body');
                body.insertAdjacentHTML('afterbegin', headerHtml);
            } else {
                console.error('[Header] ERROR: Could not find insertion point');
                return;
            }

            console.log('[Header] Header rendered, initializing components...');
            
            // Initialize hamburger menu functionality
            this.initHamburgerMenu();
            
            // Initialize app title click handler
            this.initAppTitleClick();
            
            // Initialize user menu dropdown (if user menu exists in initial render)
            this.initUserMenu();
            
            // Initialize sign out button (if it exists)
            this.initSignOutButton();
            
            // Note: Notification bell is initialized in updateHeader() after HTML is rendered
            
            // Listen for auth state changes to update header
            this.setupAuthStateListener();
            
            // Setup periodic session validation
            this.setupSessionValidation();
            
            // Update header immediately to show user menu if already authenticated
            console.log('[Header] Updating header with current auth state...');
            try {
                await this.updateHeader();
            } catch (error) {
                console.error('[Header] Error in initial updateHeader call:', error);
                // Header structure is already rendered, just user menu might be missing
                // This is acceptable - it will be updated when auth state is ready
            }
        } catch (error) {
            console.error('[Header] Error inserting header HTML:', error);
            // Try to insert header anyway as fallback
            if (body) {
                try {
                    body.insertAdjacentHTML('afterbegin', headerHtml);
                    this.initHamburgerMenu();
                    this.initAppTitleClick();
                } catch (fallbackError) {
                    console.error('[Header] Fallback header insertion also failed:', fallbackError);
                }
            }
        }
        
        // Update notification count after a delay to ensure services are loaded
        setTimeout(() => {
            this.updateNotificationCount().catch(err => {
                console.warn('[Header] Failed to update notification count on init:', err);
            });
            this.setupNotificationSubscription().catch(err => {
                console.warn('[Header] Failed to setup notification subscription:', err);
            });
            this.setupMessageSubscription().catch(err => {
                console.warn('[Header] Failed to setup message subscription:', err);
            });
        }, 1000);

        // Update notification count when page becomes visible (user switches back to tab)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && window.AuthService && window.AuthService.isAuthenticated()) {
                console.log('[Header] Page became visible, updating notification count...');
                this.updateNotificationCount().catch(err => {
                    console.warn('[Header] Failed to update notification count on visibility change:', err);
                });
            }
        });
        
        this.initialized = true;
        console.log('[Header] ========== HEADER INIT COMPLETE ==========');
    }

    /**
     * Initialize hamburger menu functionality
     */
    static initHamburgerMenu() {
        const hamburgerBtn = document.querySelector('.hamburger-menu');
        const navList = document.querySelector('.nav-list');

        if (!hamburgerBtn || !navList) return;

        hamburgerBtn.addEventListener('click', () => {
            const isExpanded = hamburgerBtn.getAttribute('aria-expanded') === 'true';
            hamburgerBtn.setAttribute('aria-expanded', !isExpanded);
            navList.classList.toggle('nav-open');
        });

        // Close menu when clicking outside or on a link
        document.addEventListener('click', (e) => {
            if (!hamburgerBtn.contains(e.target) && !navList.contains(e.target)) {
                hamburgerBtn.setAttribute('aria-expanded', 'false');
                navList.classList.remove('nav-open');
            }
        });

        // Close menu when a link is clicked
        navList.addEventListener('click', (e) => {
            if (e.target.classList.contains('nav-link')) {
                hamburgerBtn.setAttribute('aria-expanded', 'false');
                navList.classList.remove('nav-open');
            }
        });
    }

    /**
     * Initialize app title click handler
     * Redirects to landing page if authenticated, sign-in page if not
     */
    static initAppTitleClick() {
        const appTitle = document.getElementById('header-app-title');
        if (!appTitle) return;

        const handleClick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const isAuthenticated = window.AuthService && window.AuthService.isAuthenticated();
            const basePath = this.getBasePath();
            const path = window.location.pathname;
            const isInPaymentsViews = path.includes('/payments/views/');
            const isInUiViews = path.includes('/ui/views/');
            
            if (isAuthenticated) {
                // Determine landing page URL based on current location (same logic as render method)
                let landingPageUrl;
                if (isInPaymentsViews) {
                    landingPageUrl = '../../ui/index.html';
                } else if (isInUiViews) {
                    landingPageUrl = '../index.html';
                } else if (path.includes('/payments/')) {
                    landingPageUrl = '../ui/index.html';
                } else if (path.includes('/ui/')) {
                    landingPageUrl = 'index.html';
                } else {
                    landingPageUrl = 'ui/index.html';
                }
                window.location.href = landingPageUrl;
            } else {
                const authPageUrl = basePath + 'auth.html';
                window.location.href = authPageUrl;
            }
        };

        appTitle.addEventListener('click', handleClick);
        appTitle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClick(e);
            }
        });
    }

    /**
     * Initialize user menu dropdown
     */
    static initUserMenu() {
        const avatarButton = document.getElementById('user-avatar-button');
        const dropdownMenu = document.getElementById('user-dropdown-menu');

        if (!avatarButton || !dropdownMenu) return;

        avatarButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = avatarButton.getAttribute('aria-expanded') === 'true';
            avatarButton.setAttribute('aria-expanded', !isExpanded);
            dropdownMenu.classList.toggle('user-dropdown-open');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!avatarButton.contains(e.target) && !dropdownMenu.contains(e.target)) {
                avatarButton.setAttribute('aria-expanded', 'false');
                dropdownMenu.classList.remove('user-dropdown-open');
            }
        });

        // Close menu when clicking on a dropdown item
        dropdownMenu.addEventListener('click', (e) => {
            if (e.target.classList.contains('user-dropdown-item') || e.target.closest('.user-dropdown-item')) {
                avatarButton.setAttribute('aria-expanded', 'false');
                dropdownMenu.classList.remove('user-dropdown-open');
            }
        });
    }

    /**
     * Initialize notification bell
     */
    static initNotificationBell() {
        try {
            const notificationsButton = document.getElementById('header-notifications-button');

            if (notificationsButton) {
                notificationsButton.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.handleNotificationBellClick();
                });
            }

            setTimeout(() => {
                this.updateNotificationCount().catch(err => {
                    console.warn('[Header] Failed to update notification count:', err);
                });
            }, 100);
        } catch (error) {
            console.error('[Header] Error initializing notification features:', error);
        }
    }

    /**
     * Handle notification bell click
     */
    static handleNotificationBellClick() {
        const basePath = this.getBasePath();
        const notificationsUrl = basePath + 'notifications.html';
        window.location.href = notificationsUrl;
    }

    /**
     * Update notification count in header
     * Checks both notifications and unread messages
     */
    static async updateNotificationCount() {
        console.log('[Header] ========== updateNotificationCount() CALLED ==========');
        console.log('[Header] updateNotificationCount() - Start time:', new Date().toISOString());
        
        try {
            console.log('[Header] Checking authentication status...');
            if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                console.log('[Header] User not authenticated, skipping notification count update');
                return;
            }
            console.log('[Header] User is authenticated');

            console.log('[Header] Getting current user ID...');
            const currentUserId = await window.DatabaseService?._getCurrentUserId();
            console.log('[Header] Current user ID:', currentUserId);
            if (!currentUserId) {
                console.log('[Header] No user ID found, skipping notification count update');
                return;
            }

            let totalUnreadCount = 0;

            // Get unread notification count
            console.log('[Header] Checking for NotificationService...');
            if (typeof window.NotificationService !== 'undefined') {
                console.log('[Header] NotificationService is available, calling getUnreadCount()...');
                try {
                    const notificationStartTime = Date.now();
                    const notificationResult = await window.NotificationService.getUnreadCount(currentUserId);
                    const notificationDuration = Date.now() - notificationStartTime;
                    console.log('[Header] NotificationService.getUnreadCount() completed in', notificationDuration, 'ms');
                    console.log('[Header] NotificationService.getUnreadCount() result:', {
                        success: notificationResult.success,
                        count: notificationResult.count,
                        error: notificationResult.error
                    });
                    
                    if (notificationResult.success) {
                        totalUnreadCount += notificationResult.count || 0;
                        console.log('[Header] Unread notifications:', notificationResult.count || 0);
                    } else {
                        console.warn('[Header] NotificationService.getUnreadCount() failed:', notificationResult.error);
                    }
                } catch (notifError) {
                    console.error('[Header] Exception getting notification count:', {
                        error: notifError.message,
                        stack: notifError.stack
                    });
                }
            } else {
                console.warn('[Header] NotificationService is not available');
            }

            // Also check for unread messages (in case notifications weren't created)
            console.log('[Header] Checking for MessagingService...');
            if (typeof window.MessagingService !== 'undefined') {
                console.log('[Header] MessagingService is available, calling getUnreadCount()...');
                try {
                    const messageStartTime = Date.now();
                    const messageResult = await window.MessagingService.getUnreadCount(currentUserId);
                    const messageDuration = Date.now() - messageStartTime;
                    console.log('[Header] MessagingService.getUnreadCount() completed in', messageDuration, 'ms');
                    console.log('[Header] MessagingService.getUnreadCount() result:', {
                        success: messageResult.success,
                        count: messageResult.count,
                        error: messageResult.error
                    });
                    
                    if (messageResult.success) {
                        const unreadMessages = messageResult.count || 0;
                        console.log('[Header] Unread messages count:', unreadMessages);
                        console.log('[Header] Current total unread count before adding messages:', totalUnreadCount);
                        
                        // Only add message count if there's no notification for it
                        // This prevents double counting, but ensures we catch messages even if notifications fail
                        if (unreadMessages > 0) {
                            console.log('[Header] Found unread messages:', unreadMessages);
                            // Check if we already have notifications for these messages
                            // If notification count is 0 but we have unread messages, add them
                            if (totalUnreadCount === 0 && unreadMessages > 0) {
                                console.log('[Header] Adding unread messages to total count (no notifications found)');
                                totalUnreadCount += unreadMessages;
                            } else {
                                console.log('[Header] Not adding unread messages to total (already have notifications or no unread messages)');
                            }
                        } else {
                            console.log('[Header] No unread messages found');
                        }
                    } else {
                        console.warn('[Header] MessagingService.getUnreadCount() failed:', messageResult.error);
                    }
                } catch (messageError) {
                    console.error('[Header] Exception getting message count:', {
                        error: messageError.message,
                        stack: messageError.stack
                    });
                }
            } else {
                console.warn('[Header] MessagingService is not available');
            }

            console.log('[Header] Total unread count (notifications + messages):', totalUnreadCount);

            const countBadge = document.getElementById('header-notification-count');
            const avatarBadge = document.getElementById('avatar-notification-badge');

            // Update badge in the user menu dropdown
            if (countBadge) {
                if (totalUnreadCount > 0) {
                    countBadge.textContent = totalUnreadCount > 99 ? '99+' : totalUnreadCount.toString();
                    countBadge.style.display = 'inline-block';
                } else {
                    countBadge.style.display = 'none';
                }
            }

            // Update badge on avatar icon
            if (avatarBadge) {
                if (totalUnreadCount > 0) {
                    avatarBadge.textContent = totalUnreadCount > 99 ? '99+' : totalUnreadCount.toString();
                    avatarBadge.style.display = 'inline-block';
                } else {
                    avatarBadge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('[Header] Error updating notification count:', error);
        }
    }

    /**
     * Setup real-time notification subscription
     */
    static async setupNotificationSubscription() {
        try {
            if (typeof window.NotificationService === 'undefined' || !window.AuthService || !window.AuthService.isAuthenticated()) {
                return;
            }

            const currentUserId = await window.DatabaseService?._getCurrentUserId();
            if (!currentUserId) {
                return;
            }

            const result = await window.NotificationService.subscribeToNotifications(currentUserId, (payload) => {
                console.log('[Header] Notification update received:', payload);
                this.updateNotificationCount();
            });

            if (result.success) {
                console.log('[Header] Real-time notification subscription established');
            } else {
                console.warn('[Header] Real-time subscription not available, will poll instead');
                setInterval(() => this.updateNotificationCount(), 30000);
            }
        } catch (error) {
            console.error('[Header] Error setting up notification subscription:', error);
            setInterval(() => this.updateNotificationCount(), 30000);
        }
    }

    /**
     * Setup real-time message subscription to update notification count when new messages arrive
     */
    static async setupMessageSubscription() {
        try {
            if (typeof window.MessagingService === 'undefined' || !window.AuthService || !window.AuthService.isAuthenticated()) {
                return;
            }

            const currentUserId = await window.DatabaseService?._getCurrentUserId();
            if (!currentUserId) {
                return;
            }

            console.log('[Header] Setting up message subscription for user:', currentUserId);
            const result = await window.MessagingService.subscribeToMessages(currentUserId, (payload) => {
                console.log('[Header] Message update received:', payload);
                // When a new message arrives, update notification count
                // This ensures the badge updates even if notification creation is delayed
                setTimeout(() => {
                    this.updateNotificationCount();
                }, 500); // Small delay to allow notification to be created
            });

            if (result.success) {
                console.log('[Header] Real-time message subscription established');
            } else {
                console.warn('[Header] Real-time message subscription not available');
            }
        } catch (error) {
            console.error('[Header] Error setting up message subscription:', error);
        }
    }

    /**
     * Initialize sign out button
     */
    static initSignOutButton() {
        const signOutButton = document.getElementById('header-signout-button');
        if (signOutButton) {
            signOutButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Disable button immediately to prevent multiple clicks
                signOutButton.disabled = true;
                signOutButton.textContent = 'Signing out...';
                
                // Call signOut - it handles everything including redirect
                // Don't await - signOut will redirect immediately
                if (window.AuthService) {
                    window.AuthService.signOut().catch(error => {
                        // If signOut fails, force redirect anyway
                        console.error('[Header] Sign out error, forcing redirect:', error);
                        // Use absolute URL to avoid path resolution issues
                        const baseUrl = window.location.origin;
                        const currentPath = window.location.pathname;
                        const pathParts = currentPath.split('/').filter(p => p && p !== 'index.html');
                        
                        // Find the base path (everything before 'ui' or 'payments')
                        let basePathParts = [];
                        for (let i = 0; i < pathParts.length; i++) {
                            if (pathParts[i] === 'ui' || pathParts[i] === 'payments') {
                                break;
                            }
                            basePathParts.push(pathParts[i]);
                        }
                        
                        const basePath = basePathParts.length > 0 ? basePathParts.join('/') + '/' : '';
                        const authUrl = `${baseUrl}/${basePath}ui/views/auth.html`;
                        console.log('[Header] Redirecting to auth:', authUrl);
                        window.location.href = authUrl;
                    });
                } else {
                    // Fallback if AuthService not available - use absolute URL
                    const baseUrl = window.location.origin;
                    const currentPath = window.location.pathname;
                    const pathParts = currentPath.split('/').filter(p => p && p !== 'index.html');
                    
                    let basePathParts = [];
                    for (let i = 0; i < pathParts.length; i++) {
                        if (pathParts[i] === 'ui' || pathParts[i] === 'payments') {
                            break;
                        }
                        basePathParts.push(pathParts[i]);
                    }
                    
                    const basePath = basePathParts.length > 0 ? basePathParts.join('/') + '/' : '';
                    const authUrl = `${baseUrl}/${basePath}ui/views/auth.html`;
                    console.log('[Header] Fallback redirect to auth:', authUrl);
                    window.location.href = authUrl;
                }
            });
        }
    }

    /**
     * Setup auth state listener to update header when auth state changes
     */
    static setupAuthStateListener() {
        console.log('[Header] Setting up auth state listener...');
        
        // Remove existing listeners to prevent duplicates
        if (this._authSignInHandler) {
            window.removeEventListener('auth:signin', this._authSignInHandler);
        }
        if (this._authSignOutHandler) {
            window.removeEventListener('auth:signout', this._authSignOutHandler);
        }
        if (this._authInitialSessionHandler) {
            window.removeEventListener('auth:initial_session', this._authInitialSessionHandler);
        }
        
        // Create handler functions
        this._authSignInHandler = () => {
            console.log('[Header] auth:signin event received, updating header...');
            // Clear last update state to force update
            this.lastUpdateState = null;
            // Clear cache to force fresh check
            this.authStateCache = null;
            this.authStateCacheTimestamp = null;
            // Longer delay to ensure AuthService state is fully updated
            setTimeout(async () => {
                await this.updateHeader(true); // Force update on sign-in
            }, 300);
        };
        
        this._authSignOutHandler = () => {
            console.log('[Header] auth:signout event received, updating header...');
            // Clear cache on sign out
            this.authStateCache = null;
            this.authStateCacheTimestamp = null;
            this.updateHeader().catch(err => {
                console.warn('[Header] Error updating header on sign out:', err);
            });
        };
        
        // Listen for initial session event (only once, with debounce)
        this._authInitialSessionHandler = () => {
            console.log('[Header] auth:initial_session event received');
            // Only update if we haven't updated recently (debounce)
            if (!this.updateInProgress) {
                setTimeout(async () => {
                    if (!this.updateInProgress) {
                        console.log('[Header] Executing header update after initial_session event (200ms delay)...');
                        await this.updateHeader();
                    }
                }, 200);
            }
        };
        
        // Listen for auth state changes
        window.addEventListener('auth:signin', this._authSignInHandler);
        window.addEventListener('auth:signout', this._authSignOutHandler);
        window.addEventListener('auth:initial_session', this._authInitialSessionHandler);
        
        console.log('[Header] Auth state listener set up successfully');
    }

    /**
     * Update header to reflect current auth state
     * @param {boolean} force - Force update even if state appears unchanged
     */
    static async updateHeader(force = false) {
        console.log('[Header] ========== UPDATE HEADER CALLED ==========', { force });
        
        if (this.updateInProgress && !force) {
            console.log('[Header] Update already in progress, skipping duplicate call');
            return;
        }
        
        this.updateInProgress = true;
        console.log('[Header] updateHeader() called', { force });
        
        try {
            const header = document.querySelector('.main-header');
            console.log('[Header] Header element found:', !!header);
            
            if (!header) {
                console.warn('[Header] Header element not found in DOM');
                this.updateInProgress = false;
                return;
            }
            
            const nav = header.querySelector('.main-navigation');
            console.log('[Header] Navigation element found:', !!nav);
            
            if (!nav) {
                console.warn('[Header] Navigation element not found in header');
                this.updateInProgress = false;
                return;
            }
            
            // Check authentication status with caching and retry logic
            let isAuthenticated = false;
            let currentUserEmail = null;
            
            try {
                // Check cache first (if valid)
                const now = Date.now();
                if (this.authStateCache && this.authStateCacheTimestamp && 
                    (now - this.authStateCacheTimestamp) < this.AUTH_STATE_CACHE_DURATION && !force) {
                    console.log('[Header] Using cached auth state');
                    isAuthenticated = this.authStateCache.isAuthenticated;
                    currentUserEmail = this.authStateCache.userEmail;
                } else if (window.AuthService) {
                    // Perform fresh auth check with retry logic
                    const authResult = await this._checkAuthStateWithRetry(force);
                    isAuthenticated = authResult.isAuthenticated;
                    currentUserEmail = authResult.userEmail;
                    
                    // Cache the result
                    this.authStateCache = { isAuthenticated, userEmail: currentUserEmail };
                    this.authStateCacheTimestamp = now;
                }
            } catch (authError) {
                console.error('[Header] Error checking auth state:', authError);
                // Fallback: try simple check
                if (window.AuthService) {
                    try {
                        isAuthenticated = window.AuthService.isAuthenticated();
                        const user = window.AuthService.getCurrentUser();
                        currentUserEmail = user?.email || null;
                    } catch (fallbackError) {
                        console.warn('[Header] Fallback auth check also failed:', fallbackError);
                    }
                }
            }
            
            this._performHeaderUpdate(nav, isAuthenticated, currentUserEmail, force);
        } catch (error) {
            console.error('[Header] Error in updateHeader:', error);
            this.updateInProgress = false;
        }
    }
    
    /**
     * Perform the actual header update
     * @private
     */
    static _performHeaderUpdate(nav, isAuthenticated, currentUserEmail, force) {
        try {
            const currentState = {
                isAuthenticated: isAuthenticated,
                userEmail: currentUserEmail
            };
            
            // Check if state has actually changed (unless forced)
            if (!force && this.lastUpdateState && 
                this.lastUpdateState.isAuthenticated === currentState.isAuthenticated &&
                this.lastUpdateState.userEmail === currentState.userEmail) {
                console.log('[Header] Auth state unchanged, skipping update');
                this.updateInProgress = false;
                return;
            }
            
            console.log('[Header] Authentication status:', {
                hasAuthService: !!window.AuthService,
                isAuthenticated: isAuthenticated,
                methodCheck: window.AuthService?.isAuthenticated(),
                directCheck: window.AuthService?.currentUser !== null && window.AuthService?.session !== null,
                hasCurrentUser: !!window.AuthService?.getCurrentUser(),
                userEmail: currentUserEmail
            });
            
            // Fallback: if isAuthenticated is false but session exists, try one more validation
            if (!isAuthenticated && window.AuthService && 
                (window.AuthService.currentUser !== null || window.AuthService.session !== null)) {
                console.log('[Header] Fallback: isAuthenticated is false but session exists, attempting validation...');
                try {
                    if (window.AuthService.validateSession) {
                        const validationResult = await window.AuthService.validateSession();
                        if (validationResult.valid) {
                            console.log('[Header] Fallback validation succeeded, updating auth state');
                            isAuthenticated = true;
                            const user = window.AuthService.getCurrentUser();
                            currentUserEmail = user?.email || null;
                            // Update cache
                            this.authStateCache = { isAuthenticated, userEmail: currentUserEmail };
                            this.authStateCacheTimestamp = Date.now();
                        } else {
                            console.log('[Header] Fallback validation failed, clearing session state');
                            // Clear invalid session state
                            if (window.AuthService.currentUser) {
                                window.AuthService.currentUser = null;
                            }
                            if (window.AuthService.session) {
                                window.AuthService.session = null;
                            }
                        }
                    }
                } catch (validationError) {
                    console.warn('[Header] Fallback validation error:', validationError);
                }
            }

            const oldUserMenu = nav.querySelector('.header-user-menu');
            if (oldUserMenu) {
                console.log('[Header] Removing existing user menu');
                oldUserMenu.remove();
            }
            
            // Add user menu if authenticated
            if (isAuthenticated) {
                const user = window.AuthService.getCurrentUser();
                const userEmail = user?.email || 'User';
                const userInitials = this.getUserInitials(userEmail);
                const basePath = this.getBasePath();
                const settingsHref = basePath + 'settings.html';
                
                console.log('[Header] Adding user menu:', {
                    userEmail: userEmail,
                    userInitials: userInitials,
                    settingsHref: settingsHref
                });
                
                const userInfoHtml = `
                    <div class="header-user-menu">
                        <button class="user-avatar-button" id="user-avatar-button" aria-label="User menu" aria-expanded="false">
                            <span class="user-initials">${userInitials}</span>
                        <span class="avatar-notification-badge" id="avatar-notification-badge" style="display: none;">0</span>
                        </button>
                        <div class="user-dropdown-menu" id="user-dropdown-menu">
                            <div class="user-dropdown-item user-dropdown-username">
                                <i class="fa-regular fa-user user-dropdown-icon"></i>
                                <span>${userEmail}</span>
                            </div>
                            <a href="${settingsHref}" class="user-dropdown-item user-dropdown-settings">
                                <i class="fa-regular fa-gear user-dropdown-icon"></i>
                                <span>Settings</span>
                            </a>
                        <button class="user-dropdown-item user-dropdown-notifications" id="header-notifications-button" aria-label="Notifications">
                            <i class="fa-regular fa-bell user-dropdown-icon"></i>
                            <span>Notifications</span>
                            <span class="notification-count-badge" id="header-notification-count" style="display: none;">0</span>
                        </button>
                            <button class="user-dropdown-item user-dropdown-signout" id="header-signout-button" aria-label="Sign out">
                                <i class="fa-solid fa-right-from-bracket user-dropdown-icon"></i>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </div>`;
                nav.insertAdjacentHTML('beforeend', userInfoHtml);
                this.initUserMenu();
                this.initSignOutButton();
                this.initNotificationBell(); // Initialize notifications button click handler
                
                try {
                    // Update notification count and set up subscriptions
                    setTimeout(() => {
                        this.updateNotificationCount().catch(err => {
                            console.warn('[Header] Failed to update notification count in updateHeader:', err);
                        });
                        this.setupNotificationSubscription().catch(err => {
                            console.warn('[Header] Failed to setup notification subscription in updateHeader:', err);
                        });
                        this.setupMessageSubscription().catch(err => {
                            console.warn('[Header] Failed to setup message subscription in updateHeader:', err);
                        });
                    }, 500);
                } catch (error) {
                    console.error('[Header] Error initializing notification features in updateHeader:', error);
                }
                
                console.log('[Header] User menu added successfully');
            } else {
                console.log('[Header] User not authenticated, not adding user menu');
            }
            
            this.lastUpdateState = currentState;
            console.log('[Header] ========== UPDATE HEADER COMPLETE ==========');
            this.updateInProgress = false;
        } catch (error) {
            console.error('[Header] Error in _performHeaderUpdate:', error);
            this.updateInProgress = false;
        }
    }

    /**
     * Check auth state with retry logic and fallback checks
     * @private
     */
    static async _checkAuthStateWithRetry(force = false, retryCount = 0, maxRetries = 3) {
        try {
            if (!window.AuthService) {
                return { isAuthenticated: false, userEmail: null };
            }

            // Check both the method and direct state to handle timeout scenarios
            const methodCheck = window.AuthService.isAuthenticated();
            const directCheck = window.AuthService.currentUser !== null && window.AuthService.session !== null;
            
            let isAuthenticated = methodCheck || directCheck;
            let user = window.AuthService.getCurrentUser();
            let currentUserEmail = user?.email || null;

            // Fallback: if methodCheck is false but we have session/user, try to validate session
            if (!methodCheck && directCheck && window.AuthService.validateSession) {
                console.log('[Header] Method check failed but session exists, validating session...');
                try {
                    const validationResult = await window.AuthService.validateSession();
                    if (validationResult.valid) {
                        console.log('[Header] Session validation succeeded');
                        isAuthenticated = true;
                        user = window.AuthService.getCurrentUser();
                        currentUserEmail = user?.email || null;
                    } else {
                        console.log('[Header] Session validation failed:', validationResult.error);
                        // Clear invalid session state
                        if (window.AuthService.currentUser) {
                            window.AuthService.currentUser = null;
                        }
                        if (window.AuthService.session) {
                            window.AuthService.session = null;
                        }
                    }
                } catch (validationError) {
                    console.warn('[Header] Session validation error:', validationError);
                }
            }

            // If still not authenticated and we should retry, do so with exponential backoff
            if (!isAuthenticated && force && retryCount < maxRetries) {
                const delay = Math.min(300 * Math.pow(2, retryCount), 2000); // Max 2 seconds
                console.log(`[Header] Auth check failed, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return this._checkAuthStateWithRetry(force, retryCount + 1, maxRetries);
            }

            return { isAuthenticated, userEmail: currentUserEmail };
        } catch (error) {
            console.error('[Header] Error in _checkAuthStateWithRetry:', error);
            return { isAuthenticated: false, userEmail: null };
        }
    }

    /**
     * Setup periodic session validation
     */
    static setupSessionValidation() {
        // Clear existing interval if any
        if (this.sessionValidationInterval) {
            clearInterval(this.sessionValidationInterval);
        }

        // Validate session periodically
        this.sessionValidationInterval = setInterval(async () => {
            try {
                if (!window.AuthService || !window.AuthService.isAuthenticated()) {
                    return;
                }

                console.log('[Header] Periodic session validation check...');
                
                // Validate session
                if (window.AuthService.validateSession) {
                    const validationResult = await window.AuthService.validateSession();
                    if (!validationResult.valid) {
                        console.log('[Header] Session validation failed, updating header...');
                        // Clear cache to force fresh check
                        this.authStateCache = null;
                        this.authStateCacheTimestamp = null;
                        // Update header to reflect new auth state
                        this.updateHeader(true).catch(err => {
                            console.warn('[Header] Error updating header after session validation:', err);
                        });
                    } else {
                        console.log('[Header] Session validation passed');
                    }
                }
            } catch (error) {
                console.error('[Header] Error in periodic session validation:', error);
            }
        }, this.SESSION_VALIDATION_INTERVAL);

        console.log('[Header] Periodic session validation set up (interval: ' + this.SESSION_VALIDATION_INTERVAL + 'ms)');
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Header.init());
} else {
    Header.init();
}

// Export to window for global access
if (typeof window !== 'undefined') {
    window.Header = Header;
    console.log('[Header] Header class assigned to window.Header');
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Header;
}

