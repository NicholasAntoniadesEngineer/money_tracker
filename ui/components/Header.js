/**
 * Shared Header Component
 * Renders consistent navigation header across all pages
 */

class Header {
    static updateInProgress = false;
    static lastUpdateState = null;
    static initialized = false;
    
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
        
        // Initialize user menu dropdown
        this.initUserMenu();
        
        // Initialize sign out button
        this.initSignOutButton();
        
        // Note: Notification bell is initialized in updateHeader() after HTML is rendered
        
        // Listen for auth state changes to update header
        this.setupAuthStateListener();
        
        // Update header immediately to show user menu if already authenticated
        console.log('[Header] Updating header with current auth state...');
        this.updateHeader();
        
        // Update notification count after a delay to ensure services are loaded
        setTimeout(() => {
            this.updateNotificationCount().catch(err => {
                console.warn('[Header] Failed to update notification count on init:', err);
            });
            this.setupNotificationSubscription().catch(err => {
                console.warn('[Header] Failed to setup notification subscription:', err);
            });
        }, 1000);
        
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
     */
    static async updateNotificationCount() {
        try {
            if (typeof window.NotificationService === 'undefined' || !window.AuthService || !window.AuthService.isAuthenticated()) {
                return;
            }

            const currentUserId = await window.DatabaseService?._getCurrentUserId();
            if (!currentUserId) {
                return;
            }

            const result = await window.NotificationService.getUnreadCount(currentUserId);
            if (result.success) {
                const count = result.count || 0;
                const countBadge = document.getElementById('header-notification-count');

                // Only update the badge in the user menu (notification bell removed)
                if (countBadge) {
                    if (count > 0) {
                        countBadge.textContent = count > 99 ? '99+' : count.toString();
                        countBadge.style.display = 'inline-block';
                    } else {
                        countBadge.style.display = 'none';
                    }
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
            // Longer delay to ensure AuthService state is fully updated
            setTimeout(() => {
                this.updateHeader(true); // Force update on sign-in
            }, 300);
        };
        
        this._authSignOutHandler = () => {
            console.log('[Header] auth:signout event received, updating header...');
            this.updateHeader();
        };
        
        // Listen for initial session event (only once, with debounce)
        this._authInitialSessionHandler = () => {
            console.log('[Header] auth:initial_session event received');
            // Only update if we haven't updated recently (debounce)
            if (!this.updateInProgress) {
                setTimeout(() => {
                    if (!this.updateInProgress) {
                        console.log('[Header] Executing header update after initial_session event (200ms delay)...');
                        this.updateHeader();
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
    static updateHeader(force = false) {
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
            
            // Check authentication status
            // Be more resilient - check both isAuthenticated() and direct session/user state
            let isAuthenticated = false;
            let currentUserEmail = null;
            if (window.AuthService) {
                // Check both the method and direct state to handle timeout scenarios
                const methodCheck = window.AuthService.isAuthenticated();
                const directCheck = window.AuthService.currentUser !== null && window.AuthService.session !== null;
                isAuthenticated = methodCheck || directCheck;
                const user = window.AuthService.getCurrentUser();
                currentUserEmail = user?.email || null;
                
                // If still not authenticated on force update, wait a bit and retry (for sign-in timing issues)
                if (!isAuthenticated && force) {
                    console.log('[Header] Auth check failed on force update, retrying after delay...');
                    this.updateInProgress = false; // Reset to allow retry
                    setTimeout(() => {
                        // Recursively call updateHeader with force to retry
                        this.updateHeader(true);
                    }, 300);
                    return;
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
                    // Notification bell removed - notifications are in user menu only
                    setTimeout(() => {
                        this.updateNotificationCount().catch(err => {
                            console.warn('[Header] Failed to update notification count in updateHeader:', err);
                        });
                    }, 500);
                } catch (error) {
                    console.error('[Header] Error initializing notification bell in updateHeader:', error);
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

