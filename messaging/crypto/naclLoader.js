/**
 * NaCl Loader
 *
 * Dynamically loads the TweetNaCl.js cryptography library from CDN
 * TweetNaCl is a port of NaCl (Networking and Cryptography library)
 * providing high-speed, high-security cryptographic operations.
 *
 * Library: https://github.com/dchest/tweetnacl-js
 * Size: ~100KB minified
 * License: Public domain
 */

const NaClLoader = {
    /**
     * Load TweetNaCl.js library and utilities
     * @returns {Promise<Object>} The nacl library object with util
     */
    async load() {
        // Return existing instance if already loaded with utils
        if (window.nacl && window.nacl.util) {
            console.log('[NaClLoader] TweetNaCl already loaded with utils');
            return window.nacl;
        }

        console.log('[NaClLoader] Loading TweetNaCl.js from CDN...');

        // Load main library first
        await this._loadScript(
            'https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js',
            'TweetNaCl main library'
        );

        // Then load util library (extends nacl object)
        await this._loadScript(
            'https://cdn.jsdelivr.net/npm/tweetnacl-util@0.15.1/nacl-util.min.js',
            'TweetNaCl util library'
        );

        // Verify both are available
        if (!window.nacl) {
            throw new Error('TweetNaCl loaded but not available on window object');
        }

        if (!window.nacl.util) {
            throw new Error('TweetNaCl util loaded but not available on nacl object');
        }

        console.log('[NaClLoader] ✓ TweetNaCl.js loaded successfully with utils');

        // Log library version info
        console.log('[NaClLoader] Library info:', {
            hasBox: !!window.nacl.box,
            hasSecretbox: !!window.nacl.secretbox,
            hasHash: !!window.nacl.hash,
            hasRandomBytes: !!window.nacl.randomBytes,
            hasUtil: !!window.nacl.util,
            hasUtilEncodeBase64: !!window.nacl.util?.encodeBase64,
            hasUtilDecodeBase64: !!window.nacl.util?.decodeBase64
        });

        return window.nacl;
    },

    /**
     * Load a single script
     * @private
     * @param {string} src - Script URL
     * @param {string} name - Script name for logging
     * @returns {Promise<void>}
     */
    _loadScript(src, name) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.defer = true;

            script.onload = () => {
                console.log(`[NaClLoader] ✓ ${name} loaded`);
                resolve();
            };

            script.onerror = (event) => {
                const error = new Error(`Failed to load ${name} from CDN`);
                console.error('[NaClLoader]', error, event);
                reject(error);
            };

            document.head.appendChild(script);
        });
    },

    /**
     * Check if TweetNaCl is already loaded with utils
     * @returns {boolean} True if loaded with utils
     */
    isLoaded() {
        return !!(window.nacl && window.nacl.util);
    }
};

// Make available globally
window.NaClLoader = NaClLoader;

console.log('%c[NaClLoader] Ready to load TweetNaCl.js', 'color: blue; font-weight: bold');
