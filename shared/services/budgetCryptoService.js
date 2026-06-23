/**
 * Budget Crypto Service  (BUDGET_E2E_DESIGN.md — staged plan S1)
 *
 * PURE, STANDALONE crypto wrapper for client-side end-to-end encryption of
 * budget data. No DB, no UI, no read/write-path wiring — those land in S2+.
 *
 * Two-layer key model (design §1.1):
 *   - DEK  — one random 32-byte key per user. Encrypts every budget blob with
 *            NaCl secretbox (XSalsa20-Poly1305).
 *   - KEK  — the user's EXISTING X25519 identity secret. We derive a symmetric
 *            wrap key from it with the existing HKDF and secretbox the DEK under
 *            that key. No second password is introduced.
 *
 * This service REUSES the auth_db encryption primitives verbatim and never
 * reimplements crypto:
 *   - CryptoPrimitivesService.encrypt / decrypt          (string blob, base64 envelope)
 *   - CryptoPrimitivesService.encryptBytes / decryptBytes (raw-bytes DEK wrap)
 *   - CryptoPrimitivesService.randomBytes                (the seedable RNG seam)
 *   - KeyDerivationService._hkdf                         (HKDF for the wrap key)
 *
 * Both nonces route through the RNG seam (CryptoPrimitivesService.randomBytes),
 * so the deterministic test gates can freeze the seed for byte-stable envelopes.
 *
 * Envelope format (design §2.1 / §3.1):
 *   { enc_payload: base64-secretbox-ciphertext,
 *     enc_nonce:   base64-24-byte-nonce,
 *     enc_version: 1 }                 // 1 = encrypted (0 = legacy plaintext)
 *
 * Wrapped-DEK format (design §2.3 budget_dek columns):
 *   { wrapped_dek: base64-secretbox-ciphertext-of-the-32-byte-DEK,
 *     wrap_nonce:  base64-24-byte-nonce }
 *
 * DEK wrap-key derivation (design §1.1):
 *   wrapKey = KeyDerivationService._hkdf(identitySecret, "MoneyTracker:BudgetDEK:v1", 32)
 *
 * NOTE: the info string is passed to _hkdf VERBATIM and already carries the
 * "MoneyTracker:" prefix, exactly as the design specifies. _hkdf auto-derives a
 * deterministic context salt from the info string when none is passed, so no new
 * salt management is introduced.
 */

// The crypto-version tag written into every blob envelope. 0 = legacy plaintext
// (dual-read window, S5+), 1 = encrypted. S1 only ever produces/consumes 1.
const BUDGET_ENC_VERSION = 1;

// HKDF info string for the DEK wrap key. CHANGING THIS BREAKS ALL EXISTING
// WRAPPED DEKs — it is part of the on-disk contract. See design §1.1.
const BUDGET_DEK_WRAP_INFO = 'MoneyTracker:BudgetDEK:v1';

// Size of the Data Encryption Key, in bytes.
const DEK_LENGTH = 32;

const BudgetCryptoService = {
    // Crypto-version tag and wrap-key info string exposed for tests / callers.
    ENC_VERSION: BUDGET_ENC_VERSION,
    WRAP_INFO: BUDGET_DEK_WRAP_INFO,

    /**
     * Resolve the CryptoPrimitivesService. In the browser it is a global; under
     * node (tests) it is wired onto global by the harness. Kept indirect so this
     * module never bundles or duplicates the primitive.
     * @private
     */
    _cp() {
        const cp = (typeof CryptoPrimitivesService !== 'undefined')
            ? CryptoPrimitivesService
            : (typeof globalThis !== 'undefined' ? globalThis.CryptoPrimitivesService : undefined);
        if (!cp) {
            throw new Error('[BudgetCryptoService] CryptoPrimitivesService is not available');
        }
        return cp;
    },

    /**
     * Resolve the KeyDerivationService (HKDF). Same indirection rationale as _cp.
     * @private
     */
    _kdf() {
        const kdf = (typeof KeyDerivationService !== 'undefined')
            ? KeyDerivationService
            : (typeof globalThis !== 'undefined' ? globalThis.KeyDerivationService : undefined);
        if (!kdf) {
            throw new Error('[BudgetCryptoService] KeyDerivationService is not available');
        }
        return kdf;
    },

    // ==================== DEK generation ====================

    /**
     * Generate a fresh 32-byte Data Encryption Key.
     *
     * Routed through CryptoPrimitivesService.randomBytes (the seedable RNG seam),
     * so a frozen seed makes the DEK — and any envelope built from it —
     * byte-stable in the deterministic test gates.
     *
     * @returns {Uint8Array} 32-byte DEK
     */
    generateDEK() {
        const dek = this._cp().randomBytes(DEK_LENGTH);
        if (!(dek instanceof Uint8Array) || dek.length !== DEK_LENGTH) {
            throw new Error(`[BudgetCryptoService] generateDEK produced ${dek && dek.length} bytes, expected ${DEK_LENGTH}`);
        }
        return dek;
    },

    // ==================== Blob encrypt / decrypt ====================

    /**
     * Encrypt a JSON-serializable object into a budget envelope.
     *
     * @param {Object} jsonObject - any JSON-serializable value (the sensitive blob)
     * @param {Uint8Array} dek - 32-byte DEK
     * @returns {{enc_payload: string, enc_nonce: string, enc_version: number}}
     */
    encryptBlob(jsonObject, dek) {
        this._assertDek(dek, 'encryptBlob');
        const plaintext = JSON.stringify(jsonObject);
        const { ciphertext, nonce } = this._cp().encrypt(plaintext, dek);
        return {
            enc_payload: ciphertext,
            enc_nonce: nonce,
            enc_version: BUDGET_ENC_VERSION,
        };
    },

    /**
     * Decrypt a budget envelope back into the original object.
     *
     * Fails closed: a wrong DEK or any tamper (ciphertext/nonce) makes the
     * underlying secretbox.open return null, which CryptoPrimitivesService.decrypt
     * turns into a thrown Error (Poly1305 auth failure) — never silent garbage.
     *
     * @param {{enc_payload: string, enc_nonce: string, enc_version: number}} envelope
     * @param {Uint8Array} dek - 32-byte DEK
     * @returns {Object} the original parsed object
     * @throws {Error} on unknown version, missing fields, auth failure, or bad JSON
     */
    decryptBlob(envelope, dek) {
        this._assertDek(dek, 'decryptBlob');
        if (!envelope || typeof envelope !== 'object') {
            throw new Error('[BudgetCryptoService] decryptBlob: envelope is missing');
        }
        // Verify version (design: "parse + verify version").
        if (envelope.enc_version !== BUDGET_ENC_VERSION) {
            throw new Error(
                `[BudgetCryptoService] decryptBlob: unsupported enc_version ` +
                `${envelope.enc_version} (expected ${BUDGET_ENC_VERSION})`
            );
        }
        if (typeof envelope.enc_payload !== 'string' || typeof envelope.enc_nonce !== 'string') {
            throw new Error('[BudgetCryptoService] decryptBlob: enc_payload/enc_nonce must be base64 strings');
        }
        // Throws on auth failure (wrong key / tamper) — fail closed.
        const plaintext = this._cp().decrypt(envelope.enc_payload, envelope.enc_nonce, dek);
        return JSON.parse(plaintext);
    },

    // ==================== DEK wrap-key derivation ====================

    /**
     * Derive the symmetric wrap key from the identity secret.
     *
     * wrapKey = HKDF(identitySecret, "MoneyTracker:BudgetDEK:v1", 32)
     *
     * Pure function of the identity secret, so every paired device that holds the
     * same identity secret re-derives the SAME wrap key (design §1.1, "why
     * multi-device is free"). Calls the existing _hkdf directly with the literal
     * info string, mirroring the deriveBackupKey/deriveDeviceKey pattern.
     *
     * @param {Uint8Array} identitySecret - the X25519 identity secret (KEK source)
     * @returns {Promise<Uint8Array>} 32-byte wrap key
     */
    async deriveBudgetWrapKey(identitySecret) {
        if (!(identitySecret instanceof Uint8Array) || identitySecret.length === 0) {
            throw new Error('[BudgetCryptoService] deriveBudgetWrapKey: identitySecret must be a non-empty Uint8Array');
        }
        return await this._kdf()._hkdf(identitySecret, BUDGET_DEK_WRAP_INFO, 32);
    },

    // ==================== DEK wrap / unwrap ====================

    /**
     * Wrap (encrypt) the DEK under the identity-derived wrap key.
     *
     * Raw-bytes secretbox over the 32-byte DEK (design §1.1):
     *   wrapKey      = deriveBudgetWrapKey(identitySecret)
     *   {ct, nonce}  = CryptoPrimitivesService.encryptBytes(DEK, wrapKey)
     *
     * @param {Uint8Array} dek - 32-byte DEK to protect
     * @param {Uint8Array} identitySecret - the X25519 identity secret
     * @returns {Promise<{wrapped_dek: string, wrap_nonce: string}>} base64 envelope
     */
    async wrapDEK(dek, identitySecret) {
        this._assertDek(dek, 'wrapDEK');
        const wrapKey = await this.deriveBudgetWrapKey(identitySecret);
        const cp = this._cp();
        const { ciphertext, nonce } = cp.encryptBytes(dek, wrapKey);
        return {
            wrapped_dek: cp.serializeKey(ciphertext),
            wrap_nonce: cp.serializeKey(nonce),
        };
    },

    /**
     * Unwrap (decrypt) the DEK using the identity secret.
     *
     * Fails closed: a wrong identity (=> wrong wrap key) or any tamper makes the
     * raw-bytes secretbox.open return null, which decryptBytes turns into a thrown
     * Error — never a wrong/garbage DEK.
     *
     * @param {{wrapped_dek: string, wrap_nonce: string}} wrapped - base64 envelope
     * @param {Uint8Array} identitySecret - the X25519 identity secret
     * @returns {Promise<Uint8Array>} the recovered 32-byte DEK
     * @throws {Error} on missing fields, wrong identity, or tamper
     */
    async unwrapDEK(wrapped, identitySecret) {
        if (!wrapped || typeof wrapped !== 'object') {
            throw new Error('[BudgetCryptoService] unwrapDEK: wrapped envelope is missing');
        }
        if (typeof wrapped.wrapped_dek !== 'string' || typeof wrapped.wrap_nonce !== 'string') {
            throw new Error('[BudgetCryptoService] unwrapDEK: wrapped_dek/wrap_nonce must be base64 strings');
        }
        const wrapKey = await this.deriveBudgetWrapKey(identitySecret);
        const cp = this._cp();
        const ciphertext = cp.deserializeKey(wrapped.wrapped_dek);
        const nonce = cp.deserializeKey(wrapped.wrap_nonce);
        // Throws on auth failure (wrong identity / tamper) — fail closed.
        const dek = cp.decryptBytes(ciphertext, nonce, wrapKey);
        if (!(dek instanceof Uint8Array) || dek.length !== DEK_LENGTH) {
            throw new Error(`[BudgetCryptoService] unwrapDEK recovered ${dek && dek.length} bytes, expected ${DEK_LENGTH}`);
        }
        return dek;
    },

    // ==================== helpers ====================

    /**
     * Validate a DEK argument.
     * @private
     */
    _assertDek(dek, where) {
        if (!(dek instanceof Uint8Array) || dek.length !== DEK_LENGTH) {
            throw new Error(`[BudgetCryptoService] ${where}: dek must be a ${DEK_LENGTH}-byte Uint8Array`);
        }
    },
};

if (typeof window !== 'undefined') {
    window.BudgetCryptoService = BudgetCryptoService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BudgetCryptoService;
}
