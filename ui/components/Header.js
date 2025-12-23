/**
 * Shared Header Component
 * Renders consistent navigation header across all pages
 */

class Header {
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
     * Render the header HTML
     */
    static render() {
        const currentPage = this.getCurrentPage();
        const basePath = this.getBasePath();
        const isInViews = window.location.pathname.includes('/views/');
        
        const navItems = [
            { name: 'Home', href: isInViews ? '../index.html' : 'index.html', page: 'Home' },
            { name: 'Monthly Budget', href: basePath + 'monthly-budget.html', page: 'Monthly Budget' },
            { name: 'Pots & Investments', href: basePath + 'pots.html', page: 'Pots & Investments' },
            { name: 'Settings', href: basePath + 'settings.html', page: 'Settings' }
        ];

        const navLinks = navItems.map(item => {
            const isActive = item.page === currentPage;
            const activeClass = isActive ? ' active' : '';
            const ariaCurrent = isActive ? ' aria-current="page"' : '';
            return `<li><a href="${item.href}" class="nav-link${activeClass}"${ariaCurrent}>${item.name}</a></li>`;
        }).join('\n                ');

        // Get user info if authenticated
        let userInfoHtml = '';
        if (window.AuthService && window.AuthService.isAuthenticated()) {
            const user = window.AuthService.getCurrentUser();
            const userEmail = user?.email || 'User';
            userInfoHtml = `
            <div class="header-user-info">
                <span class="user-email">${userEmail}</span>
                <button class="btn-signout" id="header-signout-button" aria-label="Sign out">Sign Out</button>
            </div>`;
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
        // Wait for AuthService to be available if it exists
        if (window.AuthService && !window.AuthService.client) {
            try {
                await window.AuthService.initialize();
            } catch (error) {
                console.warn('[Header] AuthService initialization failed:', error);
            }
        }
        
        // Find where to insert the header (before main or body's first child)
        const main = document.querySelector('main');
        const body = document.body;
        
        if (main) {
            // Insert before main element
            main.insertAdjacentHTML('beforebegin', this.render());
        } else if (body) {
            // Insert as first child of body
            body.insertAdjacentHTML('afterbegin', this.render());
        } else {
            console.error('Header: Could not find insertion point');
            return;
        }

        // Initialize hamburger menu functionality
        this.initHamburgerMenu();
        
        // Initialize sign out button
        this.initSignOutButton();
        
        // Listen for auth state changes to update header
        this.setupAuthStateListener();
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
     * Initialize sign out button
     */
    static initSignOutButton() {
        const signOutButton = document.getElementById('header-signout-button');
        if (signOutButton) {
            signOutButton.addEventListener('click', async () => {
                if (window.AuthService) {
                    const result = await window.AuthService.signOut();
                    if (result.success) {
                        // Redirect to auth page
                        const basePath = window.location.pathname.includes('/views/') ? '' : 'views/';
                        window.location.href = `${basePath}auth.html`;
                    } else {
                        console.error('[Header] Sign out failed:', result.error);
                        alert('Sign out failed: ' + (result.error || 'Unknown error'));
                    }
                }
            });
        }
    }

    /**
     * Setup auth state listener to update header when auth state changes
     */
    static setupAuthStateListener() {
        // Listen for auth state changes
        window.addEventListener('auth:signin', () => {
            this.updateHeader();
        });
        
        window.addEventListener('auth:signout', () => {
            this.updateHeader();
        });
    }

    /**
     * Update header to reflect current auth state
     */
    static updateHeader() {
        const header = document.querySelector('.main-header');
        if (header) {
            const nav = header.querySelector('.main-navigation');
            if (nav) {
                const oldUserInfo = nav.querySelector('.header-user-info');
                if (oldUserInfo) {
                    oldUserInfo.remove();
                }
                
                // Add user info if authenticated
                if (window.AuthService && window.AuthService.isAuthenticated()) {
                    const user = window.AuthService.getCurrentUser();
                    const userEmail = user?.email || 'User';
                    const userInfoHtml = `
                    <div class="header-user-info">
                        <span class="user-email">${userEmail}</span>
                        <button class="btn-signout" id="header-signout-button" aria-label="Sign out">Sign Out</button>
                    </div>`;
                    nav.insertAdjacentHTML('beforeend', userInfoHtml);
                    this.initSignOutButton();
                }
            }
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

