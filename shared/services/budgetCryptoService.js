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

    // ==================== cross-user share seal / unseal (S7 + SEC-H4) ============
    //
    // Cross-user sharing (BUDGET_E2E_DESIGN.md §2.5 / §7) is the ONLY part of the
    // design that needs new key DISTRIBUTION: the OWNER's budget DEK has to reach a
    // RECIPIENT who holds a DIFFERENT identity.
    //
    // SEC-H4 — the original S7 seal was an ANONYMOUS box: a fresh ephemeral keypair
    // DH'd against the recipient pubkey, with NO owner static identity in the DH and
    // NO context binding. That let a curious server (a) substitute the recipient key
    // and read the DEK, and (b) FORGE a share to a recipient (no proof of origin), and
    // it bound nothing about (owner, recipient, dek_version, share_id) so a seal could
    // be lifted onto another row. The hardened construction below is an AUTHENTICATED
    // static+ephemeral box (X3DH-flavoured) with context-bound key derivation:
    //
    //   DH_ss  = DH(ownerIdentitySecret, recipientPub)   // static-static: AUTHENTICATES
    //                                                     // the owner to the recipient
    //   DH_es  = DH(ephemeralSecret,     recipientPub)   // ephemeral-static: freshness
    //   info   = canonical( owner IK pub, recipient IK pub, owner_id, recipient_id,
    //                       dek_version, share_id )       // CONTEXT BINDING
    //   wrapKey = HKDF( DH_ss || DH_es, info, 32 )
    //   seal    = secretbox( DEK, nonce, wrapKey )
    //
    // On unseal the recipient recomputes DH_ss = DH(recipientSecret, ownerIK) and
    // DH_es = DH(recipientSecret, ephPub), rebuilds `info` from the SAME context it
    // independently knows (the share row), derives the same wrapKey, and secretbox.open
    // succeeds ONLY if every bound value matches AND the static-static leg used the
    // genuine owner identity. The recipient ALSO verifies the bound owner IK equals the
    // PINNED (TOFU) sender static key before returning the DEK. A substituted recipient
    // key, a forged/anonymous seal, a mismatched (owner_id/recipient_id/dek_version/
    // share_id), or a lifted seal therefore ALL fail closed.
    //
    // deriveSharedSecret() is nacl.box.before (X25519 DH + HSalsa20); HKDF over the two
    // DH legs is the standard X3DH KDF shape. Both the ephemeral keygen and the nonce
    // route through the RNG seam, so the gates stay deterministic under a frozen seed.

    // Versioned algorithm tag persisted on the share row. 'v2-auth' = the SEC-H4
    // authenticated, context-bound construction. (The legacy anonymous 'v1' seal is
    // intentionally NOT readable here — see the migration note below.)
    SEAL_ALG: 'v2-auth',
    SEAL_INFO_PREFIX: 'MoneyTracker:BudgetShareSeal:v2',

    /**
     * Build the canonical, context-binding HKDF info string for a share seal.
     * Order + delimiter are fixed and must be byte-identical on seal and unseal.
     * Every value is a stable string: base64 keys and the share's identity/scope.
     * @private
     */
    _sealInfo(ctx) {
        const required = ['ownerIkB64', 'recipientIkB64', 'ownerId', 'recipientId', 'dekVersion', 'shareId'];
        for (const k of required) {
            if (ctx[k] === undefined || ctx[k] === null || ctx[k] === '') {
                throw new Error(`[BudgetCryptoService] seal context missing required field: ${k}`);
            }
        }
        // Pipe-delimited, label=value; '|' and '=' never appear in base64 / uuids / ints.
        return [
            this.SEAL_INFO_PREFIX,
            `ownerIK=${ctx.ownerIkB64}`,
            `recipientIK=${ctx.recipientIkB64}`,
            `owner=${ctx.ownerId}`,
            `recipient=${ctx.recipientId}`,
            `dekVersion=${ctx.dekVersion}`,
            `shareId=${ctx.shareId}`,
        ].join('|');
    },

    /**
     * Seal (authenticated box) the OWNER's DEK to a RECIPIENT's identity public key,
     * binding the owner's static identity (sender auth) AND the share context.
     *
     * @param {Uint8Array} dek - the 32-byte OWNER budget DEK to share
     * @param {Uint8Array|string} recipientPublicKey - the recipient's identity X25519
     *        public key (raw Uint8Array or base64)
     * @param {Object} opts - REQUIRED authenticated-seal parameters (SEC-H4):
     * @param {Uint8Array} opts.ownerSecretKey - the OWNER's identity X25519 secret
     * @param {Uint8Array|string} [opts.ownerPublicKey] - the OWNER's identity X25519
     *        public key (derived from ownerSecretKey if omitted)
     * @param {string} opts.ownerId   - the owner user id (bound into the seal)
     * @param {string} opts.recipientId - the recipient user id (bound into the seal)
     * @param {number|string} opts.dekVersion - the owner budget-DEK generation
     * @param {number|string} opts.shareId  - the data_shares row id
     * @returns {{wrapped_dek:string, wrap_nonce:string, wrap_eph_pub:string,
     *            wrap_owner_ik:string, wrap_alg:string, dek_version:(number|string)}}
     *          all base64 / scalar — the data_shares seal columns
     */
    sealDEKToRecipient(dek, recipientPublicKey, opts) {
        this._assertDek(dek, 'sealDEKToRecipient');
        const cp = this._cp();
        if (!opts || typeof opts !== 'object') {
            throw new Error('[BudgetCryptoService] sealDEKToRecipient: SEC-H4 requires opts {ownerSecretKey, ownerId, recipientId, dekVersion, shareId} — anonymous seals are no longer permitted');
        }
        const recipientPub = (recipientPublicKey instanceof Uint8Array)
            ? recipientPublicKey
            : cp.deserializeKey(recipientPublicKey);
        if (!(recipientPub instanceof Uint8Array) || recipientPub.length !== 32) {
            throw new Error('[BudgetCryptoService] sealDEKToRecipient: recipientPublicKey must be a 32-byte X25519 key (raw or base64)');
        }
        const ownerSecret = opts.ownerSecretKey;
        if (!(ownerSecret instanceof Uint8Array) || ownerSecret.length !== 32) {
            throw new Error('[BudgetCryptoService] sealDEKToRecipient: opts.ownerSecretKey must be a 32-byte X25519 secret key');
        }
        const ownerPub = opts.ownerPublicKey
            ? ((opts.ownerPublicKey instanceof Uint8Array) ? opts.ownerPublicKey : cp.deserializeKey(opts.ownerPublicKey))
            : cp.keyPairFromSecretKey(ownerSecret).publicKey;
        const ownerIkB64 = cp.serializeKey(ownerPub);
        const recipientIkB64 = cp.serializeKey(recipientPub);

        const ctx = {
            ownerIkB64,
            recipientIkB64,
            ownerId: String(opts.ownerId),
            recipientId: String(opts.recipientId),
            dekVersion: opts.dekVersion,
            shareId: opts.shareId,
        };
        const info = this._sealInfo(ctx);

        // Fresh ephemeral keypair per seal (routed through the RNG seam).
        const eph = cp.generateKeyPair();
        // Two DH legs: static-static (owner auth) + ephemeral-static (freshness).
        const dhSs = cp.deriveSharedSecret(ownerSecret, recipientPub);
        const dhEs = cp.deriveSharedSecret(eph.secretKey, recipientPub);
        const wrapKey = this._deriveSealKey(dhSs, dhEs, info);

        const { ciphertext, nonce } = cp.encryptBytes(dek, wrapKey);
        return {
            wrapped_dek: cp.serializeKey(ciphertext),
            wrap_nonce: cp.serializeKey(nonce),
            wrap_eph_pub: cp.serializeKey(eph.publicKey),
            wrap_owner_ik: ownerIkB64,
            wrap_alg: this.SEAL_ALG,
            dek_version: opts.dekVersion,
        };
    },

    /**
     * Unseal (authenticated box-open) a sealed DEK using the RECIPIENT's identity
     * secret, verifying the bound context AND the pinned sender static key.
     *
     * Fails closed on ALL of: wrong recipient, tamper, anonymous/legacy seal (no
     * wrap_owner_ik), a context that does not match the share row, or an owner IK that
     * does not equal the PINNED sender key.
     *
     * @param {Object} sealed - the data_shares seal columns
     *        {wrapped_dek, wrap_nonce, wrap_eph_pub, wrap_owner_ik, wrap_alg, dek_version}
     * @param {Uint8Array} recipientSecretKey - the recipient's identity X25519 secret
     * @param {Object} opts - REQUIRED verification parameters (SEC-H4):
     * @param {Uint8Array|string} opts.expectedOwnerPublicKey - the PINNED (TOFU) owner
     *        identity X25519 public key; the seal's wrap_owner_ik MUST equal this
     * @param {string} opts.ownerId   - expected owner user id (must match the seal ctx)
     * @param {string} opts.recipientId - expected recipient user id (must match)
     * @param {number|string} opts.dekVersion - expected dek generation (must match)
     * @param {number|string} opts.shareId  - expected share id (must match)
     * @returns {Uint8Array} the recovered 32-byte OWNER DEK
     * @throws {Error} on missing fields, wrong recipient, tamper, context mismatch, or
     *         an unpinned/changed sender key
     */
    unsealDEK(sealed, recipientSecretKey, opts) {
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
        if (!opts || typeof opts !== 'object') {
            throw new Error('[BudgetCryptoService] unsealDEK: SEC-H4 requires opts {expectedOwnerPublicKey, ownerId, recipientId, dekVersion, shareId}');
        }
        // CRYPTO_DEEP_REVIEW L-1: dekVersion MUST be supplied by the caller (from the
        // independently-known share row), NEVER defaulted from the seal blob. Binding to
        // an attacker-controllable envelope field would defeat version-pinning. No fallback.
        if (opts.dekVersion === undefined || opts.dekVersion === null) {
            throw new Error('[BudgetCryptoService] unsealDEK: opts.dekVersion is required (no fallback to sealed.dek_version — that field is attacker-controllable)');
        }
        // SEC-H4: refuse a legacy/anonymous seal (no bound owner IK). Such seals are
        // unauthenticated by construction and must be re-sealed by the owner.
        if (typeof sealed.wrap_owner_ik !== 'string' || sealed.wrap_owner_ik.length === 0) {
            throw new Error('[BudgetCryptoService] unsealDEK: seal is missing wrap_owner_ik (legacy/anonymous seal) — fail closed, owner must re-seal');
        }
        const cp = this._cp();

        // (1) The bound owner IK MUST equal the PINNED sender static key. This catches a
        //     curious server that substituted the recipient key (it would have to also
        //     forge an owner IK; that owner IK then won't match the pin) or forged a seal
        //     under a different owner identity.
        const expectedOwnerB64 = (opts.expectedOwnerPublicKey instanceof Uint8Array)
            ? cp.serializeKey(opts.expectedOwnerPublicKey)
            : opts.expectedOwnerPublicKey;
        if (!expectedOwnerB64) {
            throw new Error('[BudgetCryptoService] unsealDEK: opts.expectedOwnerPublicKey (pinned sender key) is required');
        }
        if (sealed.wrap_owner_ik !== expectedOwnerB64) {
            throw new Error('[BudgetCryptoService] unsealDEK: bound owner identity key does not match the pinned sender key — fail closed (possible key substitution / forged share)');
        }

        // (2) Rebuild the context info from what the recipient INDEPENDENTLY knows (the
        //     share row + the recipient's own published IK), NOT from the seal blob, so a
        //     lifted/forged seal whose IDs disagree with the row derives a different key.
        const recipientPub = cp.keyPairFromSecretKey(recipientSecretKey).publicKey;
        const ctx = {
            ownerIkB64: sealed.wrap_owner_ik, // already proven == pinned owner key above
            recipientIkB64: cp.serializeKey(recipientPub),
            ownerId: String(opts.ownerId),
            recipientId: String(opts.recipientId),
            dekVersion: opts.dekVersion, // L-1: caller-supplied only; no seal-blob fallback (guarded above)
            shareId: opts.shareId,
        };
        const info = this._sealInfo(ctx);

        const ownerIk = cp.deserializeKey(sealed.wrap_owner_ik);
        const ephPub = cp.deserializeKey(sealed.wrap_eph_pub);
        const ciphertext = cp.deserializeKey(sealed.wrapped_dek);
        const nonce = cp.deserializeKey(sealed.wrap_nonce);

        // Recompute the two DH legs from the recipient side (DH symmetry).
        const dhSs = cp.deriveSharedSecret(recipientSecretKey, ownerIk);   // == DH(ownerSecret, recipientPub)
        const dhEs = cp.deriveSharedSecret(recipientSecretKey, ephPub);    // == DH(ephSecret,   recipientPub)
        const wrapKey = this._deriveSealKey(dhSs, dhEs, info);

        // Throws on auth failure (wrong recipient / tamper / any context mismatch).
        const dek = cp.decryptBytes(ciphertext, nonce, wrapKey);
        if (!(dek instanceof Uint8Array) || dek.length !== DEK_LENGTH) {
            throw new Error(`[BudgetCryptoService] unsealDEK recovered ${dek && dek.length} bytes, expected ${DEK_LENGTH}`);
        }
        return dek;
    },

    /**
     * Derive the 32-byte seal wrap key from the two DH legs + the context info.
     *
     * Kept SYNCHRONOUS to preserve the existing seal/unseal + S7-transform contract
     * (KeyDerivationService._hkdf is async; the budget transforms are sync). We use a
     * deterministic, domain-separated SHA-512 KDF over (label || DH_ss || DH_es ||
     * info) and take the first 32 bytes as the secretbox key. The full share context
     * is carried in `info`, so the key is unique per (owner, recipient, eph,
     * dek_version, share_id); changing any bound value changes the key, so the seal
     * fails closed on a context mismatch. Both DH legs are required, so the key
     * authenticates the owner (static-static) and is fresh per seal (ephemeral-static).
     * @private
     */
    _deriveSealKey(dhSs, dhEs, info) {
        const cp = this._cp();
        // Domain-separated SHA-512 over (label || DH_ss || DH_es || info);
        // first 32 bytes are the secretbox key.
        const enc = (typeof TextEncoder !== 'undefined')
            ? new TextEncoder()
            : { encode: (s) => Uint8Array.from(Buffer.from(s, 'utf8')) };
        const labelBytes = enc.encode('MoneyTracker:BudgetShareSeal:HKDF:v2|');
        const infoBytes = enc.encode('|' + info);
        const ikm = new Uint8Array(labelBytes.length + dhSs.length + dhEs.length + infoBytes.length);
        let off = 0;
        ikm.set(labelBytes, off); off += labelBytes.length;
        ikm.set(dhSs, off); off += dhSs.length;
        ikm.set(dhEs, off); off += dhEs.length;
        ikm.set(infoBytes, off);
        const digest = cp.hash(ikm); // nacl.hash = SHA-512 (64 bytes)
        return digest.subarray(0, DEK_LENGTH); // 32-byte secretbox key
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
