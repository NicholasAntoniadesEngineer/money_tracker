/**
 * Budget Key Service  (BUDGET_E2E_DESIGN.md — staged plan S2)
 *
 * DEK bootstrap / fetch + in-memory session cache for client-side end-to-end
 * encryption of budget data. This is the stateful, environment-aware companion to
 * the PURE BudgetCryptoService (S1):
 *   - BudgetCryptoService  = crypto only (generate/wrap/unwrap/encrypt/decrypt).
 *   - BudgetKeyService     = "where does the DEK come from this session?" — talks to
 *                            the budget_dek table (via DatabaseService) and the
 *                            identity secret (via KeyStorageService), caches the
 *                            unwrapped DEK in memory, and fails closed when locked.
 *
 * It does NOT wire the budget read/write path (transformMonthToDatabase etc.) —
 * that is S3+. It only makes a DEK available.
 *
 * Two-layer key model (design §1.1):
 *   - DEK  — one random 32-byte key per user, stored server-side ONLY as ciphertext
 *            wrapped under the identity (the budget_dek row).
 *   - KEK  — the user's EXISTING X25519 identity secret (KeyStorageService
 *            .getIdentityKeys(userId).secretKey, a Uint8Array). No second password.
 *
 * Why multi-device is free (design §1.1, §7): the wrap key is a pure function of the
 * identity secret, and the pairing flow already transfers the identity secret to a
 * new device. So any paired device re-derives the SAME wrap key, fetches the one
 * budget_dek row, and unwraps the SAME DEK. This service therefore performs NO key
 * distribution of its own — it just bootstraps-or-fetches the single wrapped row.
 *
 * budget_dek row (design §2.3):
 *   { user_id PK, wrapped_dek TEXT, wrap_nonce TEXT, dek_version INT, created_at, updated_at }
 *
 * Fail-closed posture (design §3.3): if the identity is locked/absent, or the DB
 * row cannot be unwrapped, getBudgetDEK()/ensureBudgetDEK() THROW a typed error
 * (BudgetKeyError, an EncryptionError subclass) rather than returning null or a
 * garbage key. A caller must never silently fall back to plaintext.
 *
 * Dependency resolution: like BudgetCryptoService, runtime deps are resolved
 * indirectly (globals in the browser; injectable for the node gates) so this module
 * never bundles DatabaseService/KeyStorageService/BudgetCryptoService and the
 * deterministic test gates can substitute in-memory fakes.
 */

// budget_dek table name (design §2.3). Hard-coded (not via DatabaseService config)
// to keep this module free of config coupling; it is the canonical name in
// database/setup/fresh-install-complete.sql + apply-budget-dek.sql.
const BUDGET_DEK_TABLE = 'budget_dek';

// dek_version written on first bootstrap. 1 = the only generation today; the column
// reserves space for the future per-epoch forward-secrecy re-key (design §7).
const BUDGET_DEK_VERSION = 1;

// Columns fetched from a budget_dek row.
const BUDGET_DEK_SELECT = 'user_id,wrapped_dek,wrap_nonce,dek_version,created_at';

// Postgres unique-violation SQLSTATE — surfaced by DatabaseService as error.code.
// A POST that races a concurrent bootstrap hits the user_id PRIMARY KEY and returns
// this; we treat it as "someone else just bootstrapped" and re-fetch + unwrap.
const PG_UNIQUE_VIOLATION = '23505';

/**
 * Typed error for budget-DEK access failures. Subclasses the auth_db EncryptionError
 * when it is available (house convention: .code + .recoverable), else falls back to a
 * plain Error carrying the same fields so callers can branch on .code uniformly.
 *
 * Codes:
 *   - 'NO_IDENTITY'       : no local identity record at all (not set up / wiped).      recoverable
 *   - 'IDENTITY_LOCKED'   : identity present but unreadable this session.              recoverable
 *   - 'DEK_UNWRAP_FAILED' : the wrapped DEK exists but does not unwrap (wrong identity
 *                           / tamper) — a hard integrity failure.                     not recoverable
 *   - 'DB_ERROR'          : a budget_dek query failed.                                not recoverable
 *   - 'NOT_AUTHENTICATED' : no authenticated user id was supplied.                    recoverable
 *   - 'DEK_NOT_LOADED'    : getBudgetDEK() called before a successful ensureBudgetDEK. recoverable
 */
function makeBudgetKeyError(message, code, recoverable) {
    const EE = (typeof EncryptionError !== 'undefined')
        ? EncryptionError
        : (typeof globalThis !== 'undefined' ? globalThis.EncryptionError : undefined);
    let err;
    if (typeof EE === 'function') {
        err = new EE(message, code, !!recoverable);
    } else {
        err = new Error(message);
        err.code = code;
        err.recoverable = !!recoverable;
    }
    err.name = 'BudgetKeyError';
    return err;
}

const BudgetKeyService = {
    // Public constants exposed for tests / callers.
    TABLE: BUDGET_DEK_TABLE,
    DEK_VERSION: BUDGET_DEK_VERSION,

    // ---- in-memory session cache (design §1.1 "cache in-memory for the session") ----
    // Cleared on lock/logout via clearCache(). Keyed by user_id so a re-login as a
    // different user never reuses the previous DEK.
    _cachedDek: null,          // Uint8Array | null
    _cachedUserId: null,       // string | null

    // ---- injectable dependency seams (browser: globals; node gates: setDependencies) ----
    _deps: null,               // { databaseService, keyStorageService, budgetCryptoService } | null

    /**
     * Inject dependencies (test seam). Pass any subset; unset deps fall back to the
     * global-resolution path. Returns the prior _deps so a test can restore it.
     */
    setDependencies(deps) {
        const prev = this._deps;
        this._deps = deps || null;
        return prev;
    },

    /**
     * Resolve DatabaseService: injected dep first, else the browser/global singleton.
     * @private
     */
    _db() {
        const injected = this._deps && this._deps.databaseService;
        const db = injected
            || (typeof DatabaseService !== 'undefined' ? DatabaseService
                : (typeof globalThis !== 'undefined' ? globalThis.DatabaseService : undefined));
        if (!db) throw makeBudgetKeyError('[BudgetKeyService] DatabaseService is not available', 'DB_ERROR', false);
        return db;
    },

    /**
     * Resolve KeyStorageService (identity-secret source).
     * @private
     */
    _ks() {
        const injected = this._deps && this._deps.keyStorageService;
        const ks = injected
            || (typeof KeyStorageService !== 'undefined' ? KeyStorageService
                : (typeof globalThis !== 'undefined' ? globalThis.KeyStorageService : undefined));
        if (!ks) throw makeBudgetKeyError('[BudgetKeyService] KeyStorageService is not available', 'IDENTITY_LOCKED', true);
        return ks;
    },

    /**
     * Resolve BudgetCryptoService (the pure S1 crypto wrapper).
     * @private
     */
    _bcs() {
        const injected = this._deps && this._deps.budgetCryptoService;
        const bcs = injected
            || (typeof BudgetCryptoService !== 'undefined' ? BudgetCryptoService
                : (typeof globalThis !== 'undefined' ? globalThis.BudgetCryptoService : undefined));
        if (!bcs) throw makeBudgetKeyError('[BudgetKeyService] BudgetCryptoService is not available', 'DB_ERROR', false);
        return bcs;
    },

    // ==================== identity secret ====================

    /**
     * Fetch the X25519 identity secret as a Uint8Array, mapping the
     * KeyStorageService outcomes onto the fail-closed contract:
     *   - null record           -> NO_IDENTITY       (recoverable: set up / restore)
     *   - WRAP_KEY_UNAVAILABLE  -> IDENTITY_LOCKED   (recoverable: future session)
     *   - IDENTITY_UNWRAP_FAILED-> IDENTITY_LOCKED   (recoverable: future session)
     * @private
     * @returns {Promise<Uint8Array>} the identity secretKey
     * @throws {BudgetKeyError}
     */
    async _getIdentitySecret(userId) {
        let identityKeys;
        try {
            identityKeys = await this._ks().getIdentityKeys(userId);
        } catch (err) {
            // KeyStorageService throws typed errors for "present but unreadable".
            if (err && (err.code === 'IDENTITY_UNWRAP_FAILED' || err.code === 'WRAP_KEY_UNAVAILABLE')) {
                throw makeBudgetKeyError(
                    '[BudgetKeyService] identity is locked — cannot unwrap the budget DEK this session',
                    'IDENTITY_LOCKED', true
                );
            }
            throw err; // unexpected — propagate
        }
        if (!identityKeys || !identityKeys.secretKey) {
            throw makeBudgetKeyError(
                '[BudgetKeyService] no local identity — budget encryption is unavailable',
                'NO_IDENTITY', true
            );
        }
        const secret = identityKeys.secretKey;
        if (!(secret instanceof Uint8Array) || secret.length === 0) {
            throw makeBudgetKeyError(
                '[BudgetKeyService] identity secretKey must be a non-empty Uint8Array',
                'IDENTITY_LOCKED', true
            );
        }
        return secret;
    },

    // ==================== budget_dek row I/O ====================

    /**
     * Fetch the single budget_dek row for a user (or null if none).
     * @private
     * @returns {Promise<{wrapped_dek:string, wrap_nonce:string, dek_version:number}|null>}
     * @throws {BudgetKeyError} on a DB error (NOT on "no row" — that returns null)
     */
    async _fetchRow(userId) {
        const { data, error } = await this._db().querySelect(BUDGET_DEK_TABLE, {
            select: BUDGET_DEK_SELECT,
            filter: { user_id: userId },
            limit: 1,
        });
        if (error) {
            throw makeBudgetKeyError(
                `[BudgetKeyService] budget_dek SELECT failed: ${error.message || error.code || 'unknown'}`,
                'DB_ERROR', false
            );
        }
        return (Array.isArray(data) && data.length > 0) ? data[0] : null;
    },

    /**
     * Unwrap a fetched row into a DEK using the identity secret. Wraps a unwrap
     * (auth) failure into the typed DEK_UNWRAP_FAILED.
     * @private
     * @returns {Promise<Uint8Array>}
     * @throws {BudgetKeyError}
     */
    async _unwrapRow(row, identitySecret) {
        try {
            return await this._bcs().unwrapDEK(
                { wrapped_dek: row.wrapped_dek, wrap_nonce: row.wrap_nonce },
                identitySecret
            );
        } catch (err) {
            throw makeBudgetKeyError(
                `[BudgetKeyService] stored budget DEK could not be unwrapped: ${err && err.message}`,
                'DEK_UNWRAP_FAILED', false
            );
        }
    },

    // ==================== public API ====================

    /**
     * Ensure a budget DEK exists for the user and is loaded into the session cache,
     * returning it.
     *
     * Flow (design §6.2, §7):
     *   1. If a DEK is already cached for THIS user, return it (idempotent).
     *   2. Resolve the identity secret (fail closed if locked/absent).
     *   3. SELECT the budget_dek row.
     *      - row present  -> unwrap with the identity secret -> cache + return.
     *      - no row       -> generate a DEK, wrap under the identity, INSERT,
     *                        cache + return.
     *   4. Race tolerance: if the INSERT loses to a concurrent bootstrap (PK unique
     *      violation, code 23505), re-fetch the now-present row and unwrap it — both
     *      racers converge on the SAME DEK (it is the SAME wrapped row).
     *
     * @param {string} userId - the authenticated user id (RLS scopes the row to them)
     * @returns {Promise<Uint8Array>} the 32-byte DEK
     * @throws {BudgetKeyError} NOT_AUTHENTICATED / NO_IDENTITY / IDENTITY_LOCKED /
     *                          DEK_UNWRAP_FAILED / DB_ERROR
     */
    async ensureBudgetDEK(userId) {
        if (!userId || typeof userId !== 'string') {
            throw makeBudgetKeyError('[BudgetKeyService] ensureBudgetDEK: a user id is required', 'NOT_AUTHENTICATED', true);
        }
        // 1. session cache hit.
        if (this._cachedDek && this._cachedUserId === userId) {
            return this._cachedDek;
        }
        // A different user is logging in — drop any stale cached DEK first.
        if (this._cachedUserId && this._cachedUserId !== userId) {
            this.clearCache();
        }

        // 2. identity secret (fail closed).
        const identitySecret = await this._getIdentitySecret(userId);

        // 3. existing row?
        const existing = await this._fetchRow(userId);
        if (existing) {
            const dek = await this._unwrapRow(existing, identitySecret);
            return this._cache(userId, dek);
        }

        // 3b. bootstrap: generate -> wrap -> INSERT.
        const bcs = this._bcs();
        const dek = bcs.generateDEK();
        const wrapped = await bcs.wrapDEK(dek, identitySecret);

        const { error } = await this._db().queryInsert(BUDGET_DEK_TABLE, {
            user_id: userId,
            wrapped_dek: wrapped.wrapped_dek,
            wrap_nonce: wrapped.wrap_nonce,
            dek_version: BUDGET_DEK_VERSION,
        });

        if (error) {
            // 4. concurrent-bootstrap race: another device/tab inserted first. The
            // user_id PRIMARY KEY rejected our INSERT (23505). Re-fetch the winner's
            // row and unwrap it — both converge on the same DEK.
            if (error.code === PG_UNIQUE_VIOLATION) {
                const raced = await this._fetchRow(userId);
                if (!raced) {
                    // Extremely unlikely (row vanished between conflict and re-fetch).
                    throw makeBudgetKeyError(
                        '[BudgetKeyService] bootstrap race: conflict reported but no row found on re-fetch',
                        'DB_ERROR', false
                    );
                }
                const racedDek = await this._unwrapRow(raced, identitySecret);
                return this._cache(userId, racedDek);
            }
            throw makeBudgetKeyError(
                `[BudgetKeyService] budget_dek INSERT failed: ${error.message || error.code || 'unknown'}`,
                'DB_ERROR', false
            );
        }

        // Our INSERT won. The DEK we generated is authoritative (it IS what we just
        // wrapped and stored).
        return this._cache(userId, dek);
    },

    /**
     * Return the cached DEK for the session.
     *
     * Unlike ensureBudgetDEK this performs NO I/O and NO bootstrap: it is the cheap
     * accessor for code that already ran ensureBudgetDEK at session start. It throws
     * (fail closed) if no DEK is loaded for this user, or if a different user is
     * passed than the one cached.
     *
     * @param {string} userId - the authenticated user id the DEK must belong to
     * @returns {Uint8Array} the cached 32-byte DEK
     * @throws {BudgetKeyError} DEK_NOT_LOADED / NOT_AUTHENTICATED
     */
    getBudgetDEK(userId) {
        if (!userId || typeof userId !== 'string') {
            throw makeBudgetKeyError('[BudgetKeyService] getBudgetDEK: a user id is required', 'NOT_AUTHENTICATED', true);
        }
        if (!this._cachedDek || this._cachedUserId !== userId) {
            throw makeBudgetKeyError(
                '[BudgetKeyService] budget DEK is not loaded — call ensureBudgetDEK() first (locked or not bootstrapped)',
                'DEK_NOT_LOADED', true
            );
        }
        return this._cachedDek;
    },

    /**
     * Whether a DEK is currently cached for the given user.
     * @param {string} userId
     * @returns {boolean}
     */
    hasBudgetDEK(userId) {
        return !!this._cachedDek && this._cachedUserId === userId;
    },

    /**
     * Clear the in-memory DEK cache. Call on lock / logout / account switch so a
     * subsequent session must re-fetch + re-unwrap (mirrors DatabaseService.clearCache
     * and the identity-key lock discipline). Best-effort wipes the key bytes.
     */
    clearCache() {
        if (this._cachedDek instanceof Uint8Array) {
            this._cachedDek.fill(0); // best-effort zeroize before dropping the reference
        }
        this._cachedDek = null;
        this._cachedUserId = null;
    },

    /**
     * Store + return the DEK in the session cache.
     * @private
     */
    _cache(userId, dek) {
        this._cachedDek = dek;
        this._cachedUserId = userId;
        return dek;
    },
};

if (typeof window !== 'undefined') {
    window.BudgetKeyService = BudgetKeyService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BudgetKeyService;
}
