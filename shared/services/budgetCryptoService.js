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

    // ==================== cross-user share seal / unseal (S7) ====================
    //
    // Cross-user sharing (BUDGET_E2E_DESIGN.md §2.5 / §7) is the ONLY part of the
    // design that needs new key DISTRIBUTION: the OWNER's budget DEK has to reach a
    // RECIPIENT who holds a DIFFERENT identity. We do NOT hand-roll this — it is the
    // standard NaCl box (authenticated public-key encryption) built from the existing
    // primitives:
    //   seal   = secretbox(DEK, nonce, deriveSharedSecret(ephSecret, recipientPub))
    //   unseal = secretbox.open(ct, nonce, deriveSharedSecret(recipientSecret, ephPub))
    // deriveSharedSecret() is nacl.box.before (X25519 DH + HSalsa20), exactly what
    // nacl.box / nacl.box.open use internally, so seal(eph -> recipientPub) and
    // unseal(recipientSecret <- ephPub) agree (Diffie-Hellman symmetry). A FRESH
    // ephemeral keypair per seal means the wrap key is unique per share and forward
    // of the ephemeral secret (which is never stored). Both the ephemeral keygen and
    // the nonce route through the RNG seam, so the gates are deterministic.

    /**
     * Seal (box-encrypt) the OWNER's DEK to a RECIPIENT's identity public key.
     *
     * @param {Uint8Array} dek - the 32-byte OWNER budget DEK to share
     * @param {Uint8Array|string} recipientPublicKey - the recipient's identity
     *        X25519 public key (raw Uint8Array, or base64 as returned by
     *        HistoricalKeysService.getCurrentKey / identity_keys.public_key)
     * @returns {{wrapped_dek: string, wrap_nonce: string, wrap_eph_pub: string}}
     *          all base64 — the three data_shares columns
     */
    sealDEKToRecipient(dek, recipientPublicKey) {
        this._assertDek(dek, 'sealDEKToRecipient');
        const cp = this._cp();
        const recipientPub = (recipientPublicKey instanceof Uint8Array)
            ? recipientPublicKey
            : cp.deserializeKey(recipientPublicKey);
        if (!(recipientPub instanceof Uint8Array) || recipientPub.length !== 32) {
            throw new Error('[BudgetCryptoService] sealDEKToRecipient: recipientPublicKey must be a 32-byte X25519 key (raw or base64)');
        }
        // Fresh ephemeral keypair per seal (routed through the RNG seam).
        const eph = cp.generateKeyPair();
        // box(DEK) = secretbox(DEK, nonce, DH(ephSecret, recipientPub)). encryptBytes
        // generates the nonce via the RNG seam and returns raw-byte ciphertext+nonce.
        const sharedKey = cp.deriveSharedSecret(eph.secretKey, recipientPub);
        const { ciphertext, nonce } = cp.encryptBytes(dek, sharedKey);
        return {
            wrapped_dek: cp.serializeKey(ciphertext),
            wrap_nonce: cp.serializeKey(nonce),
            wrap_eph_pub: cp.serializeKey(eph.publicKey),
        };
    },

    /**
     * Unseal (box-open) a sealed DEK using the RECIPIENT's identity secret.
     *
     * Fails closed: a wrong identity secret (=> wrong DH shared key) or any tamper
     * makes secretbox.open return null, which decryptBytes turns into a thrown Error
     * — never a wrong/garbage DEK. So a NON-recipient cannot recover the DEK.
     *
     * @param {{wrapped_dek: string, wrap_nonce: string, wrap_eph_pub: string}} sealed
     *        the three base64 data_shares columns
     * @param {Uint8Array} recipientSecretKey - the recipient's identity X25519 secret
     * @returns {Uint8Array} the recovered 32-byte OWNER DEK
     * @throws {Error} on missing fields, wrong recipient, or tamper
     */
    unsealDEK(sealed, recipientSecretKey) {
        if (!sealed || typeof sealed !== 'object') {
            throw new Error('[BudgetCryptoService] unsealDEK: sealed envelope is missing');
        }
        if (typeof sealed.wrapped_dek !== 'string' ||
            typeof sealed.wrap_nonce !== 'string' ||
            typeof sealed.wrap_eph_pub !== 'string') {
            throw new Error('[BudgetCryptoService] unsealDEK: wrapped_dek/wrap_nonce/wrap_eph_pub must be base64 strings');
        }
        if (!(recipientSecretKey instanceof Uint8Array) || recipientSecretKey.length !== 32) {
            throw new Error('[BudgetCryptoService] unsealDEK: recipientSecretKey must be a 32-byte X25519 secret key');
        }
        const cp = this._cp();
        const ciphertext = cp.deserializeKey(sealed.wrapped_dek);
        const nonce = cp.deserializeKey(sealed.wrap_nonce);
        const ephPub = cp.deserializeKey(sealed.wrap_eph_pub);
        const sharedKey = cp.deriveSharedSecret(recipientSecretKey, ephPub);
        // Throws on auth failure (wrong recipient / tamper) — fail closed.
        const dek = cp.decryptBytes(ciphertext, nonce, sharedKey);
        if (!(dek instanceof Uint8Array) || dek.length !== DEK_LENGTH) {
            throw new Error(`[BudgetCryptoService] unsealDEK recovered ${dek && dek.length} bytes, expected ${DEK_LENGTH}`);
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
