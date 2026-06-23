// Initialize application with parallel loading for better performance
async function runInit() {
    try {
        console.log('[monthlyBudget.html] Starting initialization...');

        // PERFORMANCE OPTIMIZATION: Run independent initializations in parallel
        const [paymentsReady, dbInitResult] = await Promise.all([
            // Wait for payments module initialization
            window.waitForPaymentsInit ? window.waitForPaymentsInit() : Promise.resolve(),
            // Initialize database service
            window.DatabaseService.initialize()
        ]);
        console.log('[monthlyBudget.html] Payments and Database initialized');

        // Check authentication (must happen after database/payments init)
        const isAuthenticated = await window.AuthGuard.checkAuth();
        if (!isAuthenticated) {
            console.log('[monthlyBudget.html] Not authenticated, redirecting...');
            return;
        }
        console.log('[monthlyBudget.html] Authentication check passed');

        // Initialize the encryption key store BEFORE the controller's first
        // getAllMonths. getAllMonths -> ensureBudgetDEK -> getIdentityKeys ->
        // KeyStorageService._ensureInitialized() throws "Service not initialized"
        // unless KeyStorageService.initialize(config) has run (C2). Mirrors
        // auth.html's initCryptoServices(). Idempotent + ordered before the
        // controller so the budget DEK can bootstrap from the identity secret.
        if (window.MoneyTrackerEncryptionConfig && window.KeyStorageService
            && typeof window.KeyStorageService.initialize === 'function') {
            if (window.CryptoLibraryLoader && typeof window.CryptoLibraryLoader.load === 'function') {
                await window.CryptoLibraryLoader.load();
                await window.CryptoPrimitivesService.initialize();
            }
            window.MoneyTrackerEncryptionConfig.prepareWithServices();
            if (!window.KeyStorageService.initialized) {
                await window.KeyStorageService.initialize(window.MoneyTrackerEncryptionConfig);
            }
            console.log('[monthlyBudget.html] KeyStorageService initialized:', window.KeyStorageService.initialized);
        }

        // Initialize settings after database is ready
        await window.DataManager.initializeSettings();
        await window.DataManager.applyFontScale();
        console.log('[monthlyBudget.html] Settings initialized and applied');

        // Verify ReferenceImporter is loaded
        if (!window.ReferenceImporter) {
            console.error('ReferenceImporter not loaded! HTML file imports will not work.');
        } else {
            console.log('ReferenceImporter loaded successfully');
        }

        // Verify CSVHandler is loaded
        if (!window.CSVHandler) {
            console.error('CSVHandler not loaded! CSV export/import will not work.');
        } else {
            console.log('CSVHandler loaded successfully');
        }

        // Help content for each section
        const helpContent = {
            'working-section-help': {
                title: 'The Working Section',
                content: '<div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin: 0;">Weeks are automatically generated based on the calendar month.</p></div><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin-top: 0; font-weight: 600; margin-bottom: 0.75rem;"><strong>Using the "=" Line for Actual Spending:</strong></p><p style="margin-bottom: 0.75rem;">Each variable cost column has an "=" line at the bottom. Enter your actual weekly spending after the "=" sign. What is entered after the "=" is summed up as actual spending.</p><table style="width: 100%; border-collapse: collapse; margin: 0;"><thead><tr style="background-color: rgba(0,0,0,0.1);"><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left;">Format</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left;">Example</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left;">Result</th></tr></thead><tbody><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Simple number</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);"><code>= 50</code></td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">50</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Math expression</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);"><code>= 20 + 15 + 10</code></td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">45</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Empty (no spend)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);"><code>=</code></td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">0</td></tr></tbody></table></div><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin-top: 0; font-weight: 600; margin-bottom: 0.75rem;"><strong>Calculation Formulas:</strong></p><table style="width: 100%; border-collapse: collapse; margin: 0;"><thead><tr style="background-color: rgba(0,0,0,0.1);"><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 8%;">Step</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 30%;">Description</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 62%;">Formula</th></tr></thead><tbody><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">1</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Payments Due</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Sum of values in Payments Due column</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">2</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Variable Cost Estimates</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">First number in each category column (weekly budget)</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">3</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Week Estimate</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Payments Due + Variable Cost Estimates</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">4</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Variable Cost Actuals</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Value entered after "=" in each category column</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">5</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Paid Fixed Costs</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Sum of Fixed Costs marked "Paid" within week date range</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">6</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Paid Unplanned</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Sum of Unplanned marked "Paid" within week date range</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">7</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Week Actual</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Paid Fixed Costs + Paid Unplanned + Variable Cost Actuals</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">8</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Totals Row</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Sum of each column across all weeks</td></tr></tbody></table></div>'
            },
            'income-section-help': {
                title: '1. Income',
                content: '<p>At the start of each month, write down how much you expect to earn, how much I expect to earn, and any other income.</p><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin-top: 0; font-weight: 600; margin-bottom: 0.75rem;"><strong>Calculation Order and Formulas:</strong></p><table style="width: 100%; border-collapse: collapse; margin: 0;"><thead><tr style="background-color: rgba(0,0,0,0.1);"><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 10%;">Step</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 40%;">Description</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 50%;">Formula</th></tr></thead><tbody><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">1</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Total Income (Estimated)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Income (Estimated) = Σ(Estimated Amount for all income sources)</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">2</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Total Income (Actual)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Income (Actual) = Σ(Actual Amount for all income sources)</td></tr></tbody></table></div><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin: 0;"><strong>Note:</strong> Each income source is tracked separately with its own estimated amount, actual amount, date, description, and comments.</p></div>'
            },
            'fixed-costs-section-help': {
                title: '2. Fixed Costs ',
                content: '<p>All predictable expenses that come out every month — rent, subscriptions, gym, storage, transport, etc. Track estimated, actual, date, and which card.</p><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin-top: 0; font-weight: 600; margin-bottom: 0.75rem;"><strong>Calculation Order and Formulas:</strong></p><table style="width: 100%; border-collapse: collapse; margin: 0;"><thead><tr style="background-color: rgba(0,0,0,0.1);"><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 10%;">Step</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 40%;">Description</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 50%;">Formula</th></tr></thead><tbody><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">1</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Total Fixed Costs (Estimated)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Fixed Costs (Estimated) = Σ(Estimated Amount for all fixed cost entries)</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">2</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Total Fixed Costs (Actual)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Fixed Costs (Actual) = Σ(Actual Amount for all fixed cost entries)</td></tr></tbody></table></div><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin: 0;"><strong>Note:</strong> Only fixed costs marked as "Paid" are included in the Working Section actual calculations for the week in which the payment date falls.</p></div>'
            },
            'variable-costs-section-help': {
                title: '3. Variable Costs ',
                content: '<p>The two categories we can control. Assign a monthly budget for each.</p><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin-top: 0; font-weight: 600; margin-bottom: 0.75rem;"><strong>Using the "=" Line for Actual Spending:</strong></p><p style="margin-bottom: 0.75rem;">Each variable cost column has an "=" line at the bottom. Enter your actual weekly spending after the "=" sign. What is entered after the "=" is summed up as actual spending.</p><table style="width: 100%; border-collapse: collapse; margin: 0;"><thead><tr style="background-color: rgba(0,0,0,0.1);"><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left;">Format</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left;">Example</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left;">Result</th></tr></thead><tbody><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Simple number</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);"><code>= 50</code></td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">50</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Math expression</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);"><code>= 20 + 15 + 10</code></td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">45</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Empty (no spend)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);"><code>=</code></td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">0</td></tr></tbody></table></div><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin-top: 0; font-weight: 600; margin-bottom: 0.75rem;"><strong>Calculation Order and Formulas:</strong></p><table style="width: 100%; border-collapse: collapse; margin: 0;"><thead><tr style="background-color: rgba(0,0,0,0.1);"><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 10%;">Step</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 40%;">Description</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 50%;">Formula</th></tr></thead><tbody><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">1</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Remaining (for each category)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Remaining = Monthly Budget - Actual Spent</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">2</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Total Variable Costs (Estimated)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Variable Costs (Estimated) = Σ(Monthly Budget for all categories)</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">3</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Total Variable Costs (Actual)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Variable Costs (Actual) = Σ(Actual Spent for all categories)</td></tr></tbody></table></div><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin: 0;"><strong>Note:</strong> Variable costs are broken down by week in the Working Section, where you can track weekly spending and adjustments.</p></div>'
            },
            'unplanned-expenses-section-help': {
                title: '4. Unplanned Buying',
                content: '<p>Catch-all section for things we didn\'t budget for but end up buying anyway (new jeans, spontaneous book, one-off fee, anything unexpected).</p><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin-top: 0; font-weight: 600; margin-bottom: 0.75rem;"><strong>Calculation Order and Formulas:</strong></p><table style="width: 100%; border-collapse: collapse; margin: 0;"><thead><tr style="background-color: rgba(0,0,0,0.1);"><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 10%;">Step</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 40%;">Description</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 50%;">Formula</th></tr></thead><tbody><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">1</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Total Unplanned Expenses (Actual)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Unplanned Expenses (Actual) = Σ(Amount for all unplanned expense entries)</td></tr></tbody></table></div><div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin: 0;"><strong>Note:</strong> Unplanned expenses only have actual amounts (no estimates). Only expenses marked as "Paid" are included in the Working Section actual calculations for the week in which the payment date falls.</p></div>'
            },
            'summary-section-help': {
                title: '5. End-of-Month Summary',
                content: '<div style="background-color: rgba(240, 240, 240, 0.9); border: var(--border-width-standard) solid var(--border-color-black); border-radius: calc(var(--border-radius) * var(--border-radius-multiplier)); padding: var(--spacing-md); margin: 1rem 0;"><p style="margin-top: 0; font-weight: 600; margin-bottom: 0.75rem;"><strong>Calculation Order and Formulas:</strong></p><table style="width: 100%; border-collapse: collapse; margin: 0;"><thead><tr style="background-color: rgba(0,0,0,0.1);"><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 10%;">Step</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 35%;">Description</th><th style="padding: 0.5rem; border: 1px solid var(--border-color-black); text-align: left; width: 55%;">Formula</th></tr></thead><tbody><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">1</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Get Total Income</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Income (Estimated) = from Income section<br/>Total Income (Actual) = from Income section</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">2</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Get Total Fixed Costs</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Fixed Costs (Estimated) = from Fixed Costs section<br/>Total Fixed Costs (Actual) = from Fixed Costs section</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">3</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Get Total Variable Costs</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Variable Costs (Estimated) = from Variable Costs section<br/>Total Variable Costs (Actual) = from Variable Costs section</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">4</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Total Expenses (Estimated)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Expenses (Estimated) = Total Fixed Costs (Estimated) + Total Variable Costs (Estimated)</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">5</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Total Expenses (Actual)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Expenses (Actual) = Total Fixed Costs (Actual) + Total Variable Costs (Actual)</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">6</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Get Total Unplanned Expenses</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Total Unplanned Expenses (Actual) = from Unplanned Buying section</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">7</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Grand Savings Total (Estimated)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Grand Savings Total (Estimated) = Total Income (Estimated) - Total Expenses (Estimated)</td></tr><tr><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">8</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Calculate Grand Savings Total (Actual)</td><td style="padding: 0.5rem; border: 1px solid var(--border-color-black);">Grand Savings Total (Actual) = Total Income (Actual) - Total Expenses (Actual) - Total Unplanned Expenses (Actual)</td></tr></tbody></table></div>'
            },
        };

        // Help modal functionality
        function initHelpButtons() {
            const helpButtons = document.querySelectorAll('.help-button');
            const helpModal = document.getElementById('help-modal');
            const helpModalTitle = document.getElementById('help-modal-title');
            const helpModalBody = document.getElementById('help-modal-body');
            const helpModalClose = document.querySelector('.help-modal-close');
            const helpModalOverlay = document.querySelector('.help-modal-overlay');

            function openHelpModal(helpId) {
                const content = helpContent[helpId];
                if (content) {
                    helpModalTitle.textContent = content.title;
                    helpModalBody.innerHTML = content.content;
                    helpModal.style.display = 'flex';
                    helpModal.setAttribute('aria-hidden', 'false');
                    document.body.style.overflow = 'hidden';
                }
            }

            function closeHelpModal() {
                helpModal.style.display = 'none';
                helpModal.setAttribute('aria-hidden', 'true');
                document.body.style.overflow = '';
            }

            helpButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const helpId = this.getAttribute('data-help-id');
                    openHelpModal(helpId);
                });
            });

            if (helpModalClose) {
                helpModalClose.addEventListener('click', closeHelpModal);
            }

            if (helpModalOverlay) {
                helpModalOverlay.addEventListener('click', closeHelpModal);
            }

            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && helpModal.style.display === 'flex') {
                    closeHelpModal();
                }
            });
        }

        // Verify ReferenceImporter is loaded
        if (!window.ReferenceImporter) {
            console.error('ReferenceImporter not loaded! HTML file imports will not work.');
        } else {
            console.log('ReferenceImporter loaded successfully');
        }

        // Verify CSVHandler is loaded
        if (!window.CSVHandler) {
            console.error('CSVHandler not loaded! CSV export/import will not work.');
        } else {
            console.log('CSVHandler loaded successfully');
        }

        // Initialize help buttons
        initHelpButtons();

        // Now initialize the controller (it will handle loading months)
        if (window.MonthlyBudgetController) {
            await window.MonthlyBudgetController.init();
            console.log('[monthlyBudget.html] MonthlyBudgetController initialized');
        }

        // Budget E2E one-time migration (S6): bulk-encrypt the user's EXISTING
        // plaintext budget rows (enc_version=0) so historical data also becomes
        // ciphertext. Runs ONCE per session, AFTER auth + DEK-bootstrap (the
        // controller's getAllMonths already ran ensureBudgetDEK). Fire-and-forget
        // / NON-BLOCKING: deliberately NOT awaited, so it never stalls the UI; it
        // is idempotent (re-runnable every login), concurrency-guarded, and
        // VERIFY-BEFORE-DESTROY (a row never loses plaintext without a verified
        // ciphertext replacement). It swallows its own errors via runOnLogin().
        if (window.BudgetMigrationService && window.DatabaseService) {
            Promise.resolve(window.DatabaseService._getCurrentUserId())
                .then((uid) => uid && window.BudgetMigrationService.runOnLogin(uid))
                .then((summary) => {
                    if (summary && summary.ran) {
                        console.log('[monthlyBudget.html] Budget migration:', summary.totals);
                    }
                })
                .catch((e) => console.warn('[monthlyBudget.html] Budget migration trigger error (non-fatal):', e && e.message));
        }

        console.log('[monthlyBudget.html] Initialization complete!');
    } catch (error) {
        console.error('[monthlyBudget.html] ❌ Initialization error:', error);
        console.error('[monthlyBudget.html] Error stack:', error.stack);
        (function(){try{console.error('[init] failed:', typeof error!=='undefined'?error:'');}catch(_){}if(document.body){var b=document.createElement('div');b.setAttribute('role','alert');b.style.cssText='background:#7f1d1d;color:#fff;padding:12px 16px;text-align:center;font:14px sans-serif';b.textContent='Could not load the page. Check your connection and refresh.';document.body.prepend(b);}})();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInit);
} else {
    runInit();
}
