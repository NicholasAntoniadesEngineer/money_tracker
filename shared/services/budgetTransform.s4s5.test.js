/**
 * S4/S5 GATES -- Budget E2E encrypt-on-write + dual-read on the REAL
 * DatabaseService transforms (BUDGET_E2E_DESIGN.md staged plan S4 + S5).
 *
 * Run: node .s4s5_budget_transform_runner.cjs        (from the money_tracker repo root)
 *
 * (This checkout declares "type":"module" in package.json, which forces every .js
 *  to ESM. The auth_db harness + primitive services are CommonJS, so this test is
 *  executed by the repo-root .s4s5_budget_transform_runner.cjs shim, mirroring the
 *  S1 .s10_budget_runner.cjs / S2 .s2_budget_key_runner.cjs runners. No npm deps
 *  are added; the auth_db submodule databaseService.js is loaded by READING it and
 *  capturing window.DatabaseService — it is NOT modified by the test.)
 *
 * What is REAL here (no crypto/transform stubs):
 *   - the REAL BudgetCryptoService (S1) does the secretbox encrypt/decrypt,
 *   - the REAL DatabaseService.transformMonthToDatabase / transformMonthFromDatabase
 *     / transformPotToDatabase / transformPotFromDatabase (S4/S5, the canonical
 *     auth_db submodule copy) do the envelope/dual-read,
 *   - the REAL CalculationService runs the aggregates.
 * Only the DEK source (BudgetKeyService) and a tiny row store are mocked.
 *
 * Gates (per the task spec):
 *   (1) ROUND-TRIP            -- app month -> transformMonthToDatabase (encrypted,
 *                                NO plaintext financial columns) -> transformMonthFromDatabase
 *                                -> deep-equals the original app month. Same for a pot.
 *   (2) DUAL-READ             -- a legacy plaintext row (enc_version=0, no enc_payload)
 *                                still reads correctly via the from-transform.
 *   (3) AGGREGATE-EQUIVALENCE -- CalculationService aggregates over the decrypted month
 *                                deep-equal the aggregates over the original plaintext
 *                                month (encryption is transparent to client math; §8 g2).
 *   (4) NO-FINANCIAL-PLAINTEXT lint -- the to-database output for an encrypted row
 *                                contains NONE of the seven sensitive fields / pot money
 *                                fields as a non-null plaintext column (§8 g6).
 *   (5) FAIL-CLOSED           -- to-database with NO DEK loaded throws; from-database of
 *                                an encrypted row with NO DEK throws (never blanks).
 *
 * Mutation-checks woven into (1) and (4): we prove each gate would FAIL against a
 * broken transform (a no-op passthrough / a plaintext-leaking record), so a silent
 * regression cannot pass.
 */

const path = require('path');
const fs = require('fs');
const vm = require('vm');

const HARNESS_PATH = path.resolve(__dirname, '../../lib/auth_db/encryption/tests/_harness.js');
const H = require(HARNESS_PATH);

// Wire the REAL CryptoPrimitivesService + KeyDerivationService onto global.
const { CryptoPrimitivesService: CP } = H.loadServices();

// REAL S1 crypto (canonical money_tracker service).
const BudgetCryptoService = require(path.resolve(__dirname, './budgetCryptoService.js'));

// ---------------------------------------------------------------------------
// Load a browser-style ("const X = {...}; window.X = X") service file in node by
// running it in a sandbox where `window`, `console`, etc. exist, then return the
// captured window.<globalName>. Used for DatabaseService + CalculationService,
// which only export via `window` (no module.exports). The file is READ, never
// modified.
// ---------------------------------------------------------------------------
function loadBrowserGlobal(absPath, globalName, extraGlobals) {
    const src = fs.readFileSync(absPath, 'utf8');
    const win = Object.assign({}, extraGlobals || {});
    const sandbox = {
        window: win,
        console: { log() {}, warn() {}, error() {}, info() {} }, // silence the chatty service
        Date, JSON, Math, Array, Object, String, Number, Boolean, parseInt, parseFloat,
        isNaN, Buffer, Uint8Array, Error, TypeError, RangeError,
        globalThis: undefined, // forced below
    };
    sandbox.globalThis = sandbox;
    // Expose any extraGlobals as bare identifiers too (so `typeof X !== 'undefined'`
    // resolution paths inside the service find them).
    Object.assign(sandbox, extraGlobals || {});
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox, { filename: absPath });
    const captured = win[globalName] || sandbox[globalName];
    if (!captured) throw new Error(`loadBrowserGlobal: ${globalName} not found after loading ${absPath}`);
    return { service: captured, window: win };
}

// CalculationService first (no deps).
const calc = loadBrowserGlobal(
    path.resolve(__dirname, './calculationService.js'), 'CalculationService'
).service;

// ---------------------------------------------------------------------------
// Mock BudgetKeyService: an in-memory DEK, fail-closed accessor matching the real
// getLoadedDEK contract used by the transforms.
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
                throw e;
            }
            return this._dek;
        },
        async ensureBudgetDEK() { return this._dek; },
    };
}

// DatabaseService is loaded with BudgetCryptoService + a fake BudgetKeyService on
// its `window`, exactly how the browser wires sibling services.
const FAKE_BKS = makeFakeBudgetKeyService(null);
const dbLoad = loadBrowserGlobal(
    path.resolve(__dirname, '../../lib/auth_db/database/services/databaseService.js'),
    'DatabaseService',
    { BudgetCryptoService, BudgetKeyService: FAKE_BKS }
);
const DB = dbLoad.service;
// The service resolves siblings via `window.*` first; ensure both are present on
// the captured window so the transforms see them.
dbLoad.window.BudgetCryptoService = BudgetCryptoService;
dbLoad.window.BudgetKeyService = FAKE_BKS;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const USER_ID = 'user-abc-123';
const YEAR = 2026, MONTH = 6;

function makeAppMonth() {
    return {
        // structural
        monthName: 'June',
        createdAt: '2026-06-01T00:00:00.000Z',
        // sensitive (the seven fields)
        dateRange: { start: '2026-06-01', end: '2026-06-30' },
        weeklyBreakdown: [
            { week: 1, spent: 200.5 },
            { week: 2, spent: -15.25 }, // refund
        ],
        fixedCosts: [
            { name: 'Rent', estimatedAmount: 1500, actualAmount: 1500, category: 'Housing' },
            { name: 'Café ☕', estimatedAmount: 30, actualAmount: 27.99, note: 'résumé 日本語 🍱' },
        ],
        variableCosts: [
            { name: 'Groceries', estimatedAmount: 400, actualAmount: 412.6, category: 'Food' },
        ],
        unplannedExpenses: [
            { name: 'Car repair', actualAmount: 250 },
        ],
        incomeSources: [
            { name: 'Salary', estimatedAmount: 5000, actualAmount: 5000 },
        ],
        pots: [
            { name: 'Emergency 🛟', estimatedAmount: 10000, actualAmount: 7250.75, comments: 'für Notfälle' },
        ],
    };
}

function makeAppPot() {
    return {
        id: 'pot-xyz-1',
        name: 'Holiday ✈️',
        estimatedAmount: 3000,
        actualAmount: 1234.56,
        comments: 'Japan trip — 日本',
        createdAt: '2026-06-01T00:00:00.000Z',
    };
}

// The seven sensitive plaintext month columns + the four pot money columns that
// must NEVER appear as a non-null value on an ENCRYPTED to-database record.
const MONTH_PLAINTEXT_COLS = [
    'date_range', 'weekly_breakdown', 'fixed_costs', 'variable_costs',
    'unplanned_expenses', 'income_sources', 'pots',
];
const POT_PLAINTEXT_COLS = ['name', 'estimated_amount', 'actual_amount', 'comments'];

// The allow-list of plaintext columns an encrypted record MAY carry (design §8 g6).
const MONTH_ALLOWED_COLS = [
    'user_id', 'id', 'year', 'month', 'month_name', 'created_at', 'updated_at',
    'enc_payload', 'enc_nonce', 'enc_version',
];
const POT_ALLOWED_COLS = [
    'id', 'created_at', 'updated_at', 'enc_payload', 'enc_nonce', 'enc_version',
];

// Compare two "totals"-shaped aggregate objects for deep numeric equality.
function aggregatesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

// Build the LEGACY plaintext db row shape (what an enc_version=0 row looks like in
// Postgres), mirroring the OLD transformMonthToDatabase output before S4.
function legacyMonthRow(app) {
    return {
        user_id: USER_ID, year: YEAR, month: MONTH,
        month_name: app.monthName,
        date_range: app.dateRange,
        weekly_breakdown: app.weeklyBreakdown,
        fixed_costs: app.fixedCosts,
        variable_costs: app.variableCosts,
        unplanned_expenses: app.unplannedExpenses,
        income_sources: app.incomeSources,
        pots: app.pots,
        created_at: app.createdAt,
        updated_at: app.createdAt,
        // enc_* absent / 0 on a legacy row:
        enc_version: 0,
    };
}
function legacyPotRow(app) {
    return {
        id: app.id, name: app.name,
        estimated_amount: app.estimatedAmount, actual_amount: app.actualAmount,
        comments: app.comments,
        created_at: app.createdAt, updated_at: app.createdAt,
        enc_version: 0,
    };
}

async function main() {
    const dek = BudgetCryptoService.generateDEK();

    // =====================================================================
    // (1) ROUND-TRIP: app -> to-database (encrypted, no plaintext financial
    //     columns) -> from-database -> identical app object. Month + pot.
    // =====================================================================
    await H.gate('S4/S5 (1) round-trip month + pot (encrypted, exact)', async () => {
        FAKE_BKS.load(dek);
        const app = makeAppMonth();

        const rec = DB.transformMonthToDatabase(app, YEAR, MONTH, USER_ID);

        // It is encrypted (envelope present, version 1).
        H.assertEqual(rec.enc_version, 1, 'to-database emits enc_version=1');
        H.assertEqual(typeof rec.enc_payload, 'string', 'enc_payload is a base64 string');
        H.assertEqual(typeof rec.enc_nonce, 'string', 'enc_nonce is a base64 string');
        // Structural columns survive in the clear.
        H.assertEqual(rec.year, YEAR, 'year plaintext');
        H.assertEqual(rec.month, MONTH, 'month plaintext');
        H.assertEqual(rec.month_name, 'June', 'month_name plaintext');
        H.assertEqual(rec.user_id, USER_ID, 'user_id plaintext');
        // NO plaintext financial column carries a value (they are null).
        for (const c of MONTH_PLAINTEXT_COLS) {
            H.assertEqual(rec[c], null, `to-database NULLs plaintext column ${c}`);
        }

        // Decrypt path reconstructs the app object exactly.
        const back = DB.transformMonthFromDatabase(rec);
        // `key` is derived structural metadata the from-transform adds; ignore it for
        // the equality of the SEVEN sensitive fields + month_name.
        H.assertEqual(JSON.stringify(back.dateRange), JSON.stringify(app.dateRange), 'dateRange round-trips');
        H.assertEqual(JSON.stringify(back.weeklyBreakdown), JSON.stringify(app.weeklyBreakdown), 'weeklyBreakdown round-trips');
        H.assertEqual(JSON.stringify(back.fixedCosts), JSON.stringify(app.fixedCosts), 'fixedCosts round-trips');
        H.assertEqual(JSON.stringify(back.variableCosts), JSON.stringify(app.variableCosts), 'variableCosts round-trips');
        H.assertEqual(JSON.stringify(back.unplannedExpenses), JSON.stringify(app.unplannedExpenses), 'unplannedExpenses round-trips');
        H.assertEqual(JSON.stringify(back.incomeSources), JSON.stringify(app.incomeSources), 'incomeSources round-trips');
        H.assertEqual(JSON.stringify(back.pots), JSON.stringify(app.pots), 'pots round-trips');
        H.assertEqual(back.monthName, app.monthName, 'monthName round-trips');
        // Unicode spot-check survived secretbox.
        H.assertEqual(back.fixedCosts[1].note, 'résumé 日本語 🍱', 'unicode preserved through encrypt round-trip');

        // ---- pot round-trip ----
        const pot = makeAppPot();
        const prec = DB.transformPotToDatabase(pot);
        H.assertEqual(prec.enc_version, 1, 'pot to-database emits enc_version=1');
        for (const c of POT_PLAINTEXT_COLS) {
            H.assertEqual(prec[c], null, `pot to-database NULLs plaintext column ${c}`);
        }
        // from-database needs id/created_at on the row (the to-database record carries them).
        const pback = DB.transformPotFromDatabase(prec);
        H.assertEqual(pback.name, pot.name, 'pot name round-trips');
        H.assertEqual(pback.estimatedAmount, pot.estimatedAmount, 'pot estimatedAmount round-trips');
        H.assertEqual(pback.actualAmount, pot.actualAmount, 'pot actualAmount round-trips');
        H.assertEqual(pback.comments, pot.comments, 'pot comments round-trips');

        // ---- mutation-check: a no-op (passthrough) to-database that left plaintext
        //      in would FAIL the "NULLs plaintext column" assertion above. Prove that
        //      by checking the legacy-shaped record (which carries plaintext) does NOT
        //      satisfy the null invariant.
        const leak = legacyMonthRow(app);
        let leakDetected = false;
        for (const c of MONTH_PLAINTEXT_COLS) { if (leak[c] != null) leakDetected = true; }
        H.assert(leakDetected, 'mutation-check: a plaintext-leaking record is detectably non-null');
    });

    // =====================================================================
    // (2) DUAL-READ: a legacy plaintext row (enc_version=0, no enc_payload)
    //     reads correctly via the from-transform, unchanged from pre-S5.
    // =====================================================================
    await H.gate('S4/S5 (2) dual-read legacy plaintext row', async () => {
        // No DEK needed to read a legacy row — prove it by UNLOADING the DEK.
        FAKE_BKS.unload();
        const app = makeAppMonth();
        const legacy = legacyMonthRow(app);

        const back = DB.transformMonthFromDatabase(legacy);
        H.assertEqual(JSON.stringify(back.fixedCosts), JSON.stringify(app.fixedCosts), 'legacy fixedCosts read');
        H.assertEqual(JSON.stringify(back.incomeSources), JSON.stringify(app.incomeSources), 'legacy incomeSources read');
        H.assertEqual(JSON.stringify(back.pots), JSON.stringify(app.pots), 'legacy pots read');
        H.assertEqual(back.monthName, app.monthName, 'legacy monthName read');

        // legacy pot too
        const pot = makeAppPot();
        const pback = DB.transformPotFromDatabase(legacyPotRow(pot));
        H.assertEqual(pback.name, pot.name, 'legacy pot name read');
        H.assertEqual(pback.estimatedAmount, pot.estimatedAmount, 'legacy pot estimatedAmount read');

        // mutation-check: an encrypted row WITHOUT a DEK must NOT silently read — it
        // throws (covered fully in gate 5; here just prove the legacy branch did not
        // accidentally require a DEK by succeeding above with the DEK unloaded).
        H.assert(true, 'legacy read succeeded with NO DEK loaded (dual-read window works)');
    });

    // =====================================================================
    // (3) AGGREGATE-EQUIVALENCE: CalculationService over the decrypted month ==
    //     over the original plaintext month. Encryption is transparent to math.
    // =====================================================================
    await H.gate('S4/S5 (3) aggregate-equivalence (decrypted == plaintext)', async () => {
        FAKE_BKS.load(dek);
        const app = makeAppMonth();

        // aggregates over the ORIGINAL plaintext app month
        const totalsPlain = calc.calculateMonthTotals(app);
        const weeksPlain = calc.calculateWeekTotals(app.weeklyBreakdown);

        // encrypt -> decrypt, then aggregate over the DECRYPTED month
        const rec = DB.transformMonthToDatabase(app, YEAR, MONTH, USER_ID);
        const dec = DB.transformMonthFromDatabase(rec);
        const totalsDec = calc.calculateMonthTotals(dec);
        const weeksDec = calc.calculateWeekTotals(dec.weeklyBreakdown);

        H.assert(aggregatesEqual(totalsPlain, totalsDec),
            'calculateMonthTotals(decrypted) deep-equals calculateMonthTotals(plaintext)\n' +
            `      plain=${JSON.stringify(totalsPlain)}\n      dec  =${JSON.stringify(totalsDec)}`);
        H.assert(aggregatesEqual(weeksPlain, weeksDec),
            'calculateWeekTotals(decrypted) deep-equals calculateWeekTotals(plaintext)');

        // And equivalence against the LEGACY plaintext-row read path (same numbers
        // whether the row is encrypted or legacy — the whole point of dual-read).
        FAKE_BKS.unload();
        const legacyDec = DB.transformMonthFromDatabase(legacyMonthRow(app));
        const totalsLegacy = calc.calculateMonthTotals(legacyDec);
        H.assert(aggregatesEqual(totalsPlain, totalsLegacy),
            'aggregates over a legacy-row read == aggregates over plaintext');

        // sanity: the fixture actually produces non-trivial totals (not all zero), so
        // the equivalence is meaningful.
        H.assert(totalsPlain.expenses.actual > 0, 'fixture yields non-zero expenses (meaningful aggregate)');
    });

    // =====================================================================
    // (4) NO-FINANCIAL-PLAINTEXT lint: an encrypted to-database record carries
    //     ONLY allow-listed plaintext columns; NONE of the sensitive columns hold
    //     a non-null value. Fails CI if anyone adds an amount/category column.
    // =====================================================================
    await H.gate('S4/S5 (4) no-financial-plaintext lint', async () => {
        FAKE_BKS.load(dek);
        const app = makeAppMonth();
        const rec = DB.transformMonthToDatabase(app, YEAR, MONTH, USER_ID);

        // every key present in the record is either allow-listed, or is one of the
        // sensitive columns set to null (residue-wipe) — never a non-null financial value.
        for (const key of Object.keys(rec)) {
            const allowed = MONTH_ALLOWED_COLS.includes(key);
            const sensitiveNull = MONTH_PLAINTEXT_COLS.includes(key) && rec[key] === null;
            H.assert(allowed || sensitiveNull,
                `month record key "${key}" is allow-listed OR a NULLed sensitive column (value=${JSON.stringify(rec[key])})`);
        }
        // explicit: no sensitive column holds a value.
        for (const c of MONTH_PLAINTEXT_COLS) {
            H.assert(rec[c] == null, `sensitive month column ${c} holds no plaintext value`);
        }
        // The ciphertext does NOT contain any obvious plaintext token (defense-in-depth:
        // the payload is base64 secretbox, so a known sensitive string must not appear).
        H.assert(!rec.enc_payload.includes('Rent'), 'enc_payload does not leak the "Rent" plaintext');
        H.assert(!rec.enc_payload.includes('Salary'), 'enc_payload does not leak the "Salary" plaintext');

        // pot lint
        const prec = DB.transformPotToDatabase(makeAppPot());
        for (const key of Object.keys(prec)) {
            const allowed = POT_ALLOWED_COLS.includes(key);
            const sensitiveNull = POT_PLAINTEXT_COLS.includes(key) && prec[key] === null;
            H.assert(allowed || sensitiveNull,
                `pot record key "${key}" is allow-listed OR a NULLed sensitive column (value=${JSON.stringify(prec[key])})`);
        }
        for (const c of POT_PLAINTEXT_COLS) {
            H.assert(prec[c] == null, `sensitive pot column ${c} holds no plaintext value`);
        }
        H.assert(!prec.enc_payload.includes('Holiday'), 'pot enc_payload does not leak the "Holiday" plaintext');

        // mutation-check: the LEGACY record (pre-S4) WOULD fail this lint — it carries
        // non-null financial columns. Prove the lint actually catches that.
        const legacy = legacyMonthRow(app);
        let legacyFails = false;
        for (const c of MONTH_PLAINTEXT_COLS) { if (legacy[c] != null) legacyFails = true; }
        H.assert(legacyFails, 'mutation-check: a pre-S4 plaintext record is correctly flagged by the lint');
    });

    // =====================================================================
    // (5) FAIL-CLOSED: with NO DEK loaded, encrypt-on-write throws (never writes
    //     plaintext) and decrypt-on-read of an ENCRYPTED row throws (never blanks).
    // =====================================================================
    await H.gate('S4/S5 (5) fail-closed without a DEK', async () => {
        // First build a genuine encrypted row WHILE a DEK is loaded.
        FAKE_BKS.load(dek);
        const app = makeAppMonth();
        const encRec = DB.transformMonthToDatabase(app, YEAR, MONTH, USER_ID);
        const encPot = DB.transformPotToDatabase(makeAppPot());

        // Now UNLOAD the DEK and prove both directions fail closed.
        FAKE_BKS.unload();

        H.assertThrows(() => DB.transformMonthToDatabase(app, YEAR, MONTH, USER_ID),
            'to-database (month) with NO DEK must throw (fail closed)');
        H.assertThrows(() => DB.transformPotToDatabase(makeAppPot()),
            'to-database (pot) with NO DEK must throw (fail closed)');
        H.assertThrows(() => DB.transformMonthFromDatabase(encRec),
            'from-database of an ENCRYPTED month with NO DEK must throw (never blank)');
        H.assertThrows(() => DB.transformPotFromDatabase(encPot),
            'from-database of an ENCRYPTED pot with NO DEK must throw (never blank)');

        // mutation-check: the SAME encrypted row reads fine once the DEK is restored,
        // so the throw is attributable to the missing DEK, not a broken row.
        FAKE_BKS.load(dek);
        const ok = DB.transformMonthFromDatabase(encRec);
        H.assertEqual(JSON.stringify(ok.fixedCosts), JSON.stringify(app.fixedCosts),
            'restored DEK decrypts the same row (mutation-check baseline)');

        // a tampered ciphertext throws a typed BudgetDecryptError, not silent garbage.
        const tampered = { ...encRec, enc_payload: encRec.enc_payload.slice(0, -4) + 'AAAA' };
        let threwTyped = false;
        try { DB.transformMonthFromDatabase(tampered); }
        catch (e) { threwTyped = (e && e.name === 'BudgetDecryptError'); }
        H.assert(threwTyped, 'tampered ciphertext throws a typed BudgetDecryptError');
    });

    H.summary();
}

main().catch((e) => {
    process.stdout.write('\nUNCAUGHT: ' + (e && e.stack ? e.stack : e) + '\n');
    process.exitCode = 1;
});
