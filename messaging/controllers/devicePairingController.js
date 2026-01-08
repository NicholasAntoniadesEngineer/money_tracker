/**
 * Device Pairing Controller
 *
 * Manages the device pairing UI and flow
 */

const DevicePairingController = {
    modal: null,
    timerInterval: null,
    currentCode: null,
    expiresAt: null,

    /**
     * Initialize the pairing controller
     */
    init() {
        console.log('[DevicePairingController] Initializing...');

        this.modal = document.getElementById('device-pairing-modal');
        if (!this.modal) {
            console.warn('[DevicePairingController] Pairing modal not found');
            return;
        }

        this.setupEventListeners();
        console.log('[DevicePairingController] Initialized');
    },

    /**
     * Setup event listeners for pairing UI
     */
    setupEventListeners() {
        // Close modal
        const closeBtn = document.getElementById('close-pairing-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeModal());
        }

        // Primary device button
        const primaryBtn = document.getElementById('is-primary-device-btn');
        if (primaryBtn) {
            primaryBtn.addEventListener('click', () => this.handlePrimaryDevice());
        }

        // Secondary device button
        const secondaryBtn = document.getElementById('is-secondary-device-btn');
        if (secondaryBtn) {
            secondaryBtn.addEventListener('click', () => this.showSecondaryDeviceView());
        }

        // Generate code button
        const regenerateBtn = document.getElementById('regenerate-code-btn');
        if (regenerateBtn) {
            regenerateBtn.addEventListener('click', () => this.generatePairingCode());
        }

        // Submit pairing code
        const submitBtn = document.getElementById('submit-pairing-code-btn');
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.submitPairingCode());
        }

        // Cancel pairing
        const cancelBtn = document.getElementById('cancel-pairing-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeModal());
        }

        // Back to detection
        const backBtn = document.getElementById('back-to-detection-btn');
        if (backBtn) {
            backBtn.addEventListener('click', () => this.showDeviceDetection());
        }

        // Continue without pairing (primary device)
        const continueBtn = document.getElementById('continue-without-pairing-btn');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                window.location.href = '../../landing/index.html';
            });
        }

        // Auto-format pairing code input (only numbers)
        const codeInput = document.getElementById('pairing-code-input');
        if (codeInput) {
            codeInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
            });

            // Submit on Enter
            codeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.submitPairingCode();
                }
            });
        }
    },

    /**
     * Show device detection view (first time users)
     */
    showDeviceDetection() {
        console.log('[DevicePairingController] Showing device detection');

        this.hideAllViews();

        const detectionView = document.getElementById('device-detection-view');
        if (detectionView) {
            detectionView.classList.add('active');
        }

        // Only show modal if it exists (for modal version)
        if (this.modal) {
            this.modal.style.display = 'flex';
        }
    },

    /**
     * Handle primary device selection
     */
    async handlePrimaryDevice() {
        console.log('[DevicePairingController] User selected primary device');

        this.hideAllViews();

        // Show status message in detection view
        const detectionView = document.getElementById('device-detection-view');
        if (detectionView) {
            detectionView.innerHTML = '<p style="text-align: center; color: var(--primary-color);">Setting up encryption keys...</p>';
            detectionView.style.display = 'block';
        }

        try {
            // Get current user
            const currentUser = await window.AuthService.getCurrentUser();
            if (!currentUser) {
                throw new Error('User not authenticated');
            }

            const userId = currentUser.id;

            // Initialize keys as primary device
            const keys = await window.KeyManager.initialize(userId);

            // Register this device as primary
            const deviceName = window.DevicePairingService.getDeviceName();
            await window.DevicePairingService.registerDevice(userId, deviceName, true);

            // Show success and redirect
            if (detectionView) {
                detectionView.innerHTML = '<p style="text-align: center; color: var(--success-color);">Encryption set up successfully! Redirecting...</p>';
            }

            // Redirect to home page
            setTimeout(() => {
                window.location.href = '../../landing/index.html';
            }, 1500);

        } catch (error) {
            console.error('[DevicePairingController] Error setting up primary device:', error);
            alert('Error setting up primary device: ' + error.message);

            // Restore detection view
            if (detectionView) {
                detectionView.innerHTML = `
                    <h2 style="margin-bottom: var(--spacing-lg);">Is this your first time using messenger on this device?</h2>
                    <button id="is-primary-device-btn" class="btn btn-primary" style="width: 100%; margin-bottom: var(--spacing-md);">Yes, this is my primary device</button>
                    <button id="is-secondary-device-btn" class="btn btn-secondary" style="width: 100%;">No, I have another device already</button>
                `;
                detectionView.style.display = 'block';
                this.setupEventListeners(); // Re-attach listeners
            }
        }
    },

    /**
     * Show primary device view with pairing code
     */
    showPrimaryDeviceView() {
        console.log('[DevicePairingController] Showing primary device view');

        this.hideAllViews();

        const primaryView = document.getElementById('primary-device-view');
        if (primaryView) {
            primaryView.classList.add('active');
        }

        // Only show modal if it exists (for modal version)
        if (this.modal) {
            this.modal.style.display = 'flex';
        }

        // Generate pairing code
        this.generatePairingCode();
    },

    /**
     * Generate and display pairing code
     */
    async generatePairingCode() {
        console.log('[DevicePairingController] Generating pairing code');

        try {
            // Get current user
            const currentUser = await window.AuthService.getCurrentUser();
            if (!currentUser) {
                throw new Error('User not authenticated');
            }

            const userId = currentUser.id;

            // Get user's identity keys
            const keys = await window.KeyStorageService.getIdentityKeys(userId);
            if (!keys) {
                throw new Error('No encryption keys found. Please initialize messenger first.');
            }

            // Create pairing request
            const result = await window.DevicePairingService.createPairingRequest(userId, keys);

            if (!result.success) {
                throw new Error(result.error);
            }

            this.currentCode = result.code;
            this.expiresAt = result.expiresAt;

            // Display code
            const codeDisplay = document.getElementById('pairing-code-display');
            if (codeDisplay) {
                codeDisplay.textContent = result.code;
            }

            // Start countdown timer
            this.startTimer();

        } catch (error) {
            console.error('[DevicePairingController] Error generating pairing code:', error);
            alert('Error generating pairing code: ' + error.message);
        }
    },

    /**
     * Start countdown timer for pairing code
     */
    startTimer() {
        // Clear any existing timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        const timerDisplay = document.getElementById('pairing-code-timer');
        if (!timerDisplay || !this.expiresAt) return;

        this.timerInterval = setInterval(() => {
            const now = new Date();
            const remaining = Math.max(0, this.expiresAt - now);

            if (remaining === 0) {
                clearInterval(this.timerInterval);
                timerDisplay.textContent = 'Expired';

                // Disable code display
                const codeDisplay = document.getElementById('pairing-code-display');
                if (codeDisplay) {
                    codeDisplay.style.opacity = '0.3';
                }
                return;
            }

            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            timerDisplay.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        }, 1000);
    },

    /**
     * Show secondary device view for code entry
     */
    showSecondaryDeviceView() {
        console.log('[DevicePairingController] Showing secondary device view');

        this.hideAllViews();

        const secondaryView = document.getElementById('secondary-device-view');
        if (secondaryView) {
            secondaryView.classList.add('active');
        }

        const codeInput = document.getElementById('pairing-code-input');
        if (codeInput) {
            codeInput.value = '';
            codeInput.focus();
        }

        const statusDiv = document.getElementById('pairing-status');
        if (statusDiv) {
            statusDiv.textContent = '';
        }
    },

    /**
     * Submit and verify pairing code (secondary device)
     */
    async submitPairingCode() {
        console.log('[DevicePairingController] Submitting pairing code');

        const codeInput = document.getElementById('pairing-code-input');
        const statusDiv = document.getElementById('pairing-status');
        const submitBtn = document.getElementById('submit-pairing-code-btn');

        if (!codeInput || !statusDiv) return;

        const code = codeInput.value.trim();

        if (!code || code.length !== 6) {
            statusDiv.innerHTML = '<span style="color: var(--error-color);">Please enter a valid 6-digit code</span>';
            return;
        }

        try {
            // Disable button during processing
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Pairing...';
            }

            statusDiv.innerHTML = '<span style="color: var(--primary-color);">Verifying code...</span>';

            // Get current user
            const currentUser = await window.AuthService.getCurrentUser();
            if (!currentUser) {
                throw new Error('User not authenticated');
            }

            const userId = currentUser.id;

            // Verify pairing code and get keys
            const result = await window.DevicePairingService.verifyPairingCode(userId, code);

            if (!result.success) {
                throw new Error(result.error);
            }

            statusDiv.innerHTML = '<span style="color: var(--success-color);">Code verified! Setting up encryption...</span>';

            // Store the received keys
            await window.KeyStorageService.storeIdentityKeys(
                userId,
                result.keys.publicKey,
                result.keys.secretKey
            );

            // Upload public key to database
            await window.KeyManager.uploadPublicKey(userId, result.keys.publicKey);

            // Register this device
            const deviceName = window.DevicePairingService.getDeviceName();
            await window.DevicePairingService.registerDevice(userId, deviceName, false);

            statusDiv.innerHTML = '<span style="color: var(--success-color);">Device paired successfully! Redirecting...</span>';

            // Redirect to home page
            setTimeout(() => {
                window.location.href = '../../landing/index.html';
            }, 1500);

        } catch (error) {
            console.error('[DevicePairingController] Error verifying pairing code:', error);
            statusDiv.innerHTML = `<span style="color: var(--error-color);">${error.message}</span>`;

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Pair Device';
            }
        }
    },

    /**
     * Hide all views
     */
    hideAllViews() {
        const views = [
            'device-detection-view',
            'primary-device-view',
            'secondary-device-view'
        ];

        views.forEach(viewId => {
            const view = document.getElementById(viewId);
            if (view) {
                view.classList.remove('active');
                view.style.display = 'none';
            }
        });

        // Clear timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    },

    /**
     * Close the pairing modal
     */
    closeModal() {
        console.log('[DevicePairingController] Closing pairing modal');

        if (this.modal) {
            this.modal.style.display = 'none';
        }

        this.hideAllViews();
    }
};

// Make available globally
window.DevicePairingController = DevicePairingController;

console.log('[DevicePairingController] Controller loaded');
