/**
 * Landing Page Controller
 * Handles the landing page view logic
 */

const LandingController = {
    /**
     * Initialize the landing page
     */
    async init() {
        await this.loadRecentMonths();
        this.setupEventListeners();
    },

    /**
     * Load and display recent months
     */
    async loadRecentMonths() {
        const recentMonthsContainer = document.getElementById('recent-months-container');
        if (!recentMonthsContainer) return;

        // Ensure months are loaded from files
        await DataManager.loadMonthsFromFiles();
        
        const allMonths = DataManager.getAllMonths();
        const monthKeys = Object.keys(allMonths).sort().reverse().slice(0, 6);

        if (monthKeys.length === 0) {
            recentMonthsContainer.innerHTML = '<p class="empty-message">No months created yet. Click "Create New Month" to get started.</p>';
            return;
        }

        recentMonthsContainer.innerHTML = monthKeys.map(monthKey => {
            const monthData = allMonths[monthKey];
            const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
            const year = monthData.year;
            const dateRange = monthData.dateRange;
            
            return `
                <a href="views/monthly-budget.html?month=${monthKey}" class="month-item">
                    <div class="month-item-title">${monthName} ${year}</div>
                    <div class="month-item-date">${dateRange?.start || ''} to ${dateRange?.end || ''}</div>
                </a>
            `;
        }).join('');
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const createNewMonthButton = document.getElementById('create-new-month-button');

        if (createNewMonthButton) {
            createNewMonthButton.addEventListener('click', () => this.handleCreateNewMonth());
        }
    },

    /**
     * Handle create new month action
     */
    async handleCreateNewMonth() {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        const yearInput = prompt('Enter year:', currentYear);
        if (!yearInput) return;

        if (!Formatters.validateYear(yearInput)) {
            alert('Please enter a valid year between 2000 and 2100');
            return;
        }

        const year = parseInt(yearInput, 10);
        const monthInput = prompt('Enter month (1-12):', currentMonth);
        if (!monthInput) return;

        if (!Formatters.validateMonth(monthInput)) {
            alert('Please enter a valid month between 1 and 12');
            return;
        }

        const month = parseInt(monthInput, 10);
        const monthKey = DataManager.generateMonthKey(year, month);
        const allMonths = DataManager.getAllMonths();
        const existingMonth = allMonths[monthKey];

        if (existingMonth) {
            if (confirm('A month for this period already exists. Do you want to open it instead?')) {
                window.location.href = `views/monthly-budget.html?month=${monthKey}`;
            }
            return;
        }

        await DataManager.createNewMonth(year, month);
        window.location.href = `views/monthly-budget.html?month=${monthKey}`;
    },

};

// Make LandingController available globally
window.LandingController = LandingController;

// Initialize when DOM is ready (if not already initialized by index.html)
document.addEventListener('DOMContentLoaded', () => {
    if (!window.landingControllerInitialized) {
        LandingController.init();
    }
});

