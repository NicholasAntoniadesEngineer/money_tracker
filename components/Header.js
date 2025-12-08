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
        } else if (filename.includes('overview')) {
            return 'Overview';
        } else if (filename.includes('import')) {
            return 'Import';
        }
        return 'Home';
    }

    /**
     * Get the base path for navigation links
     */
    static getBasePath() {
        const path = window.location.pathname;
        // If we're in the views folder, go up one level
        if (path.includes('/views/')) {
            return '../';
        }
        return '';
    }

    /**
     * Render the header HTML
     */
    static render() {
        const currentPage = this.getCurrentPage();
        const basePath = this.getBasePath();
        
        const navItems = [
            { name: 'Home', href: basePath + 'index.html', page: 'Home' },
            { name: 'Monthly Budget', href: basePath + 'views/monthly-budget.html', page: 'Monthly Budget' },
            { name: 'Pots & Investments', href: basePath + 'views/pots.html', page: 'Pots & Investments' },
            { name: 'Overview', href: basePath + 'views/overview.html', page: 'Overview' },
            { name: 'Import', href: basePath + 'views/import.html', page: 'Import' }
        ];

        const navLinks = navItems.map(item => {
            const isActive = item.page === currentPage;
            const activeClass = isActive ? ' active' : '';
            const ariaCurrent = isActive ? ' aria-current="page"' : '';
            return `<li><a href="${item.href}" class="nav-link${activeClass}"${ariaCurrent}>${item.name}</a></li>`;
        }).join('\n                ');

        return `
    <header class="main-header">
        <nav class="main-navigation" role="navigation" aria-label="Main navigation">
            <h1 class="site-title">Money Tracker</h1>
            <button class="hamburger-menu" aria-label="Toggle navigation menu" aria-expanded="false">
                <span class="hamburger-line"></span>
                <span class="hamburger-line"></span>
                <span class="hamburger-line"></span>
            </button>
            <ul class="nav-list">
                ${navLinks}
            </ul>
        </nav>
    </header>`;
    }

    /**
     * Initialize and inject header into the page
     */
    static init() {
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

