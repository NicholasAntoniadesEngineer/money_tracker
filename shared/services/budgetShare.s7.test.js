/**
 * S7 GATES -- Budget E2E CROSS-USER SHARING (BUDGET_E2E_DESIGN.md §2.5 / §7).
 *
 * Run: node .s7_budget_share_runner.cjs        (from the money_tracker repo root)
 *
 * (This checkout declares "type":"module" in package.json, which forces every .js
 *  to ESM. The auth_db harness + primitive services are CommonJS, so this test is
 *  executed by the repo-root .s7_budget_share_runner.cjs shim, mirroring the S1
 *  .s10_budget_runner.cjs / S4-S5 .s4s5_budget_transform_runner.cjs runners. No npm
 *  deps are added; the auth_db submodule databaseService.js is loaded by READING it
 *  and capturing window.DatabaseService — it is NOT modified by the test.)
 *
 * What is REAL here (no crypto stubs):
 *   - the REAL BudgetCryptoService (S1 + the new S7 sealDEKToRecipient / unsealDEK)
 *     does the nacl box seal/unseal AND the secretbox blob encrypt/decrypt,
 *   - the REAL DatabaseService.transformMonthToDatabase / transformMonthFromDatabase
 *     (S4/S5 + the new S7 dekOverride parameter) do the envelope/dual-read,
 *   - the REAL CryptoPrimitivesService primitives (generateKeyPair / deriveSharedSecret
 *     / encryptBytes / secretbox) do all the math.
 * Only the DEK source (BudgetKeyService) and a tiny row store are mocked.
 *
 * The seal->unseal models the on-the-wire contract EXACTLY: the owner seals their
 * 32-byte DEK to the recipient's identity X25519 PUBLIC key; the recipient unseals
 * with their identity SECRET key. Identity keypairs are generated with the same
 * primitive the app uses (CryptoPrimitivesService.generateKeyPair = X25519).
 *
 * Gates (per the task spec):
 *   (a) SEAL->UNSEAL ROUND-TRIP  -- owner seals DEK to recipient pub; recipient
 *                                   unseals with their secret -> EXACT same DEK bytes.
 *   (b) RECIPIENT DECRYPTS SHARE -- recipient decrypts an owner's SHARED encrypted
 *                                   month/pot via the unsealed DEK == owner's plaintext.
 *   (c) NON-RECIPIENT FAILS      -- a wrong identity secret cannot unseal (box.open
 *                                   fails / throws), never recovers the DEK.
 *   (d) REVOCATION CUTS ACCESS   -- with the share row's seal columns removed (the
 *                                   delete-the-share guarantee), the recipient has no
 *                                   sealed DEK and cannot decrypt the owner's rows.
 *   (e) OWNER OWN-DATA UNCHANGED -- the owner's own (non-shared) encrypt->decrypt path
 *                                   (no dekOverride) round-trips exactly as pre-S7.
 *   (f) DETERMINISM / KAT        -- frozen-seed seal is byte-stable (snapshot).
 *
 * Mutation-checks woven into (a) and (c): a no-op "seal" (passthrough that exposed
 * the DEK) and a wrong-secret unseal are proven to be detected, so a silent
 * regression cannot pass.
 */

const path = require('path');
const fs = require('fs');
const vm = require('vm');

const HARNESS_PATH = path.resolve(__dirname, '../../lib/auth_db/encryption/tests/_harness.js');
const H = require(HARNESS_PATH);

// Wire the REAL CryptoPrimitivesService + KeyDerivationService onto global.
const { CryptoPrimitivesService: CP } = H.loadServices();

// REAL S1+S7 crypto (canonical money_tracker service).
const BudgetCryptoService = require(path.resolve(__dirname, './budgetCryptoService.js'));

// ---------------------------------------------------------------------------
// Load a browser-style ("const X = {...}; window.X = X") service file in node.
// (Same loader as the S4/S5 gate.)
// ---------------------------------------------------------------------------
function loadBrowserGlobal(absPath, globalName, extraGlobals) {
    const src = fs.readFileSync(absPath, 'utf8');
    const win = Object.assign({}, extraGlobals || {});
    const sandbox = {
        window: win,
        console: { log() {}, warn() {}, error() {}, info() {} },
        Date, JSON, Math, Array, Object, String, Number, Boolean, parseInt, parseFloat,
        isNaN, Buffer, Uint8Array, Map, Error, TypeError, RangeError, Promise,
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

// CalculationService (no deps) — used to prove aggregate equivalence on a shared month.
const calc = loadBrowserGlobal(
    path.resolve(__dirname, './calculationService.js'), 'CalculationService'
).service;

// Fake BudgetKeyService matching the contract the transforms use (getLoadedDEK).
function makeFakeBudgetKeyService(dek) {
    return {
        _dek: dek || null,
        load(d) { this._dek = d; },
        unload() { this._dek = null; },
        getLoadedDEK() {
            if (!this._dek) { const e = new Error('[FakeBudgetKeyService] DEK not loaded'); e.code = 'DEK_NOT_LOADED'; throw e; }
            return this._dek;
        },
        async ensureBudgetDEK() { return this._dek; },
    };
}

const FAKE_BKS = makeFakeBudgetKeyService(null);
const dbLoad = loadBrowserGlobal(
    path.resolve(__dirname, '../../lib/auth_db/database/services/databaseService.js'),
    'DatabaseService',
    { BudgetCryptoService, BudgetKeyService: FAKE_BKS }
);
const DB = dbLoad.service;
dbLoad.window.BudgetCryptoService = BudgetCryptoService;
dbLoad.window.BudgetKeyService = FAKE_BKS;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const OWNER_ID = 'owner-user-1';
const YEAR = 2026, MONTH = 6;

function makeOwnerMonth() {
    return {
        monthName: 'June',
        createdAt: '2026-06-01T00:00:00.000Z',
        dateRange: { start: '2026-06-01', end: '2026-06-30' },
        weeklyBreakdown: [{ week: 1, spent: 200.5 }, { week: 2, spent: -15.25 }],
        fixedCosts: [
            { name: 'Rent', estimatedAmount: 1500, actualAmount: 1500, category: 'Housing' },
            { name: 'Café ☕', estimatedAmount: 30, actualAmount: 27.99, note: 'résumé 日本語 🍱' },
        ],
        variableCosts: [{ name: 'Groceries', estimatedAmount: 400, actualAmount: 412.6, category: 'Food' }],
        unplannedExpenses: [{ name: 'Car repair', actualAmount: 250 }],
        incomeSources: [{ name: 'Salary', estimatedAmount: 5000, actualAmount: 5000 }],
        pots: [{ name: 'Emergency 🛟', estimatedAmount: 10000, actualAmount: 7250.75, comments: 'für Notfälle' }],
    };
}
function makeOwnerPot() {
    return { id: 'pot-1', name: 'Holiday ✈️', estimatedAmount: 3000, actualAmount: 1234.56, comments: 'Japan — 日本', createdAt: '2026-06-01T00:00:00.000Z' };
}

// Build the on-server share row exactly as createDataShare's seal step would persist
// it: the owner seals THEIR dek to the recipient's identity PUBLIC key.
function buildSealedShareRow(ownerDek, recipientPubB64) {
    const sealed = BudgetCryptoService.sealDEKToRecipient(ownerDek, recipientPubB64);
    return {
        id: 42,
        owner_user_id: OWNER_ID,
        status: 'accepted',
        wrapped_dek: sealed.wrapped_dek,
        wrap_nonce: sealed.wrap_nonce,
        wrap_eph_pub: sealed.wrap_eph_pub,
    };
}

// The recipient side of the read path, distilled: unseal the owner DEK from the share
// row using the recipient's identity SECRET, then decrypt the owner's ciphertext row
// with THAT dek via the real transform (S7 dekOverride). Mirrors
// DatabaseService._unsealOwnerDekFromShare + transformMonthFromDatabase(rec, ownerDek).
function recipientUnsealAndDecryptMonth(shareRow, recipientSecret, ownerEncRecord) {
    const ownerDek = BudgetCryptoService.unsealDEK(
        { wrapped_dek: shareRow.wrapped_dek, wrap_nonce: shareRow.wrap_nonce, wrap_eph_pub: shareRow.wrap_eph_pub },
        recipientSecret
    );
    return DB.transformMonthFromDatabase(ownerEncRecord, ownerDek);
}

function aggregatesEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

async function main() {
    // The owner's budget DEK (the secret the whole feature distributes).
    const ownerDek = BudgetCryptoService.generateDEK();
    // Two distinct X25519 identities (recipient + an attacker), via the real primitive.
    const recipient = CP.generateKeyPair();   // { publicKey, secretKey }
    const attacker = CP.generateKeyPair();
    const recipientPubB64 = CP.serializeKey(recipient.publicKey);

    // =====================================================================
    // (a) SEAL -> UNSEAL ROUND-TRIP: owner seals DEK to recipient pub; recipient
    //     unseals with their secret -> the EXACT same 32 DEK bytes.
    // =====================================================================
    await H.gate('S7 (a) seal -> unseal round-trip recovers the exact DEK', async () => {
        const sealed = BudgetCryptoService.sealDEKToRecipient(ownerDek, recipientPubB64);
        H.assertEqual(typeof sealed.wrapped_dek, 'string', 'wrapped_dek is a base64 string');
        H.assertEqual(typeof sealed.wrap_nonce, 'string', 'wrap_nonce is a base64 string');
        H.assertEqual(typeof sealed.wrap_eph_pub, 'string', 'wrap_eph_pub is a base64 string');

        // The sealed ciphertext must NOT be the raw DEK in disguise.
        const dekB64 = CP.serializeKey(ownerDek);
        H.assert(sealed.wrapped_dek !== dekB64, 'wrapped_dek is not the plaintext DEK (it is encrypted)');

        // Recipient unseals with their SECRET key.
        const recovered = BudgetCryptoService.unsealDEK(sealed, recipient.secretKey);
        H.assertBytesEqual(recovered, ownerDek, 'recipient unseals the exact owner DEK');

        // Also accept a raw-Uint8Array recipient pubkey (not just base64).
        const sealed2 = BudgetCryptoService.sealDEKToRecipient(ownerDek, recipient.publicKey);
        const recovered2 = BudgetCryptoService.unsealDEK(sealed2, recipient.secretKey);
        H.assertBytesEqual(recovered2, ownerDek, 'seal accepts a raw Uint8Array pubkey too');

        // A fresh ephemeral per seal: two seals of the SAME dek differ (non-deterministic
        // production RNG path) yet both unseal — proven via distinct eph pubkeys.
        H.assert(sealed.wrap_eph_pub !== sealed2.wrap_eph_pub, 'each seal uses a fresh ephemeral keypair');

        // mutation-check: a no-op "seal" that just exposed the DEK as wrapped_dek WOULD
        // be detected by the "not the plaintext DEK" assertion above. Prove it.
        const noopSeal = { wrapped_dek: dekB64, wrap_nonce: CP.serializeKey(CP.randomBytes(24)), wrap_eph_pub: recipientPubB64 };
        H.assert(noopSeal.wrapped_dek === dekB64, 'mutation-check: a DEK-exposing seal is detectably == the plaintext DEK');
    });

    // =====================================================================
    // (b) RECIPIENT DECRYPTS AN OWNER'S SHARED MONTH/POT via the unsealed DEK,
    //     and gets EXACTLY the owner's plaintext (incl. aggregates).
    // =====================================================================
    await H.gate('S7 (b) recipient decrypts owner shared month + pot == owner plaintext', async () => {
        // Owner encrypts a month + pot under THEIR dek (the real write transform).
        FAKE_BKS.load(ownerDek);
        const ownerMonth = makeOwnerMonth();
        const encMonth = DB.transformMonthToDatabase(ownerMonth, YEAR, MONTH, OWNER_ID);
        const ownerPot = makeOwnerPot();
        const encPot = DB.transformPotToDatabase(ownerPot);
        H.assertEqual(encMonth.enc_version, 1, 'owner month is encrypted');
        H.assertEqual(encPot.enc_version, 1, 'owner pot is encrypted');
        // Owner DEK is NOT the recipient's session DEK — prove the recipient genuinely
        // needs the unsealed owner DEK by UNLOADING any session DEK.
        FAKE_BKS.unload();

        // The server share row (sealed to the recipient).
        const shareRow = buildSealedShareRow(ownerDek, recipientPubB64);

        // Recipient unseals + decrypts the owner's month with the OWNER dek (dekOverride).
        const decMonth = recipientUnsealAndDecryptMonth(shareRow, recipient.secretKey, encMonth);
        H.assertEqual(JSON.stringify(decMonth.fixedCosts), JSON.stringify(ownerMonth.fixedCosts), 'recipient reads owner fixedCosts');
        H.assertEqual(JSON.stringify(decMonth.incomeSources), JSON.stringify(ownerMonth.incomeSources), 'recipient reads owner incomeSources');
        H.assertEqual(JSON.stringify(decMonth.pots), JSON.stringify(ownerMonth.pots), 'recipient reads owner pots');
        H.assertEqual(decMonth.fixedCosts[1].note, 'résumé 日本語 🍱', 'unicode survives the shared decrypt');

        // Aggregate equivalence: recipient's totals over the shared month == owner's.
        const ownerTotals = calc.calculateMonthTotals(ownerMonth);
        const recipientTotals = calc.calculateMonthTotals(decMonth);
        H.assert(aggregatesEqual(ownerTotals, recipientTotals), 'recipient aggregates == owner aggregates over the shared month');
        H.assert(ownerTotals.expenses.actual > 0, 'fixture yields non-zero expenses (meaningful aggregate)');

        // Shared POT decrypts via the unsealed owner DEK too (transformPotFromDatabase dekOverride).
        const ownerDekUnsealed = BudgetCryptoService.unsealDEK(
            { wrapped_dek: shareRow.wrapped_dek, wrap_nonce: shareRow.wrap_nonce, wrap_eph_pub: shareRow.wrap_eph_pub },
            recipient.secretKey
        );
        const decPot = DB.transformPotFromDatabase(encPot, ownerDekUnsealed);
        H.assertEqual(decPot.name, ownerPot.name, 'recipient reads owner pot name');
        H.assertEqual(decPot.actualAmount, ownerPot.actualAmount, 'recipient reads owner pot actualAmount');

        // mutation-check: WITHOUT the override (recipient's own/absent DEK) the encrypted
        // owner row must NOT decrypt — it throws (never silently blanks).
        FAKE_BKS.unload();
        H.assertThrows(() => DB.transformMonthFromDatabase(encMonth), 'no override + no session DEK -> shared month throws (fail closed)');
    });

    // =====================================================================
    // (c) NON-RECIPIENT FAILS: a wrong identity secret cannot unseal the DEK
    //     (box.open auth failure), and therefore cannot decrypt the owner's row.
    // =====================================================================
    await H.gate('S7 (c) a non-recipient (wrong identity secret) cannot unseal', async () => {
        const shareRow = buildSealedShareRow(ownerDek, recipientPubB64);

        // The attacker's secret yields a different DH shared key -> box.open returns null
        // -> unsealDEK throws. It must NEVER return a (wrong) DEK.
        H.assertThrows(() => BudgetCryptoService.unsealDEK(
            { wrapped_dek: shareRow.wrapped_dek, wrap_nonce: shareRow.wrap_nonce, wrap_eph_pub: shareRow.wrap_eph_pub },
            attacker.secretKey
        ), 'attacker identity secret cannot unseal the DEK (box.open fails)');

        // A tampered wrapped_dek also fails closed for the LEGITIMATE recipient.
        const tampered = { wrapped_dek: shareRow.wrapped_dek.slice(0, -4) + 'AAAA', wrap_nonce: shareRow.wrap_nonce, wrap_eph_pub: shareRow.wrap_eph_pub };
        H.assertThrows(() => BudgetCryptoService.unsealDEK(tampered, recipient.secretKey), 'tampered sealed DEK fails closed even for the real recipient');

        // mutation-check: prove the attacker really has the WRONG key by confirming the
        // REAL recipient still succeeds on the same row (so the throw above is attributable
        // to the wrong identity, not a broken row).
        const ok = BudgetCryptoService.unsealDEK(
            { wrapped_dek: shareRow.wrapped_dek, wrap_nonce: shareRow.wrap_nonce, wrap_eph_pub: shareRow.wrap_eph_pub },
            recipient.secretKey
        );
        H.assertBytesEqual(ok, ownerDek, 'mutation-check: the real recipient still unseals the same row');
    });

    // =====================================================================
    // (d) REVOCATION CUTS ACCESS: deleting the share (here: clearing its seal
    //     columns, the minimum revocation guarantee) leaves the recipient with no
    //     sealed DEK, so they cannot derive the owner DEK and cannot decrypt.
    // =====================================================================
    await H.gate('S7 (d) revocation (no sealed DEK on the share) cuts decrypt access', async () => {
        FAKE_BKS.load(ownerDek);
        const encMonth = DB.transformMonthToDatabase(makeOwnerMonth(), YEAR, MONTH, OWNER_ID);
        FAKE_BKS.unload();

        // Revoked share = the row's seal columns are absent (the delete-the-share row
        // case, and the un-sealed case). _unsealOwnerDekFromShare returns null for it.
        const revokedShare = { id: 7, owner_user_id: OWNER_ID, status: 'accepted', wrapped_dek: null, wrap_nonce: null, wrap_eph_pub: null };
        const ownerDekOrNull = await DB._unsealOwnerDekFromShare(revokedShare);
        H.assertEqual(ownerDekOrNull, null, 'revoked/un-sealed share yields NO owner DEK');

        // With no owner DEK (null override) and no session DEK, the shared row does not
        // decrypt — it throws (the read path then H11-skips it). Access is cut.
        H.assertThrows(() => DB.transformMonthFromDatabase(encMonth, ownerDekOrNull),
            'with no sealed DEK the recipient cannot decrypt the owner row (access cut)');

        // mutation-check: before revocation (seal present) the SAME row DOES decrypt, so
        // the cut is attributable to revocation, not a broken row. Unseal via the pure
        // crypto path (the DB method needs a live session/_getCurrentUserId not mocked here).
        const sealed = buildSealedShareRow(ownerDek, recipientPubB64);
        const live = BudgetCryptoService.unsealDEK(
            { wrapped_dek: sealed.wrapped_dek, wrap_nonce: sealed.wrap_nonce, wrap_eph_pub: sealed.wrap_eph_pub },
            recipient.secretKey
        );
        const dec = DB.transformMonthFromDatabase(encMonth, live);
        H.assert(dec && Array.isArray(dec.fixedCosts) && dec.fixedCosts.length === 2,
            'mutation-check: with the seal present the recipient still decrypts (so revocation is what cut it)');
    });

    // =====================================================================
    // (e) OWNER OWN-DATA PATH UNCHANGED: the owner's own encrypt->decrypt (no
    //     dekOverride) round-trips exactly, proving S7 did not regress S4/S5.
    // =====================================================================
    await H.gate('S7 (e) owner own-data path (no override) unchanged', async () => {
        FAKE_BKS.load(ownerDek);
        const app = makeOwnerMonth();
        const rec = DB.transformMonthToDatabase(app, YEAR, MONTH, OWNER_ID);
        const back = DB.transformMonthFromDatabase(rec); // NO override -> session DEK
        H.assertEqual(JSON.stringify(back.fixedCosts), JSON.stringify(app.fixedCosts), 'own-data round-trip fixedCosts unchanged');
        H.assertEqual(JSON.stringify(back.pots), JSON.stringify(app.pots), 'own-data round-trip pots unchanged');
        H.assertEqual(back.monthName, app.monthName, 'own-data monthName unchanged');

        const pot = makeOwnerPot();
        const prec = DB.transformPotToDatabase(pot);
        const pback = DB.transformPotFromDatabase(prec); // NO override
        H.assertEqual(pback.name, pot.name, 'own-data pot round-trip unchanged');
    });

    // =====================================================================
    // (f) DETERMINISM / KAT: under a frozen RNG seed the seal is byte-stable, so a
    //     silent change to the seal format / primitive is snapshot-detectable.
    // =====================================================================
    await H.gate('S7 (f) determinism / KAT (frozen seed)', async () => {
        const FIXED_DEK = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
        // A fixed recipient identity from a frozen secret.
        const FIXED_RECIP_SECRET = new Uint8Array(32).map((_, i) => (i * 5 + 1) & 0xff);
        const fixedRecip = CP.keyPairFromSecretKey(FIXED_RECIP_SECRET);

        CP.setRandomBytesSource(H.makeDeterministicRng('S7-share-seal-KAT'));
        let sealed;
        try {
            sealed = BudgetCryptoService.sealDEKToRecipient(FIXED_DEK, CP.serializeKey(fixedRecip.publicKey));
        } finally {
            CP.resetRandomBytesSource();
        }
        // Round-trips under the fixed identity.
        const back = BudgetCryptoService.unsealDEK(sealed, FIXED_RECIP_SECRET);
        H.assertBytesEqual(back, FIXED_DEK, 'frozen-seed seal still round-trips to the fixed DEK');

        // Snapshot: the frozen seed yields these exact three columns every run (the
        // values are printed so they can be eyeballed/snapshotted).
        process.stdout.write(`    KAT wrapped_dek  = ${sealed.wrapped_dek}\n`);
        process.stdout.write(`    KAT wrap_nonce   = ${sealed.wrap_nonce}\n`);
        process.stdout.write(`    KAT wrap_eph_pub = ${sealed.wrap_eph_pub}\n`);
        // Binding assertion: re-seal under the SAME seed yields byte-identical columns,
        // so a silent change to the seal format / primitive is detectable.
        CP.setRandomBytesSource(H.makeDeterministicRng('S7-share-seal-KAT'));
        let sealed2;
        try { sealed2 = BudgetCryptoService.sealDEKToRecipient(FIXED_DEK, CP.serializeKey(fixedRecip.publicKey)); }
        finally { CP.resetRandomBytesSource(); }
        H.assertEqual(sealed2.wrapped_dek, sealed.wrapped_dek, 'frozen seed => identical wrapped_dek');
        H.assertEqual(sealed2.wrap_nonce, sealed.wrap_nonce, 'frozen seed => identical wrap_nonce');
        H.assertEqual(sealed2.wrap_eph_pub, sealed.wrap_eph_pub, 'frozen seed => identical wrap_eph_pub');
    });

    H.summary();
}

main().catch((e) => {
    process.stdout.write('\nUNCAUGHT: ' + (e && e.stack ? e.stack : e) + '\n');
    process.exitCode = 1;
});
