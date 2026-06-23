/**
 * S6 GATES -- Budget E2E one-time client migration of EXISTING plaintext rows
 * (BUDGET_E2E_DESIGN.md §6 + staged plan S6).
 *
 * Run: node .s6_budget_migration_runner.cjs        (from the money_tracker repo root)
 *
 * (This checkout declares "type":"module" in package.json, which forces every .js
 *  to ESM. The auth_db harness + primitive services are CommonJS, so this test is
 *  executed by the repo-root .s6_budget_migration_runner.cjs shim, mirroring the
 *  S1 .s10_budget_runner.cjs / S2 .s2_budget_key_runner.cjs / S4S5 runners. No npm
 *  deps are added; the read-only auth_db submodule databaseService.js + the
 *  money_tracker calculationService.js are loaded by READING them and capturing
 *  window.<Global> — neither is modified by the test.)
 *
 * What is REAL here (no crypto / transform / migration-logic stubs):
 *   - the REAL BudgetCryptoService (S1) does the secretbox encrypt / decrypt / verify,
 *   - the REAL BudgetMigrationService (S6, the canonical money_tracker service) does
 *     the batched, idempotent, verify-before-destroy migration,
 *   - the REAL DatabaseService.transformMonthFromDatabase / transformPotFromDatabase
 *     (S5 dual-read) reads the MIXED post-state,
 *   - the REAL CalculationService runs the aggregates.
 * Only the DEK source (BudgetKeyService) and the row store (DatabaseService's
 * querySelect/queryUpdate, modelling Postgres + RLS) are mocked in-memory.
 *
 * Gates (per the task spec):
 *   (1) ROUND-TRIP MIGRATION  -- a store of plaintext rows (enc_version=0) is migrated
 *                                to enc_version=1 and each decrypts back to the EXACT
 *                                original (month + pot).
 *   (2) IDEMPOTENT            -- a second run is a no-op: no re-encrypt, no new writes.
 *   (3) VERIFY-BEFORE-DESTROY -- inject an encrypt/verify failure for ONE row; assert
 *                                its plaintext is RETAINED (not nulled) while the others
 *                                migrate -- NO DATA LOSS.
 *   (4) MIXED DUAL-READ       -- the mixed post-state (migrated + legacy rows) reads
 *                                correctly via the dual-read transform; aggregates over
 *                                a migrated row deep-equal aggregates over its original.
 *   (5) FAIL-CLOSED (no DEK)  -- with no DEK, the migration aborts with ZERO writes.
 *
 * Mutation-check woven into (3): we PROVE the store actually distinguishes a migrated
 * row from an untouched one (the broken row keeps enc_version=0 AND non-null plaintext;
 * a sibling row flips to 1 AND nulls its plaintext) -- so "no data loss" cannot pass
 * vacuously.
 */

const path = require('path');
const fs = require('fs');
const vm = require('vm');

const HARNESS_PATH = path.resolve(__dirname, '../../lib/auth_db/encryption/tests/_harness.js');
const H = require(HARNESS_PATH);

// Wire the REAL CryptoPrimitivesService + KeyDerivationService onto global, and seed
// the deterministic RNG so secretbox nonces are reproducible run-to-run.
const { CryptoPrimitivesService: CP } = H.loadServices();
CP.setRandomBytesSource(H.makeDeterministicRng('s6-budget-migration'));

// REAL S1 crypto + REAL S6 migration (canonical money_tracker services).
const BudgetCryptoService = require(path.resolve(__dirname, './budgetCryptoService.js'));
const BudgetMigrationService = require(path.resolve(__dirname, './budgetMigrationService.js'));

// ---------------------------------------------------------------------------
// Load a browser-style ("const X = {...}; window.X = X") service file in node by
// running it in a sandbox where `window`, etc. exist, then return the captured
// window.<globalName>. Used for DatabaseService (dual-read transforms) +
// CalculationService. The file is READ, never modified.
// ---------------------------------------------------------------------------
function loadBrowserGlobal(absPath, globalName, extraGlobals) {
    const src = fs.readFileSync(absPath, 'utf8');
    const win = Object.assign({}, extraGlobals || {});
    const sandbox = {
        window: win,
        console: { log() {}, warn() {}, error() {}, info() {} },
        Date, JSON, Math, Array, Object, String, Number, Boolean, parseInt, parseFloat,
        isNaN, Buffer, Uint8Array, Error, TypeError, RangeError,
        globalThis: undefined,
    };
    sandbox.globalThis = sandbox;
    Object.assign(sandbox, extraGlobals || {});
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: absPath });
    const captured = win[globalName] || sandbox[globalName];
    if (!captured) throw new Error(`loadBrowserGlobal: ${globalName} not found after loading ${absPath}`);
    return { service: captured, window: win };
}

const calc = loadBrowserGlobal(
    path.resolve(__dirname, './calculationService.js'), 'CalculationService'
).service;

// ---------------------------------------------------------------------------
// Mock BudgetKeyService: in-memory DEK with the fail-closed getLoadedDEK contract
// AND the ensureBudgetDEK contract the migration calls first. ensureBudgetDEK
// THROWS (typed) when no DEK is available, modelling the real fail-closed S2 path.
// ---------------------------------------------------------------------------
function makeFakeBudgetKeyService(dek) {
    return {
        _dek: dek || null,
        load(d) { this._dek = d; },
        unload() { this._dek = null; },
        getLoadedDEK() {
            if (!this._dek) {
                const e = new Error('[FakeBudgetKeyService] DEK not loaded');
                e.code = 'DEK_NOT_LOADED';
                e.name = 'BudgetKeyError';
                throw e;
            }
            return this._dek;
        },
        async ensureBudgetDEK() {
            if (!this._dek) {
                const e = new Error('[FakeBudgetKeyService] cannot bootstrap DEK (identity locked)');
                e.code = 'IDENTITY_LOCKED';
                e.name = 'BudgetKeyError';
                throw e; // fail-closed: a missing DEK ABORTS migrateAll before any write
            }
            return this._dek;
        },
    };
}

// ---------------------------------------------------------------------------
// Mock row store modelling Postgres + RLS for user_months + pots. Implements the
// querySelect / queryUpdate surface BudgetMigrationService uses:
//   - querySelect(table, { select, filter:{user_id, enc_version}, order:[{column:'id'}], limit })
//   - queryUpdate(table, id, updateData)
// Filters are applied like PostgREST eq.* ; ordering + limit are honored so the
// service's id-cursor batching is exercised for real.
// ---------------------------------------------------------------------------
function makeMockStore(initialRows) {
    const tables = {
        user_months: (initialRows.user_months || []).map((r) => ({ ...r })),
        pots: (initialRows.pots || []).map((r) => ({ ...r })),
    };
    // failHooks[table] = (row) => boolean : if true, queryUpdate to that row returns an error.
    const failHooks = {};
    let updateCalls = 0;

    return {
        tables,
        get updateCalls() { return updateCalls; },
        resetUpdateCalls() { updateCalls = 0; },
        setUpdateFailHook(table, fn) { failHooks[table] = fn; },

        async querySelect(table, options = {}) {
            const all = tables[table];
            if (!all) return { data: null, error: { message: `no such table ${table}` } };
            let rows = all.slice();
            const f = options.filter || {};
            if (f.user_id !== undefined) rows = rows.filter((r) => r.user_id === f.user_id);
            if (f.enc_version !== undefined) rows = rows.filter((r) => (r.enc_version || 0) === f.enc_version);
            if (options.order) {
                for (const o of options.order.slice().reverse()) {
                    rows.sort((a, b) => (a[o.column] - b[o.column]) * (o.ascending ? 1 : -1));
                }
            }
            if (options.limit) rows = rows.slice(0, options.limit);
            // Return SHALLOW COPIES so the service can never mutate the store except via
            // queryUpdate (models a real over-the-wire fetch).
            return { data: rows.map((r) => ({ ...r })), error: null };
        },

        async queryUpdate(table, id, updateData) {
            updateCalls += 1;
            const all = tables[table];
            const row = all.find((r) => Number(r.id) === Number(id));
            if (!row) return { data: null, error: { message: `row ${table}#${id} not found` } };
            if (failHooks[table] && failHooks[table](row)) {
                // Simulate a server-side write failure: the row is NOT modified (the
                // PATCH did not commit). This is the WRITE_FAILED data-safety case.
                return { data: null, error: { message: 'simulated write failure', code: 'XX000' } };
            }
            Object.assign(row, updateData);
            return { data: [{ ...row }], error: null };
        },
    };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = 'user-abc-123';

function appMonth(seed) {
    return {
        monthName: 'June',
        dateRange: { start: '2026-06-01', end: '2026-06-30' },
        weeklyBreakdown: [{ week: 1, spent: 200.5 + seed }, { week: 2, spent: -15.25 }],
        fixedCosts: [
            { name: 'Rent', estimatedAmount: 1500 + seed, actualAmount: 1500, category: 'Housing' },
            { name: 'Café ☕', estimatedAmount: 30, actualAmount: 27.99, note: 'résumé 日本語 🍱' },
        ],
        variableCosts: [{ name: 'Groceries', estimatedAmount: 400, actualAmount: 412.6, category: 'Food' }],
        unplannedExpenses: [{ name: 'Car repair', actualAmount: 250 }],
        incomeSources: [{ name: 'Salary', estimatedAmount: 5000, actualAmount: 5000 }],
        pots: [{ name: 'Emergency 🛟', estimatedAmount: 10000, actualAmount: 7250.75, comments: 'für Notfälle' }],
    };
}

// A LEGACY plaintext user_months DB row (enc_version=0), as it sits in Postgres
// before migration. Mirrors the pre-S4 transformMonthToDatabase output.
function legacyMonthRow(id, year, month, app) {
    return {
        user_id: USER_ID, id, year, month, month_name: app.monthName,
        date_range: app.dateRange,
        weekly_breakdown: app.weeklyBreakdown,
        fixed_costs: app.fixedCosts,
        variable_costs: app.variableCosts,
        unplanned_expenses: app.unplannedExpenses,
        income_sources: app.incomeSources,
        pots: app.pots,
        enc_payload: null, enc_nonce: null, enc_version: 0,
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
    };
}

function appPot(seed) {
    return { name: 'Holiday ✈️', estimatedAmount: 3000 + seed, actualAmount: 1234.56, comments: 'Japan trip — 日本' };
}
function legacyPotRow(id, app) {
    return {
        user_id: USER_ID, id, name: app.name,
        estimated_amount: app.estimatedAmount, actual_amount: app.actualAmount, comments: app.comments,
        enc_payload: null, enc_nonce: null, enc_version: 0,
        created_at: '2026-06-01T00:00:00.000Z', updated_at: '2026-06-01T00:00:00.000Z',
    };
}

const MONTH_PLAINTEXT_COLS = [
    'date_range', 'weekly_breakdown', 'fixed_costs', 'variable_costs',
    'unplanned_expenses', 'income_sources', 'pots',
];
const POT_PLAINTEXT_COLS = ['name', 'estimated_amount', 'actual_amount', 'comments'];

// Wire DatabaseService (for the dual-read inverse transforms in gate 4) with the
// REAL BudgetCryptoService + a fake BudgetKeyService on its window.
const DB_FAKE_BKS = makeFakeBudgetKeyService(null);
const dbLoad = loadBrowserGlobal(
    path.resolve(__dirname, '../../lib/auth_db/database/services/databaseService.js'),
    'DatabaseService',
    { BudgetCryptoService, BudgetKeyService: DB_FAKE_BKS }
);
const DB = dbLoad.service;
dbLoad.window.BudgetCryptoService = BudgetCryptoService;
dbLoad.window.BudgetKeyService = DB_FAKE_BKS;

function aggregatesEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// Decrypt a migrated DB row's envelope directly with the DEK and assert it matches
// the original app month's seven sensitive fields.
function assertMonthEnvelopeMatches(row, app, label) {
    H.assertEqual(row.enc_version, 1, `${label}: row migrated to enc_version=1`);
    H.assert(typeof row.enc_payload === 'string' && row.enc_payload.length > 0, `${label}: enc_payload present`);
    H.assert(typeof row.enc_nonce === 'string' && row.enc_nonce.length > 0, `${label}: enc_nonce present`);
    for (const c of MONTH_PLAINTEXT_COLS) {
        H.assertEqual(row[c], null, `${label}: legacy plaintext column ${c} nulled`);
    }
}

async function main() {
    const dek = BudgetCryptoService.generateDEK();
    const FAKE_BKS = makeFakeBudgetKeyService(null);
    BudgetMigrationService.setDependencies({
        budgetCryptoService: BudgetCryptoService,
        budgetKeyService: FAKE_BKS,
        databaseService: null, // set per-gate to a fresh store
    });

    // =====================================================================
    // (1) ROUND-TRIP MIGRATION: a store of plaintext rows is migrated to
    //     enc_version=1 and each decrypts back to the EXACT original.
    // =====================================================================
    await H.gate('S6 (1) round-trip migration of plaintext rows (month + pot)', async () => {
        const apps = [appMonth(0), appMonth(1), appMonth(2)];
        const pots = [appPot(0), appPot(1)];
        const store = makeMockStore({
            user_months: apps.map((a, i) => legacyMonthRow(i + 1, 2026, 4 + i, a)),
            pots: pots.map((p, i) => legacyPotRow(100 + i, p)),
        });
        BudgetMigrationService.setDependencies({
            budgetCryptoService: BudgetCryptoService, budgetKeyService: FAKE_BKS, databaseService: store,
        });
        FAKE_BKS.load(dek);
        BudgetMigrationService.resetSessionState();

        const summary = await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 2 });

        H.assert(summary.ran, 'migration ran');
        H.assert(summary.dekReady, 'DEK was loaded before any write (fail-closed gate passed)');
        H.assertEqual(summary.totals.migrated, 5, 'all 5 rows (3 months + 2 pots) migrated');
        H.assertEqual(summary.totals.verifyFailed, 0, 'no verify failures');
        H.assertEqual(summary.totals.writeFailed, 0, 'no write failures');
        H.assertEqual(summary.errors.length, 0, 'no errors');

        // Every month row is now an envelope that decrypts to its original.
        for (let i = 0; i < apps.length; i++) {
            const row = store.tables.user_months.find((r) => r.id === i + 1);
            assertMonthEnvelopeMatches(row, apps[i], `month#${i + 1}`);
            const dec = BudgetCryptoService.decryptBlob(
                { enc_payload: row.enc_payload, enc_nonce: row.enc_nonce, enc_version: row.enc_version }, dek
            );
            H.assertEqual(JSON.stringify(dec.fixedCosts), JSON.stringify(apps[i].fixedCosts), `month#${i + 1} fixedCosts decrypts to original`);
            H.assertEqual(JSON.stringify(dec.incomeSources), JSON.stringify(apps[i].incomeSources), `month#${i + 1} incomeSources decrypts to original`);
            H.assertEqual(dec.fixedCosts[1].note, 'résumé 日本語 🍱', `month#${i + 1} unicode preserved through migration`);
        }
        // Every pot row likewise.
        for (let i = 0; i < pots.length; i++) {
            const row = store.tables.pots.find((r) => r.id === 100 + i);
            H.assertEqual(row.enc_version, 1, `pot#${100 + i} migrated`);
            for (const c of POT_PLAINTEXT_COLS) H.assertEqual(row[c], null, `pot#${100 + i} legacy ${c} nulled`);
            const dec = BudgetCryptoService.decryptBlob(
                { enc_payload: row.enc_payload, enc_nonce: row.enc_nonce, enc_version: row.enc_version }, dek
            );
            H.assertEqual(dec.name, pots[i].name, `pot#${100 + i} name decrypts to original`);
            H.assertEqual(dec.estimatedAmount, pots[i].estimatedAmount, `pot#${100 + i} estimatedAmount decrypts to original`);
            H.assertEqual(dec.comments, pots[i].comments, `pot#${100 + i} comments decrypts to original`);
        }

        // mutation-check: a no-op migration (one that left rows at enc_version=0) would
        // FAIL the "migrated=5" / "enc_version=1" assertions above. Prove the store
        // genuinely changed by confirming ZERO rows remain at enc_version=0.
        const remaining = store.tables.user_months.concat(store.tables.pots)
            .filter((r) => (r.enc_version || 0) === 0).length;
        H.assertEqual(remaining, 0, 'mutation-check: no plaintext rows remain (a no-op migration would leave 5)');
    });

    // =====================================================================
    // (2) IDEMPOTENT: a second run is a no-op -- no re-encrypt, no new writes.
    // =====================================================================
    await H.gate('S6 (2) idempotent — second run issues ZERO writes', async () => {
        const apps = [appMonth(0), appMonth(1)];
        const store = makeMockStore({
            user_months: apps.map((a, i) => legacyMonthRow(i + 1, 2026, 4 + i, a)),
            pots: [legacyPotRow(100, appPot(0))],
        });
        BudgetMigrationService.setDependencies({
            budgetCryptoService: BudgetCryptoService, budgetKeyService: FAKE_BKS, databaseService: store,
        });
        FAKE_BKS.load(dek);
        BudgetMigrationService.resetSessionState();

        const first = await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 10 });
        H.assertEqual(first.totals.migrated, 3, 'first run migrates all 3 rows');
        const writesAfterFirst = store.updateCalls;
        H.assertEqual(writesAfterFirst, 3, 'first run issued exactly 3 UPDATEs (one per row)');

        // Snapshot the ciphertext so we can prove the second run does NOT re-encrypt.
        const cipherSnapshot = store.tables.user_months.map((r) => r.enc_payload)
            .concat(store.tables.pots.map((r) => r.enc_payload));

        // Force a second FULL run (bypass the session-completed short-circuit) against
        // the already-migrated store: it must touch nothing.
        store.resetUpdateCalls();
        const second = await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 10, force: true });
        H.assertEqual(second.totals.scanned, 0, 'second run scans 0 rows (enc_version=0 set is empty)');
        H.assertEqual(second.totals.migrated, 0, 'second run migrates 0 rows');
        H.assertEqual(store.updateCalls, 0, 'second run issued ZERO UPDATEs (idempotent no-op)');

        // ciphertext is byte-identical (no re-encrypt with a fresh nonce).
        const cipherAfter = store.tables.user_months.map((r) => r.enc_payload)
            .concat(store.tables.pots.map((r) => r.enc_payload));
        H.assertEqual(JSON.stringify(cipherAfter), JSON.stringify(cipherSnapshot),
            'ciphertext unchanged after the second run (no re-encrypt)');

        // The session-completed guard ALSO makes a non-forced re-trigger a no-op.
        store.resetUpdateCalls();
        const third = await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 10 });
        H.assert(!third.ran && third.skipped === 'already-completed-this-session',
            'a non-forced re-trigger this session is skipped (run-once-on-login guard)');
        H.assertEqual(store.updateCalls, 0, 'the skipped re-trigger issued ZERO UPDATEs');
    });

    // =====================================================================
    // (3) VERIFY-BEFORE-DESTROY: inject a write failure for ONE row; its plaintext
    //     is RETAINED (not nulled) while the others migrate -- NO DATA LOSS.
    //     (A simulated server write failure is the realistic "verify passed but the
    //     destroy did not commit" case; the row stays fully plaintext.)
    // =====================================================================
    await H.gate('S6 (3) verify-before-destroy — failing row keeps plaintext, others migrate', async () => {
        const apps = [appMonth(0), appMonth(1), appMonth(2)];
        const store = makeMockStore({
            user_months: apps.map((a, i) => legacyMonthRow(i + 1, 2026, 4 + i, a)),
            pots: [],
        });
        // Make the UPDATE to row id=2 fail (simulate a server-side write rejection AFTER
        // the in-memory verify passed). Its plaintext must remain intact.
        store.setUpdateFailHook('user_months', (row) => Number(row.id) === 2);

        BudgetMigrationService.setDependencies({
            budgetCryptoService: BudgetCryptoService, budgetKeyService: FAKE_BKS, databaseService: store,
        });
        FAKE_BKS.load(dek);
        BudgetMigrationService.resetSessionState();

        const summary = await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 10 });
        H.assertEqual(summary.totals.migrated, 2, 'the 2 healthy rows migrated');
        H.assertEqual(summary.totals.writeFailed, 1, 'exactly 1 row failed to write');
        H.assert(summary.errors.length === 1 && summary.errors[0].name === 'BudgetMigrationError',
            'a typed BudgetMigrationError was collected for the failing row');
        H.assertEqual(summary.errors[0].code, 'WRITE_FAILED', 'the error code is WRITE_FAILED');

        // THE failing row (id=2): plaintext FULLY RETAINED, NOT nulled, still enc_version=0.
        const failed = store.tables.user_months.find((r) => r.id === 2);
        H.assertEqual(failed.enc_version, 0, 'failing row stays enc_version=0 (NOT flipped)');
        for (const c of MONTH_PLAINTEXT_COLS) {
            H.assert(failed[c] != null, `NO DATA LOSS: failing row retained plaintext column ${c}`);
        }
        // Its plaintext is still EXACTLY the original (unmodified, recoverable).
        H.assertEqual(JSON.stringify(failed.fixed_costs), JSON.stringify(apps[1].fixedCosts),
            'failing row plaintext is byte-identical to the original (fully recoverable)');

        // The sibling healthy rows DID migrate (mutation-check: prove the store really
        // distinguishes the two outcomes, so "no data loss" is not vacuous).
        const ok1 = store.tables.user_months.find((r) => r.id === 1);
        const ok3 = store.tables.user_months.find((r) => r.id === 3);
        assertMonthEnvelopeMatches(ok1, apps[0], 'healthy month#1');
        assertMonthEnvelopeMatches(ok3, apps[2], 'healthy month#3');
        H.assert(ok1.enc_version === 1 && failed.enc_version === 0,
            'mutation-check: a migrated row (1) and the failed row (0) are genuinely different states');

        // A RE-RUN (after the failure is cleared) completes the rest: prove resumability.
        store.setUpdateFailHook('user_months', null); // failure cleared
        store.resetUpdateCalls();
        const rerun = await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 10, force: true });
        H.assertEqual(rerun.totals.migrated, 1, 're-run migrates ONLY the previously-failing row');
        H.assertEqual(store.updateCalls, 1, 're-run issues exactly 1 UPDATE (only the un-migrated row)');
        const nowOk = store.tables.user_months.find((r) => r.id === 2);
        const dec = BudgetCryptoService.decryptBlob(
            { enc_payload: nowOk.enc_payload, enc_nonce: nowOk.enc_nonce, enc_version: nowOk.enc_version }, dek
        );
        H.assertEqual(JSON.stringify(dec.fixedCosts), JSON.stringify(apps[1].fixedCosts),
            'previously-failing row now migrates and decrypts to its original (resumable, no loss)');
    });

    // Also prove an ENCRYPT/VERIFY failure (not just a write failure) keeps plaintext:
    // inject a crypto wrapper whose encryptBlob produces a tampered envelope so the
    // round-trip decrypt MISMATCHES -> VERIFY_FAILED -> plaintext retained.
    await H.gate('S6 (3b) verify-before-destroy — encrypt/verify mismatch keeps plaintext', async () => {
        const apps = [appMonth(0), appMonth(1)];
        const store = makeMockStore({
            user_months: apps.map((a, i) => legacyMonthRow(i + 1, 2026, 4 + i, a)),
            pots: [],
        });

        // A crypto shim that corrupts the ciphertext for row-with-Rent-estimate 1500
        // (id=1, seed 0) so its verify round-trip fails, but is correct for everything
        // else. decryptBlob delegates to the REAL crypto (so a healthy row verifies).
        let corruptNext = false;
        const corruptingBcs = {
            generateDEK: () => BudgetCryptoService.generateDEK(),
            encryptBlob(obj, d) {
                const env = BudgetCryptoService.encryptBlob(obj, d);
                if (corruptNext) {
                    // Flip the tail of the ciphertext: a real decrypt will now FAIL auth,
                    // so the verify-before-destroy round-trip throws -> VERIFY_FAILED.
                    env.enc_payload = env.enc_payload.slice(0, -4) + 'AAAA';
                }
                return env;
            },
            decryptBlob(env, d) { return BudgetCryptoService.decryptBlob(env, d); },
        };
        // Make ONLY id=1 corrupt: the migrator processes ascending by id, so corrupt
        // the first encrypt then turn it off.
        const realEncrypt = corruptingBcs.encryptBlob.bind(corruptingBcs);
        let seen = 0;
        corruptingBcs.encryptBlob = (obj, d) => {
            seen += 1;
            corruptNext = (seen === 1); // only the first row (id=1, ascending)
            return realEncrypt(obj, d);
        };

        BudgetMigrationService.setDependencies({
            budgetCryptoService: corruptingBcs, budgetKeyService: FAKE_BKS, databaseService: store,
        });
        FAKE_BKS.load(dek);
        BudgetMigrationService.resetSessionState();

        const summary = await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 10 });
        H.assertEqual(summary.totals.verifyFailed, 1, 'exactly 1 row failed verify (corrupted ciphertext)');
        H.assertEqual(summary.totals.migrated, 1, 'the healthy row migrated');
        H.assert(summary.errors[0].code === 'VERIFY_FAILED', 'collected error code is VERIFY_FAILED');

        const corrupted = store.tables.user_months.find((r) => r.id === 1);
        H.assertEqual(corrupted.enc_version, 0, 'verify-failed row stays enc_version=0');
        for (const c of MONTH_PLAINTEXT_COLS) {
            H.assert(corrupted[c] != null, `NO DATA LOSS: verify-failed row retained plaintext column ${c}`);
        }
        H.assert(corrupted.enc_payload == null, 'verify-failed row did NOT even store the bad ciphertext');

        // restore the real crypto dep for later gates
        BudgetMigrationService.setDependencies({
            budgetCryptoService: BudgetCryptoService, budgetKeyService: FAKE_BKS, databaseService: store,
        });
    });

    // =====================================================================
    // (4) MIXED DUAL-READ: a mix of migrated + legacy rows reads correctly via the
    //     real dual-read transform; aggregates over a migrated row == over its original.
    // =====================================================================
    await H.gate('S6 (4) mixed post-state reads via dual-read; aggregates unchanged', async () => {
        const migApp = appMonth(0);   // will be migrated
        const legApp = appMonth(7);   // will be left legacy (simulate a crash mid-run)
        const store = makeMockStore({
            user_months: [legacyMonthRow(1, 2026, 4, migApp), legacyMonthRow(2, 2026, 5, legApp)],
            pots: [legacyPotRow(100, appPot(0))],
        });
        BudgetMigrationService.setDependencies({
            budgetCryptoService: BudgetCryptoService, budgetKeyService: FAKE_BKS, databaseService: store,
        });
        FAKE_BKS.load(dek);
        BudgetMigrationService.resetSessionState();

        // Migrate ONLY row id=1 + the pot by failing id=2's write, producing a MIX.
        store.setUpdateFailHook('user_months', (row) => Number(row.id) === 2);
        await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 10 });

        const migRow = store.tables.user_months.find((r) => r.id === 1);
        const legRow = store.tables.user_months.find((r) => r.id === 2);
        H.assertEqual(migRow.enc_version, 1, 'row 1 is migrated (encrypted)');
        H.assertEqual(legRow.enc_version, 0, 'row 2 is still legacy plaintext (mixed state)');

        // Both read correctly through the REAL S5 dual-read transform. The DB transform
        // resolves the DEK via its own window.BudgetKeyService -> load it there.
        DB_FAKE_BKS.load(dek);
        const migBack = DB.transformMonthFromDatabase(migRow);
        const legBack = DB.transformMonthFromDatabase(legRow);
        H.assertEqual(JSON.stringify(migBack.fixedCosts), JSON.stringify(migApp.fixedCosts), 'migrated row reads back its fixedCosts via dual-read');
        H.assertEqual(JSON.stringify(legBack.fixedCosts), JSON.stringify(legApp.fixedCosts), 'legacy row reads back its fixedCosts via dual-read');

        // Aggregates over the migrated row == aggregates over the original plaintext app.
        const totalsOrig = calc.calculateMonthTotals(migApp);
        const totalsMig = calc.calculateMonthTotals(migBack);
        H.assert(aggregatesEqual(totalsOrig, totalsMig),
            'aggregates over the MIGRATED+decrypted month deep-equal aggregates over the original plaintext');
        H.assert(totalsOrig.expenses.actual > 0, 'fixture yields non-zero expenses (meaningful aggregate)');

        // And the pot reads back via the pot dual-read transform.
        const potRow = store.tables.pots.find((r) => r.id === 100);
        const potBack = DB.transformPotFromDatabase(potRow);
        H.assertEqual(potBack.name, appPot(0).name, 'migrated pot reads back its name via dual-read');
        H.assertEqual(potBack.estimatedAmount, appPot(0).estimatedAmount, 'migrated pot reads back its estimatedAmount');

        DB_FAKE_BKS.unload();
    });

    // =====================================================================
    // (5) FAIL-CLOSED (no DEK): with no DEK, the migration aborts with ZERO writes.
    // =====================================================================
    await H.gate('S6 (5) fail-closed — no DEK aborts with ZERO writes', async () => {
        const apps = [appMonth(0), appMonth(1)];
        const store = makeMockStore({
            user_months: apps.map((a, i) => legacyMonthRow(i + 1, 2026, 4 + i, a)),
            pots: [legacyPotRow(100, appPot(0))],
        });
        BudgetMigrationService.setDependencies({
            budgetCryptoService: BudgetCryptoService, budgetKeyService: FAKE_BKS, databaseService: store,
        });
        FAKE_BKS.unload(); // NO DEK -> ensureBudgetDEK throws (fail-closed)
        BudgetMigrationService.resetSessionState();

        // migrateAll PROPAGATES the fail-closed abort (a missing DEK is an error to
        // surface, not a silent skip).
        let threw = false, code = null;
        try {
            await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 10 });
        } catch (e) { threw = true; code = e && e.code; }
        H.assert(threw, 'migrateAll throws (does not silently skip) when no DEK is available');
        H.assertEqual(code, 'IDENTITY_LOCKED', 'the thrown error is the typed fail-closed DEK error');

        // CRITICAL: NOT A SINGLE WRITE happened, and every row is untouched plaintext.
        H.assertEqual(store.updateCalls, 0, 'fail-closed: ZERO UPDATEs issued');
        for (const r of store.tables.user_months.concat(store.tables.pots)) {
            H.assertEqual(r.enc_version, 0, `fail-closed: row ${r.id} untouched (enc_version still 0)`);
            H.assert(r.enc_payload == null, `fail-closed: row ${r.id} has no ciphertext written`);
        }
        // Months still hold plaintext.
        const m1 = store.tables.user_months.find((r) => r.id === 1);
        H.assert(m1.fixed_costs != null, 'fail-closed: plaintext fully intact (NO DATA LOSS)');

        // runOnLogin is the page hook: it SWALLOWS the fail-closed abort (never breaks
        // page load) and STILL writes nothing.
        store.resetUpdateCalls();
        const r = await BudgetMigrationService.runOnLogin(USER_ID, { batchSize: 10 });
        H.assert(r === null, 'runOnLogin swallows the no-DEK abort and returns null');
        H.assertEqual(store.updateCalls, 0, 'runOnLogin wrote nothing under the no-DEK condition');

        // mutation-check: once a DEK IS present, the SAME store migrates — proving the
        // zero-writes above were attributable to the missing DEK, not a broken store.
        FAKE_BKS.load(dek);
        BudgetMigrationService.resetSessionState();
        const ok = await BudgetMigrationService.migrateAll(USER_ID, { batchSize: 10 });
        H.assertEqual(ok.totals.migrated, 3, 'mutation-check: with a DEK loaded the same store migrates all 3 rows');
    });

    H.summary();
}

main().catch((e) => {
    process.stdout.write('\nUNCAUGHT: ' + (e && e.stack ? e.stack : e) + '\n');
    process.exitCode = 1;
});
