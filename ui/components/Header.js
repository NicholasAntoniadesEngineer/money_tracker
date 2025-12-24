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
        // If we're in the views folder, we're already in ui/views/
        if (path.includes('/views/')) {
            return '';
        }
        // If we're at root index.html, paths go to views/
        return 'views/';
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
        const isInViews = window.location.pathname.includes('/views/');
        
        const navItems = [
            { name: 'Home', href: isInViews ? '../index.html' : 'index.html', page: 'Home' },
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
                            <svg class="user-dropdown-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 8C10.2091 8 12 6.20914 12 4C12 1.79086 10.2091 0 8 0C5.79086 0 4 1.79086 4 4C4 6.20914 5.79086 8 8 8Z" fill="currentColor"/>
                                <path d="M8 10C4.68629 10 2 11.7909 2 14V16H14V14C14 11.7909 11.3137 10 8 10Z" fill="currentColor"/>
                            </svg>
                            <span>${userEmail}</span>
                        </div>
                        <a href="${settingsHref}" class="user-dropdown-item user-dropdown-settings">
                            <svg class="user-dropdown-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 5C6.34315 5 5 6.34315 5 8C5 9.65685 6.34315 11 8 11C9.65685 11 11 9.65685 11 8C11 6.34315 9.65685 5 8 5Z" fill="currentColor"/>
                                <path d="M8 0L9.5 0.5L11 0L12 1.5L13.5 1.5L14.5 3L13.5 4.5L12 4.5L11 6L9.5 5.5L8 7L6.5 5.5L5 6L4 4.5L2.5 4.5L1.5 3L2.5 1.5L4 1.5L5 0L6.5 0.5L8 0Z" fill="currentColor"/>
                            </svg>
                            <span>Settings</span>
                        </a>
                        <button class="user-dropdown-item user-dropdown-signout" id="header-signout-button" aria-label="Sign out">
                            <svg class="user-dropdown-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                <path d="M10 11L13 8L10 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M13 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            </svg>
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
                <h1 class="site-title">Money Tracker</h1>
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
        
        // Wait for AuthService to be available if it exists
        if (window.AuthService && !window.AuthService.client) {
            console.log('[Header] AuthService available but client not initialized, initializing...');
            try {
                await window.AuthService.initialize();
                console.log('[Header] AuthService initialized');
            } catch (error) {
                console.warn('[Header] AuthService initialization failed:', error);
            }
        } else {
            console.log('[Header] AuthService status:', {
                hasAuthService: !!window.AuthService,
                hasClient: !!window.AuthService?.client
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
        
        // Initialize user menu dropdown
        this.initUserMenu();
        
        // Initialize sign out button
        this.initSignOutButton();
        
        // Listen for auth state changes to update header
        this.setupAuthStateListener();
        
        // Update header immediately to show user menu if already authenticated
        console.log('[Header] Updating header with current auth state...');
        this.updateHeader();
        
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
                        const currentPath = window.location.pathname;
                        const authPath = currentPath.includes('/views/') 
                            ? currentPath.replace(/[^/]+$/, 'auth.html')
                            : 'views/auth.html';
                        window.location.href = authPath;
                    });
                } else {
                    // Fallback if AuthService not available
                    window.location.href = 'views/auth.html';
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
            // Small delay to ensure AuthService state is updated
            setTimeout(() => {
                this.updateHeader();
            }, 100);
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
     */
    static updateHeader() {
        console.log('[Header] ========== UPDATE HEADER CALLED ==========');
        
        if (this.updateInProgress) {
            console.log('[Header] Update already in progress, skipping duplicate call');
            return;
        }
        
        this.updateInProgress = true;
        console.log('[Header] updateHeader() called');
        
        try {
            const header = document.querySelector('.main-header');
            console.log('[Header] Header element found:', !!header);
            
            if (!header) {
                console.warn('[Header] Header element not found in DOM');
                return;
            }
            
            const nav = header.querySelector('.main-navigation');
            console.log('[Header] Navigation element found:', !!nav);
            
            if (!nav) {
                console.warn('[Header] Navigation element not found in header');
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
            }
            
            const currentState = {
                isAuthenticated: isAuthenticated,
                userEmail: currentUserEmail
            };
            
            // Check if state has actually changed
            if (this.lastUpdateState && 
                this.lastUpdateState.isAuthenticated === currentState.isAuthenticated &&
                this.lastUpdateState.userEmail === currentState.userEmail) {
                console.log('[Header] Auth state unchanged, skipping update');
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
                                <svg class="user-dropdown-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M8 8C10.2091 8 12 6.20914 12 4C12 1.79086 10.2091 0 8 0C5.79086 0 4 1.79086 4 4C4 6.20914 5.79086 8 8 8Z" fill="currentColor"/>
                                    <path d="M8 10C4.68629 10 2 11.7909 2 14V16H14V14C14 11.7909 11.3137 10 8 10Z" fill="currentColor"/>
                                </svg>
                                <span>${userEmail}</span>
                            </div>
                            <a href="${settingsHref}" class="user-dropdown-item user-dropdown-settings">
                                <svg class="user-dropdown-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M8 5C6.34315 5 5 6.34315 5 8C5 9.65685 6.34315 11 8 11C9.65685 11 11 9.65685 11 8C11 6.34315 9.65685 5 8 5Z" fill="currentColor"/>
                                    <path d="M8 0L9.5 0.5L11 0L12 1.5L13.5 1.5L14.5 3L13.5 4.5L12 4.5L11 6L9.5 5.5L8 7L6.5 5.5L5 6L4 4.5L2.5 4.5L1.5 3L2.5 1.5L4 1.5L5 0L6.5 0.5L8 0Z" fill="currentColor"/>
                                </svg>
                                <span>Settings</span>
                            </a>
                            <button class="user-dropdown-item user-dropdown-signout" id="header-signout-button" aria-label="Sign out">
                                <svg class="user-dropdown-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M6 14H3C2.44772 14 2 13.5523 2 13V3C2 2.44772 2.44772 2 3 2H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                    <path d="M10 11L13 8L10 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M13 8H6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                </svg>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </div>`;
                nav.insertAdjacentHTML('beforeend', userInfoHtml);
                this.initUserMenu();
                this.initSignOutButton();
                console.log('[Header] User menu added successfully');
            } else {
                console.log('[Header] User not authenticated, not adding user menu');
            }
            
            this.lastUpdateState = currentState;
            console.log('[Header] ========== UPDATE HEADER COMPLETE ==========');
        } finally {
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

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Header;
}

