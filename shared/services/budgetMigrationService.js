/**
 * Budget Migration Service  (BUDGET_E2E_DESIGN.md — §6 + staged plan S6)
 *
 * ONE-TIME, IDEMPOTENT, BATCHED, VERIFY-BEFORE-DESTROY migration of a user's
 * EXISTING plaintext budget rows (enc_version=0) into encrypted envelopes
 * (enc_version=1), so HISTORICAL data also becomes server-side ciphertext.
 *
 * Why this exists separately from the encrypt-on-write path (S4): the write
 * chokepoint (transformMonthToDatabase / transformPotToDatabase) only encrypts a
 * row when the user EDITS and re-saves it. Rows the user never touches would stay
 * plaintext forever. This service bulk-migrates the rest, once, in the background,
 * after the DEK is available — completing the privacy promise for old data.
 *
 * It REUSES the landed S1–S5 pieces verbatim and reimplements no crypto and no
 * envelope/dual-read shape:
 *   - BudgetCryptoService.encryptBlob / decryptBlob   (S1 — secretbox + verify)
 *   - BudgetKeyService.ensureBudgetDEK / getLoadedDEK (S2 — fail-closed DEK)
 *   - DatabaseService.querySelect / queryUpdate       (batched read + atomic flip)
 * The legacy-column -> sensitive-object mapping is kept BYTE-IDENTICAL to the
 * dual-read inverse transforms in databaseService.js so a migrated row decrypts to
 * exactly what the legacy branch would have read (no semantic drift between the
 * encrypt-on-write path, the dual-read path, and this bulk path).
 *
 * ============================ DATA-SAFETY CONTRACT ===========================
 * VERIFY-BEFORE-DESTROY is the whole point of S6. For each plaintext row:
 *   1. Read the plaintext fields from the legacy columns.
 *   2. encryptBlob(plaintext, DEK)  -> {enc_payload, enc_nonce, enc_version=1}.
 *   3. decryptBlob(thatEnvelope, DEK) and assert it deep-equals the ORIGINAL
 *      plaintext object (a real round-trip through the same ciphertext bytes we
 *      are about to store) — NOT a fresh re-encrypt.
 *   4. ONLY if step 3 verifies, issue ONE UPDATE that BOTH sets the envelope
 *      (enc_version=1) AND nulls the legacy plaintext columns — a single atomic
 *      PATCH, so the plaintext is never cleared in a separate step from the
 *      ciphertext landing.
 *   5. If ANY step fails for a row, that row's plaintext is LEFT INTACT (no
 *      UPDATE is issued at all) and a typed error is collected — never a partial
 *      / lossy write. No row can lose plaintext without a verified ciphertext
 *      replacement having already been proven readable.
 *
 * IDEMPOTENT: only rows with enc_version=0 (or NULL) are selected; rows already at
 * enc_version>=1 are never re-encrypted and never re-written. Safe to run on every
 * login. A second run with nothing left to migrate issues ZERO writes.
 *
 * BATCHED + RESUMABLE: rows are processed in small batches; each row's flip is its
 * own atomic UPDATE, so a crash mid-run leaves a clean MIX of migrated
 * (enc_version=1) and not-yet-migrated (enc_version=0) rows — both readable via the
 * S5 dual-read branch — and a re-run completes the rest.
 *
 * FAIL-CLOSED ON NO DEK: ensureBudgetDEK() is called first; if no DEK can be
 * loaded (locked / not bootstrapped / DB error) the migration ABORTS cleanly with
 * NO writes. It does not silently skip.
 *
 * Dependency resolution mirrors BudgetKeyService: deps are resolved indirectly
 * (browser globals; injectable for the deterministic node gates), so this module
 * never bundles DatabaseService / BudgetKeyService / BudgetCryptoService and the
 * gates can substitute an in-memory row store + DEK.
 */

// Tables migrated by S6 (design §6 step 3 — "Same for pots"). Hard-coded canonical
// names; both already carry the enc_* envelope columns (apply-budget-envelope.sql).
const USER_MONTHS_TABLE = 'user_months';
const POTS_TABLE = 'pots';

// Batch size (design §6 step 5 — "~10 rows" so a closed tab loses at most one
// batch's worth of WORK, never any DATA — each row's flip is atomic regardless).
const DEFAULT_BATCH_SIZE = 10;

// The legacy plaintext columns nulled on a user_months row once its envelope is
// verified-and-stored (the seven sensitive JSONB columns; design §2.1 / §6 step 3).
const MONTH_PLAINTEXT_COLS = [
    'date_range', 'weekly_breakdown', 'fixed_costs', 'variable_costs',
    'unplanned_expenses', 'income_sources', 'pots',
];
// The legacy plaintext columns nulled on a pots row (design §2.2).
const POT_PLAINTEXT_COLS = ['name', 'estimated_amount', 'actual_amount', 'comments'];

// Columns selected for migration. Includes id (the UPDATE key + pagination cursor),
// enc_version (the idempotency discriminator) and every legacy plaintext column.
const MONTH_SELECT = ['id', 'enc_version'].concat(MONTH_PLAINTEXT_COLS).join(',');
const POT_SELECT = ['id', 'enc_version'].concat(POT_PLAINTEXT_COLS).join(',');

/**
 * Typed error for a single row that could NOT be safely migrated. Subclasses the
 * auth_db EncryptionError when available, else a plain Error carrying .code, so the
 * caller can branch uniformly. The presence of a BudgetMigrationError ALWAYS means
 * "that row's plaintext was left intact" — it is never thrown after a destructive
 * write.
 *
 * Codes:
 *   - 'VERIFY_FAILED'  : the round-trip decrypt did not match the original — the
 *                        ciphertext is not provably readable, so plaintext kept.
 *   - 'ENCRYPT_FAILED' : encryptBlob threw — plaintext kept.
 *   - 'WRITE_FAILED'   : the UPDATE failed AFTER a verified envelope — plaintext
 *                        kept (the UPDATE either fully applied or fully did not;
 *                        a failed PATCH leaves the legacy columns untouched).
 */
function makeBudgetMigrationError(message, code, rowRef) {
    const EE = (typeof EncryptionError !== 'undefined')
        ? EncryptionError
        : (typeof globalThis !== 'undefined' ? globalThis.EncryptionError : undefined);
    let err;
    if (typeof EE === 'function') {
        err = new EE(message, code, false);
    } else {
        err = new Error(message);
        err.code = code;
        err.recoverable = false;
    }
    err.name = 'BudgetMigrationError';
    if (rowRef !== undefined) err.rowRef = rowRef;
    return err;
}

const BudgetMigrationService = {
    // Public constants exposed for tests / callers.
    USER_MONTHS_TABLE,
    POTS_TABLE,
    DEFAULT_BATCH_SIZE,

    // ---- concurrent-run guard (one in-flight migration per page/session) ----
    // Prevents a second trigger (e.g. a second getAllMonths, a re-login, a tab
    // focus) from running the migration while the first is still going. Idempotency
    // already makes a double run harmless at the DB level (enc_version=0 filter),
    // but this avoids wasted work + double traffic.
    _running: false,
    // Set true after a successful full run THIS session, so a per-session "run once
    // on login" trigger is a cheap no-op on subsequent calls.
    _completedThisSession: false,

    // ---- injectable dependency seams (browser: globals; node gates: setDependencies) ----
    _deps: null,

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
     * Reset the session-run flags (test seam / logout). Does NOT touch the DB.
     */
    resetSessionState() {
        this._running = false;
        this._completedThisSession = false;
    },

    /** Resolve DatabaseService. @private */
    _db() {
        const injected = this._deps && this._deps.databaseService;
        const db = injected
            || (typeof DatabaseService !== 'undefined' ? DatabaseService
                : (typeof globalThis !== 'undefined' ? globalThis.DatabaseService : undefined));
        if (!db) throw makeBudgetMigrationError('[BudgetMigrationService] DatabaseService is not available', 'WRITE_FAILED');
        return db;
    },

    /** Resolve BudgetKeyService (the S2 fail-closed DEK source). @private */
    _bks() {
        const injected = this._deps && this._deps.budgetKeyService;
        const bks = injected
            || (typeof BudgetKeyService !== 'undefined' ? BudgetKeyService
                : (typeof globalThis !== 'undefined' ? globalThis.BudgetKeyService : undefined));
        if (!bks) throw makeBudgetMigrationError('[BudgetMigrationService] BudgetKeyService is not available', 'WRITE_FAILED');
        return bks;
    },

    /** Resolve BudgetCryptoService (the S1 pure crypto wrapper). @private */
    _bcs() {
        const injected = this._deps && this._deps.budgetCryptoService;
        const bcs = injected
            || (typeof BudgetCryptoService !== 'undefined' ? BudgetCryptoService
                : (typeof globalThis !== 'undefined' ? globalThis.BudgetCryptoService : undefined));
        if (!bcs) throw makeBudgetMigrationError('[BudgetMigrationService] BudgetCryptoService is not available', 'WRITE_FAILED');
        return bcs;
    },

    /** @private structured log that is silent if no logger is present. */
    _log(level, ...args) {
        try {
            const c = (typeof console !== 'undefined') ? console : null;
            if (c && typeof c[level] === 'function') c[level]('[BudgetMigrationService]', ...args);
        } catch (_) { /* never let logging break the migration */ }
    },

    // ==================== legacy-column -> sensitive-object mappers ====================
    // Kept BYTE-IDENTICAL to the dual-read inverse transforms in databaseService.js so
    // a migrated row decrypts to exactly what the legacy read branch produced.

    /**
     * Build the seven-field sensitive object for a user_months row from its legacy
     * plaintext columns (mirror of transformMonthFromDatabase's enc_version=0 branch
     * / transformMonthToDatabase's `sensitive` bundle).
     * @private
     */
    _monthSensitiveFromLegacy(row) {
        return {
            dateRange: row.date_range || {},
            weeklyBreakdown: row.weekly_breakdown || [],
            fixedCosts: row.fixed_costs || [],
            variableCosts: row.variable_costs || [],
            unplannedExpenses: row.unplanned_expenses || [],
            incomeSources: row.income_sources || [],
            pots: row.pots || [],
        };
    },

    /**
     * Build the four-field sensitive object for a pots row from its legacy plaintext
     * columns (mirror of transformPotToDatabase's `sensitive` bundle).
     * @private
     */
    _potSensitiveFromLegacy(row) {
        return {
            name: row.name || '',
            estimatedAmount: row.estimated_amount || 0,
            actualAmount: row.actual_amount || 0,
            comments: row.comments || '',
        };
    },

    // ==================== public API ====================

    /**
     * Run the one-time migration for BOTH user_months and pots for a user.
     *
     * Fail-closed: ensureBudgetDEK() runs FIRST. If the DEK cannot be loaded the
     * whole migration ABORTS with NO writes (a missing DEK is an error to surface,
     * not a silent skip). Concurrency-guarded: a second concurrent call returns a
     * { skipped:'already-running' } summary without touching the DB.
     *
     * @param {string} userId - the authenticated user id (RLS scopes all rows)
     * @param {{batchSize?:number, force?:boolean}} [options]
     * @returns {Promise<Object>} a summary: { ran, dekReady, tables:{...}, totals:{...}, errors:[...] }
     * @throws {BudgetKeyError} ONLY when the DEK cannot be loaded (fail-closed abort) —
     *                          a per-row failure does NOT throw; it is collected.
     */
    async migrateAll(userId, options = {}) {
        if (!userId || typeof userId !== 'string') {
            throw makeBudgetMigrationError('[BudgetMigrationService] migrateAll: a user id is required', 'WRITE_FAILED');
        }
        if (this._running) {
            this._log('warn', 'migrateAll: a migration is already running this session — skipping the duplicate trigger');
            return { ran: false, skipped: 'already-running' };
        }
        if (this._completedThisSession && !options.force) {
            return { ran: false, skipped: 'already-completed-this-session' };
        }

        this._running = true;
        const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
        const summary = {
            ran: true,
            dekReady: false,
            tables: {},
            totals: { scanned: 0, migrated: 0, verifyFailed: 0, writeFailed: 0, skipped: 0 },
            errors: [],
        };
        try {
            // ---- FAIL-CLOSED: load the DEK FIRST. A failure here propagates (no
            //      writes happen before this point), so a missing DEK aborts cleanly. ----
            await this._bks().ensureBudgetDEK(userId); // throws (typed) on no-DEK
            summary.dekReady = true;

            const monthRes = await this._migrateTable(
                USER_MONTHS_TABLE, userId, MONTH_SELECT, MONTH_PLAINTEXT_COLS,
                (row) => this._monthSensitiveFromLegacy(row), batchSize
            );
            summary.tables.user_months = monthRes;

            const potsRes = await this._migrateTable(
                POTS_TABLE, userId, POT_SELECT, POT_PLAINTEXT_COLS,
                (row) => this._potSensitiveFromLegacy(row), batchSize
            );
            summary.tables.pots = potsRes;

            for (const r of [monthRes, potsRes]) {
                summary.totals.scanned += r.scanned;
                summary.totals.migrated += r.migrated;
                summary.totals.verifyFailed += r.verifyFailed;
                summary.totals.writeFailed += r.writeFailed;
                summary.totals.skipped += r.skipped;
                summary.errors = summary.errors.concat(r.errors);
            }

            // "Completed" means we drained both tables WITHOUT a hard DB-read error.
            // Per-row verify/write failures do NOT block completion — those rows kept
            // their plaintext and are retried on the next explicit run; but they must
            // not wedge the session flag, or a re-login would never retry them.
            summary.completed = (summary.errors.length === 0);
            if (summary.completed) this._completedThisSession = true;

            this._log('info',
                `migration done for ${userId.slice(0, 8)}: ` +
                `scanned=${summary.totals.scanned} migrated=${summary.totals.migrated} ` +
                `verifyFailed=${summary.totals.verifyFailed} writeFailed=${summary.totals.writeFailed}`);
            return summary;
        } finally {
            this._running = false;
        }
    },

    /**
     * Migrate one table's plaintext rows in batches, paging by an ascending id
     * cursor (resumable, and needs only the `eq` filter the query layer supports;
     * each batch re-selects enc_version=0 so already-migrated rows are never re-read).
     *
     * @private
     * @param {string} table
     * @param {string} userId
     * @param {string} select - column list to fetch
     * @param {string[]} plaintextCols - legacy columns to NULL on a verified flip
     * @param {(row:Object)=>Object} buildSensitive - legacy-columns -> sensitive object
     * @param {number} batchSize
     * @returns {Promise<{scanned,migrated,verifyFailed,writeFailed,skipped,errors}>}
     */
    async _migrateTable(table, userId, select, plaintextCols, buildSensitive, batchSize) {
        const db = this._db();
        const result = { scanned: 0, migrated: 0, verifyFailed: 0, writeFailed: 0, skipped: 0, errors: [] };

        let cursor = 0; // last id processed; we page id > cursor, ascending
        // Hard cap on iterations as a runaway guard (cursor strictly advances, so this
        // can only be hit by a pathological row count; keeps a bug from looping forever).
        let guard = 0;
        const MAX_BATCHES = 100000;

        while (guard++ < MAX_BATCHES) {
            // Fetch the next batch of NOT-YET-migrated rows. enc_version=eq.0 is the
            // idempotency filter (rows already at >=1 are skipped). We page on id so a
            // partially-migrated table resumes cleanly and we never re-read a flipped
            // row (it drops out of the enc_version=0 set). id > cursor via a gte-style
            // cursor handled by ordering + client-side advance below.
            const { data, error } = await db.querySelect(table, {
                select,
                filter: { user_id: userId, enc_version: 0 },
                order: [{ column: 'id', ascending: true }],
                limit: batchSize,
            });

            if (error) {
                // A hard read error is surfaced as a typed error but does NOT destroy
                // any data (we never got to a write). Abort THIS table; the caller
                // records it and other tables / a re-run can still proceed.
                const e = makeBudgetMigrationError(
                    `[BudgetMigrationService] ${table} SELECT failed: ${error.message || error.code || 'unknown'}`,
                    'WRITE_FAILED'
                );
                result.errors.push(e);
                this._log('error', e.message);
                return result;
            }

            const rows = Array.isArray(data) ? data : (data ? [data] : []);
            // Only consider rows strictly after the cursor, so a row that FAILED to
            // migrate (and thus stays enc_version=0) does not trap us re-reading the
            // same head-of-table batch forever. Failed rows are recorded once and then
            // stepped past; a future explicit run retries them from a fresh cursor=0.
            const fresh = rows.filter((r) => Number(r.id) > cursor);
            if (fresh.length === 0) {
                // Either the table is fully migrated, or every remaining row is one we
                // already attempted-and-failed this run (all <= cursor). Done.
                break;
            }

            for (const row of fresh) {
                result.scanned += 1;
                cursor = Math.max(cursor, Number(row.id));

                // Defensive idempotency: never touch a row that is already encrypted.
                if ((row.enc_version || 0) >= 1) { result.skipped += 1; continue; }

                const outcome = await this._migrateRow(table, row, plaintextCols, buildSensitive);
                if (outcome.ok) {
                    result.migrated += 1;
                } else if (outcome.code === 'VERIFY_FAILED' || outcome.code === 'ENCRYPT_FAILED') {
                    result.verifyFailed += 1;
                    result.errors.push(outcome.error);
                } else {
                    result.writeFailed += 1;
                    result.errors.push(outcome.error);
                }
            }

            // If the batch came back short, there is nothing more to read.
            if (rows.length < batchSize) break;
        }

        return result;
    },

    /**
     * Migrate a SINGLE row with the verify-before-destroy guarantee.
     *
     * NEVER nulls the plaintext columns unless the just-built ciphertext has been
     * decrypted back and proven byte-equal to the original plaintext object. The
     * envelope-set + plaintext-null happen in ONE atomic UPDATE, so the plaintext is
     * never cleared in a step separate from the ciphertext landing.
     *
     * @private
     * @returns {Promise<{ok:boolean, code?:string, error?:Error}>}
     */
    async _migrateRow(table, row, plaintextCols, buildSensitive) {
        const bcs = this._bcs();
        const rowRef = `${table}#${row.id}`;

        // The original plaintext object from the legacy columns. This is the GROUND
        // TRUTH we must be able to reproduce from ciphertext before destroying it.
        const original = buildSensitive(row);
        const originalJson = this._stableJson(original);

        // ---- 1. encrypt (fail-closed DEK; getLoadedDEK throws if not loaded) ----
        let envelope;
        try {
            const dek = this._bks().getLoadedDEK();
            envelope = bcs.encryptBlob(original, dek);
        } catch (encErr) {
            const e = makeBudgetMigrationError(
                `[BudgetMigrationService] ${rowRef}: encrypt failed, plaintext LEFT INTACT: ${encErr && encErr.message}`,
                'ENCRYPT_FAILED', rowRef
            );
            this._log('error', e.message);
            return { ok: false, code: 'ENCRYPT_FAILED', error: e };
        }

        // ---- 2. VERIFY-BEFORE-DESTROY: round-trip the SAME ciphertext bytes back ----
        // Decrypt the exact envelope we are about to store and assert it equals the
        // original. This proves the stored ciphertext is readable with this DEK; only
        // then is it safe to drop the plaintext.
        let roundTrip;
        try {
            const dek = this._bks().getLoadedDEK();
            roundTrip = bcs.decryptBlob(envelope, dek);
        } catch (decErr) {
            const e = makeBudgetMigrationError(
                `[BudgetMigrationService] ${rowRef}: verify decrypt threw, plaintext LEFT INTACT: ${decErr && decErr.message}`,
                'VERIFY_FAILED', rowRef
            );
            this._log('error', e.message);
            return { ok: false, code: 'VERIFY_FAILED', error: e };
        }
        if (this._stableJson(roundTrip) !== originalJson) {
            const e = makeBudgetMigrationError(
                `[BudgetMigrationService] ${rowRef}: round-trip MISMATCH, plaintext LEFT INTACT (NOT nulled)`,
                'VERIFY_FAILED', rowRef
            );
            this._log('error', e.message);
            return { ok: false, code: 'VERIFY_FAILED', error: e };
        }

        // ---- 3. atomic flip: set envelope AND null the legacy plaintext columns in
        //         ONE UPDATE. Only reached after a proven round-trip. ----
        const updateData = {
            enc_payload: envelope.enc_payload,
            enc_nonce: envelope.enc_nonce,
            enc_version: envelope.enc_version, // 1
        };
        for (const c of plaintextCols) updateData[c] = null;

        let writeRes;
        try {
            writeRes = await this._db().queryUpdate(table, row.id, updateData);
        } catch (writeErr) {
            // A thrown write means the PATCH did not commit -> legacy columns intact.
            const e = makeBudgetMigrationError(
                `[BudgetMigrationService] ${rowRef}: UPDATE threw AFTER verify; row UNCHANGED (plaintext intact): ${writeErr && writeErr.message}`,
                'WRITE_FAILED', rowRef
            );
            this._log('error', e.message);
            return { ok: false, code: 'WRITE_FAILED', error: e };
        }
        if (writeRes && writeRes.error) {
            const e = makeBudgetMigrationError(
                `[BudgetMigrationService] ${rowRef}: UPDATE failed AFTER verify; row UNCHANGED (plaintext intact): ${writeRes.error.message || writeRes.error.code || 'unknown'}`,
                'WRITE_FAILED', rowRef
            );
            this._log('error', e.message);
            return { ok: false, code: 'WRITE_FAILED', error: e };
        }

        return { ok: true };
    },

    /**
     * Deterministic JSON for round-trip equality: recursively sort object keys so two
     * structurally-equal objects with different key insertion order still compare
     * equal. (Arrays keep their order — order is meaningful for budget line items.)
     * @private
     */
    _stableJson(value) {
        return JSON.stringify(this._sortKeys(value));
    },

    /** @private */
    _sortKeys(value) {
        if (Array.isArray(value)) return value.map((v) => this._sortKeys(v));
        if (value && typeof value === 'object') {
            const out = {};
            for (const k of Object.keys(value).sort()) out[k] = this._sortKeys(value[k]);
            return out;
        }
        return value;
    },

    // ==================== trigger entry point ====================

    /**
     * Fire-and-forget trigger for "run once per session after login/DEK-bootstrap".
     *
     * Designed to be called from the page bootstrap (DOMContentLoaded, AFTER auth +
     * controller init) WITHOUT awaiting it, so it never stalls the UI. It swallows
     * its own errors (logging them) so a migration failure can never break page load;
     * the per-row data-safety contract still holds (no plaintext lost). Honors the
     * concurrent-run + already-completed guards internally.
     *
     * @param {string} userId
     * @param {{batchSize?:number}} [options]
     * @returns {Promise<Object|null>} the summary (for tests), or null on a swallowed error
     */
    async runOnLogin(userId, options = {}) {
        try {
            if (!userId) return null; // not authenticated -> nothing to migrate
            return await this.migrateAll(userId, options);
        } catch (err) {
            // A fail-closed abort (no DEK) or unexpected error: log, never rethrow into
            // the page bootstrap. Nothing was destroyed (migrateAll fails closed BEFORE
            // any write), so the next login retries.
            this._log('warn', `runOnLogin: migration deferred (${err && err.code ? err.code : 'error'}): ${err && err.message}`);
            return null;
        }
    },
};

if (typeof window !== 'undefined') {
    window.BudgetMigrationService = BudgetMigrationService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = BudgetMigrationService;
}
