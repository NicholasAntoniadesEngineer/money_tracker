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
     * Load TweetNaCl.js library
     * @returns {Promise<Object>} The nacl library object
     */
    async load() {
        // Return existing instance if already loaded
        if (window.nacl) {
            console.log('[NaClLoader] TweetNaCl already loaded');
            return window.nacl;
        }

        console.log('[NaClLoader] Loading TweetNaCl.js from CDN...');

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');

            // Use fast variant for better performance
            script.src = 'https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js';
            script.async = true;
            script.defer = true;

            script.onload = () => {
                console.log('[NaClLoader] ✓ TweetNaCl.js loaded successfully');

                // Verify library is available
                if (!window.nacl) {
                    const error = new Error('TweetNaCl loaded but not available on window object');
                    console.error('[NaClLoader]', error);
                    reject(error);
                    return;
                }

                // Log library version info
                console.log('[NaClLoader] Library info:', {
                    hasBox: !!window.nacl.box,
                    hasSecretbox: !!window.nacl.secretbox,
                    hasHash: !!window.nacl.hash,
                    hasRandomBytes: !!window.nacl.randomBytes,
                    hasUtil: !!window.nacl.util
                });

                resolve(window.nacl);
            };

            script.onerror = (event) => {
                const error = new Error('Failed to load TweetNaCl.js from CDN');
                console.error('[NaClLoader]', error, event);
                reject(error);
            };

            document.head.appendChild(script);
        });
    },

    /**
     * Check if TweetNaCl is already loaded
     * @returns {boolean} True if loaded
     */
    isLoaded() {
        return !!window.nacl;
    }
};

// Make available globally
window.NaClLoader = NaClLoader;

console.log('%c[NaClLoader] Ready to load TweetNaCl.js', 'color: blue; font-weight: bold');
