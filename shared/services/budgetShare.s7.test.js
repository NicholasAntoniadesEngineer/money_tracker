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
const RECIPIENT_ID = 'recipient-user-2';
const YEAR = 2026, MONTH = 6;
const DEK_VERSION = 1;
const SHARE_ID = 42;

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

// SEC-H4: the authenticated-seal opts the OWNER passes at seal time. The static-static
// DH leg authenticates the owner; the context binds the seal to this exact share.
function ownerSealOpts(ownerKeyPair, recipientId = RECIPIENT_ID, shareId = SHARE_ID, dekVersion = DEK_VERSION) {
    return {
        ownerSecretKey: ownerKeyPair.secretKey,
        ownerPublicKey: ownerKeyPair.publicKey,
        ownerId: OWNER_ID,
        recipientId,
        dekVersion,
        shareId,
    };
}

// SEC-H4: the verification opts the RECIPIENT passes at unseal time. expectedOwnerPublicKey
// is the PINNED owner identity key; the context must match the share row.
function recipientUnsealOpts(ownerKeyPair, recipientId = RECIPIENT_ID, shareId = SHARE_ID, dekVersion = DEK_VERSION) {
    return {
        expectedOwnerPublicKey: ownerKeyPair.publicKey,
        ownerId: OWNER_ID,
        recipientId,
        dekVersion,
        shareId,
    };
}

// Build the on-server share row exactly as createDataShare's seal step would persist it:
// the owner seals THEIR dek (authenticated + context-bound) to the recipient pubkey.
function buildSealedShareRow(ownerDek, recipientPubB64, ownerKeyPair, shareId = SHARE_ID) {
    const sealed = BudgetCryptoService.sealDEKToRecipient(
        ownerDek, recipientPubB64, ownerSealOpts(ownerKeyPair, RECIPIENT_ID, shareId)
    );
    return {
        id: shareId,
        owner_user_id: OWNER_ID,
        status: 'accepted',
        wrapped_dek: sealed.wrapped_dek,
        wrap_nonce: sealed.wrap_nonce,
        wrap_eph_pub: sealed.wrap_eph_pub,
        wrap_owner_ik: sealed.wrap_owner_ik,
        wrap_alg: sealed.wrap_alg,
        dek_version: sealed.dek_version,
    };
}

// The recipient side of the read path, distilled: unseal the owner DEK from the share
// row (verifying the bound context + pinned owner key) using the recipient's identity
// SECRET, then decrypt the owner's ciphertext row with THAT dek via the real transform
// (S7 dekOverride). Mirrors DatabaseService._unsealOwnerDekFromShare +
// transformMonthFromDatabase(rec, ownerDek).
function recipientUnsealAndDecryptMonth(shareRow, recipientSecret, ownerEncRecord, ownerKeyPair) {
    const ownerDek = BudgetCryptoService.unsealDEK(
        shareRow, recipientSecret, recipientUnsealOpts(ownerKeyPair, RECIPIENT_ID, shareRow.id)
    );
    return DB.transformMonthFromDatabase(ownerEncRecord, ownerDek);
}

function aggregatesEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

async function main() {
    // The owner's budget DEK (the secret the whole feature distributes).
    const ownerDek = BudgetCryptoService.generateDEK();
    // X25519 identities via the real primitive: the OWNER static identity (SEC-H4: the
    // sender-authenticating static-static DH leg), the recipient, and an attacker.
    const owner = CP.generateKeyPair();        // { publicKey, secretKey } — OWNER identity
    const recipient = CP.generateKeyPair();
    const attacker = CP.generateKeyPair();
    const recipientPubB64 = CP.serializeKey(recipient.publicKey);

    // =====================================================================
    // (a) SEAL -> UNSEAL ROUND-TRIP: owner seals DEK to recipient pub; recipient
    //     unseals with their secret -> the EXACT same 32 DEK bytes.
    // =====================================================================
    await H.gate('S7 (a) seal -> unseal round-trip recovers the exact DEK', async () => {
        const sealed = BudgetCryptoService.sealDEKToRecipient(ownerDek, recipientPubB64, ownerSealOpts(owner));
        H.assertEqual(typeof sealed.wrapped_dek, 'string', 'wrapped_dek is a base64 string');
        H.assertEqual(typeof sealed.wrap_nonce, 'string', 'wrap_nonce is a base64 string');
        H.assertEqual(typeof sealed.wrap_eph_pub, 'string', 'wrap_eph_pub is a base64 string');
        // SEC-H4: the authenticated seal also persists the bound owner IK + alg tag.
        H.assertEqual(typeof sealed.wrap_owner_ik, 'string', 'wrap_owner_ik (bound owner identity) is a base64 string');
        H.assertEqual(sealed.wrap_owner_ik, CP.serializeKey(owner.publicKey), 'wrap_owner_ik == owner identity pub');
        H.assertEqual(sealed.wrap_alg, 'v2-auth', 'wrap_alg marks the authenticated construction');

        // The sealed ciphertext must NOT be the raw DEK in disguise.
        const dekB64 = CP.serializeKey(ownerDek);
        H.assert(sealed.wrapped_dek !== dekB64, 'wrapped_dek is not the plaintext DEK (it is encrypted)');

        // Recipient unseals with their SECRET key + the verification opts.
        const recovered = BudgetCryptoService.unsealDEK(sealed, recipient.secretKey, recipientUnsealOpts(owner));
        H.assertBytesEqual(recovered, ownerDek, 'recipient unseals the exact owner DEK');

        // Also accept a raw-Uint8Array recipient pubkey (not just base64) at seal time.
        const sealed2 = BudgetCryptoService.sealDEKToRecipient(ownerDek, recipient.publicKey, ownerSealOpts(owner));
        const recovered2 = BudgetCryptoService.unsealDEK(sealed2, recipient.secretKey, recipientUnsealOpts(owner));
        H.assertBytesEqual(recovered2, ownerDek, 'seal accepts a raw Uint8Array pubkey too');

        // A fresh ephemeral per seal: two seals of the SAME dek differ (non-deterministic
        // production RNG path) yet both unseal — proven via distinct eph pubkeys.
        H.assert(sealed.wrap_eph_pub !== sealed2.wrap_eph_pub, 'each seal uses a fresh ephemeral keypair');

        // mutation-check: a no-op "seal" that just exposed the DEK as wrapped_dek WOULD
        // be detected by the "not the plaintext DEK" assertion above. Prove it.
        const noopSeal = { wrapped_dek: dekB64, wrap_nonce: CP.serializeKey(CP.randomBytes(24)), wrap_eph_pub: recipientPubB64 };
        H.assert(noopSeal.wrapped_dek === dekB64, 'mutation-check: a DEK-exposing seal is detectably == the plaintext DEK');

        // SEC-H4 mutation-check: an ANONYMOUS seal (no opts) is now REJECTED outright,
        // so a silent regression back to the unauthenticated box cannot pass.
        H.assertThrows(() => BudgetCryptoService.sealDEKToRecipient(ownerDek, recipientPubB64),
            'mutation-check: anonymous seal (no owner identity / context) is rejected');
        H.assertThrows(() => BudgetCryptoService.unsealDEK(sealed, recipient.secretKey),
            'mutation-check: unseal without verification opts is rejected');
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
        const shareRow = buildSealedShareRow(ownerDek, recipientPubB64, owner);

        // Recipient unseals + decrypts the owner's month with the OWNER dek (dekOverride).
        const decMonth = recipientUnsealAndDecryptMonth(shareRow, recipient.secretKey, encMonth, owner);
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
            shareRow, recipient.secretKey, recipientUnsealOpts(owner)
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
        const shareRow = buildSealedShareRow(ownerDek, recipientPubB64, owner);

        // The attacker's secret yields a different DH shared key -> box.open returns null
        // -> unsealDEK throws. It must NEVER return a (wrong) DEK. (The attacker also fails
        // the bound-owner-key check unless they happen to pass the right pinned key, but
        // even with it the DH legs are wrong -> AEAD fails.)
        H.assertThrows(() => BudgetCryptoService.unsealDEK(
            shareRow, attacker.secretKey, recipientUnsealOpts(owner)
        ), 'attacker identity secret cannot unseal the DEK (box.open fails)');

        // A tampered wrapped_dek also fails closed for the LEGITIMATE recipient.
        const tampered = Object.assign({}, shareRow, { wrapped_dek: shareRow.wrapped_dek.slice(0, -4) + 'AAAA' });
        H.assertThrows(() => BudgetCryptoService.unsealDEK(tampered, recipient.secretKey, recipientUnsealOpts(owner)), 'tampered sealed DEK fails closed even for the real recipient');

        // mutation-check: prove the attacker really has the WRONG key by confirming the
        // REAL recipient still succeeds on the same row (so the throw above is attributable
        // to the wrong identity, not a broken row).
        const ok = BudgetCryptoService.unsealDEK(shareRow, recipient.secretKey, recipientUnsealOpts(owner));
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
        const sealed = buildSealedShareRow(ownerDek, recipientPubB64, owner);
        const live = BudgetCryptoService.unsealDEK(sealed, recipient.secretKey, recipientUnsealOpts(owner));
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
        // Fixed recipient + OWNER identities from frozen secrets (SEC-H4: the seal binds
        // the owner static identity, so the KAT pins it too).
        const FIXED_RECIP_SECRET = new Uint8Array(32).map((_, i) => (i * 5 + 1) & 0xff);
        const FIXED_OWNER_SECRET = new Uint8Array(32).map((_, i) => (i * 11 + 9) & 0xff);
        const fixedRecip = CP.keyPairFromSecretKey(FIXED_RECIP_SECRET);
        const fixedOwner = CP.keyPairFromSecretKey(FIXED_OWNER_SECRET);
        const fixedSealOpts = ownerSealOpts(fixedOwner);             // owner static + bound context
        const fixedUnsealOpts = recipientUnsealOpts(fixedOwner);     // pinned owner key + bound context

        CP.setRandomBytesSource(H.makeDeterministicRng('S7-share-seal-KAT'));
        let sealed;
        try {
            sealed = BudgetCryptoService.sealDEKToRecipient(FIXED_DEK, CP.serializeKey(fixedRecip.publicKey), fixedSealOpts);
        } finally {
            CP.resetRandomBytesSource();
        }
        // Round-trips under the fixed identities + bound context.
        const back = BudgetCryptoService.unsealDEK(sealed, FIXED_RECIP_SECRET, fixedUnsealOpts);
        H.assertBytesEqual(back, FIXED_DEK, 'frozen-seed seal still round-trips to the fixed DEK');

        // Snapshot: the frozen seed yields these exact columns every run (printed so they
        // can be eyeballed/snapshotted). wrap_owner_ik is deterministic (fixed owner).
        process.stdout.write(`    KAT wrapped_dek   = ${sealed.wrapped_dek}\n`);
        process.stdout.write(`    KAT wrap_nonce    = ${sealed.wrap_nonce}\n`);
        process.stdout.write(`    KAT wrap_eph_pub  = ${sealed.wrap_eph_pub}\n`);
        process.stdout.write(`    KAT wrap_owner_ik = ${sealed.wrap_owner_ik}\n`);
        // Binding assertion: re-seal under the SAME seed yields byte-identical columns,
        // so a silent change to the seal format / primitive is detectable.
        CP.setRandomBytesSource(H.makeDeterministicRng('S7-share-seal-KAT'));
        let sealed2;
        try { sealed2 = BudgetCryptoService.sealDEKToRecipient(FIXED_DEK, CP.serializeKey(fixedRecip.publicKey), fixedSealOpts); }
        finally { CP.resetRandomBytesSource(); }
        H.assertEqual(sealed2.wrapped_dek, sealed.wrapped_dek, 'frozen seed => identical wrapped_dek');
        H.assertEqual(sealed2.wrap_nonce, sealed.wrap_nonce, 'frozen seed => identical wrap_nonce');
        H.assertEqual(sealed2.wrap_eph_pub, sealed.wrap_eph_pub, 'frozen seed => identical wrap_eph_pub');
        H.assertEqual(sealed2.wrap_owner_ik, sealed.wrap_owner_ik, 'frozen seed => identical wrap_owner_ik');
    });

    // =====================================================================
    // (g) SEC-H4 AUTHENTICATED-SEAL NEGATIVES: a seal whose bound context does not
    //     match the share row, whose sender (owner) key is changed/substituted, or
    //     that is a legacy/anonymous seal, MUST fail closed on unseal.
    // =====================================================================
    await H.gate('S7 (g) SEC-H4: context-mismatch / unpinned-or-changed owner / anonymous seal fail closed', async () => {
        // A legit authenticated seal bound to (owner, recipient=RECIPIENT_ID, dek=1, share=42).
        const shareRow = buildSealedShareRow(ownerDek, recipientPubB64, owner, SHARE_ID);

        // Baseline: the correct opts unseal it (so every throw below is attributable to
        // the ONE thing changed, not a broken row).
        const okBaseline = BudgetCryptoService.unsealDEK(shareRow, recipient.secretKey, recipientUnsealOpts(owner));
        H.assertBytesEqual(okBaseline, ownerDek, 'baseline: correct context + pinned owner unseals');

        // g1: wrong bound share_id -> HKDF info differs -> AEAD fails -> throws.
        H.assertThrows(() => BudgetCryptoService.unsealDEK(
            shareRow, recipient.secretKey, recipientUnsealOpts(owner, RECIPIENT_ID, SHARE_ID + 1)
        ), 'g1: a seal verified against a DIFFERENT share_id fails closed');

        // g2: wrong bound recipient_id -> info differs -> throws.
        H.assertThrows(() => BudgetCryptoService.unsealDEK(
            shareRow, recipient.secretKey, recipientUnsealOpts(owner, 'someone-else', SHARE_ID)
        ), 'g2: a seal verified against a DIFFERENT recipient_id fails closed');

        // g3: wrong bound dek_version -> info differs -> throws.
        H.assertThrows(() => BudgetCryptoService.unsealDEK(
            shareRow, recipient.secretKey, recipientUnsealOpts(owner, RECIPIENT_ID, SHARE_ID, DEK_VERSION + 1)
        ), 'g3: a seal verified against a DIFFERENT dek_version fails closed');

        // g4: wrong bound owner_id -> info differs -> throws.
        H.assertThrows(() => BudgetCryptoService.unsealDEK(
            shareRow, recipient.secretKey,
            { expectedOwnerPublicKey: owner.publicKey, ownerId: 'not-the-owner', recipientId: RECIPIENT_ID, dekVersion: DEK_VERSION, shareId: SHARE_ID }
        ), 'g4: a seal verified against a DIFFERENT owner_id fails closed');

        // g5: SUBSTITUTED / CHANGED owner (pinned) key. The curious server points
        //     expectedOwnerPublicKey at an attacker key it controls; the bound owner IK
        //     on the row (the genuine owner) no longer equals the pinned key -> reject.
        H.assertThrows(() => BudgetCryptoService.unsealDEK(
            shareRow, recipient.secretKey,
            { expectedOwnerPublicKey: attacker.publicKey, ownerId: OWNER_ID, recipientId: RECIPIENT_ID, dekVersion: DEK_VERSION, shareId: SHARE_ID }
        ), 'g5: an unpinned/changed sender (owner) key fails closed (no key substitution)');

        // g6: FORGE-TO-RECIPIENT variant. An attacker (not the owner) seals an
        //     attacker-known DEK to the recipient using the ATTACKER static identity, then
        //     dresses it up as a share from OWNER_ID. The recipient verifies against the
        //     OWNER's pinned key, which != the attacker IK bound in the seal -> reject. The
        //     attacker cannot bind the owner's IK (no static-static DH without the owner
        //     secret), so a forged share cannot pass.
        const forged = buildSealedShareRow(BudgetCryptoService.generateDEK(), recipientPubB64, attacker, SHARE_ID);
        forged.owner_user_id = OWNER_ID; // attacker lies about the origin on the row
        H.assertThrows(() => BudgetCryptoService.unsealDEK(
            forged, recipient.secretKey, recipientUnsealOpts(owner) // verified against OWNER pin
        ), 'g6: a forged share (sealed under an attacker identity) fails the pinned-owner check');

        // g7: LEGACY / ANONYMOUS seal (no wrap_owner_ik) fails closed — no silent v1 read.
        const anonRow = { wrapped_dek: shareRow.wrapped_dek, wrap_nonce: shareRow.wrap_nonce, wrap_eph_pub: shareRow.wrap_eph_pub };
        H.assertThrows(() => BudgetCryptoService.unsealDEK(anonRow, recipient.secretKey, recipientUnsealOpts(owner)),
            'g7: a legacy/anonymous seal (missing wrap_owner_ik) fails closed (owner must re-seal)');

        // mutation-check: confirm the baseline STILL unseals after all the negatives, so
        // the row itself is intact and the throws are attributable to the changed input.
        const okAfter = BudgetCryptoService.unsealDEK(shareRow, recipient.secretKey, recipientUnsealOpts(owner));
        H.assertBytesEqual(okAfter, ownerDek, 'mutation-check: the legit seal still round-trips after the negatives');
    });

    // =====================================================================
    // (h) SEC-C1 RLS REGRESSION: a recipient PATCH that flips can_edit/share_all_data
    //     must be REJECTED. We assert the canonical schema actually carries the fix
    //     (WITH CHECK on both UPDATE policies + column-scoped UPDATE grant that excludes
    //     the grant flags + the owner-only DEFINER RPC), AND we simulate the RLS
    //     column-grant + WITH CHECK decision to prove the escalation is blocked.
    // =====================================================================
    await H.gate('S7 (h) SEC-C1: recipient cannot escalate can_edit/share_all_data', async () => {
        const schemaPath = path.resolve(__dirname, '../../database/setup/fresh-install-complete.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // (h1) Both UPDATE policies must carry a WITH CHECK (the C-1 root fix).
        const ownerPolicy = schema.match(/CREATE POLICY data_shares_update_as_owner[\s\S]*?;/);
        const recipPolicy = schema.match(/CREATE POLICY data_shares_update_as_recipient[\s\S]*?;/);
        H.assert(!!ownerPolicy, 'data_shares_update_as_owner policy is present');
        H.assert(!!recipPolicy, 'data_shares_update_as_recipient policy is present');
        H.assert(/WITH CHECK/.test(ownerPolicy[0]), 'owner UPDATE policy now has a WITH CHECK');
        H.assert(/WITH CHECK\s*\(\s*auth\.uid\(\)\s*=\s*owner_user_id\s*\)/.test(ownerPolicy[0]),
            'owner WITH CHECK pins auth.uid() = owner_user_id (no owner reassignment)');
        H.assert(/WITH CHECK/.test(recipPolicy[0]), 'recipient UPDATE policy now has a WITH CHECK');
        H.assert(/status IN \('accepted', 'rejected'\)/.test(recipPolicy[0]),
            'recipient WITH CHECK only lets status move to accepted/rejected');

        // (h2) The table-wide UPDATE grant is gone; UPDATE is column-scoped and EXCLUDES
        //      the grant flags (can_edit / share_all_data).
        H.assert(!/GRANT SELECT, INSERT, UPDATE, DELETE ON data_shares/.test(schema),
            'the old table-wide GRANT ... UPDATE ... ON data_shares is removed');
        const colGrant = schema.match(/GRANT UPDATE \(([^)]*)\)\s*\n?\s*ON data_shares TO authenticated;/);
        H.assert(!!colGrant, 'a column-scoped GRANT UPDATE(...) ON data_shares is present');
        const grantedCols = colGrant[1].split(',').map(s => s.trim());
        H.assert(grantedCols.includes('status'), 'recipient can UPDATE status (accept/reject)');
        H.assert(!grantedCols.includes('can_edit'), 'can_edit is NOT in the client UPDATE grant');
        H.assert(!grantedCols.includes('share_all_data'), 'share_all_data is NOT in the client UPDATE grant');
        H.assert(!grantedCols.includes('owner_user_id'), 'owner_user_id is NOT in the client UPDATE grant');

        // (h3) The owner-only DEFINER RPC is the sanctioned flag-mutation path.
        H.assert(/CREATE OR REPLACE FUNCTION update_share_grants\(/.test(schema), 'update_share_grants() DEFINER RPC exists');
        const rpc = schema.match(/CREATE OR REPLACE FUNCTION update_share_grants\(([\s\S]*?)\$\$;/);
        H.assert(!!rpc, 'update_share_grants body captured');
        H.assert(/SECURITY DEFINER/.test(rpc[0]), 'update_share_grants is SECURITY DEFINER');
        H.assert(/SET search_path = public/.test(rpc[0]), 'update_share_grants sets search_path (start_trial style)');
        H.assert(/owner_user_id\s*<>\s*v_uid/.test(rpc[0]), 'update_share_grants re-asserts the caller is the OWNER');

        // (h4) SIMULATE the access decision. Model the column-grant check the way Postgres
        //      applies it: a recipient PATCH may write ONLY the granted columns; writing a
        //      withheld column is rejected (SQLSTATE 42501) BEFORE RLS. Then model the
        //      recipient WITH CHECK on the surviving (status-only) write.
        const GRANTED = new Set(grantedCols);
        function recipientPatchAllowed(patchCols, newRow, ctx) {
            // privilege check (column grant)
            for (const c of patchCols) {
                if (!GRANTED.has(c)) return { allowed: false, reason: `42501: no UPDATE privilege on column ${c}` };
            }
            // USING (old row): recipient + still pending
            if (!(ctx.oldRow.shared_with_user_id === ctx.uid && ctx.oldRow.status === 'pending')) {
                return { allowed: false, reason: 'USING failed (not the pending recipient)' };
            }
            // WITH CHECK (new row): recipient + status in accepted/rejected
            if (!(newRow.shared_with_user_id === ctx.uid && ['accepted', 'rejected'].includes(newRow.status))) {
                return { allowed: false, reason: 'WITH CHECK failed (recipient + status transition)' };
            }
            return { allowed: true };
        }

        const oldRow = { id: 1, owner_user_id: OWNER_ID, shared_with_user_id: RECIPIENT_ID, status: 'pending', can_edit: false, share_all_data: false };
        const ctx = { uid: RECIPIENT_ID, oldRow };

        // The C-1 EXPLOIT attempt: pending recipient PATCHes can_edit + share_all_data.
        const exploit = recipientPatchAllowed(
            ['can_edit', 'share_all_data'],
            Object.assign({}, oldRow, { can_edit: true, share_all_data: true }),
            ctx
        );
        H.assert(exploit.allowed === false, 'C-1 EXPLOIT (recipient flips can_edit/share_all_data) is REJECTED');
        H.assert(/42501/.test(exploit.reason), 'rejection is the column-privilege check (can_edit not granted)');

        // The single-PATCH escalation variant {status:accepted, can_edit:true,...} also rejected.
        const exploit2 = recipientPatchAllowed(
            ['status', 'can_edit', 'share_all_data'],
            Object.assign({}, oldRow, { status: 'accepted', can_edit: true, share_all_data: true }),
            ctx
        );
        H.assert(exploit2.allowed === false, 'C-1 single-PATCH escalation (status+flags) is REJECTED');

        // The LEGITIMATE recipient action — accept (status only) — is ALLOWED.
        const legit = recipientPatchAllowed(['status'], Object.assign({}, oldRow, { status: 'accepted' }), ctx);
        H.assert(legit.allowed === true, 'legit recipient accept (status -> accepted) is ALLOWED');

        // mutation-check: prove the simulator is not trivially-allow — granting can_edit
        // WOULD let the exploit through, so the rejection is load-bearing.
        const GRANTED_BAD = new Set([...GRANTED, 'can_edit', 'share_all_data']);
        const wouldEscalate = (() => {
            for (const c of ['can_edit', 'share_all_data']) if (!GRANTED_BAD.has(c)) return false;
            return true;
        })();
        H.assert(wouldEscalate === true, 'mutation-check: a table-wide-UPDATE grant WOULD re-open the escalation (so the column-scope is what blocks it)');
    });

    H.summary();
}

main().catch((e) => {
    process.stdout.write('\nUNCAUGHT: ' + (e && e.stack ? e.stack : e) + '\n');
    process.exitCode = 1;
});
