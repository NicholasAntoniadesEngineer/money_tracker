/**
 * Monthly Budget Controller
 * Handles the monthly budget view logic
 */

const MonthlyBudgetController = {
    currentMonthData: null,
    currentMonthKey: null,
    editingShareId: null,

    /**
     * Calculate the number of weeks in a month
     * Returns an array of week objects with start and end dates
     * Weeks run Monday to Sunday
     */
    calculateWeeksInMonth(year, month) {
        const weeks = [];
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const daysInMonth = lastDay.getDate();
        
        // Find the Monday of the week containing the first day of the month
        const firstDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToMonday = firstDayOfWeek === 0 ? -6 : 1 - firstDayOfWeek;
        
        let weekStartDay = 1 + daysToMonday;
        let weekEndDay = weekStartDay + 6;
        
        // Adjust if week starts before month
        if (weekStartDay < 1) {
            weekStartDay = 1;
        }
        
        // Continue until we've covered all days in the month
        while (weekStartDay <= daysInMonth) {
            // Ensure week end doesn't exceed month end
            if (weekEndDay > daysInMonth) {
                weekEndDay = daysInMonth;
            }
            
            weeks.push({
                startDate: weekStartDay,
                endDate: weekEndDay,
                startFullDate: new Date(year, month - 1, weekStartDay),
                endFullDate: new Date(year, month - 1, weekEndDay),
                weekNumber: weeks.length + 1
            });
            
            // Move to next week
            weekStartDay = weekEndDay + 1;
            weekEndDay = weekStartDay + 6;
        }
        
        return weeks;
    },

    /**
     * Get week number for a given date in the month
     */
    getWeekForDate(year, month, day) {
        const weeks = this.calculateWeeksInMonth(year, month);
        for (let i = 0; i < weeks.length; i++) {
            if (day >= weeks[i].startDate && day <= weeks[i].endDate) {
                return i;
            }
        }
        return 0; // Default to first week
    },

    /**
     * Format date range for week display
     */
    formatWeekDateRange(week) {
        return `${week.startDate}-${week.endDate}`;
    },

    /**
     * Initialize the monthly budget page
     */
    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        const monthParam = urlParams.get('month');

        // Load months from database (user months + enabled example data only)
        const allMonths = await DataManager.getAllMonths(false, true);

        this.loadMonthSelector();

        if (monthParam) {
            await this.loadMonth(monthParam);
        } else {
            const monthKeys = Object.keys(allMonths).sort().reverse();
            if (monthKeys.length > 0) {
                await this.loadMonth(monthKeys[0]);
            }
        }

        this.setupEventListeners();
        await this.loadSharedFromData();
    },

    /**
     * Load month selector dropdown
     */
    async loadMonthSelector() {
        const selector = document.getElementById('month-selector');

        // Load user months + enabled example data only
        const allMonths = await DataManager.getAllMonths(false, true);
        const monthKeys = Object.keys(allMonths).sort().reverse();

        // Build options with shared month labels
        let optionsHtml = '';
        if (monthKeys.length > 0) {
            const optionsPromises = monthKeys.map(async (key) => {
                const monthData = allMonths[key];
                const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                let displayText = `${monthName} ${monthData.year}`;
                
                // If this is a shared month, append owner email
                if (monthData.isShared && monthData.sharedOwnerId) {
                    try {
                        if (window.DatabaseService) {
                            const emailResult = await window.DatabaseService.getUserEmailById(monthData.sharedOwnerId);
                            if (emailResult.success && emailResult.email) {
                                displayText += ` (shared from: ${emailResult.email})`;
                            } else {
                                displayText += ` (shared from: Unknown User)`;
                            }
                        } else {
                            displayText += ` (shared from: Unknown User)`;
                        }
                    } catch (error) {
                        console.warn('[MonthlyBudgetController] Error fetching owner email for shared month:', error);
                        displayText += ` (shared from: Unknown User)`;
                    }
                }
                
                return `<option value="${key}">${displayText}</option>`;
            });
            
            const options = await Promise.all(optionsPromises);
            optionsHtml = options.join('');
        } else {
            optionsHtml = '<option value="">No months available</option>';
        }

        if (selector) {
            selector.innerHTML = optionsHtml;
            this.adjustMonthSelectorWidth();
        }
    },
    
    /**
     * Adjust month selector width to fit content
     */
    adjustMonthSelectorWidth() {
        const selector = document.getElementById('month-selector');
        if (!selector) return;
        
        // Create a temporary span to measure text width
        const tempSpan = document.createElement('span');
        tempSpan.style.position = 'absolute';
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.whiteSpace = 'nowrap';
        tempSpan.style.fontSize = window.getComputedStyle(selector).fontSize;
        tempSpan.style.fontFamily = window.getComputedStyle(selector).fontFamily;
        tempSpan.style.fontWeight = window.getComputedStyle(selector).fontWeight;
        tempSpan.style.padding = window.getComputedStyle(selector).padding;
        document.body.appendChild(tempSpan);
        
        // Find the longest option text
        let maxWidth = 0;
        const options = selector.options;
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            tempSpan.textContent = option.textContent;
            const width = tempSpan.offsetWidth;
            if (width > maxWidth) {
                maxWidth = width;
            }
        }
        
        // Also check the label width
        const label = document.querySelector('label[for="month-selector"]');
        if (label) {
            tempSpan.textContent = label.textContent;
            const labelWidth = tempSpan.offsetWidth;
            if (labelWidth > maxWidth) {
                maxWidth = labelWidth;
            }
        }
        
        // Set the width (add some padding for dropdown arrow and borders)
        selector.style.width = `${maxWidth + 40}px`;
        
        // Clean up
        document.body.removeChild(tempSpan);
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        const createMonthBtn = document.getElementById('create-month-button');
        const saveMonthBtn = document.getElementById('save-month-button');
        const addIncomeBtn = document.getElementById('add-income-button');
        const addFixedCostBtn = document.getElementById('add-fixed-cost-button');
        const addVariableCostBtn = document.getElementById('add-variable-cost-button');
        const addUnplannedBtn = document.getElementById('add-unplanned-expense-button');
        const addPotBtn = document.getElementById('add-pot-button');
        const addWeeklyBreakdownBtn = document.getElementById('add-weekly-breakdown-button');
        const shareMonthBtn = document.getElementById('share-month-button');

        if (createMonthBtn) createMonthBtn.addEventListener('click', () => this.createNewMonth());
        if (saveMonthBtn) saveMonthBtn.addEventListener('click', () => this.saveMonthData());
        if (addIncomeBtn) addIncomeBtn.addEventListener('click', () => this.addIncomeRow());
        if (addFixedCostBtn) addFixedCostBtn.addEventListener('click', () => this.addFixedCostRow());
        if (addVariableCostBtn) addVariableCostBtn.addEventListener('click', () => this.addVariableCostRow());
        if (addUnplannedBtn) addUnplannedBtn.addEventListener('click', () => this.addUnplannedExpenseRow());
        if (addPotBtn) addPotBtn.addEventListener('click', () => this.addPotRow());
        if (addWeeklyBreakdownBtn) addWeeklyBreakdownBtn.addEventListener('click', () => this.addWeeklyBreakdownRow());
        if (shareMonthBtn) shareMonthBtn.addEventListener('click', () => this.handleShareMonth());
        
        // Copy from month event listeners
        const copyIncomeBtn = document.getElementById('copy-income-button');
        const copyFixedCostsBtn = document.getElementById('copy-fixed-costs-button');
        const copyVariableCostsBtn = document.getElementById('copy-variable-costs-button');
        const copyUnplannedBtn = document.getElementById('copy-unplanned-button');

        if (copyIncomeBtn) copyIncomeBtn.addEventListener('click', () => this.copyIncomeFromMonth());
        if (copyFixedCostsBtn) copyFixedCostsBtn.addEventListener('click', () => this.copyFixedCostsFromMonth());
        if (copyVariableCostsBtn) copyVariableCostsBtn.addEventListener('click', () => this.copyVariableCostsFromMonth());
        if (copyUnplannedBtn) copyUnplannedBtn.addEventListener('click', () => this.copyUnplannedExpensesFromMonth());

        // Month selector event listeners
        const selector = document.getElementById('month-selector');
        
        const handleMonthChange = async (value) => {
            if (value) {
                await this.loadMonth(value);
            }
        };
        
        if (selector) {
            selector.addEventListener('change', () => handleMonthChange(selector.value));
        }

        const incomeInputs = ['nicholas-income-estimated', 'nicholas-income-actual', 
                             'lara-income-estimated', 'lara-income-actual',
                             'other-income-estimated', 'other-income-actual'];
        incomeInputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) input.addEventListener('input', () => this.updateCalculations());
        });
    },

    /**
     * Create a new month
     */
    async createNewMonth() {
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
        await DataManager.createNewMonth(year, month);
        window.location.href = `monthly-budget.html?month=${monthKey}`;
    },

    /**
     * Load a specific month
     */
    async loadMonth(monthKey) {
        console.log('[MonthlyBudgetController] loadMonth() called for:', monthKey);
        
        const monthData = await DataManager.getMonth(monthKey);
        
        if (!monthData) {
            console.warn('[MonthlyBudgetController] Month not found:', monthKey);
            alert('Month not found');
            return;
        }

        console.log('[MonthlyBudgetController] Month data loaded:', { 
            year: monthData.year, 
            month: monthData.month, 
            monthName: monthData.monthName 
        });

        this.currentMonthData = monthData;
        this.currentMonthKey = monthKey;

        const selector = document.getElementById('month-selector');

        // Update selector
        if (selector) {
            selector.value = monthKey;
            this.adjustMonthSelectorWidth();
        }

        this.loadIncomeSources(monthData.income || monthData.incomeSources || []);
        this.loadFixedCosts(monthData.fixedCosts || []);

        // Ensure variable costs are initialized with defaults if empty
        let variableCosts = monthData.variableCosts || [];

        if (variableCosts.length === 0) {
            const settings = DataManager.getSettings() || DataManager.initializeSettings();
            variableCosts = (settings.defaultVariableCategories || []).map(category => ({
                category: category,
                estimatedAmount: 0,
                actualAmount: 0,
                comments: ''
            }));
            // Update the month data with default variable costs
            monthData.variableCosts = variableCosts;
            this.currentMonthData = monthData;
        }

        // Normalize variable costs data structure to use estimatedAmount/actualAmount
        // (handles both monthlyBudget/actualSpent and estimatedAmount/actualAmount formats)
        // Create a fresh copy to avoid reference issues
        const normalizedVariableCosts = variableCosts.map(cost => ({
            category: cost.category || '',
            estimatedAmount: cost.estimatedAmount !== undefined ? cost.estimatedAmount : (cost.monthlyBudget || 0),
            actualAmount: cost.actualAmount !== undefined ? cost.actualAmount : (cost.actualSpent || 0),
            comments: cost.comments || ''
        }));

        // Load variable costs with normalized data
        this.loadVariableCosts(normalizedVariableCosts, false); // Allow rebuild to ensure proper display
        
        // Explicitly update current month data to ensure it's in sync (matching copyVariableCostsFromMonth pattern)
        this.currentMonthData.variableCosts = normalizedVariableCosts;
        
        this.loadUnplannedExpenses(monthData.unplannedExpenses || []);
        this.loadPots(monthData.pots || []);

        // Load weekly breakdown after costs are loaded so we can populate them
        this.loadWeeklyBreakdown(monthData.weeklyBreakdown || []);

        // Only populate working section if it's empty or needs initialization
        // Don't overwrite data that was just loaded from saved format
        // Check if weeklyBreakdown had data - if so, skip populateWorkingSectionFromCosts
        const weeklyBreakdownHadData = monthData.weeklyBreakdown && monthData.weeklyBreakdown.length > 0 && monthData.weeklyBreakdown.some(week => {
            return Object.keys(week).some(key => {
                if (key.startsWith('weekly-variable-') || key === 'Food' || key === 'Travel' || key === 'Activities') {
                    const value = week[key];
                    return typeof value === 'string' && value.includes('Estimate:') && value.trim().length > 0;
                }
                return false;
            });
        });
        
        // Only populate if weeklyBreakdown had no data
        // This preserves loaded calculations from saved/example data
        if (!weeklyBreakdownHadData) {
            this.populateWorkingSectionFromCosts();
        }

        // Update variable cost actuals from working section data
        this.updateVariableCostActualsFromWorkingSection();

        const monthContent = document.getElementById('month-content');
        const noMonthMessage = document.getElementById('no-month-message');
        if (monthContent) monthContent.style.display = 'block';
        if (noMonthMessage) noMonthMessage.style.display = 'none';

        // Populate copy month selectors
        this.populateCopyMonthSelectors();

        // Automatically copy variable costs from the selected month to ensure table updates correctly
        // This uses the same logic as the copy button which works reliably
        this.copyVariableCostsFromMonthInternal(monthKey);

        this.updateCalculations();
        
        // Show share button if user has premium
        this.updateShareButtonVisibility();
        
        // Update sharing indicators
        await this.updateSharingIndicators();
        
        console.log('[MonthlyBudgetController] loadMonth() completed for:', monthKey);
    },
    
    /**
     * Update share button visibility based on premium status and month loaded
     */
    async updateShareButtonVisibility() {
        console.log('[MonthlyBudgetController] updateShareButtonVisibility() called');
        
        const shareBtn = document.getElementById('share-month-button');
        const indicator = document.getElementById('month-sharing-indicator');
        
        if (!shareBtn) {
            console.warn('[MonthlyBudgetController] share-month-button not found');
            return;
        }
        
        if (!this.currentMonthKey || !this.currentMonthData) {
            console.log('[MonthlyBudgetController] No current month, hiding share button');
            shareBtn.style.display = 'none';
            if (indicator) indicator.style.display = 'none';
            return;
        }
        
        // Check if user has premium subscription
        if (window.SubscriptionGuard) {
            try {
                const hasPremium = await window.SubscriptionGuard.hasTier('premium');
                console.log('[MonthlyBudgetController] Premium status:', hasPremium);
                
                if (hasPremium) {
                    shareBtn.style.display = 'inline-block';
                    // Indicator visibility will be set by updateSharingIndicators
                } else {
                    shareBtn.style.display = 'none';
                    if (indicator) indicator.style.display = 'none';
                }
            } catch (error) {
                console.warn('[MonthlyBudgetController] Error checking premium status:', error);
                shareBtn.style.display = 'none';
                if (indicator) indicator.style.display = 'none';
            }
        } else {
            console.warn('[MonthlyBudgetController] SubscriptionGuard not available');
            shareBtn.style.display = 'none';
            if (indicator) indicator.style.display = 'none';
        }
    },
    
    /**
     * Handle share month button click
     */
    /**
     * Handle share month button click - shows modal
     */
    async handleShareMonth() {
        console.log('[MonthlyBudgetController] handleShareMonth() called');
        
        if (!this.currentMonthKey || !this.currentMonthData) {
            console.warn('[MonthlyBudgetController] No month selected');
            alert('No month selected');
            return;
        }
        
        console.log('[MonthlyBudgetController] Current month:', this.currentMonthKey);
        
        if (!window.SubscriptionGuard) {
            console.error('[MonthlyBudgetController] SubscriptionGuard not available');
            alert('Subscription service not available');
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        console.log('[MonthlyBudgetController] Premium status:', hasPremium);
        
        if (!hasPremium) {
            alert('Premium subscription required to share data');
            return;
        }
        
        await this.showShareMonthModal();
    },
    
    /**
     * Show share month modal
     */
    async showShareMonthModal() {
        console.log('[MonthlyBudgetController] showShareMonthModal() called');
        
        const modal = document.getElementById('share-month-modal');
        if (!modal) {
            console.error('[MonthlyBudgetController] Share modal not found');
            return;
        }
        
        // Reset form
        this.resetShareMonthForm();
        
        // Load existing shares for this month
        await this.loadExistingSharesForMonth();
        
        // Load user months as checkboxes
        await this.loadUserMonthsAsCheckboxes();
        
        // Pre-select current month
        if (this.currentMonthKey) {
            const checkbox = document.querySelector(`input[type="checkbox"][data-month-key="${this.currentMonthKey}"]`);
            if (checkbox) {
                checkbox.checked = true;
                console.log('[MonthlyBudgetController] Pre-selected current month:', this.currentMonthKey);
            }
        }
        
        // Setup event listeners
        this.setupShareMonthModalListeners();
        
        // Show modal
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        
        console.log('[MonthlyBudgetController] Share modal displayed');
    },
    
    /**
     * Setup event listeners for share month modal
     */
    setupShareMonthModalListeners() {
        console.log('[MonthlyBudgetController] ========== setupShareMonthModalListeners() CALLED ==========');
        
        const closeBtn = document.getElementById('close-share-modal');
        const cancelBtn = document.getElementById('share-month-cancel-button');
        const saveBtn = document.getElementById('share-month-save-button');
        const shareAllDataCheckbox = document.getElementById('share-month-all-data');
        
        console.log('[MonthlyBudgetController] Element checks:', {
            closeBtn: !!closeBtn,
            cancelBtn: !!cancelBtn,
            saveBtn: !!saveBtn,
            shareAllDataCheckbox: !!shareAllDataCheckbox
        });
        
        if (closeBtn) {
            console.log('[MonthlyBudgetController] Setting up close button listener');
            closeBtn.onclick = () => {
                console.log('[MonthlyBudgetController] Close button clicked');
                this.hideShareMonthModal();
            };
        } else {
            console.warn('[MonthlyBudgetController] Close button not found!');
        }
        
        if (cancelBtn) {
            console.log('[MonthlyBudgetController] Setting up cancel button listener');
            cancelBtn.onclick = () => {
                console.log('[MonthlyBudgetController] Cancel button clicked');
                this.hideShareMonthModal();
            };
        } else {
            console.warn('[MonthlyBudgetController] Cancel button not found!');
        }
        
        if (saveBtn) {
            console.log('[MonthlyBudgetController] Setting up save button listener');
            // Remove any existing listeners first
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            
            // Add click listener
            newSaveBtn.addEventListener('click', (e) => {
                console.log('[MonthlyBudgetController] ========== SAVE BUTTON CLICKED ==========');
                console.log('[MonthlyBudgetController] Event:', e);
                console.log('[MonthlyBudgetController] Event type:', e.type);
                console.log('[MonthlyBudgetController] Event target:', e.target);
                console.log('[MonthlyBudgetController] Event currentTarget:', e.currentTarget);
                e.preventDefault();
                e.stopPropagation();
                this.handleSaveShareMonth();
            });
            console.log('[MonthlyBudgetController] Save button listener attached successfully');
        } else {
            console.error('[MonthlyBudgetController] ❌ Save button not found!');
            console.error('[MonthlyBudgetController] Attempting to find button by querySelector...');
            const foundBtn = document.querySelector('#share-month-save-button');
            console.error('[MonthlyBudgetController] QuerySelector result:', foundBtn);
        }
        
        if (shareAllDataCheckbox) {
            console.log('[MonthlyBudgetController] Setting up share all data checkbox listener');
            shareAllDataCheckbox.onchange = () => {
                console.log('[MonthlyBudgetController] Share all data checkbox changed');
                this.handleShareAllDataChangeInModal();
            };
        } else {
            console.warn('[MonthlyBudgetController] Share all data checkbox not found!');
        }
        
        console.log('[MonthlyBudgetController] ========== setupShareMonthModalListeners() COMPLETE ==========');
        
        // Close on overlay click
        const modal = document.getElementById('share-month-modal');
        if (modal) {
            const overlay = modal.querySelector('.help-modal-overlay');
            if (overlay) {
                overlay.onclick = () => this.hideShareMonthModal();
            }
        }
        
        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
                this.hideShareMonthModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    },
    
    /**
     * Hide share month modal
     */
    hideShareMonthModal() {
        console.log('[MonthlyBudgetController] hideShareMonthModal() called');
        
        const modal = document.getElementById('share-month-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
            this.resetShareMonthForm();
        }
    },
    
    /**
     * Reset share month form
     */
    resetShareMonthForm() {
        console.log('[MonthlyBudgetController] resetShareMonthForm() called');
        
        const emailInput = document.getElementById('share-month-email');
        if (emailInput) {
            emailInput.value = '';
            emailInput.readOnly = false;
            emailInput.title = '';
        }
        
        const accessLevel = document.getElementById('share-month-access-level');
        if (accessLevel) accessLevel.value = 'read';
        
        const shareAllData = document.getElementById('share-month-all-data');
        if (shareAllData) shareAllData.checked = false;
        
        const shareMonths = document.getElementById('share-month-months');
        if (shareMonths) {
            shareMonths.checked = true;
            shareMonths.disabled = false;
        }
        
        const sharePots = document.getElementById('share-month-pots');
        if (sharePots) {
            sharePots.checked = false;
            sharePots.disabled = false;
        }
        
        const shareSettings = document.getElementById('share-month-settings');
        if (shareSettings) {
            shareSettings.checked = false;
            shareSettings.disabled = false;
        }
        
        const monthsCheckboxes = document.getElementById('share-month-months-checkboxes');
        if (monthsCheckboxes) {
            monthsCheckboxes.innerHTML = '';
            // Uncheck all checkboxes
            monthsCheckboxes.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        }
        
        const statusDiv = document.getElementById('share-month-form-status');
        if (statusDiv) statusDiv.innerHTML = '';
        
        const monthsContainer = document.getElementById('share-month-months-container');
        if (monthsContainer) monthsContainer.style.display = 'block';
        
        this.editingShareId = null;
    },
    
    /**
     * Edit share in modal - populate form with existing share data
     */
    async editShareInModal(share) {
        console.log('[MonthlyBudgetController] editShareInModal() called for share:', share.id);
        
        if (!window.SubscriptionGuard) {
            console.error('[MonthlyBudgetController] SubscriptionGuard not available');
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            console.warn('[MonthlyBudgetController] User does not have premium');
            return;
        }
        
        // Set editing flag
        this.editingShareId = share.id;
        
        // Get user email for display
        let userEmail = share.displayEmail || share.shared_with_user_id;
        if (!share.displayEmail && window.DatabaseService) {
            try {
                const emailResult = await window.DatabaseService.getUserEmailById(share.shared_with_user_id);
                if (emailResult.success && emailResult.email) {
                    userEmail = emailResult.email;
                }
            } catch (error) {
                console.warn('[MonthlyBudgetController] Error looking up email:', error);
            }
        }
        
        // Populate form fields
        const emailInput = document.getElementById('share-month-email');
        if (emailInput) {
            emailInput.value = userEmail;
            emailInput.readOnly = true;
            emailInput.title = 'Email cannot be changed when editing';
        }
        
        const accessLevel = document.getElementById('share-month-access-level');
        if (accessLevel) {
            accessLevel.value = share.access_level;
        }
        
        // Parse shared_months if it's a string
        let sharedMonths = share.shared_months;
        if (typeof sharedMonths === 'string') {
            try {
                sharedMonths = JSON.parse(sharedMonths);
            } catch (e) {
                console.warn('[MonthlyBudgetController] Error parsing shared_months:', e);
                sharedMonths = [];
            }
        }
        
        const shareAllData = share.share_all_data === true || share.share_all_data === 'true';
        const shareMonthsCheck = shareAllData || (sharedMonths && sharedMonths.length > 0);
        const sharePotsCheck = shareAllData || share.shared_pots === true || share.shared_pots === 'true';
        const shareSettingsCheck = shareAllData || share.shared_settings === true || share.shared_settings === 'true';
        
        const shareAllDataCheckbox = document.getElementById('share-month-all-data');
        if (shareAllDataCheckbox) {
            shareAllDataCheckbox.checked = shareAllData;
            // Trigger change handler to update UI
            shareAllDataCheckbox.dispatchEvent(new Event('change'));
        }
        
        const shareMonthsCheckbox = document.getElementById('share-month-months');
        if (shareMonthsCheckbox) {
            shareMonthsCheckbox.checked = shareMonthsCheck;
        }
        
        const sharePotsCheckbox = document.getElementById('share-month-pots');
        if (sharePotsCheckbox) {
            sharePotsCheckbox.checked = sharePotsCheck;
        }
        
        const shareSettingsCheckbox = document.getElementById('share-month-settings');
        if (shareSettingsCheckbox) {
            shareSettingsCheckbox.checked = shareSettingsCheck;
        }
        
        // Load months as checkboxes and pre-select the ones in the share
        await this.loadUserMonthsAsCheckboxes();
        
        if (!shareAllData && sharedMonths && sharedMonths.length > 0) {
            // Pre-select the months that are in the share
            sharedMonths.forEach(monthEntry => {
                if (monthEntry.type === 'single') {
                    const monthKey = `${monthEntry.year}-${String(monthEntry.month).padStart(2, '0')}`;
                    const checkbox = document.querySelector(`input[type="checkbox"][data-month-key="${monthKey}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                        console.log('[MonthlyBudgetController] Pre-selected month:', monthKey);
                    }
                }
            });
        }
        
        // Re-setup event listeners (in case they were removed)
        console.log('[MonthlyBudgetController] Re-setting up event listeners for edit mode...');
        this.setupShareMonthModalListeners();
        
        // Show the modal
        const modal = document.getElementById('share-month-modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            console.log('[MonthlyBudgetController] Share modal opened in edit mode');
        }
    },
    
    /**
     * Load existing shares for current month
     */
    async loadExistingSharesForMonth() {
        console.log('[MonthlyBudgetController] loadExistingSharesForMonth() called for month:', this.currentMonthKey);
        
        if (!window.DatabaseService) {
            console.error('[MonthlyBudgetController] DatabaseService not available');
            return;
        }
        
        try {
            const result = await window.DatabaseService.getDataSharesCreatedByMe();
            console.log('[MonthlyBudgetController] getDataSharesCreatedByMe result:', result);
            
            if (result.success && result.shares) {
                const [year, month] = this.currentMonthKey.split('-');
                const yearNum = parseInt(year, 10);
                const monthNum = parseInt(month, 10);
                
                // Filter shares that include this month
                const relevantShares = result.shares.filter(share => {
                    if (!share.shared_months || share.shared_months.length === 0) {
                        return false;
                    }
                    
                    return share.shared_months.some(monthEntry => {
                        if (monthEntry.type === 'single') {
                            return monthEntry.year === yearNum && monthEntry.month === monthNum;
                        }
                        // Handle range if needed
                        return false;
                    });
                });
                
                console.log('[MonthlyBudgetController] Relevant shares found:', relevantShares.length);
                this.renderExistingSharesInModal(relevantShares);
            } else {
                const list = document.getElementById('share-month-shares-list');
                if (list) {
                    list.innerHTML = '<p>No shares for this month yet.</p>';
                }
            }
        } catch (error) {
            console.error('[MonthlyBudgetController] Error loading existing shares:', error);
        }
    },
    
    /**
     * Render existing shares in modal
     */
    async renderExistingSharesInModal(shares) {
        console.log('[MonthlyBudgetController] renderExistingSharesInModal() called with', shares.length, 'shares');
        
        const list = document.getElementById('share-month-shares-list');
        if (!list) {
            console.warn('[MonthlyBudgetController] share-month-shares-list not found');
            return;
        }
        
        if (shares.length === 0) {
            list.innerHTML = '<p>No shares for this month yet.</p>';
            return;
        }
        
        // Look up emails for all shares
        const sharesWithEmails = await Promise.all(shares.map(async (share) => {
            let email = share.shared_with_user_id;
            if (window.DatabaseService) {
                try {
                    const emailResult = await window.DatabaseService.getUserEmailById(share.shared_with_user_id);
                    if (emailResult.success && emailResult.email) {
                        email = emailResult.email;
                    }
                } catch (error) {
                    console.warn('[MonthlyBudgetController] Error looking up email:', error);
                }
            }
            return { ...share, displayEmail: email };
        }));
        
        list.innerHTML = sharesWithEmails.map(share => `
            <div class="share-item" style="padding: var(--spacing-sm); margin-bottom: var(--spacing-sm); background: rgba(213, 213, 213, 0.85); border: var(--border-width-thin) solid var(--border-color-black); border-radius: var(--border-radius);">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <strong>Shared with:</strong> ${share.displayEmail}<br>
                        <strong>Access Level:</strong> ${share.access_level.replace('_', '/')}
                    </div>
                    <button class="btn btn-danger btn-sm delete-share-month-btn" data-share-id="${share.id}">Delete</button>
                </div>
            </div>
        `).join('');
        
        // Add delete handlers
        list.querySelectorAll('.delete-share-month-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleDeleteShareFromModal(btn.dataset.shareId));
        });
    },
    
    /**
     * Handle delete share from modal
     */
    async handleDeleteShareFromModal(shareId) {
        console.log('[MonthlyBudgetController] handleDeleteShareFromModal() called for share:', shareId);
        
        if (!confirm('Are you sure you want to delete this share?')) {
            return;
        }
        
        try {
            const result = await window.DatabaseService.deleteDataShare(parseInt(shareId, 10));
            console.log('[MonthlyBudgetController] deleteDataShare result:', result);
            
            if (result.success) {
                await this.loadExistingSharesForMonth();
                await this.updateSharingIndicators();
            } else {
                alert(`Error deleting share: ${result.error}`);
            }
        } catch (error) {
            console.error('[MonthlyBudgetController] Error deleting share:', error);
            alert(`Error: ${error.message}`);
        }
    },
    
    /**
     * Load user months as checkboxes for multiple selection
     */
    async loadUserMonthsAsCheckboxes() {
        console.log('[MonthlyBudgetController] loadUserMonthsAsCheckboxes() called');
        
        const checkboxesContainer = document.getElementById('share-month-months-checkboxes');
        if (!checkboxesContainer) {
            console.warn('[MonthlyBudgetController] share-month-months-checkboxes not found');
            return;
        }
        
        try {
            if (!window.DatabaseService) {
                console.error('[MonthlyBudgetController] DatabaseService not available');
                return;
            }
            
            const allMonths = await window.DatabaseService.getAllMonths(false, false);
            const monthKeys = Object.keys(allMonths).sort().reverse();
            
            console.log('[MonthlyBudgetController] Found', monthKeys.length, 'user months to display as checkboxes');
            
            checkboxesContainer.innerHTML = '';
            
            if (monthKeys.length === 0) {
                checkboxesContainer.innerHTML = '<p>No months available to share.</p>';
                return;
            }
            
            monthKeys.forEach(monthKey => {
                const monthData = allMonths[monthKey];
                if (monthData && !monthData.isShared) {
                    const monthName = monthData.monthName || window.DataManager.getMonthName(monthData.month);
                    const displayText = `${monthName} ${monthData.year}`;
                    
                    const label = document.createElement('label');
                    label.style.display = 'flex';
                    label.style.alignItems = 'center';
                    label.style.gap = 'var(--spacing-sm)';
                    label.style.cursor = 'pointer';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.value = monthKey;
                    checkbox.dataset.monthKey = monthKey;
                    checkbox.dataset.year = monthData.year;
                    checkbox.dataset.month = monthData.month;
                    
                    const span = document.createElement('span');
                    span.textContent = displayText;
                    
                    label.appendChild(checkbox);
                    label.appendChild(span);
                    checkboxesContainer.appendChild(label);
                }
            });
            
            console.log('[MonthlyBudgetController] Loaded', checkboxesContainer.children.length, 'month checkboxes');
        } catch (error) {
            console.error('[MonthlyBudgetController] Error loading user months as checkboxes:', error);
            checkboxesContainer.innerHTML = '<p style="color: var(--error-color);">Error loading months.</p>';
        }
    },
    
    /**
     * Handle share all data checkbox change in modal
     */
    async handleShareAllDataChangeInModal() {
        console.log('[MonthlyBudgetController] handleShareAllDataChangeInModal() called');
        
        if (!window.SubscriptionGuard) {
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            const checkbox = document.getElementById('share-month-all-data');
            if (checkbox) {
                checkbox.checked = false;
            }
            return;
        }
        
        const shareAllData = document.getElementById('share-month-all-data').checked;
        const shareMonthsCheckbox = document.getElementById('share-month-months');
        const sharePotsCheckbox = document.getElementById('share-month-pots');
        const shareSettingsCheckbox = document.getElementById('share-month-settings');
        const monthsContainer = document.getElementById('share-month-months-container');
        
        if (shareAllData) {
            shareMonthsCheckbox.checked = true;
            sharePotsCheckbox.checked = true;
            shareSettingsCheckbox.checked = true;
            shareMonthsCheckbox.disabled = true;
            sharePotsCheckbox.disabled = true;
            shareSettingsCheckbox.disabled = true;
            if (monthsContainer) {
                monthsContainer.style.display = 'none';
            }
            // Uncheck all month checkboxes
            const checkboxes = document.querySelectorAll('#share-month-months-checkboxes input[type="checkbox"]');
            checkboxes.forEach(cb => cb.checked = false);
        } else {
            shareMonthsCheckbox.disabled = false;
            sharePotsCheckbox.disabled = false;
            shareSettingsCheckbox.disabled = false;
            if (monthsContainer) {
                monthsContainer.style.display = 'block';
            }
        }
    },
    
    /**
     * Handle save share from modal
     */
    async handleSaveShareMonth() {
        console.log('[MonthlyBudgetController] handleSaveShareMonth() called');
        
        if (!window.SubscriptionGuard) {
            alert('Subscription service not available');
            return;
        }
        
        const hasPremium = await window.SubscriptionGuard.hasTier('premium');
        if (!hasPremium) {
            alert('Premium subscription required');
            return;
        }
        
        const email = document.getElementById('share-month-email').value.trim();
        const accessLevel = document.getElementById('share-month-access-level').value;
        const shareAllData = document.getElementById('share-month-all-data').checked;
        const shareMonths = document.getElementById('share-month-months').checked;
        const sharePots = document.getElementById('share-month-pots').checked;
        const shareSettings = document.getElementById('share-month-settings').checked;
        
        console.log('[MonthlyBudgetController] Form values:', { email, accessLevel, shareAllData, shareMonths, sharePots, shareSettings });
        
        // When editing, email field is read-only and already has a value
        // But we still need to validate it's not empty
        if (!email) {
            const statusDiv = document.getElementById('share-month-form-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<p style="color: var(--error-color);">Please enter an email address.</p>';
            } else {
                alert('Please enter an email address');
            }
            console.warn('[MonthlyBudgetController] Save failed: Email is empty');
            return;
        }
        
        // When shareAllData is true, all share options are automatically enabled
        // So we should check shareAllData OR at least one share option
        if (!shareAllData && !shareMonths && !sharePots && !shareSettings) {
            const statusDiv = document.getElementById('share-month-form-status');
            if (statusDiv) {
                statusDiv.innerHTML = '<p style="color: var(--error-color);">Please select at least one thing to share.</p>';
            } else {
                alert('Please select at least one thing to share');
            }
            console.warn('[MonthlyBudgetController] Save failed: No share options selected');
            return;
        }
        
        let selectedMonths = [];
        
        if (shareAllData) {
            if (!window.DatabaseService) {
                alert('DatabaseService not available');
                return;
            }
            
            try {
                const allMonths = await window.DatabaseService.getAllMonths(false, false);
                const monthKeys = Object.keys(allMonths);
                selectedMonths = monthKeys.map(monthKey => {
                    const monthData = allMonths[monthKey];
                    if (monthData && !monthData.isShared) {
                        return { type: 'single', year: monthData.year, month: monthData.month };
                    }
                    return null;
                }).filter(m => m !== null);
                
                console.log('[MonthlyBudgetController] Share all data - selected', selectedMonths.length, 'months');
            } catch (error) {
                console.error('[MonthlyBudgetController] Error loading all months:', error);
                alert('Error loading your months. Please try again.');
                return;
            }
        } else if (shareMonths) {
            // Get selected months from checkboxes
            const checkboxes = document.querySelectorAll('#share-month-months-checkboxes input[type="checkbox"]:checked');
            selectedMonths = Array.from(checkboxes).map(checkbox => ({
                type: 'single',
                year: parseInt(checkbox.dataset.year, 10),
                month: parseInt(checkbox.dataset.month, 10)
            }));
            
            console.log('[MonthlyBudgetController] Selected months from checkboxes:', selectedMonths.length);
            
            if (selectedMonths.length === 0) {
                alert('Please select at least one month');
                return;
            }
        }
        
        const statusDiv = document.getElementById('share-month-form-status');
        if (!statusDiv) {
            console.error('[MonthlyBudgetController] Status div not found');
            alert('Error: Status element not found');
            return;
        }
        
        statusDiv.innerHTML = '<p>Saving share...</p>';
        console.log('[MonthlyBudgetController] Starting save operation. Editing:', !!this.editingShareId, 'Share ID:', this.editingShareId);
        
        try {
            let result;
            
            if (this.editingShareId) {
                console.log('[MonthlyBudgetController] Updating existing share ID:', this.editingShareId);
                console.log('[MonthlyBudgetController] Update parameters:', {
                    shareId: this.editingShareId,
                    accessLevel,
                    selectedMonthsCount: selectedMonths.length,
                    sharePots,
                    shareSettings,
                    shareAllData
                });
                
                result = await window.DatabaseService.updateDataShare(
                    this.editingShareId,
                    accessLevel,
                    selectedMonths,
                    sharePots,
                    shareSettings,
                    shareAllData
                );
                console.log('[MonthlyBudgetController] updateDataShare result:', result);
            } else {
                console.log('[MonthlyBudgetController] MODE: CREATE NEW SHARE');
                console.log('[MonthlyBudgetController] Create parameters:', {
                    email: email,
                    accessLevel: accessLevel,
                    selectedMonthsCount: selectedMonths.length,
                    selectedMonths: selectedMonths,
                    sharePots: sharePots,
                    shareSettings: shareSettings,
                    shareAllData: shareAllData
                });
                
                console.log('[MonthlyBudgetController] Calling DatabaseService.createDataShare()...');
                const createStartTime = Date.now();
                result = await window.DatabaseService.createDataShare(
                    email,
                    accessLevel,
                    selectedMonths,
                    sharePots,
                    shareSettings,
                    shareAllData
                );
                const createEndTime = Date.now();
                console.log('[MonthlyBudgetController] createDataShare completed in', (createEndTime - createStartTime), 'ms');
                console.log('[MonthlyBudgetController] createDataShare result:', result);
                console.log('[MonthlyBudgetController] Result success:', result ? result.success : 'result is null/undefined');
                console.log('[MonthlyBudgetController] Result error:', result ? result.error : 'N/A');
                console.log('[MonthlyBudgetController] Result share:', result ? result.share : 'N/A');
            }
            
            console.log('[MonthlyBudgetController] ========== PROCESSING RESULT ==========');
            console.log('[MonthlyBudgetController] Result object:', result);
            console.log('[MonthlyBudgetController] Result type:', typeof result);
            console.log('[MonthlyBudgetController] Result is null:', result === null);
            console.log('[MonthlyBudgetController] Result is undefined:', result === undefined);
            
            if (!result) {
                console.error('[MonthlyBudgetController] Result is null or undefined!');
                statusDiv.innerHTML = '<p style="color: var(--error-color);">Error: No result returned from save operation.</p>';
                return;
            }
            
            if (result.success) {
                console.log('[MonthlyBudgetController] ✅ SAVE OPERATION SUCCESSFUL');
                const message = this.editingShareId ? 'Share updated successfully!' : 'Share saved successfully!';
                console.log('[MonthlyBudgetController] Success message:', message);
                statusDiv.innerHTML = `<p style="color: var(--success-color);">${message}</p>`;
                
                // Clear editing flag
                console.log('[MonthlyBudgetController] Clearing editingShareId (was:', this.editingShareId, ')');
                this.editingShareId = null;
                console.log('[MonthlyBudgetController] editingShareId cleared, now:', this.editingShareId);
                
                // Reload existing shares
                console.log('[MonthlyBudgetController] Reloading existing shares...');
                await this.loadExistingSharesForMonth();
                console.log('[MonthlyBudgetController] Existing shares reloaded');
                
                // Update sharing indicators
                console.log('[MonthlyBudgetController] Updating sharing indicators...');
                await this.updateSharingIndicators();
                console.log('[MonthlyBudgetController] Sharing indicators updated');
                
                // Reset form after a delay
                console.log('[MonthlyBudgetController] Scheduling form reset and modal close in 1500ms...');
                setTimeout(() => {
                    console.log('[MonthlyBudgetController] Timeout callback executing - resetting form and closing modal');
                    this.resetShareMonthForm();
                    this.hideShareMonthModal();
                    console.log('[MonthlyBudgetController] Form reset and modal closed');
                }, 1500);
                console.log('[MonthlyBudgetController] Timeout scheduled');
            } else {
                console.error('[MonthlyBudgetController] ❌ SAVE OPERATION FAILED');
                console.error('[MonthlyBudgetController] Error result:', result);
                console.error('[MonthlyBudgetController] Error message:', result.error);
                console.error('[MonthlyBudgetController] Error type:', typeof result.error);
                
                let errorMessage = result.error || 'Unknown error occurred';
                console.log('[MonthlyBudgetController] Initial error message:', errorMessage);
                
                // Provide user-friendly error message for duplicate key
                if (errorMessage.includes('duplicate key') || errorMessage.includes('already exists')) {
                    console.log('[MonthlyBudgetController] Duplicate key error detected, updating message');
                    errorMessage = 'A share with this user already exists. The share has been updated instead.';
                    // Still reload to show the updated share
                    console.log('[MonthlyBudgetController] Reloading shares despite error...');
                    await this.loadExistingSharesForMonth();
                    await this.updateSharingIndicators();
                    console.log('[MonthlyBudgetController] Shares reloaded after duplicate key error');
                }
                
                console.log('[MonthlyBudgetController] Displaying error message to user:', errorMessage);
                statusDiv.innerHTML = `<p style="color: var(--error-color);">Error: ${errorMessage}</p>`;
            }
            console.log('[MonthlyBudgetController] ============================================');
        } catch (error) {
            console.error('[MonthlyBudgetController] ========== EXCEPTION IN SAVE OPERATION ==========');
            console.error('[MonthlyBudgetController] Exception type:', error.constructor.name);
            console.error('[MonthlyBudgetController] Exception message:', error.message);
            console.error('[MonthlyBudgetController] Exception stack:', error.stack);
            console.error('[MonthlyBudgetController] Full error object:', error);
            console.error('[MonthlyBudgetController] ===================================================');
            
            const errorMessage = error.message || 'An unexpected error occurred';
            if (statusDiv) {
                statusDiv.innerHTML = `<p style="color: var(--error-color);">Error: ${errorMessage}</p>`;
                console.log('[MonthlyBudgetController] Error message displayed in status div');
            } else {
                console.warn('[MonthlyBudgetController] Status div not found, using alert');
                alert(`Error: ${errorMessage}`);
            }
        }
        console.log('[MonthlyBudgetController] ========== handleSaveShareMonth() COMPLETE ==========');
    },
    
    /**
     * Update sharing indicators for current month and pots
     */
    async updateSharingIndicators() {
        console.log('[MonthlyBudgetController] updateSharingIndicators() called');
        
        if (!this.currentMonthKey || !this.currentMonthData) {
            console.log('[MonthlyBudgetController] No current month, skipping indicator update');
            return;
        }
        
        if (!window.DatabaseService) {
            console.warn('[MonthlyBudgetController] DatabaseService not available');
            return;
        }
        
        try {
            const result = await window.DatabaseService.getDataSharesCreatedByMe();
            console.log('[MonthlyBudgetController] Shares for indicator update:', result);
            
            if (result.success && result.shares) {
                const [year, month] = this.currentMonthKey.split('-');
                const yearNum = parseInt(year, 10);
                const monthNum = parseInt(month, 10);
                
                // Find shares that include this month
                const monthShares = result.shares.filter(share => {
                    if (!share.shared_months || share.shared_months.length === 0) {
                        return false;
                    }
                    
                    return share.shared_months.some(monthEntry => {
                        if (monthEntry.type === 'single') {
                            return monthEntry.year === yearNum && monthEntry.month === monthNum;
                        }
                        return false;
                    });
                });
                
                console.log('[MonthlyBudgetController] Found', monthShares.length, 'shares for current month');
                
                // Update sharing indicator next to Share Month button
                await this.updateMonthSharingIndicator(monthShares);
                
                // Update pots indicators if pots are shared
                const potsShares = result.shares.filter(share => share.shared_pots === true);
                console.log('[MonthlyBudgetController] Found', potsShares.length, 'shares with pots');
                await this.updatePotsIndicators(potsShares);
            }
        } catch (error) {
            console.error('[MonthlyBudgetController] Error updating sharing indicators:', error);
        }
    },
    
    /**
     * Update sharing indicator next to Share Month button
     */
    async updateMonthSharingIndicator(shares) {
        console.log('[MonthlyBudgetController] updateMonthSharingIndicator() called with', shares.length, 'shares');
        
        const indicator = document.getElementById('month-sharing-indicator');
        if (!indicator) {
            console.warn('[MonthlyBudgetController] month-sharing-indicator not found');
            return;
        }
        
        if (shares.length === 0) {
            indicator.style.display = 'none';
            indicator.innerHTML = '';
            indicator.title = '';
            console.log('[MonthlyBudgetController] Hiding sharing indicator (no shares)');
            return;
        }
        
        // Look up emails and store share data
        const sharesWithEmails = await Promise.all(shares.map(async (share) => {
            let email = share.shared_with_user_id;
            if (window.DatabaseService) {
                try {
                    const emailResult = await window.DatabaseService.getUserEmailById(share.shared_with_user_id);
                    if (emailResult.success && emailResult.email) {
                        email = emailResult.email;
                    }
                } catch (error) {
                    console.warn('[MonthlyBudgetController] Error looking up email for share:', share.id, error);
                }
            }
            return { ...share, displayEmail: email };
        }));
        
        console.log('[MonthlyBudgetController] Month shared with:', sharesWithEmails.map(s => s.displayEmail));
        
        // Create clickable list of users, each on a new line
        const userLinks = sharesWithEmails.map((share, index) => {
            return `<div class="shared-user-link" data-share-id="${share.id}" style="cursor: pointer; text-decoration: underline; color: var(--link-color, #0066cc); margin-top: 0.25rem;">${share.displayEmail}</div>`;
        });
        
        indicator.innerHTML = `<div style="display: flex; flex-direction: column;"><strong>Shared with:</strong>${userLinks.join('')}</div>`;
        
        // Store share data for popup (store in a way that's accessible)
        this._sharesData = sharesWithEmails;
        
        // Add click handlers to user names
        indicator.querySelectorAll('.shared-user-link').forEach(link => {
            // Remove any existing listeners by cloning
            const newLink = link.cloneNode(true);
            link.parentNode.replaceChild(newLink, link);
            
            newLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const shareId = parseInt(newLink.dataset.shareId, 10);
                const share = sharesWithEmails.find(s => s.id === shareId);
                if (share) {
                    console.log('[MonthlyBudgetController] User link clicked, showing details for share:', shareId);
                    this.showShareDetailsPopup(share);
                } else {
                    console.warn('[MonthlyBudgetController] Share not found for ID:', shareId);
                }
            });
        });
        
        indicator.style.display = 'block';
        indicator.title = `Click on a user's name to see share details`;
        
        console.log('[MonthlyBudgetController] Updated sharing indicator with clickable user list');
    },
    
    /**
     * Show share details popup for a specific share
     */
    async showShareDetailsPopup(share) {
        console.log('[MonthlyBudgetController] showShareDetailsPopup() called for share:', share.id);
        
        const modal = document.getElementById('share-details-modal');
        const modalTitle = document.getElementById('share-details-modal-title');
        const modalBody = document.getElementById('share-details-modal-body');
        
        if (!modal || !modalTitle || !modalBody) {
            console.error('[MonthlyBudgetController] Share details modal elements not found');
            return;
        }
        
        // Parse shared_months if it's a string
        let sharedMonths = share.shared_months;
        if (typeof sharedMonths === 'string') {
            try {
                sharedMonths = JSON.parse(sharedMonths);
            } catch (e) {
                console.warn('[MonthlyBudgetController] Error parsing shared_months:', e);
                sharedMonths = [];
            }
        }
        
        // Check if share_all_data is set
        const shareAllData = share.share_all_data === true || share.share_all_data === 'true';
        
        // Format months list
        let monthsList = 'None';
        if (shareAllData) {
            monthsList = 'All months';
        } else if (sharedMonths && sharedMonths.length > 0) {
            const monthStrings = sharedMonths.map(monthEntry => {
                if (monthEntry.type === 'single') {
                    const monthName = window.DataManager ? window.DataManager.getMonthName(monthEntry.month) : `Month ${monthEntry.month}`;
                    return `${monthName} ${monthEntry.year}`;
                } else if (monthEntry.type === 'range') {
                    const startMonthName = window.DataManager ? window.DataManager.getMonthName(monthEntry.startMonth) : `Month ${monthEntry.startMonth}`;
                    const endMonthName = window.DataManager ? window.DataManager.getMonthName(monthEntry.endMonth) : `Month ${monthEntry.endMonth}`;
                    return `${startMonthName} ${monthEntry.startYear} - ${endMonthName} ${monthEntry.endYear}`;
                }
                return '';
            }).filter(s => s);
            monthsList = monthStrings.length > 0 ? monthStrings.join(', ') : 'None';
        }
        
        modalTitle.textContent = `Share Details: ${share.displayEmail}`;
        
        modalBody.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: var(--spacing-md);">
                <div>
                    <strong>Shared With:</strong> ${share.displayEmail}
                </div>
                <div>
                    <strong>Access Level:</strong> ${share.access_level.replace('_', '/')}
                </div>
                ${shareAllData ? '<div><strong>Share All Data:</strong> Yes</div>' : ''}
                <div>
                    <strong>Months:</strong> ${shareAllData || (share.shared_months && sharedMonths.length > 0) ? 'Yes' : 'No'}<br>
                    ${shareAllData || (share.shared_months && sharedMonths.length > 0) ? `<span style="font-size: 0.9em; color: var(--text-color-secondary); margin-top: 0.25rem; display: block;">${monthsList}</span>` : ''}
                </div>
                <div>
                    <strong>Pots:</strong> ${shareAllData || share.shared_pots ? 'Yes' : 'No'}
                </div>
                <div>
                    <strong>Settings:</strong> ${shareAllData || share.shared_settings ? 'Yes' : 'No'}
                </div>
                <div style="margin-top: var(--spacing-md);">
                    <button class="btn btn-action" id="edit-share-from-details" data-share-id="${share.id}">Edit Share</button>
                    <button class="btn btn-danger" id="delete-share-from-details" data-share-id="${share.id}" style="margin-left: var(--spacing-sm);">Delete Share</button>
                </div>
            </div>
        `;
        
        // Setup event listeners
        const editBtn = document.getElementById('edit-share-from-details');
        const deleteBtn = document.getElementById('delete-share-from-details');
        const closeBtn = document.getElementById('close-share-details-modal');
        
        if (editBtn) {
            editBtn.addEventListener('click', async () => {
                console.log('[MonthlyBudgetController] Edit share clicked:', share.id);
                this.hideShareDetailsPopup();
                await this.editShareInModal(share);
            });
        }
        
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to delete this share?')) {
                    await this.handleDeleteShareFromModal(share.id);
                    this.hideShareDetailsPopup();
                }
            });
        }
        
        if (closeBtn) {
            closeBtn.onclick = () => this.hideShareDetailsPopup();
        }
        
        // Close on overlay click
        const overlay = modal.querySelector('.help-modal-overlay');
        if (overlay) {
            overlay.onclick = () => this.hideShareDetailsPopup();
        }
        
        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                this.hideShareDetailsPopup();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
        
        // Show modal
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        
        console.log('[MonthlyBudgetController] Share details popup displayed');
    },
    
    /**
     * Hide share details popup
     */
    hideShareDetailsPopup() {
        console.log('[MonthlyBudgetController] hideShareDetailsPopup() called');
        
        const modal = document.getElementById('share-details-modal');
        if (modal) {
            modal.style.display = 'none';
            modal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        }
    },
    
    /**
     * Update pots section with sharing indicator
     */
    async updatePotsIndicators(shares) {
        console.log('[MonthlyBudgetController] updatePotsIndicators() called with', shares.length, 'shares');
        
        if (shares.length === 0) {
            // Remove indicator if exists
            const existingIndicator = document.getElementById('pots-sharing-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
                console.log('[MonthlyBudgetController] Removed pots sharing indicator');
            }
            return;
        }
        
        // Look up emails
        const emails = await Promise.all(shares.map(async (share) => {
            if (window.DatabaseService) {
                try {
                    const emailResult = await window.DatabaseService.getUserEmailById(share.shared_with_user_id);
                    if (emailResult.success && emailResult.email) {
                        return emailResult.email;
                    }
                } catch (error) {
                    console.warn('[MonthlyBudgetController] Error looking up email for share:', share.id, error);
                }
            }
            return share.shared_with_user_id;
        }));
        
        console.log('[MonthlyBudgetController] Pots shared with emails:', emails);
        
        // Find or create indicator - pots might be in monthly budget or separate page
        let indicator = document.getElementById('pots-sharing-indicator');
        if (!indicator) {
            // Try to find pots section in monthly budget
            const potsTable = document.getElementById('pots-tbody');
            if (potsTable) {
                const potsSection = potsTable.closest('section');
                if (potsSection) {
                    const title = potsSection.querySelector('h2');
                    if (title) {
                        indicator = document.createElement('span');
                        indicator.id = 'pots-sharing-indicator';
                        indicator.style.marginLeft = '0.5rem';
                        indicator.style.fontSize = '0.9em';
                        indicator.style.color = 'var(--text-color-secondary)';
                        title.appendChild(indicator);
                        console.log('[MonthlyBudgetController] Created pots sharing indicator in monthly budget');
                    }
                }
            } else {
                // Try pots page
                const potsPageTitle = document.querySelector('.pots-list-section h2');
                if (potsPageTitle) {
                    indicator = document.createElement('span');
                    indicator.id = 'pots-sharing-indicator';
                    indicator.style.marginLeft = '0.5rem';
                    indicator.style.fontSize = '0.9em';
                    indicator.style.color = 'var(--text-color-secondary)';
                    potsPageTitle.appendChild(indicator);
                    console.log('[MonthlyBudgetController] Created pots sharing indicator in pots page');
                }
            }
        }
        
        if (indicator) {
            const shareText = shares.length === 1 
                ? `🔗 Shared with ${emails[0]}`
                : `🔗 Shared with ${shares.length} users`;
            indicator.textContent = shareText;
            indicator.title = `Shared with: ${emails.join(', ')}`;
            console.log('[MonthlyBudgetController] Updated pots sharing indicator:', shareText);
        } else {
            console.log('[MonthlyBudgetController] Could not find or create pots section for indicator');
        }
    },

    /**
     * Get variable cost categories (excluding transport which is in fixed costs)
     */
    getVariableCostCategories() {
        if (!this.currentMonthData) return [];
        // Read directly from DOM to preserve the order of rows
        const variableCostRows = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)'));
        const categories = [];
        const seenCategories = new Set();
        
        variableCostRows.forEach(row => {
            const category = (row.querySelector('.variable-cost-category')?.value || '').trim();
            if (category) {
                // Only add if we haven't seen this category yet (preserve first occurrence order)
                if (!seenCategories.has(category)) {
                    seenCategories.add(category);
                    categories.push(category);
                }
            }
        });
        
        return categories;
    },

    /**
     * Rebuild the working section table structure based on variable costs
     */
    rebuildWorkingSectionTable() {
        const thead = document.getElementById('weekly-breakdown-thead');
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!thead || !tbody) return;
        
        // Refresh variable costs from DOM before getting categories to ensure we have the latest data
        if (this.currentMonthData) {
            const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)')).map(row => ({
                category: row.querySelector('.variable-cost-category')?.value || '',
                estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
                actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
                comments: row.querySelector('.variable-cost-comments')?.value || ''
            }));
            this.currentMonthData.variableCosts = variableCosts;
        }
        
        const categories = this.getVariableCostCategories();
        const headerRow = thead.querySelector('tr');
        if (!headerRow) return;
        
        // Build header: Date, Payments Due, [Variable Cost Categories], Estimate, Actual, Delete
        const existingHeaders = headerRow.innerHTML;
        let newHeaderHTML = '<th>Date</th><th>Payments Due</th>';
        
        // Add variable cost category columns
        categories.forEach(category => {
            newHeaderHTML += `<th>${category}</th>`;
        });
        
        newHeaderHTML += '<th>Estimate</th><th>Actual</th><th class="delete-column-header"></th>';
        headerRow.innerHTML = newHeaderHTML;
        
        // Update existing data rows to include all variable cost columns
        const dataRows = tbody.querySelectorAll('tr:not(.total-row)');
        dataRows.forEach(row => {
            // Get existing data from the row
            const dateInput = row.querySelector('.weekly-date-range');
            const paymentsTextarea = row.querySelector('.weekly-payments-due');
            const estimateInput = row.querySelector('.weekly-estimate');
            const actualInput = row.querySelector('.weekly-actual');
            const deleteBtn = row.querySelector('.delete-row-x');
            
            // Get existing variable cost values
            const existingVariableCosts = {};
            categories.forEach(category => {
                const categoryId = this.sanitizeCategoryId(category);
                const categoryClass = 'weekly-variable-' + categoryId;
                const existingTextarea = row.querySelector('.' + categoryClass);
                if (existingTextarea) {
                    existingVariableCosts[category] = existingTextarea.value;
                }
            });
            
            // Rebuild row HTML
            let rowHTML = `
                <td><input type="text" class="weekly-date-range" value="${dateInput?.value || ''}" placeholder="e.g., 30-9 or 1-7"></td>
                <td><textarea class="weekly-payments-due" placeholder="Payments Due" rows="4">${paymentsTextarea?.value || ''}</textarea></td>
            `;
            
            // Add textarea for each variable cost category
            categories.forEach((category, index) => {
                const categoryId = this.sanitizeCategoryId(category);
                const categoryClass = 'weekly-variable-' + categoryId;
                const existingValue = existingVariableCosts[category] || '';
                rowHTML += `<td><textarea class="${categoryClass}" placeholder="${category} (with calculations)" rows="4">${existingValue}</textarea></td>`;
            });
            
            rowHTML += `
                <td><input type="number" class="weekly-estimate" value="${estimateInput?.value || ''}" step="0.01" min="0" placeholder="0.00"></td>
                <td><input type="number" class="weekly-actual" value="${actualInput?.value || ''}" step="0.01" min="0" placeholder="0.00"></td>
                <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
            `;
            
            // Replace row content
            row.innerHTML = rowHTML;
            
            // Reattach event listeners
            row.querySelectorAll('input, textarea').forEach(input => {
                input.addEventListener('input', () => {
                    const isVariableCost = Array.from(input.classList).some(cls => cls.startsWith('weekly-variable-'));
                    
                    if (input.classList.contains('weekly-payments-due') || isVariableCost) {
                        this.autoSizeTextarea(input);
                        if (isVariableCost) {
                            requestAnimationFrame(() => {
                                this.updateVariableCostTotal(input);
                                this.updateCalculations();
                            });
                            return;
                        }
                        setTimeout(() => this.updateCalculations(), 0);
                    } else {
                        this.updateCalculations();
                    }
                });
            });
            
            // Make estimate and actual read-only
            const newEstimateInput = row.querySelector('.weekly-estimate');
            const newActualInput = row.querySelector('.weekly-actual');
            if (newEstimateInput) {
                newEstimateInput.readOnly = true;
                newEstimateInput.style.backgroundColor = 'var(--bg-secondary)';
            }
            if (newActualInput) {
                newActualInput.readOnly = true;
                newActualInput.style.backgroundColor = 'var(--bg-secondary)';
            }
            
            // Auto-size textareas
            const textareas = row.querySelectorAll('textarea');
            textareas.forEach(textarea => {
                this.autoSizeTextarea(textarea);
            });
            
            // Reattach delete handler
            const newDeleteBtn = row.querySelector('.delete-row-x');
            if (newDeleteBtn) {
                newDeleteBtn.addEventListener('click', () => {
                    row.remove();
                    this.updateCalculations();
                });
            }
        });
        
        // Update total row
        const totalRow = tbody.querySelector('.total-row');
        if (totalRow) {
            let totalRowHTML = '<td><strong>TOTALS</strong></td><td id="weekly-breakdown-total-payments"></td>';
            
            // Add total cells for each variable cost category
            categories.forEach(category => {
                const categoryId = 'weekly-breakdown-total-' + this.sanitizeCategoryId(category);
                totalRowHTML += `<td id="${categoryId}"></td>`;
            });
            
            totalRowHTML += `<td id="weekly-breakdown-total-estimate"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td><td id="weekly-breakdown-total-actual"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td><td></td>`;
            totalRow.innerHTML = totalRowHTML;
        }
        
        // Recalculate totals after rebuilding
        this.updateCalculations();
    },

    /**
     * Sanitize category name for use as ID
     */
    sanitizeCategoryId(category) {
        return category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    },

    /**
     * Load weekly breakdown
     */
    loadWeeklyBreakdown(weeklyBreakdown, forceRepopulate = false) {
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (!this.currentMonthData) return;
        
        const year = this.currentMonthData.year;
        const month = this.currentMonthData.month;
        const weeks = this.calculateWeeksInMonth(year, month);
        
        // If weekly breakdown exists and has data, use it but ensure we have the right number of weeks
        if (weeklyBreakdown && weeklyBreakdown.length > 0) {
            // Create a map of existing weeks by date range
            const existingWeeksMap = new Map();
            weeklyBreakdown.forEach(week => {
                const dateRange = week.dateRange || week.weekRange || '';
                existingWeeksMap.set(dateRange, week);
            });
            
            // Generate weeks, preserving existing data where possible
            weeks.forEach((week, index) => {
                const dateRange = this.formatWeekDateRange(week);
                let existingWeek = existingWeeksMap.get(dateRange);
                
                // If no match by date range, try matching by index (fallback)
                if (!existingWeek && index < weeklyBreakdown.length) {
                    existingWeek = weeklyBreakdown[index];
                }
                
                if (existingWeek) {
                    this.addWeeklyBreakdownRow(existingWeek);
        } else {
                    // Create new week with date range
                    this.addWeeklyBreakdownRow({
                        dateRange: dateRange,
                        weekRange: dateRange
                    });
                }
            });
        } else {
            // Auto-generate weeks based on calendar
            weeks.forEach(week => {
                const dateRange = this.formatWeekDateRange(week);
                this.addWeeklyBreakdownRow({
                    dateRange: dateRange,
                    weekRange: dateRange
                });
            });
        }

        // Always add the total row at the end
        this.addWeeklyBreakdownTotalRow();
        
        // Check if we have loaded data in weeklyBreakdown - if so, skip populateWorkingSectionFromCosts
        // to preserve the loaded calculations
        const hasLoadedData = weeklyBreakdown && weeklyBreakdown.length > 0 && weeklyBreakdown.some(week => {
            return Object.keys(week).some(key => {
                if (key.startsWith('weekly-variable-') || key === 'Food' || key === 'Travel' || key === 'Activities') {
                    const value = week[key];
                    return typeof value === 'string' && value.includes('Estimate:') && value.trim().length > 0;
                }
                return false;
            });
        });
        
        // Check if textareas already have data (from addWeeklyBreakdownRow)
        const textareasHaveData = Array.from(document.querySelectorAll('#weekly-breakdown-tbody textarea[class*="weekly-variable-"]')).some(textarea => {
            const value = textarea.value || '';
            return value.includes('Estimate:') && value.includes('=') && value.trim().length > 10;
        });
        
        // Only populate if we don't have loaded data AND textareas don't have data, or if forceRepopulate is true
        // This preserves loaded calculations from saved/example data
        if ((!hasLoadedData && !textareasHaveData) || forceRepopulate) {
            // Populate fixed costs and variable costs into working section
            this.populateWorkingSectionFromCosts(forceRepopulate);
        }
        
        // Auto-size all textareas after loading
        setTimeout(() => {
            const textareas = document.querySelectorAll('#weekly-breakdown-tbody textarea');
            textareas.forEach(textarea => {
                this.autoSizeTextarea(textarea);
            });
        }, 100);
    },

    /**
     * Add weekly breakdown row
     */
    addWeeklyBreakdownRow(weekData = null) {
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!tbody) return;

        const categories = this.getVariableCostCategories();
        let rowHTML = `
            <td><input type="text" class="weekly-date-range" value="${weekData?.dateRange || weekData?.weekRange || ''}" placeholder="e.g., 30-9 or 1-7"></td>
            <td><textarea class="weekly-payments-due" placeholder="Payments Due" rows="4">${weekData?.paymentsDue || ''}</textarea></td>
        `;
        
        // Add textarea for each variable cost category
        categories.forEach(category => {
            const categoryId = this.sanitizeCategoryId(category);
            const categoryClass = 'weekly-variable-' + categoryId;
            
            let existingValue = '';
            if (weekData) {
                // Try to find matching data by checking all possible key variations
                // Priority 1: Check for full textarea content in categoryClass (most complete)
                // This is the primary key used when saving data
                if (weekData[categoryClass] && typeof weekData[categoryClass] === 'string' && weekData[categoryClass].trim()) {
                    existingValue = weekData[categoryClass];
                }
                // Priority 2: Check for full textarea content in category name (case-sensitive)
                else if (weekData[category] && typeof weekData[category] === 'string' && weekData[category].trim()) {
                    existingValue = weekData[category];
                }
                // Priority 3: Check for lowercase category name
                else if (weekData[category.toLowerCase()] && typeof weekData[category.toLowerCase()] === 'string' && weekData[category.toLowerCase()].trim()) {
                    existingValue = weekData[category.toLowerCase()];
                }
                // Priority 4: Search through all keys in weekData to find a match
                // This handles cases where the key might be slightly different (e.g., "groceries" vs "Groceries")
                else {
                    const categoryLower = category.toLowerCase();
                    const categoryIdLower = categoryId.toLowerCase();
                    for (const key in weekData) {
                        if (typeof weekData[key] === 'string' && weekData[key].trim()) {
                            const keyLower = key.toLowerCase();
                            // Check if key matches category (with or without prefix)
                            if (keyLower === categoryLower || 
                                keyLower === categoryIdLower ||
                                keyLower === 'weekly-variable-' + categoryIdLower ||
                                keyLower.replace('weekly-variable-', '') === categoryIdLower ||
                                keyLower.replace('weekly-variable-', '') === categoryLower.replace(/[^a-z0-9]+/g, '-')) {
                                existingValue = weekData[key];
                                break;
                            }
                        }
                    }
                }
                
                // If we found a value, check if it needs format conversion
                if (existingValue) {
                    // Check if it's already in the new format (has Estimate: and newline with =)
                    const hasNewFormat = existingValue.includes('Estimate:') && existingValue.includes('\n') && existingValue.includes('=');
                    
                    if (!hasNewFormat) {
                        // Old format detected - parse it and preserve calculation string
                        const oldValue = existingValue;
                        const equalsIndex = oldValue.indexOf('=');
                        if (equalsIndex >= 0) {
                            // Extract calculation part (before =) and result part (after =)
                            const beforeEquals = oldValue.substring(0, equalsIndex).trim();
                            const afterEquals = oldValue.substring(equalsIndex + 1).trim();
                            
                            // Calculate estimate by summing all numbers before = (handles "90-55-20-40-15")
                            const numbers = beforeEquals.match(/[\d\.]+/g) || [];
                            const estimate = numbers.reduce((sum, num) => sum + parseFloat(num), 0);
                            
                            // Build new format - preserve the calculation string in the equals line
                            // If afterEquals has content, preserve it; otherwise use beforeEquals as the calculation
                            if (afterEquals) {
                                // Old format like "90-55-20-40-15= 130" - preserve the calculation before =
                                existingValue = `Estimate: ${Formatters.formatCurrency(estimate)}\n= ${beforeEquals}`;
                            } else {
                                // Format like "90-55-20-40-15=" - preserve the calculation
                                existingValue = `Estimate: ${Formatters.formatCurrency(estimate)}\n= ${beforeEquals}`;
                            }
                        } else {
                            // No = found, treat entire value as estimate
                            const estimate = Formatters.parseNumber(oldValue);
                            existingValue = `Estimate: ${Formatters.formatCurrency(estimate)}\n=`;
                        }
                    }
                }
            }
            
            rowHTML += `<td><textarea class="${categoryClass}" placeholder="${category} (with calculations)" rows="4">${existingValue}</textarea></td>`;
        });
        
        rowHTML += `
            <td><input type="number" class="weekly-estimate" value="${weekData?.estimate || weekData?.weeklyEstimate || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="weekly-actual" value="${weekData?.actual || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const row = document.createElement('tr');
        row.innerHTML = rowHTML;

        row.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', () => {
                // Check if this is a variable cost textarea (class starts with 'weekly-variable-')
                const isVariableCost = Array.from(input.classList).some(cls => cls.startsWith('weekly-variable-'));
                
                // Auto-update estimate and actual when textareas change
                if (input.classList.contains('weekly-payments-due') || isVariableCost) {
                    this.autoSizeTextarea(input);
                    // Update total line for variable cost textareas (must happen before updateCalculations)
                    if (isVariableCost) {
                        // Use requestAnimationFrame to ensure DOM is ready
                        requestAnimationFrame(() => {
                            this.updateVariableCostTotal(input);
                            // Then update calculations
                            this.updateCalculations();
                        });
                        return; // Don't call updateCalculations again below
                    }
                    // Trigger calculation update to recalculate estimate/actual
                    setTimeout(() => this.updateCalculations(), 0);
                } else {
                    this.updateCalculations();
                }
            });
        });
        
        // Make estimate and actual read-only (auto-calculated)
        const estimateInput = row.querySelector('.weekly-estimate');
        const actualInput = row.querySelector('.weekly-actual');
        if (estimateInput) {
            estimateInput.readOnly = true;
            estimateInput.style.backgroundColor = 'var(--bg-secondary)';
        }
        if (actualInput) {
            actualInput.readOnly = true;
            actualInput.style.backgroundColor = 'var(--bg-secondary)';
        }
        
        // Auto-size all textareas on load
        const textareas = row.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            this.autoSizeTextarea(textarea);
        });

        // Add delete handler
        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                row.remove();
                this.updateCalculations();
            });
        }

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
    },

    /**
     * Populate working section from fixed costs and variable costs
     * @param {boolean} forceUpdate - If true, force update even if textareas have data
     */
    populateWorkingSectionFromCosts(forceUpdate = false) {
        if (!this.currentMonthData) return;
        
        // Refresh variable costs from DOM to ensure we have the latest data
        const variableCostsFromDOM = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)')).map(row => ({
            category: row.querySelector('.variable-cost-category')?.value || '',
            estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
            actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
            comments: row.querySelector('.variable-cost-comments')?.value || ''
        }));
        this.currentMonthData.variableCosts = variableCostsFromDOM;
        
        // Refresh unplanned expenses from DOM to ensure we have the latest data
        const unplannedExpensesFromDOM = Array.from(document.querySelectorAll('#unplanned-expenses-tbody tr:not(.total-row)')).map(row => ({
            name: row.querySelector('.unplanned-name')?.value || '',
            amount: Formatters.parseNumber(row.querySelector('.unplanned-amount')?.value),
            date: row.querySelector('.unplanned-date')?.value || '',
            card: row.querySelector('.unplanned-card')?.value || '',
            paid: row.querySelector('.unplanned-paid')?.checked || false,
            comments: row.querySelector('.unplanned-comments')?.value || ''
        }));
        this.currentMonthData.unplannedExpenses = unplannedExpensesFromDOM;
        
        const year = this.currentMonthData.year;
        const month = this.currentMonthData.month;
        const weeks = this.calculateWeeksInMonth(year, month);
        const fixedCosts = this.currentMonthData.fixedCosts || [];
        const variableCosts = this.currentMonthData.variableCosts || [];
        const unplannedExpenses = this.currentMonthData.unplannedExpenses || [];
        
        // Get all weekly rows (excluding total row)
        const weeklyRows = Array.from(document.querySelectorAll('#weekly-breakdown-tbody tr:not(.total-row)'));
        
        // Distribute variable costs across weeks (same for all weeks)
        const numWeeks = weeks.length;
        const weeklyVariableCosts = {};
        // Get categories AFTER updating variableCosts to ensure we have the latest
        const categories = this.getVariableCostCategories();
        
        // Verify that all categories have corresponding columns in the table
        // If not, the table structure might be out of sync
        if (weeklyRows.length > 0) {
            const firstRow = weeklyRows[0];
            const existingVariableTextareas = firstRow.querySelectorAll('textarea[class*="weekly-variable-"]');
            const existingCategoryIds = Array.from(existingVariableTextareas).map(textarea => {
                const classList = Array.from(textarea.classList);
                const variableClass = classList.find(cls => cls.startsWith('weekly-variable-'));
                return variableClass ? variableClass.replace('weekly-variable-', '') : null;
            }).filter(id => id !== null);
            
            const expectedCategoryIds = categories.map(cat => this.sanitizeCategoryId(cat));
            const missingCategories = expectedCategoryIds.filter(id => !existingCategoryIds.includes(id));
            
            // If categories are missing from the table, rebuild it
            if (missingCategories.length > 0) {
                this.rebuildWorkingSectionTable();
                // Reload weekly breakdown to ensure columns are correct
                if (this.currentMonthData.weeklyBreakdown) {
                    this.loadWeeklyBreakdown(this.currentMonthData.weeklyBreakdown, true);
                }
                // Re-fetch weekly rows after rebuild
                const newWeeklyRows = Array.from(document.querySelectorAll('#weekly-breakdown-tbody tr:not(.total-row)'));
                if (newWeeklyRows.length > 0) {
                    // Use the newly rebuilt rows
                    weeklyRows.splice(0, weeklyRows.length, ...newWeeklyRows);
                }
            }
        }
        
        // Build weeklyVariableCosts from variableCosts, preserving order and ensuring all categories are included
        variableCosts.forEach(cost => {
            const category = (cost.category || '').trim();
            if (!category) return;
            
            const categoryLower = category.toLowerCase();
            // Skip transport/travel as it's in fixed costs
            if (categoryLower.includes('transport') || categoryLower.includes('travel')) {
                return;
            }
            
            const monthlyBudget = Formatters.parseNumber(cost.estimatedAmount || 0);
            // Include even if monthlyBudget is 0, so the category column exists
            const weeklyBudget = monthlyBudget / numWeeks;
            
            if (!weeklyVariableCosts[category]) {
                weeklyVariableCosts[category] = [];
            }
            weeklyVariableCosts[category].push({
                category: category,
                weeklyBudget: weeklyBudget,
                monthlyBudget: monthlyBudget,
                calculation: weeklyBudget.toFixed(2)
            });
        });
        
        // Ensure all categories from the categories array have entries in weeklyVariableCosts
        // This handles cases where a category exists but has no estimated amount yet
        categories.forEach(category => {
            if (!weeklyVariableCosts[category]) {
                weeklyVariableCosts[category] = [];
            }
        });
        
        // Process each week
        weeklyRows.forEach((row, weekIndex) => {
            if (weekIndex >= weeks.length) return;
            
            const paymentsDueTextarea = row.querySelector('.weekly-payments-due');
            
            // Collect fixed costs and unplanned expenses for this week
            const week = weeks[weekIndex];
            const weekFixedCosts = [];
            
            fixedCosts.forEach(cost => {
                if (!cost.date) return;
                
                // Parse date - could be in various formats (DD, DD-MM, DD/MM, etc.)
                const dateMatch = cost.date.toString().match(/(\d+)/);
                if (dateMatch) {
                    const day = parseInt(dateMatch[1], 10);
                    if (day >= week.startDate && day <= week.endDate) {
                        const amount = Formatters.parseNumber(cost.estimatedAmount || cost.actualAmount || 0);
                        const category = cost.category || 'Fixed Cost';
                        weekFixedCosts.push({
                            category: category,
                            amount: amount,
                            date: day,
                            card: cost.card || '',
                            paid: cost.paid || false
                        });
                    }
                }
            });
            
            // Add unplanned expenses for this week to payments due field (for visibility)
            // They will be excluded from estimate calculation but included in actual when paid
            unplannedExpenses.forEach(expense => {
                if (!expense.date) return;
                
                // Parse date - could be in various formats (DD, DD-MM, DD/MM, etc.)
                const dateMatch = expense.date.toString().match(/(\d+)/);
                if (dateMatch) {
                    const day = parseInt(dateMatch[1], 10);
                    if (day >= week.startDate && day <= week.endDate) {
                        const amount = Formatters.parseNumber(expense.amount || 0);
                        const name = expense.name || 'Unplanned Expense';
                        weekFixedCosts.push({
                            category: name,
                            amount: amount,
                            date: day,
                            card: expense.card || '',
                            paid: expense.paid || false,
                            isUnplanned: true // Mark as unplanned expense
                        });
                    }
                }
            });
            
            // Build payments due text (only if field is empty or contains auto-generated content)
            const currentPayments = paymentsDueTextarea?.value || '';
            const hasAutoGeneratedPayments = currentPayments.includes('Auto-generated');
            
            // Check if payments are all on one line and need reformatting (regardless of forceUpdate)
            // This handles cases where saved data has all payments concatenated on one line
            const lines = currentPayments.split('\n').filter(line => line.trim());
            // If we have multiple fixed costs/unplanned expenses for this week but only one line of text, reformat it
            // This ensures proper list format even if saved data was on one line
            const needsReformatting = lines.length === 1 && weekFixedCosts.length > 1 && currentPayments.trim().length > 0;

            // If there are no fixed costs or unplanned expenses for this week, clear the payments due field
            if (weekFixedCosts.length === 0) {
                paymentsDueTextarea.value = '';
                this.autoSizeTextarea(paymentsDueTextarea);
                this.updateCalculations();
            } else if (needsReformatting && weekFixedCosts.length > 0) {
                // Reformat single-line payments into proper list format
                const reformattedPayments = weekFixedCosts.map(cost => {
                    const paidStatus = cost.paid ? ' ✓' : '';
                    const cardInfo = cost.card ? ` (${cost.card})` : '';
                    return `${cost.category}: ${Formatters.formatCurrency(cost.amount)}${cardInfo}${paidStatus}`;
                });
                paymentsDueTextarea.value = reformattedPayments.join('\n');
                this.autoSizeTextarea(paymentsDueTextarea);
                this.updateCalculations();
            } else if (!currentPayments.trim() || hasAutoGeneratedPayments) {
                // Only auto-populate if field is empty or has auto-generated content
                const paymentsText = weekFixedCosts.map(cost => {
                    const paidStatus = cost.paid ? ' ✓' : '';
                    const cardInfo = cost.card ? ` (${cost.card})` : '';
                    // Format: Category: £Amount (Card) ✓
                    // Amount is formatted with currency symbol for easy parsing
                    return `${cost.category}: ${Formatters.formatCurrency(cost.amount)}${cardInfo}${paidStatus}`;
                }).join('\n');

                if (hasAutoGeneratedPayments) {
                    // Replace existing auto-generated content, remove any "---" separators
                    const beforeAuto = currentPayments.split('Auto-generated')[0].trim();
                    const cleanedBeforeAuto = beforeAuto.replace(/---+/g, '').trim();
                    paymentsDueTextarea.value = cleanedBeforeAuto ? cleanedBeforeAuto + '\n' + paymentsText : paymentsText;
                } else {
                    paymentsDueTextarea.value = paymentsText;
                }

                // Auto-size the textarea
                this.autoSizeTextarea(paymentsDueTextarea);

                // Update calculations to show totals
                this.updateCalculations();
            } else if (forceUpdate && currentPayments.trim()) {
                // When forceUpdate is true and field has content, rebuild from weekFixedCosts
                // This ensures deleted costs are removed and all costs are properly formatted
                if (weekFixedCosts.length === 0) {
                    // No fixed costs for this week, clear the field
                    paymentsDueTextarea.value = '';
                    this.autoSizeTextarea(paymentsDueTextarea);
                    this.updateCalculations();
                } else {
                    // Rebuild the payments text from weekFixedCosts to ensure accuracy
                    // This removes deleted costs and updates all costs with current data
                    const reformattedPayments = weekFixedCosts.map(cost => {
                        const paidStatus = cost.paid ? ' ✓' : '';
                        const cardInfo = cost.card ? ` (${cost.card})` : '';
                        return `${cost.category}: ${Formatters.formatCurrency(cost.amount)}${cardInfo}${paidStatus}`;
                    });
                    paymentsDueTextarea.value = reformattedPayments.join('\n');
                    this.autoSizeTextarea(paymentsDueTextarea);
                    this.updateCalculations();
                }
            }
            
            // Populate each variable cost category column
            // Get all variable cost textareas in the row to ensure we match correctly
            const allVariableTextareas = row.querySelectorAll('textarea[class*="weekly-variable-"]');
            const textareaMap = {};
            allVariableTextareas.forEach(textarea => {
                // Extract category from class name by removing 'weekly-variable-' prefix
                const classList = Array.from(textarea.classList);
                const variableClass = classList.find(cls => cls.startsWith('weekly-variable-'));
                if (variableClass) {
                    const categoryId = variableClass.replace('weekly-variable-', '');
                    textareaMap[categoryId] = textarea;
                }
            });
            
            categories.forEach(category => {
                const categoryId = this.sanitizeCategoryId(category);
                const categoryClass = 'weekly-variable-' + categoryId;
                // Try to find textarea by class first, then by map
                let categoryTextarea = row.querySelector('.' + categoryClass);
                if (!categoryTextarea && textareaMap[categoryId]) {
                    categoryTextarea = textareaMap[categoryId];
                }
                
                if (!categoryTextarea) {
                    // If textarea not found, it might not exist yet - skip this category
                    return;
                }
                
                const currentValue = categoryTextarea.value || '';
                const hasAutoGenerated = currentValue.includes('Auto-generated');
                const hasEstimate = currentValue.includes('Estimate:');
                
                // Check if this textarea already has loaded data from weeklyBreakdown
                // If it has Estimate: line, preserve it completely - this is loaded data
                // This prevents overwriting data that was just loaded from saved/example data
                if (hasEstimate) {
                    // Data was loaded - preserve it completely, don't modify
                    this.autoSizeTextarea(categoryTextarea);
                    return;
                }
                
                // Check if we have variable costs data for this category
                // A category exists in weeklyVariableCosts if it's in the categories array
                const hasVariableCostsData = weeklyVariableCosts[category] !== undefined;
                const hasVariableCostsAmount = weeklyVariableCosts[category] && weeklyVariableCosts[category].length > 0;
                
                // Calculate total estimate for this category (sum of all variable costs in this category)
                const totalEstimate = hasVariableCostsAmount 
                    ? weeklyVariableCosts[category].reduce((sum, cost) => sum + cost.weeklyBudget, 0)
                    : 0;
                const baseEstimate = totalEstimate.toFixed(2);
                
                // Parse existing content to extract actual spending (the = line)
                const lines = currentValue.split('\n');
                const existingEqualsLine = lines.find(line => {
                    const trimmed = line.trim();
                    return trimmed.startsWith('=') && trimmed.length > 1;
                });
                const hasActualSpending = existingEqualsLine && existingEqualsLine.trim().length > 1;
                
                // Only update if:
                // 1. Field is completely empty, OR
                // 2. Has auto-generated content, OR
                // 3. Has estimate but no actual spending (empty = line or no = line)
                // DO NOT update if field has actual spending data (preserve user input)
                if (hasVariableCostsData) {
                    if (!currentValue.trim() || hasAutoGenerated || (hasEstimate && !hasActualSpending)) {
                        // Build new content: Estimate line with formatted amount
                        const estimateLine = `Estimate: ${Formatters.formatCurrency(baseEstimate)}`;
                        let newContent = estimateLine;
                        
                        // Preserve existing actual spending if it exists
                        if (hasActualSpending) {
                            newContent += '\n' + existingEqualsLine.trim();
                        } else {
                            // Check if there's old format data (like "90-55-20-40-15= 130")
                            // Extract just the part after = if it exists
                            const oldFormatMatch = currentValue.match(/=?\s*([\d\s\+\-\.]+)/);
                            if (oldFormatMatch && oldFormatMatch[1]) {
                                // Found old format, extract the actual spending part
                                newContent += '\n= ' + oldFormatMatch[1].trim();
                            } else {
                                // Empty "=" line for user to fill in actual spending
                                newContent += '\n=';
                            }
                        }
                        
                        categoryTextarea.value = newContent;
                    } else {
                        // Field has actual spending data - preserve it completely
                        // Only update the estimate line if it's missing or in old format
                        const firstLine = lines[0]?.trim() || '';
                        
                        if (!hasEstimate) {
                            // No estimate line - add it at the beginning, preserve all existing content
                            const estimateLine = `Estimate: ${Formatters.formatCurrency(baseEstimate)}`;
                            categoryTextarea.value = estimateLine + '\n' + currentValue;
                        } else if (firstLine.startsWith('Estimate:')) {
                            // Already has estimate line with actual spending - preserve everything as-is
                            // Don't modify anything, just ensure the textarea is properly sized
                        } else {
                            // Old format (just a number) - convert to new format but preserve equals line
                            const estimateLine = `Estimate: ${Formatters.formatCurrency(baseEstimate)}`;
                            const remainingLines = lines.slice(1);
                            categoryTextarea.value = estimateLine + '\n' + remainingLines.join('\n');
                        }
                    }
                    
                    // Auto-size the textarea
                    this.autoSizeTextarea(categoryTextarea);
                } else {
                    // No variable costs data for this category - ensure total line exists
                    const hasEquals = currentValue.includes('=');
                    if (!hasEquals || currentValue.trim()) {
                        this.updateVariableCostTotal(categoryTextarea);
                    }
                }
            });
        });
    },

    /**
     * Add weekly breakdown total row
     */
    addWeeklyBreakdownTotalRow() {
        const tbody = document.getElementById('weekly-breakdown-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        // Get dynamic categories to match the table structure
        const categories = this.getVariableCostCategories();
        let totalRowHTML = '<td><strong>TOTALS</strong></td><td id="weekly-breakdown-total-payments"></td>';
        
        // Add total cells for each variable cost category
        categories.forEach(category => {
            const categoryId = 'weekly-breakdown-total-' + this.sanitizeCategoryId(category);
            totalRowHTML += `<td id="${categoryId}"></td>`;
        });
        
        totalRowHTML += `<td id="weekly-breakdown-total-estimate"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td><td id="weekly-breakdown-total-actual"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td><td></td>`;

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = totalRowHTML;

        tbody.appendChild(totalRow);
    },

    /**
     * Load income sources (supports both old format and new array format)
     */
    loadIncomeSources(incomeData) {
        const tbody = document.getElementById('income-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        let incomeSources = [];

        if (Array.isArray(incomeData)) {
            incomeSources = incomeData;
        } else if (incomeData && typeof incomeData === 'object') {
            if (incomeData.nicholasIncome) {
                incomeSources.push({
                    source: 'Nicholas Income',
                    estimated: incomeData.nicholasIncome.estimated || 0,
                    actual: incomeData.nicholasIncome.actual || 0,
                    date: incomeData.nicholasIncome.date || '',
                    description: '',
                    comments: incomeData.nicholasIncome.comments || ''
                });
            }
            if (incomeData.laraIncome) {
                incomeSources.push({
                    source: 'Lara Income',
                    estimated: incomeData.laraIncome.estimated || 0,
                    actual: incomeData.laraIncome.actual || 0,
                    date: incomeData.laraIncome.date || '',
                    description: '',
                    comments: incomeData.laraIncome.comments || ''
                });
            }
            if (incomeData.otherIncome) {
                incomeSources.push({
                    source: 'Other Income',
                    estimated: incomeData.otherIncome.estimated || 0,
                    actual: incomeData.otherIncome.actual || 0,
                    date: '',
                    description: incomeData.otherIncome.description || '',
                    comments: incomeData.otherIncome.comments || ''
                });
            }
        }

        if (incomeSources.length === 0) {
            this.addIncomeRow();
        } else {
            incomeSources.forEach(income => this.addIncomeRow(income));
        }

        // Always add the total row at the end
        this.addIncomeTotalRow();
    },

    /**
     * Add income row
     */
    addIncomeRow(incomeData = null) {
        const tbody = document.getElementById('income-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="income-source" value="${incomeData?.source || ''}" placeholder="Revenue Source"></td>
            <td><input type="number" class="income-estimated" value="${incomeData?.estimated || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="income-actual" value="${incomeData?.actual || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="text" class="income-date" value="${incomeData?.date || ''}" placeholder="Date"></td>
            <td><input type="text" class="income-description" value="${incomeData?.description || ''}" placeholder="Description"></td>
            <td><input type="text" class="income-comments" value="${incomeData?.comments || ''}" placeholder="Comments"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                row.remove();
                this.updateCalculations();
                // Repopulate working section immediately when unplanned expense is deleted
                requestAnimationFrame(() => {
                    this.populateWorkingSectionFromCosts(true);
                });
            });
        }

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                this.updateCalculations();
                // Repopulate working section immediately when unplanned expense changes
                requestAnimationFrame(() => {
                    this.populateWorkingSectionFromCosts(true);
                });
            });
        });

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
        
        // Repopulate working section when income is added
        this.populateWorkingSectionFromCosts();
    },

    /**
     * Add income total row
     */
    addIncomeTotalRow() {
        const tbody = document.getElementById('income-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Income</strong></td>
            <td id="income-total-estimated"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td>
            <td id="income-total-actual"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Load fixed costs
     */
    loadFixedCosts(costs) {
        const tbody = document.getElementById('fixed-costs-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        costs.forEach(cost => this.addFixedCostRow(cost));
        this.addFixedCostsTotalRow();
    },

    /**
     * Add fixed cost row
     */
    addFixedCostRow(costData = null) {
        const tbody = document.getElementById('fixed-costs-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="fixed-cost-category" value="${costData?.category || ''}" placeholder="Expense Category"></td>
            <td><input type="number" class="fixed-cost-estimated" value="${costData?.estimatedAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="fixed-cost-actual" value="${costData?.actualAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="text" class="fixed-cost-date" value="${costData?.date || ''}" placeholder="Date"></td>
            <td><input type="text" class="fixed-cost-card" value="${costData?.card || ''}" placeholder="Card"></td>
            <td><input type="checkbox" class="fixed-cost-paid" ${costData?.paid ? 'checked' : ''}></td>
            <td><input type="text" class="fixed-cost-comments" value="${costData?.comments || ''}" placeholder="Comments"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                row.remove();
                // Update current month data immediately after DOM removal
                if (this.currentMonthData) {
                    const fixedCosts = Array.from(document.querySelectorAll('#fixed-costs-tbody tr:not(.total-row)')).map(row => ({
                        category: row.querySelector('.fixed-cost-category')?.value || '',
                        estimatedAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-estimated')?.value),
                        actualAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-actual')?.value),
                        date: row.querySelector('.fixed-cost-date')?.value || '',
                        card: row.querySelector('.fixed-cost-card')?.value || '',
                        paid: row.querySelector('.fixed-cost-paid')?.checked || false,
                        comments: row.querySelector('.fixed-cost-comments')?.value || ''
                    }));
                    this.currentMonthData.fixedCosts = fixedCosts;
                }
                this.updateCalculations();
                // Repopulate working section immediately when fixed cost is deleted (force update)
                requestAnimationFrame(() => {
                    this.populateWorkingSectionFromCosts(true);
                });
            });
        }

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                // Update current month data
                if (this.currentMonthData) {
                    const fixedCosts = Array.from(document.querySelectorAll('#fixed-costs-tbody tr:not(.total-row)')).map(row => ({
                        category: row.querySelector('.fixed-cost-category')?.value || '',
                        estimatedAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-estimated')?.value),
                        actualAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-actual')?.value),
                        date: row.querySelector('.fixed-cost-date')?.value || '',
                        card: row.querySelector('.fixed-cost-card')?.value || '',
                        paid: row.querySelector('.fixed-cost-paid')?.checked || false,
                        comments: row.querySelector('.fixed-cost-comments')?.value || ''
                    }));
                    this.currentMonthData.fixedCosts = fixedCosts;
                }
                this.updateCalculations();
                // Repopulate working section immediately when fixed cost changes (force update)
                requestAnimationFrame(() => {
                    this.populateWorkingSectionFromCosts(true);
                });
            });
            input.addEventListener('change', () => {
                // Update current month data
                if (this.currentMonthData) {
                    const fixedCosts = Array.from(document.querySelectorAll('#fixed-costs-tbody tr:not(.total-row)')).map(row => ({
                        category: row.querySelector('.fixed-cost-category')?.value || '',
                        estimatedAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-estimated')?.value),
                        actualAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-actual')?.value),
                        date: row.querySelector('.fixed-cost-date')?.value || '',
                        card: row.querySelector('.fixed-cost-card')?.value || '',
                        paid: row.querySelector('.fixed-cost-paid')?.checked || false,
                        comments: row.querySelector('.fixed-cost-comments')?.value || ''
                    }));
                    this.currentMonthData.fixedCosts = fixedCosts;
                }
                this.updateCalculations();
                // Repopulate working section immediately when fixed cost changes (force update)
                requestAnimationFrame(() => {
                    this.populateWorkingSectionFromCosts(true);
                });
            });
        });

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
        
        // Update current month data and repopulate working section when fixed cost is added
        if (this.currentMonthData) {
            const fixedCosts = Array.from(document.querySelectorAll('#fixed-costs-tbody tr:not(.total-row)')).map(row => ({
                category: row.querySelector('.fixed-cost-category')?.value || '',
                estimatedAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-estimated')?.value),
                actualAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-actual')?.value),
                date: row.querySelector('.fixed-cost-date')?.value || '',
                card: row.querySelector('.fixed-cost-card')?.value || '',
                paid: row.querySelector('.fixed-cost-paid')?.checked || false,
                comments: row.querySelector('.fixed-cost-comments')?.value || ''
            }));
            this.currentMonthData.fixedCosts = fixedCosts;
        }
        this.populateWorkingSectionFromCosts(true);
    },

    /**
     * Add fixed costs total row
     */
    addFixedCostsTotalRow() {
        const tbody = document.getElementById('fixed-costs-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Fixed Costs</strong></td>
            <td id="fixed-costs-total-estimated"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td>
            <td id="fixed-costs-total-actual"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Load variable costs
     */
    loadVariableCosts(costs, skipRebuild = false) {
        const tbody = document.getElementById('variable-costs-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';
        costs.forEach(cost => this.addVariableCostRow(cost));
        this.addVariableCostsTotalRow();

        // Update current month data
        if (this.currentMonthData) {
            this.currentMonthData.variableCosts = costs;
        }

        // Rebuild working section table structure when variable costs change
        if (this.currentMonthData && !skipRebuild) {
            this.rebuildWorkingSectionTable();
            // Reload weekly breakdown to update columns
            if (this.currentMonthData.weeklyBreakdown) {
                this.loadWeeklyBreakdown(this.currentMonthData.weeklyBreakdown);
            }
        }
    },

    /**
     * Add variable cost row
     */
    addVariableCostRow(costData = null) {
        const tbody = document.getElementById('variable-costs-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        const estimated = Formatters.parseNumber(costData?.estimatedAmount || 0);
        const actual = Formatters.parseNumber(costData?.actualAmount || 0);
        const remaining = estimated - actual;

        row.innerHTML = `
            <td><input type="text" class="variable-cost-category" value="${costData?.category || ''}" placeholder="Expense Category"></td>
            <td><input type="number" class="variable-cost-estimated" value="${costData?.estimatedAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="variable-cost-actual" value="${costData?.actualAmount || ''}" step="0.01" min="0" placeholder="0.00" readonly></td>
            <td class="variable-cost-remaining"><em>${Formatters.formatCurrency(remaining)}</em></td>
            <td><input type="text" class="variable-cost-comments" value="${costData?.comments || ''}" placeholder="Comments"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                row.remove();
                // Update current month data immediately after DOM removal
                if (this.currentMonthData) {
                    const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)')).map(row => ({
                        category: row.querySelector('.variable-cost-category')?.value || '',
                        estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
                        actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
                        comments: row.querySelector('.variable-cost-comments')?.value || ''
                    }));
                    this.currentMonthData.variableCosts = variableCosts;
                }
                this.updateCalculations();
                // Rebuild table structure when variable cost is deleted, then repopulate
                this.rebuildWorkingSectionTable();
                requestAnimationFrame(() => {
                    this.populateWorkingSectionFromCosts(true);
                });
        });
        }

        // Update remaining calculation when estimated or actual changes
        const updateRemaining = () => {
            const estimatedInput = row.querySelector('.variable-cost-estimated');
            const actualInput = row.querySelector('.variable-cost-actual');
            const remainingCell = row.querySelector('.variable-cost-remaining');

            const estimated = Formatters.parseNumber(estimatedInput?.value || 0);
            const actual = Formatters.parseNumber(actualInput?.value || 0);
            const remaining = estimated - actual;

            if (remainingCell) {
                remainingCell.innerHTML = '<em>' + Formatters.formatCurrency(remaining) + '</em>';
            }

            this.updateCalculations();
        };

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                // Update current month data
                if (this.currentMonthData) {
                    const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)')).map(row => ({
                        category: row.querySelector('.variable-cost-category')?.value || '',
                        estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
                        actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
                        comments: row.querySelector('.variable-cost-comments')?.value || ''
                    }));
                    this.currentMonthData.variableCosts = variableCosts;
                }

                updateRemaining();
                
                // Rebuild table structure if category changed
                if (input.classList.contains('variable-cost-category')) {
                    this.rebuildWorkingSectionTable();
                    // Reload weekly breakdown to update columns, force repopulate to update category columns
                    if (this.currentMonthData && this.currentMonthData.weeklyBreakdown) {
                        this.loadWeeklyBreakdown(this.currentMonthData.weeklyBreakdown, true);
                    } else {
                        // If no weekly breakdown exists yet, load with empty data to create rows
                        this.loadWeeklyBreakdown([]);
                    }
                    // Always populate working section immediately after rebuilding to ensure new category is included
                    requestAnimationFrame(() => {
                        this.populateWorkingSectionFromCosts(true);
                        // Update calculations to ensure Estimate and Actual columns reflect the new category
                        this.updateCalculations();
                    });
                } else if (input.classList.contains('variable-cost-estimated') || input.classList.contains('variable-cost-actual')) {
                    // Repopulate working section immediately when amount changes (force update to ensure working section reflects new amounts)
                    requestAnimationFrame(() => {
                        this.populateWorkingSectionFromCosts(true);
                        // Update calculations to ensure Estimate and Actual columns reflect the updated amounts
                        this.updateCalculations();
                    });
                }
            });
        });

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
        
        // Update current month data and rebuild table structure when variable cost is added
        if (this.currentMonthData) {
            const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)')).map(row => ({
                category: row.querySelector('.variable-cost-category')?.value || '',
                estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
                actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
                comments: row.querySelector('.variable-cost-comments')?.value || ''
            }));
            this.currentMonthData.variableCosts = variableCosts;
        }
        
        const updateWorkingSection = () => {
            // Use requestAnimationFrame to ensure the new row is fully in the DOM before reading
            requestAnimationFrame(() => {
                // Ensure currentMonthData is up to date before rebuilding - read from DOM again to get latest
                if (this.currentMonthData) {
                    const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)')).map(row => ({
                        category: row.querySelector('.variable-cost-category')?.value || '',
                        estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
                        actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
                        comments: row.querySelector('.variable-cost-comments')?.value || ''
                    }));
                    this.currentMonthData.variableCosts = variableCosts;
                }
                
                // Now rebuild the table structure with the updated categories
                // rebuildWorkingSectionTable will also refresh from DOM, but we do it here too for safety
                this.rebuildWorkingSectionTable();
                
                // Use setTimeout to ensure table rebuild is complete before loading weekly breakdown
                setTimeout(() => {
                    if (this.currentMonthData && this.currentMonthData.weeklyBreakdown) {
                        this.loadWeeklyBreakdown(this.currentMonthData.weeklyBreakdown);
                    } else {
                        // If no weekly breakdown exists yet, just load with empty data to create rows
                        this.loadWeeklyBreakdown([]);
                    }
                    
                    // Use requestAnimationFrame to ensure weekly breakdown is loaded before populating
                    requestAnimationFrame(() => {
                        // Always populate working section after rebuilding to ensure new variable costs are included
                        this.populateWorkingSectionFromCosts(true);
                        // Update calculations after populating to ensure Estimate and Actual columns are correct
                        this.updateCalculations();
                    });
                }, 0);
            });
        };
        updateWorkingSection();
    },

    /**
     * Add variable costs total row
     */
    addVariableCostsTotalRow() {
        const tbody = document.getElementById('variable-costs-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Variable Costs</strong></td>
            <td id="variable-costs-total-budget"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td>
            <td id="variable-costs-total-actual"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td>
            <td id="variable-costs-total-remaining"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td>
            <td></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Load unplanned expenses
     */
    loadUnplannedExpenses(expenses) {
        const tbody = document.getElementById('unplanned-expenses-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        expenses.forEach(expense => this.addUnplannedExpenseRow(expense));
        this.addUnplannedExpensesTotalRow();
    },

    /**
     * Add unplanned expense row
     */
    addUnplannedExpenseRow(expenseData = null) {
        const tbody = document.getElementById('unplanned-expenses-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="unplanned-name" value="${expenseData?.name || ''}" placeholder="Name"></td>
            <td><input type="number" class="unplanned-amount" value="${expenseData?.amount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="text" class="unplanned-date" value="${expenseData?.date || ''}" placeholder="Date"></td>
            <td><input type="text" class="unplanned-card" value="${expenseData?.card || ''}" placeholder="Card"></td>
            <td><input type="checkbox" class="unplanned-paid" ${expenseData?.paid ? 'checked' : ''}></td>
            <td><input type="text" class="unplanned-comments" value="${expenseData?.comments || ''}" placeholder="Comments"></td>
            <td><button type="button" class="delete-row-x" aria-label="Delete row">×</button></td>
        `;

        const deleteBtn = row.querySelector('.delete-row-x');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
                // Repopulate working section immediately when unplanned expense is deleted
                requestAnimationFrame(() => {
                    this.populateWorkingSectionFromCosts(true);
                });
        });
        }

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => {
                this.updateCalculations();
                // Repopulate working section immediately when unplanned expense changes
                requestAnimationFrame(() => {
                    this.populateWorkingSectionFromCosts(true);
                });
            });
            // Also listen for change events on checkboxes (checkboxes don't fire input events reliably)
            if (input.type === 'checkbox') {
                input.addEventListener('change', () => {
                    this.updateCalculations();
                    // Repopulate working section immediately when paid status changes
                    requestAnimationFrame(() => {
                        this.populateWorkingSectionFromCosts(true);
                    });
                });
            }
        });

        // Insert before the total row if it exists, otherwise append
        const allRows = tbody.querySelectorAll('tr');
        const lastRow = allRows[allRows.length - 1];

        if (lastRow && lastRow.classList.contains('total-row')) {
            // Insert before the total row
            tbody.insertBefore(row, lastRow);
        } else {
            // No total row found, append to end
        tbody.appendChild(row);
        }
        
        // Update current month data and repopulate working section when unplanned expense is added
        if (this.currentMonthData) {
            const unplannedExpenses = Array.from(document.querySelectorAll('#unplanned-expenses-tbody tr:not(.total-row)')).map(row => ({
                name: row.querySelector('.unplanned-name')?.value || '',
                amount: Formatters.parseNumber(row.querySelector('.unplanned-amount')?.value),
                date: row.querySelector('.unplanned-date')?.value || '',
                card: row.querySelector('.unplanned-card')?.value || '',
                paid: row.querySelector('.unplanned-paid')?.checked || false,
                comments: row.querySelector('.unplanned-comments')?.value || ''
            }));
            this.currentMonthData.unplannedExpenses = unplannedExpenses;
        }
        this.updateCalculations();
        this.populateWorkingSectionFromCosts();
    },

    /**
     * Add unplanned expenses total row
     */
    addUnplannedExpensesTotalRow() {
        const tbody = document.getElementById('unplanned-expenses-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Unplanned Expenses</strong></td>
            <td id="unplanned-expenses-total"><strong><em>${Formatters.formatCurrency(0)}</em></strong></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Load pots
     */
    loadPots(pots) {
        const tbody = document.getElementById('pots-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';
        pots.forEach(pot => this.addPotRow(pot));
        this.addPotsTotalRow();
    },

    /**
     * Add pot row
     */
    addPotRow(potData = null) {
        const tbody = document.getElementById('pots-tbody');
        if (!tbody) return;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td><input type="text" class="pot-category" value="${potData?.category || ''}" placeholder="Category"></td>
            <td><input type="number" class="pot-estimated" value="${potData?.estimatedAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><input type="number" class="pot-actual" value="${potData?.actualAmount || ''}" step="0.01" min="0" placeholder="0.00"></td>
            <td><button class="btn btn-danger btn-sm remove-row">Remove</button></td>
        `;

        row.querySelector('.remove-row').addEventListener('click', () => {
            row.remove();
            this.updateCalculations();
        });

        row.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', () => this.updateCalculations());
        });

        tbody.appendChild(row);
    },

    /**
     * Add pots total row
     */
    addPotsTotalRow() {
        const tbody = document.getElementById('pots-tbody');
        if (!tbody) return;

        // Remove existing total row if it exists
        const existingTotalRow = tbody.querySelector('.total-row');
        if (existingTotalRow) {
            existingTotalRow.remove();
        }

        const totalRow = document.createElement('tr');
        totalRow.className = 'total-row';
        totalRow.innerHTML = `
            <td><strong>Total Savings/Investments</strong></td>
            <td id="pots-total-estimated"><strong>${Formatters.formatCurrency(0)}</strong></td>
            <td id="pots-total-actual"><strong>${Formatters.formatCurrency(0)}</strong></td>
            <td></td>
        `;

        tbody.appendChild(totalRow);
    },

    /**
     * Update all calculations
     */
    updateCalculations() {
        if (!this.currentMonthData) return;

        // Update variable cost actuals from working section data
        this.updateVariableCostActualsFromWorkingSection();

        const totals = DataManager.calculateMonthTotals(this.getCurrentMonthDataFromForm());

        // Update income totals
        this.setElementHTML('income-total-estimated', '<strong><em>' + Formatters.formatCurrency(totals.income.estimated) + '</em></strong>');
        this.setElementHTML('income-total-actual', '<strong><em>' + Formatters.formatCurrency(totals.income.actual) + '</em></strong>');
        
        // Update fixed costs totals
        this.setElementHTML('fixed-costs-total-estimated', '<strong><em>' + Formatters.formatCurrency(totals.fixedCosts.estimated) + '</em></strong>');
        this.setElementHTML('fixed-costs-total-actual', '<strong><em>' + Formatters.formatCurrency(totals.fixedCosts.actual) + '</em></strong>');
        
        // Update variable costs totals
        this.setElementHTML('variable-costs-total-budget', '<strong><em>' + Formatters.formatCurrency(totals.variableCosts.estimated) + '</em></strong>');
        this.setElementHTML('variable-costs-total-actual', '<strong><em>' + Formatters.formatCurrency(totals.variableCosts.actual) + '</em></strong>');
        const variableRemaining = totals.variableCosts.estimated - totals.variableCosts.actual;
        this.setElementHTML('variable-costs-total-remaining', '<strong><em>' + Formatters.formatCurrency(variableRemaining) + '</em></strong>');
        
        // Update unplanned expenses totals
        this.setElementHTML('unplanned-expenses-total', '<strong><em>' + Formatters.formatCurrency(totals.unplannedExpenses.actual) + '</em></strong>');

        // Update summary section
        this.setElementHTML('summary-income-estimated', '<strong><em>' + Formatters.formatCurrency(totals.income.estimated) + '</em></strong>');
        this.setElementHTML('summary-income-actual', '<strong><em>' + Formatters.formatCurrency(totals.income.actual) + '</em></strong>');
        this.setElementHTML('summary-fixed-costs-estimated', '<em>' + Formatters.formatCurrency(totals.fixedCosts.estimated) + '</em>');
        this.setElementHTML('summary-fixed-costs-actual', '<em>' + Formatters.formatCurrency(totals.fixedCosts.actual) + '</em>');
        this.setElementHTML('summary-variable-costs-estimated', '<em>' + Formatters.formatCurrency(totals.variableCosts.estimated) + '</em>');
        this.setElementHTML('summary-variable-costs-actual', '<em>' + Formatters.formatCurrency(totals.variableCosts.actual) + '</em>');
        this.setElementHTML('summary-expenses-estimated', '<strong><em>' + Formatters.formatCurrency(totals.expenses.estimated) + '</em></strong>');
        this.setElementHTML('summary-expenses-actual', '<strong><em>' + Formatters.formatCurrency(totals.expenses.actual) + '</em></strong>');
        this.setElementHTML('summary-unplanned-actual', '<em>' + Formatters.formatCurrency(totals.unplannedExpenses.actual) + '</em>');
        
        // Grand Savings Total = Income - Expenses - Pots
        // Note: totals.expenses.actual already includes unplanned expenses
        const grandSavingsEstimated = totals.income.estimated - totals.expenses.estimated - totals.pots.estimated;
        const grandSavingsActual = totals.income.actual - totals.expenses.actual - totals.pots.actual;
        this.setElementHTML('summary-savings-estimated', '<strong><em>' + Formatters.formatCurrency(grandSavingsEstimated) + '</em></strong>');
        this.setElementHTML('summary-savings-actual', '<strong><em>' + Formatters.formatCurrency(grandSavingsActual) + '</em></strong>');

        // Update weekly breakdown totals - simple sums of each column
        const weeklyBreakdownRows = Array.from(document.querySelectorAll('#weekly-breakdown-tbody tr:not(.total-row)'));
        const categories = this.getVariableCostCategories();
        let weeklyEstimateTotal = 0;
        let weeklyActualTotal = 0;
        let weeklyPaymentsTotal = 0;
        const weeklyVariableCostsTotal = {};
        
        // Initialize totals for each category
        categories.forEach(category => {
            weeklyVariableCostsTotal[category] = 0;
        });
        
        weeklyBreakdownRows.forEach((row, weekIndex) => {
            const estimateInput = row.querySelector('.weekly-estimate');
            const actualInput = row.querySelector('.weekly-actual');
            const paymentsDueText = row.querySelector('.weekly-payments-due')?.value || '';

            // Calculate payments due totals (estimated and actual)
            const paymentsEstimated = this.calculatePaymentsDueTotal(paymentsDueText, true);
            const paymentsActual = this.calculatePaymentsDueTotal(paymentsDueText, false);
            weeklyPaymentsTotal += paymentsEstimated;

            // Calculate paid fixed costs for this week (only those marked as paid)
            let paidFixedCostsForWeek = 0;
            const year = this.currentMonthData.year;
            const month = this.currentMonthData.month;
            const weeks = this.calculateWeeksInMonth(year, month);
            const fixedCosts = this.currentMonthData.fixedCosts || [];
            const week = weeks[weekIndex];

            // Skip processing if this row doesn't correspond to a valid week
            if (!week) return;

            fixedCosts.forEach(cost => {
                if (!cost.date || !cost.paid) return; // Skip unpaid costs

                // Parse date - could be in various formats (DD, DD-MM, DD/MM, etc.)
                const dateMatch = cost.date.toString().match(/(\d+)/);
                if (dateMatch) {
                    const day = parseInt(dateMatch[1], 10);
                    if (day >= week.startDate && day <= week.endDate) {
                        const amount = Formatters.parseNumber(cost.estimatedAmount || cost.actualAmount || 0);
                        paidFixedCostsForWeek += amount;
                    }
                }
            });
            
            // Calculate variable cost totals for each category
            // For estimate column: use only base estimate (from tables, not user adjustments)
            // For actual column: negative of sum of "=" values from variable cost columns
            // For variable cost column totals: sum the "=" values (deductions only) from each row
            let rowVariableEstimated = 0;
            let rowVariableTotal = 0;
            categories.forEach(category => {
                const categoryId = this.sanitizeCategoryId(category);
                const categoryClass = 'weekly-variable-' + categoryId;
                const categoryText = row.querySelector('.' + categoryClass)?.value || '';
                // For estimate: use only base estimate (first number, no adjustments)
                const categoryEstimated = this.calculateVariableCostBaseEstimate(categoryText);
                // For variable cost column totals: sum the total from "=" line (includes adjustments)
                const categoryTotal = this.calculateVariableCostTotal(categoryText, true);
                weeklyVariableCostsTotal[category] += categoryTotal;
                rowVariableEstimated += categoryEstimated;
                rowVariableTotal += categoryTotal;
            });
            
            // Calculate estimate (payments due estimated + all variable costs base estimates from tables)
            const rowEstimate = paymentsEstimated + rowVariableEstimated;
            if (estimateInput) {
                estimateInput.value = rowEstimate.toFixed(2);
            }
            // Calculate total directly from source data (more accurate than reading rounded input values)
            weeklyEstimateTotal += rowEstimate;
            
            // Calculate paid unplanned expenses for this week (only those marked as paid)
            let paidUnplannedForWeek = 0;
            const unplannedExpenses = this.currentMonthData.unplannedExpenses || [];
            unplannedExpenses.forEach(expense => {
                if (!expense.date || !expense.paid) return; // Skip unpaid expenses

                // Parse date - could be in various formats (DD, DD-MM, DD/MM, etc.)
                const dateMatch = expense.date.toString().match(/(\d+)/);
                if (dateMatch) {
                    const day = parseInt(dateMatch[1], 10);
                    if (day >= week.startDate && day <= week.endDate) {
                        const amount = Formatters.parseNumber(expense.amount || 0);
                        paidUnplannedForWeek += amount;
                    }
                }
            });
            
            // Calculate actual: paid fixed costs + paid unplanned expenses + sum of "=" values from variable cost columns
            const rowActual = paidFixedCostsForWeek + paidUnplannedForWeek + rowVariableTotal;
            if (actualInput) {
                actualInput.value = rowActual.toFixed(2);
            }
            // Calculate total directly from source data (more accurate than reading rounded input values)
            weeklyActualTotal += rowActual;
        });
        
        // Set calculated totals - simple sums (one number per column)
        this.setElementHTML('weekly-breakdown-total-estimate', '<strong><em>' + Formatters.formatCurrency(weeklyEstimateTotal) + '</em></strong>');
        this.setElementHTML('weekly-breakdown-total-actual', '<strong><em>' + Formatters.formatCurrency(weeklyActualTotal) + '</em></strong>');
        this.setElementHTML('weekly-breakdown-total-payments', '<strong><em>' + Formatters.formatCurrency(weeklyPaymentsTotal) + '</em></strong>');
        
        // Set variable cost totals - simple sums (one number per column)
        categories.forEach(category => {
            const categoryId = 'weekly-breakdown-total-' + this.sanitizeCategoryId(category);
            const total = weeklyVariableCostsTotal[category];
            this.setElementHTML(categoryId, '<strong><em>' + Formatters.formatCurrency(total) + '</em></strong>');
        });
    },

    /**
     * Get current month data from form
     */
    getCurrentMonthDataFromForm() {
        const categories = this.getVariableCostCategories();
        const weeklyBreakdown = Array.from(document.querySelectorAll('#weekly-breakdown-tbody tr:not(.total-row)')).map(row => {
            const weekData = {
            dateRange: row.querySelector('.weekly-date-range')?.value || '',
            weekRange: row.querySelector('.weekly-date-range')?.value || '',
            paymentsDue: row.querySelector('.weekly-payments-due')?.value || '',
            estimate: Formatters.parseNumber(row.querySelector('.weekly-estimate')?.value),
            weeklyEstimate: Formatters.parseNumber(row.querySelector('.weekly-estimate')?.value),
            actual: Formatters.parseNumber(row.querySelector('.weekly-actual')?.value)
            };
            
            // Add dynamic variable cost columns
            categories.forEach(category => {
                const categoryId = this.sanitizeCategoryId(category);
                const categoryClass = 'weekly-variable-' + categoryId;
                const categoryValue = row.querySelector('.' + categoryClass)?.value || '';
                
                // Save full textarea content in categoryClass (for full data preservation)
                // This is the primary key that should always be used when loading
                weekData[categoryClass] = categoryValue;
                
                // Also save full content in category name for backwards compatibility with example data
                // This ensures example data format works correctly
                if (categoryValue.trim()) {
                    weekData[category] = categoryValue;
                }
                
                // Parse and save in new structure: separate estimate and actual (for backwards compatibility)
                const lines = categoryValue.split('\n');
                const estimateLine = lines.find(line => line.trim().startsWith('Estimate:'));
                const actualLine = lines.find(line => {
                    const trimmed = line.trim();
                    return trimmed.startsWith('=') && trimmed.length > 1;
                });
                
                // Extract and save estimate value (for backwards compatibility)
                if (estimateLine) {
                    const estimateMatch = estimateLine.match(/Estimate:\s*[^\d]*([\d\.]+)/);
                    if (estimateMatch) {
                        const estimateKey = category + ' estimates';
                        weekData[estimateKey] = estimateMatch[1];
                    }
                }
            });
            
            return weekData;
        });

        const fixedCosts = Array.from(document.querySelectorAll('#fixed-costs-tbody tr')).map(row => ({
            category: row.querySelector('.fixed-cost-category')?.value || '',
            estimatedAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-estimated')?.value),
            actualAmount: Formatters.parseNumber(row.querySelector('.fixed-cost-actual')?.value),
            date: row.querySelector('.fixed-cost-date')?.value || '',
            card: row.querySelector('.fixed-cost-card')?.value || '',
            paid: row.querySelector('.fixed-cost-paid')?.checked || false,
            comments: row.querySelector('.fixed-cost-comments')?.value || ''
        }));

        const variableCosts = Array.from(document.querySelectorAll('#variable-costs-tbody tr')).map(row => ({
            category: row.querySelector('.variable-cost-category')?.value || '',
            estimatedAmount: Formatters.parseNumber(row.querySelector('.variable-cost-estimated')?.value),
            actualAmount: Formatters.parseNumber(row.querySelector('.variable-cost-actual')?.value),
            comments: row.querySelector('.variable-cost-comments')?.value || ''
        }));

        const unplannedExpenses = Array.from(document.querySelectorAll('#unplanned-expenses-tbody tr')).map(row => ({
            name: row.querySelector('.unplanned-name')?.value || '',
            amount: Formatters.parseNumber(row.querySelector('.unplanned-amount')?.value),
            date: row.querySelector('.unplanned-date')?.value || '',
            card: row.querySelector('.unplanned-card')?.value || '',
            paid: row.querySelector('.unplanned-paid')?.checked || false,
            comments: row.querySelector('.unplanned-comments')?.value || ''
        }));

        const pots = Array.from(document.querySelectorAll('#pots-tbody tr')).map(row => ({
            category: row.querySelector('.pot-category')?.value || '',
            estimatedAmount: Formatters.parseNumber(row.querySelector('.pot-estimated')?.value),
            actualAmount: Formatters.parseNumber(row.querySelector('.pot-actual')?.value)
        }));

        const incomeSources = Array.from(document.querySelectorAll('#income-tbody tr')).map(row => ({
            source: row.querySelector('.income-source')?.value || '',
            estimated: Formatters.parseNumber(row.querySelector('.income-estimated')?.value),
            actual: Formatters.parseNumber(row.querySelector('.income-actual')?.value),
            date: row.querySelector('.income-date')?.value || '',
            description: row.querySelector('.income-description')?.value || '',
            comments: row.querySelector('.income-comments')?.value || ''
        }));

        return {
            ...this.currentMonthData,
            weeklyBreakdown: weeklyBreakdown,
            incomeSources: incomeSources,
            fixedCosts: fixedCosts,
            variableCosts: variableCosts,
            unplannedExpenses: unplannedExpenses,
            pots: pots,
            updatedAt: new Date().toISOString()
        };
    },

    /**
     * Save month data
     */
    async saveMonthData() {
        if (!this.currentMonthKey) {
            alert('No month selected');
            return;
        }

        const monthData = this.getCurrentMonthDataFromForm();
        const isNewMonth = !this.currentMonthData || !this.currentMonthData.createdAt;
        
        // Save to database
        const success = await DataManager.saveMonth(this.currentMonthKey, monthData);

        if (success) {
            let message = 'Month data saved successfully to database!';
            
            if (isNewMonth) {
                message = 'New month created and saved!\n\n' + message;
            }
            
            alert(message);
            this.currentMonthData = monthData;
            await this.loadMonthSelector();
        } else {
            alert('Error saving month data. Please try again.');
        }
    },

    /**
     * Delete current month
     */
    async deleteCurrentMonth() {
        if (!this.currentMonthKey) {
            alert('No month selected');
            return;
        }

        const monthData = this.currentMonthData;
        const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
        const year = monthData.year;

        // Check if this is example data before attempting deletion
        if (window.DatabaseService) {
            const isExample = await window.DatabaseService.isExampleData(this.currentMonthKey);
            if (isExample) {
                alert('Example data cannot be deleted. This data is protected and locked.');
                return;
            }
        }

        const confirmMessage = `Are you sure you want to delete ${monthName} ${year}? This action cannot be undone.`;
        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            const success = await DataManager.deleteMonth(this.currentMonthKey);

            if (success) {
                alert(`${monthName} ${year} has been deleted.`);
                this.currentMonthKey = null;
                this.currentMonthData = null;

                const monthContent = document.getElementById('month-content');
                const noMonthMessage = document.getElementById('no-month-message');
                if (monthContent) monthContent.style.display = 'none';
                if (noMonthMessage) noMonthMessage.style.display = 'block';
                this.updateShareButtonVisibility();
                if (monthTitleWrapper) monthTitleWrapper.style.display = 'none';
                if (monthSelectorWrapper) monthSelectorWrapper.style.display = 'block';

                await this.loadMonthSelector();

                // Load only user months, not example data
                const allMonths = await DataManager.getAllMonths(false, false);
                const monthKeys = Object.keys(allMonths).sort().reverse();
                if (monthKeys.length > 0) {
                    await this.loadMonth(monthKeys[0]);
                } else {
                    const monthContent = document.getElementById('month-content');
                    const noMonthMessage = document.getElementById('no-month-message');
                    if (monthContent) monthContent.style.display = 'none';
                    if (noMonthMessage) noMonthMessage.style.display = 'block';
                    this.updateShareButtonVisibility();
                }
            } else {
                alert('Error deleting month. Please try again.');
            }
        } catch (error) {
            alert(error.message || 'Error deleting month. Please try again.');
        }
    },

    /**
     * Helper: Set element text content
     */
    setElementText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    },

    /**
     * Populate copy month selectors with all available months (excluding current)
     */
    async populateCopyMonthSelectors() {
        if (!this.currentMonthKey) return;

        // Load user months + enabled example data only
        const allMonths = await DataManager.getAllMonths(false, true);
        const monthKeys = Object.keys(allMonths)
            .filter(key => key !== this.currentMonthKey)
            .sort()
            .reverse();

        const optionsHtml = monthKeys.length > 0 
            ? monthKeys.map(key => {
                const monthData = allMonths[key];
                const monthName = monthData.monthName || DataManager.getMonthName(monthData.month);
                return `<option value="${key}">${monthName} ${monthData.year}</option>`;
            }).join('')
            : '<option value="">No other months available</option>';

        // Populate all copy selectors
        const selectors = [
            'copy-income-from-month',
            'copy-fixed-costs-from-month',
            'copy-variable-costs-from-month',
            'copy-unplanned-from-month'
        ];

        selectors.forEach(selectorId => {
            const selector = document.getElementById(selectorId);
            if (selector) {
                selector.innerHTML = '<option value="">Select month to copy...</option>' + optionsHtml;
            }
        });
    },

    /**
     * Copy income data from selected month
     */
    async copyIncomeFromMonth() {
        const selector = document.getElementById('copy-income-from-month');
        if (!selector || !selector.value) {
            alert('Please select a month to copy from');
            return;
        }

        const sourceMonthKey = selector.value;
        const sourceMonthData = await DataManager.getMonth(sourceMonthKey);
        
        if (!sourceMonthData) {
            alert('Source month not found');
            return;
        }

        const sourceIncome = sourceMonthData.income || sourceMonthData.incomeSources || [];
        
        if (sourceIncome.length === 0) {
            alert('No income data found in the selected month');
            return;
        }

        // Clear current income
        const tbody = document.getElementById('income-tbody');
        if (tbody) tbody.innerHTML = '';

        // Load source income
        this.loadIncomeSources(sourceIncome);
        
        // Update current month data
        if (!this.currentMonthData.income) {
            this.currentMonthData.income = {};
        }
        this.currentMonthData.incomeSources = sourceIncome;
        
        alert(`Copied ${sourceIncome.length} income source(s) from ${sourceMonthData.monthName} ${sourceMonthData.year}`);
        this.updateCalculations();
    },

    /**
     * Copy fixed costs from selected month
     */
    async copyFixedCostsFromMonth() {
        const selector = document.getElementById('copy-fixed-costs-from-month');
        if (!selector || !selector.value) {
            alert('Please select a month to copy from');
            return;
        }

        const sourceMonthKey = selector.value;
        const sourceMonthData = await DataManager.getMonth(sourceMonthKey);
        
        if (!sourceMonthData) {
            alert('Source month not found');
            return;
        }

        const sourceFixedCosts = sourceMonthData.fixedCosts || [];
        
        if (sourceFixedCosts.length === 0) {
            alert('No fixed costs found in the selected month');
            return;
        }

        // Clear current fixed costs
        const tbody = document.getElementById('fixed-costs-tbody');
        if (tbody) tbody.innerHTML = '';

        // Load source fixed costs
        this.loadFixedCosts(sourceFixedCosts);
        
        // Update current month data
        this.currentMonthData.fixedCosts = sourceFixedCosts;
        
        // Repopulate working section with new fixed costs
        this.populateWorkingSectionFromCosts();
        
        alert(`Copied ${sourceFixedCosts.length} fixed cost(s) from ${sourceMonthData.monthName} ${sourceMonthData.year}`);
        this.updateCalculations();
    },

    /**
     * Internal function to copy variable costs from a specific month
     * Used automatically when month selector changes
     */
    async copyVariableCostsFromMonthInternal(sourceMonthKey) {
        if (!sourceMonthKey) {
            return;
        }

        const sourceMonthData = await DataManager.getMonth(sourceMonthKey);
        
        if (!sourceMonthData) {
            return;
        }

        const sourceVariableCostsRaw = sourceMonthData.variableCosts || [];

        if (sourceVariableCostsRaw.length === 0) {
            return;
        }

        // Normalize variable costs data structure to use estimatedAmount/actualAmount
        // (handles both monthlyBudget/actualSpent and estimatedAmount/actualAmount formats)
        // Create a fresh copy to avoid reference issues
        const sourceVariableCosts = sourceVariableCostsRaw.map(cost => ({
            category: cost.category || '',
            estimatedAmount: cost.estimatedAmount !== undefined ? cost.estimatedAmount : (cost.monthlyBudget || 0),
            actualAmount: cost.actualAmount !== undefined ? cost.actualAmount : (cost.actualSpent || 0),
            comments: cost.comments || ''
        }));

        // Load source variable costs
        this.loadVariableCosts(sourceVariableCosts, false); // Allow rebuild when copying

        // Update current month data
        this.currentMonthData.variableCosts = sourceVariableCosts;
        
        // Repopulate working section with new variable costs
        this.populateWorkingSectionFromCosts();
    },

    /**
     * Copy variable costs from selected month
     */
    async copyVariableCostsFromMonth() {
        const selector = document.getElementById('copy-variable-costs-from-month');
        if (!selector || !selector.value) {
            alert('Please select a month to copy from');
            return;
        }

        const sourceMonthKey = selector.value;
        await this.copyVariableCostsFromMonthInternal(sourceMonthKey);
        
        const sourceMonthData = await DataManager.getMonth(sourceMonthKey);
        if (sourceMonthData) {
            alert(`Copied ${(sourceMonthData.variableCosts || []).length} variable cost(s) from ${sourceMonthData.monthName} ${sourceMonthData.year}`);
        }
        
        this.updateCalculations();
    },

    /**
     * Copy unplanned expenses from selected month
     */
    async copyUnplannedExpensesFromMonth() {
        const selector = document.getElementById('copy-unplanned-from-month');
        if (!selector || !selector.value) {
            alert('Please select a month to copy from');
            return;
        }

        const sourceMonthKey = selector.value;
        const sourceMonthData = await DataManager.getMonth(sourceMonthKey);
        
        if (!sourceMonthData) {
            alert('Source month not found');
            return;
        }

        const sourceUnplanned = sourceMonthData.unplannedExpenses || [];
        
        if (sourceUnplanned.length === 0) {
            alert('No unplanned expenses found in the selected month');
            return;
        }

        // Clear current unplanned expenses
        const tbody = document.getElementById('unplanned-expenses-tbody');
        if (tbody) tbody.innerHTML = '';

        // Load source unplanned expenses
        this.loadUnplannedExpenses(sourceUnplanned);
        
        // Update current month data
        this.currentMonthData.unplannedExpenses = sourceUnplanned;
        
        alert(`Copied ${sourceUnplanned.length} unplanned expense(s) from ${sourceMonthData.monthName} ${sourceMonthData.year}`);
        this.updateCalculations();
    },

    /**
     * Calculate total from payments due textarea
     * Parses amounts from format: "Category: £Amount (Card) ✓"
     */
    /**
     * Calculate total from payments due textarea
     * Parses amounts from format: "Category: £Amount (Card) ✓" or "Category: £Amount [Actual: £Amount]"
     * @param {boolean} estimatedOnly - If true, only count estimated amounts. If false, only count actual amounts.
     */
    calculatePaymentsDueTotal(paymentsDueText, estimatedOnly = true) {
        if (!paymentsDueText || !paymentsDueText.trim()) return 0;
        
        // Get list of unplanned expense names to exclude from estimate calculation
        const unplannedExpenseNames = new Set();
        if (this.currentMonthData && this.currentMonthData.unplannedExpenses) {
            this.currentMonthData.unplannedExpenses.forEach(expense => {
                const name = (expense.name || '').trim();
                if (name) {
                    unplannedExpenseNames.add(name);
                }
            });
        }
        
        let total = 0;
        const lines = paymentsDueText.split('\n');
        const currencySymbol = Formatters.formatCurrency(0).charAt(0); // Get currency symbol (usually £)
        const escapedSymbol = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        lines.forEach(line => {
            if (!line.trim()) return;
            
            // Remove any "---" separators from the line
            const cleanedLine = line.replace(/---+/g, '').trim();
            if (!cleanedLine) return;
            
            // Extract category name (everything before the colon)
            const categoryMatch = cleanedLine.match(/^([^:]+):/);
            const categoryName = categoryMatch ? categoryMatch[1].trim() : '';
            
            // If calculating estimate and this is an unplanned expense, skip it
            if (estimatedOnly && unplannedExpenseNames.has(categoryName)) {
                return;
            }
            
            // Check if line has actual amount in format: "Category: £Amount [Actual: £Amount]"
            const actualMatch = cleanedLine.match(/\[Actual:\s*([^\]]+)\]/i);
            
            if (estimatedOnly) {
                // Extract estimated amount (first amount, or amount before [Actual:])
                const beforeActual = actualMatch ? cleanedLine.split('[')[0] : cleanedLine;
                const amountRegex = new RegExp(`${escapedSymbol}([\\d,]+(?:\\.\\d{2})?)`, 'g');
                const matches = beforeActual.match(amountRegex);
                
                if (matches && matches.length > 0) {
                    const amountStr = matches[0].replace(currencySymbol, '').replace(/,/g, '');
                    const amount = parseFloat(amountStr);
                    if (!isNaN(amount) && amount > 0) {
                        total += amount;
                    }
                }
            } else {
                // For actual calculation, only count items with a paid tick (✓)
                const hasPaidTick = cleanedLine.includes('✓');
                if (!hasPaidTick) return; // Skip items without paid tick
                
                // Extract actual amount if present
                if (actualMatch) {
                    const actualText = actualMatch[1];
                    const amountRegex = new RegExp(`${escapedSymbol}([\\d,]+(?:\\.\\d{2})?)`, 'g');
                    const matches = actualText.match(amountRegex);
                    
                    if (matches && matches.length > 0) {
                        const amountStr = matches[0].replace(currencySymbol, '').replace(/,/g, '');
                        const amount = parseFloat(amountStr);
                        if (!isNaN(amount) && amount > 0) {
                            total += amount;
                        }
                    }
                } else {
                    // If no [Actual:] but has paid tick, use the main amount
                    const amountRegex = new RegExp(`${escapedSymbol}([\\d,]+(?:\\.\\d{2})?)`, 'g');
                    const matches = cleanedLine.match(amountRegex);
                    
                    if (matches && matches.length > 0) {
                        const amountStr = matches[0].replace(currencySymbol, '').replace(/,/g, '');
                        const amount = parseFloat(amountStr);
                        if (!isNaN(amount) && amount > 0) {
                            total += amount;
                        }
                    }
                }
            }
        });
        
        return total;
    },

    /**
     * Calculate base estimate from variable cost textarea (for estimate column)
     * Returns only the base estimate value from "Estimate: £Amount" format
     * This ensures the estimate column always uses values from the tables, not user adjustments
     */
    calculateVariableCostBaseEstimate(variableCostText) {
        if (!variableCostText || !variableCostText.trim()) return 0;
        
        const lines = variableCostText.split('\n');
        const contentLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('=');
        });
        
        if (contentLines.length === 0) return 0;
        
        // Parse first line - check for "Estimate: £Amount" format
        const firstLine = contentLines[0]?.trim() || '0';
        
        // Try to parse "Estimate: £Amount" format
        if (firstLine.startsWith('Estimate:')) {
            const currencySymbol = Formatters.formatCurrency(0).charAt(0);
            const escapedSymbol = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const amountRegex = new RegExp(`${escapedSymbol}([\\d,]+(?:\\.\\d{2})?)`, 'g');
            const matches = firstLine.match(amountRegex);
            if (matches && matches.length > 0) {
                const amountStr = matches[0].replace(currencySymbol, '').replace(/,/g, '');
                return Formatters.parseNumber(amountStr);
            }
        }
        
        // Fallback: try to parse as plain number (old format)
        const baseMatch = firstLine.match(/^([\d.]+)/);
        if (baseMatch) {
            return Formatters.parseNumber(baseMatch[1]);
        }
        
        return Formatters.parseNumber(firstLine);
    },

    /**
     * Safely evaluate a mathematical expression string
     * Only allows numbers, basic operators (+, -, *, /), parentheses, and spaces
     */
    safeEvaluateExpression(expression) {
        // Remove currency symbols and commas, keep only numbers, operators, parentheses, and spaces
        const cleaned = expression.replace(/[£$€¥₹A$C$CHFNZ$R,]/g, '').trim();
        
        // Validate that expression only contains safe characters
        if (!/^[\d+\-*/().\s]+$/.test(cleaned)) {
            return NaN;
        }
        
        try {
            // Use Function constructor for safer evaluation (still limited to math operations)
            const result = Function('"use strict"; return (' + cleaned + ')')();
            return typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : NaN;
        } catch (error) {
            return NaN;
        }
    },

    /**
     * Calculate actual total for a variable cost category from working section table
     * Sums all "= value" entries in the corresponding column
     * @param {string} category - The variable cost category name
     * @returns {number} Total actual spending for this category
     */
    calculateVariableCostActualFromWorkingSection(category) {
        if (!category) return 0;

        const categoryId = this.sanitizeCategoryId(category);
        const categoryClass = 'weekly-variable-' + categoryId;
        let total = 0;

        // Find all textareas for this category in the working section table
        const textareas = document.querySelectorAll('#weekly-breakdown-tbody .' + categoryClass);
        textareas.forEach(textarea => {
            const text = textarea.value || '';
            // Use calculateVariableCostTotal to parse the "= value" from each textarea
            const actualForRow = this.calculateVariableCostTotal(text, false);
            total += actualForRow;
        });

        return total;
    },

    /**
     * Update all variable cost actual amounts based on working section data
     */
    updateVariableCostActualsFromWorkingSection() {
        const variableCostRows = Array.from(document.querySelectorAll('#variable-costs-tbody tr:not(.total-row)'));

        variableCostRows.forEach(row => {
            const categoryInput = row.querySelector('.variable-cost-category');
            const actualInput = row.querySelector('.variable-cost-actual');
            const remainingCell = row.querySelector('.variable-cost-remaining');

            if (categoryInput && actualInput) {
                const category = categoryInput.value.trim();
                if (category) {
                    // Calculate actual total from working section
                    const actualTotal = this.calculateVariableCostActualFromWorkingSection(category);

                    // Update the actual input field
                    actualInput.value = actualTotal.toFixed(2);

                    // Update remaining calculation
                    const estimatedInput = row.querySelector('.variable-cost-estimated');
                    const estimated = Formatters.parseNumber(estimatedInput?.value || 0);
                    const actual = actualTotal;
                    const remaining = estimated - actual;

                    if (remainingCell) {
                        remainingCell.innerHTML = '<em>' + Formatters.formatCurrency(remaining) + '</em>';
                    }
                }
            }
        });
    },

    /**
     * Calculate total from variable cost textarea
     * Reads actual spending from "= £Amount" line (user input)
     * Supports both single numbers and mathematical expressions (e.g., "= 100+20+10-5")
     * @param {boolean} estimatedOnly - If true, only count estimated amounts. If false, only count actual amounts.
     */
    calculateVariableCostTotal(variableCostText, estimatedOnly = true) {
        if (!variableCostText || !variableCostText.trim()) return 0;

        const lines = variableCostText.split('\n');

        // Check if there's a total line with "=" - this is where user enters actual spending
        const totalLine = lines.find(line => line.trim().startsWith('='));
        if (totalLine) {
            const trimmedTotalLine = totalLine.trim();
            
            // If "=" line is empty or just "=", return 0 (user hasn't entered actual spending yet)
            if (trimmedTotalLine === '=' || trimmedTotalLine.length <= 1) {
                return 0;
            }
            
            // Extract everything after "="
            const expressionAfterEquals = trimmedTotalLine.substring(1).trim();
            
            if (!expressionAfterEquals) {
                return 0;
            }
            
            // Try to evaluate as a mathematical expression
            const evaluatedResult = this.safeEvaluateExpression(expressionAfterEquals);
            if (!isNaN(evaluatedResult)) {
                return evaluatedResult;
            }
            
            // Fallback: Try extracting amount from "= £Amount" format (single currency value)
            const currencySymbol = Formatters.formatCurrency(0).charAt(0);
            const escapedSymbol = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const amountRegex = new RegExp(`${escapedSymbol}([\\d,]+(?:\\.\\d{2})?)`, 'g');
            const matches = expressionAfterEquals.match(amountRegex);
            if (matches && matches.length > 0) {
                const amountStr = matches[0].replace(currencySymbol, '').replace(/,/g, '');
                const amount = parseFloat(amountStr);
                if (!isNaN(amount)) {
                    return amount;
                }
            }
            
            // Fallback: Try parsing as plain number
            const plainNumberMatch = expressionAfterEquals.match(/^([\d,]+(?:\\.\\d{2})?)$/);
            if (plainNumberMatch) {
                const amountStr = plainNumberMatch[1].replace(/,/g, '');
                const amount = parseFloat(amountStr);
                if (!isNaN(amount)) {
                    return amount;
                }
            }
        }

        // If no "=" line or it's empty, return 0 (user hasn't entered actual spending)
        return 0;
    },

    /**
     * Ensure the "=" line exists in variable cost textarea
     * User fills in actual spending on the "=" line
     */
    updateVariableCostTotal(textarea) {
        if (!textarea) return;
        
        const content = textarea.value || '';
        const lines = content.split('\n');
        
        // Check if "=" line exists, if not add empty one
        const hasEqualsLine = lines.some(line => line.trim().startsWith('='));
        
        if (!hasEqualsLine) {
            // Add empty "=" line for user to fill in actual spending
            const contentBeforeEquals = lines.filter(line => !line.trim().startsWith('=')).join('\n');
            textarea.value = contentBeforeEquals + (contentBeforeEquals ? '\n=' : '=');
            this.autoSizeTextarea(textarea);
        }
        // Don't auto-calculate the "=" line - user fills it in with actual spending
    },

    /**
     * Auto-size textarea based on content
     * Sets width to longest line and height to number of rows
     */
    autoSizeTextarea(textarea) {
        if (!textarea) return;
        
        // Get the content
        const content = textarea.value || '';
        if (!content.trim()) {
            // Reset to default if empty
            textarea.style.width = '';
            textarea.style.height = '';
            textarea.rows = 4;
            return;
        }
        
        const lines = content.split('\n');
        
        // Create a temporary element to measure text width
        const temp = document.createElement('div');
        const computedStyle = window.getComputedStyle(textarea);
        temp.style.visibility = 'hidden';
        temp.style.position = 'absolute';
        temp.style.whiteSpace = 'pre';
        temp.style.font = computedStyle.font;
        temp.style.fontSize = computedStyle.fontSize;
        temp.style.fontFamily = computedStyle.fontFamily;
        temp.style.fontWeight = computedStyle.fontWeight;
        temp.style.padding = computedStyle.padding;
        temp.style.border = computedStyle.border;
        temp.style.boxSizing = computedStyle.boxSizing;
        document.body.appendChild(temp);
        
        // Find the longest line
        let maxWidth = 0;
        lines.forEach(line => {
            temp.textContent = line || ' ';
            const width = temp.offsetWidth;
            maxWidth = Math.max(maxWidth, width);
        });
        
        document.body.removeChild(temp);
        
        // Set width to longest line + some padding (no wrapping)
        const padding = 30; // Extra padding for scrollbar and comfort
        const minWidth = 200;
        const maxWidthLimit = textarea.parentElement ? textarea.parentElement.offsetWidth - 20 : 800;
        const calculatedWidth = Math.min(Math.max(maxWidth + padding, minWidth), maxWidthLimit);
        textarea.style.width = calculatedWidth + 'px';
        textarea.style.whiteSpace = 'pre'; // Preserve formatting, prevent wrapping
        textarea.style.overflowX = 'auto'; // Allow horizontal scroll if needed
        textarea.style.overflowY = 'auto'; // Allow vertical scroll if needed
        textarea.style.wordWrap = 'normal'; // Prevent word wrapping
        textarea.style.overflowWrap = 'normal'; // Prevent overflow wrapping
        
        // Set height based on number of lines
        const lineHeight = parseInt(computedStyle.lineHeight) || 20;
        const paddingTop = parseInt(computedStyle.paddingTop) || 0;
        const paddingBottom = parseInt(computedStyle.paddingBottom) || 0;
        const borderTop = parseInt(computedStyle.borderTopWidth) || 0;
        const borderBottom = parseInt(computedStyle.borderBottomWidth) || 0;
        const minRows = 1;
        const rows = Math.max(minRows, lines.length);
        const totalHeight = (rows * lineHeight) + paddingTop + paddingBottom + borderTop + borderBottom;
        textarea.style.height = totalHeight + 'px';
        textarea.rows = rows;
    },

    /**
     * Helper: Set element HTML content
     */
    setElementHTML(id, html) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = html;
    },
    
    /**
     * ============================================================================
     * DATA SHARING AND FIELD LOCKING METHODS
     * ============================================================================
     */
    
    /**
     * Show shared data indicator
     */
    showSharedDataIndicator(monthData) {
        const header = document.querySelector('.month-header, h1, .page-header');
        if (header && monthData.isShared) {
            const accessLevel = monthData.sharedAccessLevel || 'read';
            const accessText = accessLevel.replace('_', '/').replace(/\b\w/g, l => l.toUpperCase());
            const indicator = document.createElement('div');
            indicator.id = 'shared-data-indicator';
            indicator.style.cssText = 'padding: var(--spacing-sm); margin: var(--spacing-sm) 0; background: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.5); border-radius: var(--border-radius); font-size: 0.9rem;';
            indicator.innerHTML = `🔒 Shared Data - Access Level: ${accessText}`;
            if (!document.getElementById('shared-data-indicator')) {
                header.insertAdjacentElement('afterend', indicator);
            }
        }
    },
    
    /**
     * Hide shared data indicator
     */
    hideSharedDataIndicator() {
        const indicator = document.getElementById('shared-data-indicator');
        if (indicator) {
            indicator.remove();
        }
    },
    
    /**
     * Setup field-level locking for shared data
     */
    async setupFieldLocking(monthData) {
        if (!window.FieldLockingService || !monthData.isShared || !monthData.sharedOwnerId) {
            return;
        }
        
        this.fieldLocks = {};
        this.lockSubscriptions = {};
        
        const resourceType = 'month';
        const resourceId = this.currentMonthKey;
        const ownerUserId = monthData.sharedOwnerId;
        
        try {
            const subscriptionResult = await window.FieldLockingService.subscribeToLocks(
                resourceType,
                resourceId,
                (payload) => {
                    this.handleLockUpdate(payload);
                }
            );
            
            if (subscriptionResult.success) {
                this.lockSubscriptions[resourceId] = subscriptionResult.subscription;
            }
            
            const locksResult = await window.FieldLockingService.getAllLocksForResource(resourceType, resourceId);
            if (locksResult.success && locksResult.locks) {
                locksResult.locks.forEach(lock => {
                    this.fieldLocks[lock.field_path] = lock;
                    this.updateFieldLockUI(lock.field_path, lock);
                });
            }
            
            this.attachFieldLockListeners();
        } catch (error) {
            console.error('[MonthlyBudgetController] Error setting up field locking:', error);
        }
    },
    
    /**
     * Cleanup field-level locking
     */
    cleanupFieldLocking() {
        if (this.lockSubscriptions) {
            Object.values(this.lockSubscriptions).forEach(channel => {
                try {
                    channel.unsubscribe();
                } catch (error) {
                    console.error('[MonthlyBudgetController] Error unsubscribing from locks:', error);
                }
            });
            this.lockSubscriptions = {};
        }
        
        this.fieldLocks = {};
        this.removeFieldLockListeners();
    },
    
    /**
     * Attach field lock listeners to input fields
     */
    attachFieldLockListeners() {
        const inputs = document.querySelectorAll('input[type="number"], input[type="text"], textarea');
        inputs.forEach(input => {
            const fieldPath = this.getFieldPath(input);
            if (fieldPath) {
                input.addEventListener('focus', () => this.acquireFieldLock(fieldPath, input));
                input.addEventListener('blur', () => this.releaseFieldLock(fieldPath));
                input.addEventListener('input', () => this.extendFieldLock(fieldPath));
            }
        });
    },
    
    /**
     * Remove field lock listeners
     */
    removeFieldLockListeners() {
        const inputs = document.querySelectorAll('input[type="number"], input[type="text"], textarea');
        inputs.forEach(input => {
            const newInput = input.cloneNode(true);
            input.parentNode.replaceChild(newInput, input);
        });
    },
    
    /**
     * Get field path from input element
     */
    getFieldPath(input) {
        const name = input.name || input.id;
        if (!name) {
            return null;
        }
        
        const monthData = this.currentMonthData;
        if (!monthData || !monthData.isShared) {
            return null;
        }
        
        if (name.includes('variable-cost')) {
            const match = name.match(/variable-cost-(\d+)-(estimated|actual)/);
            if (match) {
                const index = parseInt(match[1], 10);
                const field = match[2] === 'estimated' ? 'estimatedAmount' : 'actualAmount';
                return `variable_costs[${index}].${field}`;
            }
        }
        
        if (name.includes('fixed-cost')) {
            const match = name.match(/fixed-cost-(\d+)-(amount|description)/);
            if (match) {
                const index = parseInt(match[1], 10);
                const field = match[2] === 'amount' ? 'amount' : 'description';
                return `fixed_costs[${index}].${field}`;
            }
        }
        
        return name;
    },
    
    /**
     * Acquire field lock
     */
    async acquireFieldLock(fieldPath, inputElement) {
        if (!window.FieldLockingService || !this.currentMonthData || !this.currentMonthData.isShared) {
            return;
        }
        
        const resourceType = 'month';
        const resourceId = this.currentMonthKey;
        const ownerUserId = this.currentMonthData.sharedOwnerId;
        
        try {
            const result = await window.FieldLockingService.acquireFieldLock(
                resourceType,
                resourceId,
                fieldPath,
                ownerUserId
            );
            
            if (result.success) {
                this.fieldLocks[fieldPath] = result.lock;
                this.updateFieldLockUI(fieldPath, result.lock);
            } else if (result.isLockedByOther) {
                this.updateFieldLockUI(fieldPath, result.lock);
                alert('This field is being edited by another user. Please wait.');
                inputElement.blur();
            }
        } catch (error) {
            console.error('[MonthlyBudgetController] Error acquiring lock:', error);
        }
    },
    
    /**
     * Release field lock
     */
    async releaseFieldLock(fieldPath) {
        if (!window.FieldLockingService || !this.fieldLocks || !this.fieldLocks[fieldPath]) {
            return;
        }
        
        const lock = this.fieldLocks[fieldPath];
        try {
            await window.FieldLockingService.releaseFieldLock(lock.id);
            delete this.fieldLocks[fieldPath];
            this.updateFieldLockUI(fieldPath, null);
        } catch (error) {
            console.error('[MonthlyBudgetController] Error releasing lock:', error);
        }
    },
    
    /**
     * Extend field lock
     */
    async extendFieldLock(fieldPath) {
        if (!window.FieldLockingService || !this.fieldLocks || !this.fieldLocks[fieldPath]) {
            return;
        }
        
        const lock = this.fieldLocks[fieldPath];
        try {
            await window.FieldLockingService.extendLock(lock.id);
        } catch (error) {
            console.error('[MonthlyBudgetController] Error extending lock:', error);
        }
    },
    
    /**
     * Handle lock update from real-time subscription
     */
    handleLockUpdate(payload) {
        const fieldPath = payload.new?.field_path || payload.old?.field_path;
        if (!fieldPath) {
            return;
        }
        
        if (payload.eventType === 'DELETE' || !payload.new) {
            delete this.fieldLocks[fieldPath];
            this.updateFieldLockUI(fieldPath, null);
        } else {
            this.fieldLocks[fieldPath] = payload.new;
            this.updateFieldLockUI(fieldPath, payload.new);
        }
    },
    
    /**
     * Update field lock UI
     */
    updateFieldLockUI(fieldPath, lock) {
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            const inputFieldPath = this.getFieldPath(input);
            if (inputFieldPath === fieldPath) {
                if (lock) {
                    const currentUserId = window.AuthService?.getCurrentUser()?.id;
                    if (lock.locked_by_user_id !== currentUserId) {
                        input.disabled = true;
                        input.title = 'This field is being edited by another user';
                        input.style.backgroundColor = 'rgba(255, 193, 7, 0.2)';
                    } else {
                        input.disabled = false;
                        input.title = 'You are editing this field';
                        input.style.backgroundColor = '';
                    }
                } else {
                    input.disabled = false;
                    input.title = '';
                    input.style.backgroundColor = '';
                }
            }
        });
    },
    
    /**
     * Check access level and disable actions accordingly
     */
    checkAccessLevel(monthData) {
        if (!monthData || !monthData.isShared) {
            return;
        }
        
        const accessLevel = monthData.sharedAccessLevel || 'read';
        const saveButton = document.querySelector('button[id*="save"], button:contains("Save")');
        const deleteButton = document.querySelector('button[id*="delete"], button:contains("Delete")');
        
        if (accessLevel === 'read') {
            if (saveButton) saveButton.disabled = true;
            if (deleteButton) deleteButton.disabled = true;
        } else if (accessLevel === 'read_write') {
            if (saveButton) saveButton.disabled = false;
            if (deleteButton) deleteButton.disabled = true;
        } else if (accessLevel === 'read_write_delete') {
            if (saveButton) saveButton.disabled = false;
            if (deleteButton) deleteButton.disabled = false;
        }
    },

    /**
     * Load shared data with current user
     */
    async loadSharedFromData() {
        console.log('[MonthlyBudgetController] loadSharedFromData() called');

        try {
            if (typeof window.DatabaseService === 'undefined') {
                console.warn('[MonthlyBudgetController] DatabaseService not available');
                return;
            }

            const result = await window.DatabaseService.getSharedDataWithMe();
            if (result.success) {
                this.renderSharedFromSection(result.data);
            } else {
                console.error('[MonthlyBudgetController] Error loading shared data:', result.error);
            }
        } catch (error) {
            console.error('[MonthlyBudgetController] Exception loading shared data:', error);
        }
    },

    /**
     * Render shared from section
     */
    async renderSharedFromSection(sharedData) {
        console.log('[MonthlyBudgetController] renderSharedFromSection() called', sharedData);

        const section = document.getElementById('shared-from-section');
        const content = document.getElementById('shared-from-content');
        if (!section || !content) {
            return;
        }

        const pending = sharedData.pending || [];
        const accepted = sharedData.accepted || [];
        const declined = sharedData.declined || [];

        if (pending.length === 0 && accepted.length === 0 && declined.length === 0) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';

        let html = '';

        if (pending.length > 0) {
            html += '<h3 style="margin-top: var(--spacing-md) 0 var(--spacing-sm) 0;">Pending</h3>';
            html += await this.renderSharedMonthsList(pending, 'pending');
        }

        if (accepted.length > 0) {
            html += '<h3 style="margin-top: var(--spacing-md) 0 var(--spacing-sm) 0;">Accepted</h3>';
            html += await this.renderSharedMonthsList(accepted, 'accepted');
        }

        if (declined.length > 0) {
            html += '<h3 style="margin-top: var(--spacing-md) 0 var(--spacing-sm) 0;">Declined</h3>';
            html += await this.renderSharedMonthsList(declined, 'declined');
        }

        content.innerHTML = html;

        this.setupSharedFromListeners();
    },

    /**
     * Render shared months list for a status
     */
    async renderSharedMonthsList(shares, status) {
        const monthsHtml = await Promise.all(
            shares.map(async (share) => {
                let ownerEmail = 'Unknown User';
                if (share.owner_user_id && typeof window.DatabaseService !== 'undefined') {
                    const emailResult = await window.DatabaseService.getUserEmailById(share.owner_user_id);
                    if (emailResult.success && emailResult.email) {
                        ownerEmail = emailResult.email;
                    }
                }

                const sharedMonths = share.shared_months || [];
                const monthsList = sharedMonths.map(m => {
                    if (m.type === 'range') {
                        return `${m.startMonth}/${m.startYear} - ${m.endMonth}/${m.endYear}`;
                    } else {
                        return `${m.month}/${m.year}`;
                    }
                }).join(', ') || 'All months';

                let actionsHtml = '';
                if (status === 'pending') {
                    actionsHtml = `
                        <div style="display: flex; gap: var(--spacing-xs); margin-top: var(--spacing-xs);">
                            <button class="btn btn-sm btn-primary accept-share-btn" data-share-id="${share.id}">Accept</button>
                            <button class="btn btn-sm btn-secondary decline-share-btn" data-share-id="${share.id}">Decline</button>
                            <button class="btn btn-sm btn-danger block-user-btn" data-user-id="${share.owner_user_id}">Block</button>
                        </div>
                    `;
                }

                return `
                    <div class="shared-month-item" style="padding: var(--spacing-sm); border: var(--border-width-standard) solid var(--border-color); border-radius: var(--border-radius); margin-bottom: var(--spacing-xs);">
                        <div><strong>From:</strong> ${ownerEmail}</div>
                        <div><strong>Access Level:</strong> ${share.access_level}</div>
                        <div><strong>Months:</strong> ${monthsList}</div>
                        ${share.shared_pots || share.share_all_data ? '<div><strong>Pots:</strong> Yes</div>' : ''}
                        ${share.shared_settings || share.share_all_data ? '<div><strong>Settings:</strong> Yes</div>' : ''}
                        ${actionsHtml}
                    </div>
                `;
            })
        );

        return monthsHtml.join('');
    },

    /**
     * Setup event listeners for shared from section
     */
    setupSharedFromListeners() {
        const content = document.getElementById('shared-from-content');
        if (!content) {
            return;
        }

        content.addEventListener('click', async (e) => {
            if (e.target.classList.contains('accept-share-btn')) {
                const shareId = parseInt(e.target.dataset.shareId, 10);
                if (shareId) {
                    await this.handleAcceptShare(shareId);
                }
            }

            if (e.target.classList.contains('decline-share-btn')) {
                const shareId = parseInt(e.target.dataset.shareId, 10);
                if (shareId) {
                    await this.handleDeclineShare(shareId);
                }
            }

            if (e.target.classList.contains('block-user-btn')) {
                const userId = e.target.dataset.userId;
                if (userId) {
                    await this.handleBlockUser(userId);
                }
            }
        });
    },

    /**
     * Handle accept share
     */
    async handleAcceptShare(shareId) {
        console.log('[MonthlyBudgetController] handleAcceptShare() called', { shareId });

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.updateShareStatus(shareId, 'accepted');

            if (result.success) {
                // Delete related notification if it exists
                if (typeof window.NotificationService !== 'undefined') {
                    try {
                        const currentUserId = await window.DatabaseService._getCurrentUserId();
                        if (currentUserId) {
                            const notificationsResult = await window.NotificationService.getNotifications(currentUserId, { unreadOnly: false });
                            if (notificationsResult.success && notificationsResult.notifications) {
                                const relatedNotification = notificationsResult.notifications.find(n => n.share_id === shareId);
                                if (relatedNotification) {
                                    const deleteResult = await window.NotificationService.deleteNotification(relatedNotification.id);
                                    if (!deleteResult.success) {
                                        console.warn('[MonthlyBudgetController] Failed to delete notification after accepting share:', deleteResult.error);
                                    }
                                }
                            }
                        }
                    } catch (notifError) {
                        console.warn('[MonthlyBudgetController] Error deleting notification after accepting share:', notifError);
                    }
                }
                await this.loadSharedFromData();
                await this.loadMonthSelector();
                if (this.currentMonthKey) {
                    await this.loadMonth(this.currentMonthKey);
                }
                alert('Share accepted successfully');
            } else {
                throw new Error(result.error || 'Failed to accept share');
            }
        } catch (error) {
            console.error('[MonthlyBudgetController] Error accepting share:', error);
            alert('Error accepting share: ' + error.message);
        }
    },

    /**
     * Handle decline share
     */
    async handleDeclineShare(shareId) {
        console.log('[MonthlyBudgetController] handleDeclineShare() called', { shareId });

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.updateShareStatus(shareId, 'declined');

            if (result.success) {
                // Delete related notification if it exists
                if (typeof window.NotificationService !== 'undefined') {
                    try {
                        const currentUserId = await window.DatabaseService._getCurrentUserId();
                        if (currentUserId) {
                            const notificationsResult = await window.NotificationService.getNotifications(currentUserId, { unreadOnly: false });
                            if (notificationsResult.success && notificationsResult.notifications) {
                                const relatedNotification = notificationsResult.notifications.find(n => n.share_id === shareId);
                                if (relatedNotification) {
                                    const deleteResult = await window.NotificationService.deleteNotification(relatedNotification.id);
                                    if (!deleteResult.success) {
                                        console.warn('[MonthlyBudgetController] Failed to delete notification after declining share:', deleteResult.error);
                                    }
                                }
                            }
                        }
                    } catch (notifError) {
                        console.warn('[MonthlyBudgetController] Error deleting notification after declining share:', notifError);
                    }
                }
                await this.loadSharedFromData();
                alert('Share declined');
            } else {
                throw new Error(result.error || 'Failed to decline share');
            }
        } catch (error) {
            console.error('[MonthlyBudgetController] Error declining share:', error);
            alert('Error declining share: ' + error.message);
        }
    },

    /**
     * Handle block user
     */
    async handleBlockUser(userId) {
        console.log('[MonthlyBudgetController] handleBlockUser() called', { userId });

        if (!confirm('Are you sure you want to block this user? This will decline all pending shares from them.')) {
            return;
        }

        try {
            if (typeof window.DatabaseService === 'undefined') {
                throw new Error('DatabaseService not available');
            }

            const result = await window.DatabaseService.blockUser(userId);

            if (result.success) {
                await this.loadSharedFromData();
                alert('User blocked successfully');
            } else {
                throw new Error(result.error || 'Failed to block user');
            }
        } catch (error) {
            console.error('[MonthlyBudgetController] Error blocking user:', error);
            alert('Error blocking user: ' + error.message);
        }
    }
};

// Initialize when DOM is ready
// Make available globally
window.MonthlyBudgetController = MonthlyBudgetController;

