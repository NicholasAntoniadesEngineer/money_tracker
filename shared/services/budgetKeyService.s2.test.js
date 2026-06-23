/**
 * S2 GATES -- Budget DEK bootstrap / fetch / multi-device (BUDGET_E2E_DESIGN.md
 * staged plan S2). Run: node .s2_budget_key_runner.cjs   (from the repo root).
 *
 * (This checkout declares "type":"module" in package.json, which forces every .js
 *  to ESM. The auth_db harness + primitive services are CommonJS, so this test is
 *  executed by the repo-root .s2_budget_key_runner.cjs shim, mirroring the S1
 *  .s10_budget_runner.cjs. No npm deps added; the auth_db submodule is NOT
 *  modified — this test lives in money_tracker.)
 *
 * Exercises BudgetKeyService (the stateful S2 bootstrap/fetch + session cache),
 * the companion to the PURE BudgetCryptoService (S1). It does NOT touch the budget
 * read/write path (that is S3+) — only DEK availability.
 *
 * Deterministic, no browser, no real DB: we INJECT
 *   - a FakeBudgetDekTable  (in-memory budget_dek with user_id PK uniqueness ->
 *                            23505 on a racing INSERT, exactly like Postgres + the
 *                            real DatabaseService _handleResponse error shape),
 *   - a FakeKeyStorage      (in-memory identity records; getIdentityKeys returns
 *                            { secretKey: Uint8Array } or null, and throws the same
 *                            typed IDENTITY_UNWRAP_FAILED / WRAP_KEY_UNAVAILABLE),
 *   - the REAL BudgetCryptoService (so wrap/unwrap is genuine crypto, not a stub),
 * via BudgetKeyService.setDependencies().
 *
 * Gates (per the task spec):
 *   (a) first-call bootstrap  -- creates + persists ONE wrapped row, returns a 32B DEK.
 *   (b) second call same device -- fetches + unwraps the SAME DEK (byte-equal); no new row.
 *   (c) MULTI-DEVICE          -- a second instance with a DIFFERENT keyStorage but the
 *                               SAME identity secret unwraps the SAME DEK from the same row.
 *   (d) concurrent bootstrap race -- two instances racing an empty table converge on ONE
 *                               DEK and exactly ONE row (the loser hits 23505 -> re-fetch).
 *   (e) wrong identity        -- an instance whose identity secret differs cannot unwrap
 *                               the existing row (throws DEK_UNWRAP_FAILED, never garbage).
 *   (f) fail-closed accessors -- getBudgetDEK before ensure throws DEK_NOT_LOADED; a locked
 *                               identity throws IDENTITY_LOCKED; a missing identity NO_IDENTITY.
 */

const path = require('path');

const HARNESS_PATH = path.resolve(__dirname, '../../lib/auth_db/encryption/tests/_harness.js');
const H = require(HARNESS_PATH);

// Wire the REAL CryptoPrimitivesService + KeyDerivationService onto global, which
// is what BudgetCryptoService._cp()/_kdf() resolve against.
const { CryptoPrimitivesService: CP } = H.loadServices();

// Modules under test (canonical money_tracker services, NOT lib/ mirrors).
const BudgetCryptoService = require(path.resolve(__dirname, './budgetCryptoService.js'));
const BudgetKeyService = require(path.resolve(__dirname, './budgetKeyService.js'));

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/**
 * In-memory budget_dek table shared by all simulated devices/instances (it is the
 * SAME server-side row store). Enforces the user_id PRIMARY KEY: a second INSERT
 * for an existing user_id returns the Postgres unique-violation error shape the
 * real DatabaseService surfaces ({ data:null, error:{ code:'23505', message } }).
 *
 * insertCount / selectCount let gates assert "exactly one row created", "no extra
 * writes on a cache miss re-fetch", etc.
 */
function makeFakeBudgetDekTable() {
    const rows = new Map(); // user_id -> { user_id, wrapped_dek, wrap_nonce, dek_version, created_at }
    return {
        rows,
        insertCount: 0,
        selectCount: 0,

        async querySelect(table, options) {
            this.selectCount += 1;
            if (table !== 'budget_dek') return { data: null, error: { message: 'unexpected table ' + table, code: 'TEST' } };
            const userId = options && options.filter && options.filter.user_id;
            const row = rows.get(userId);
            return { data: row ? [{ ...row }] : [], count: row ? 1 : 0, error: null };
        },

        async queryInsert(table, data) {
            this.insertCount += 1;
            if (table !== 'budget_dek') return { data: null, error: { message: 'unexpected table ' + table, code: 'TEST' } };
            if (rows.has(data.user_id)) {
                // user_id PRIMARY KEY violation -> Postgres 23505, as the real layer surfaces.
                return {
                    data: null, count: null,
                    error: { code: '23505', message: 'duplicate key value violates unique constraint "budget_dek_pkey"' },
                };
            }
            const row = {
                user_id: data.user_id,
                wrapped_dek: data.wrapped_dek,
                wrap_nonce: data.wrap_nonce,
                dek_version: data.dek_version,
                created_at: new Date().toISOString(),
            };
            rows.set(data.user_id, row);
            return { data: [{ ...row }], count: 1, error: null };
        },
    };
}

/**
 * In-memory identity store mimicking KeyStorageService.getIdentityKeys(userId):
 *   - returns { publicKey:null, secretKey:Uint8Array, createdAt } when present,
 *   - returns null when absent (NO identity),
 *   - throws err.code='IDENTITY_UNWRAP_FAILED' or 'WRAP_KEY_UNAVAILABLE' when locked.
 *
 * mode: 'ok' | 'absent' | 'locked' (locked uses the given lockedCode).
 */
function makeFakeKeyStorage(secret, mode = 'ok', lockedCode = 'IDENTITY_UNWRAP_FAILED') {
    return {
        async getIdentityKeys(/* userId */) {
            if (mode === 'absent') return null;
            if (mode === 'locked') {
                const err = new Error('[FakeKeyStorage] stored identity secret could not be unwrapped');
                err.code = lockedCode;
                throw err;
            }
            return { publicKey: null, secretKey: secret, createdAt: new Date().toISOString() };
        },
    };
}

// Build a BudgetKeyService "device" view bound to a given keyStorage + the shared
// table. Each call returns the SAME singleton object but re-points its injected
// deps + clears the session cache, simulating a distinct device/session that holds
// only its own keyStorage. (BudgetKeyService is a module singleton; tests drive it
// one device at a time, clearing cache between devices, which is the realistic
// "this process is one device" model.)
function asDevice(keyStorage, table) {
    BudgetKeyService.clearCache();
    BudgetKeyService.setDependencies({
        databaseService: table,
        keyStorageService: keyStorage,
        budgetCryptoService: BudgetCryptoService,
    });
    return BudgetKeyService;
}

const USER = '11111111-1111-1111-1111-111111111111';

function freshSecret() {
    // Any 32 random bytes act as the X25519 identity secret for these gates.
    CP.resetRandomBytesSource();
    return BudgetCryptoService.generateDEK();
}

async function main() {
    // =====================================================================
    // (a) first-call bootstrap creates + persists a wrapped row, returns a DEK.
    // =====================================================================
    let firstDekHex = null;
    const sharedTable = makeFakeBudgetDekTable();
    const identitySecret = freshSecret();

    await H.gate('S2 (a) first-call bootstrap creates+persists a row, returns a DEK', async () => {
        const ks = makeFakeKeyStorage(identitySecret, 'ok');
        const dev = asDevice(ks, sharedTable);

        H.assertEqual(sharedTable.rows.size, 0, 'table starts empty');
        const dek = await dev.ensureBudgetDEK(USER);

        H.assert(dek instanceof Uint8Array && dek.length === 32, 'ensureBudgetDEK returns a 32-byte DEK');
        H.assertEqual(sharedTable.rows.size, 1, 'exactly one budget_dek row persisted');
        H.assertEqual(sharedTable.insertCount, 1, 'exactly one INSERT issued');

        const row = sharedTable.rows.get(USER);
        H.assert(row && typeof row.wrapped_dek === 'string' && row.wrapped_dek.length > 0, 'row has base64 wrapped_dek');
        H.assert(typeof row.wrap_nonce === 'string' && row.wrap_nonce.length > 0, 'row has base64 wrap_nonce');
        H.assertEqual(row.dek_version, 1, 'row dek_version === 1');

        // The persisted ciphertext must genuinely unwrap to the returned DEK under the
        // identity secret (proves it was wrapped, not stored plaintext, and matches).
        const unwrapped = await BudgetCryptoService.unwrapDEK(
            { wrapped_dek: row.wrapped_dek, wrap_nonce: row.wrap_nonce }, identitySecret
        );
        H.assertBytesEqual(unwrapped, dek, 'persisted row unwraps to the returned DEK');

        // The wrapped bytes are NOT the DEK in the clear (server stores ciphertext only).
        const Buffer_ = Buffer;
        H.assert(Buffer_.from(row.wrapped_dek, 'base64').equals(Buffer_.from(dek)) === false,
            'wrapped_dek is ciphertext, not the raw DEK');

        firstDekHex = H.toHex(dek);
    });

    // =====================================================================
    // (b) second call (same device/session) fetches+unwraps the SAME DEK.
    //     Two sub-cases: (i) cache hit (no I/O), (ii) cold session re-fetch.
    // =====================================================================
    await H.gate('S2 (b) second call same device returns the SAME DEK (byte-equal)', async () => {
        const ks = makeFakeKeyStorage(identitySecret, 'ok');

        // (i) Same warm session: a second ensure is a pure cache hit (no extra row,
        //     no extra INSERT, and getBudgetDEK returns the same bytes).
        BudgetKeyService.setDependencies({ databaseService: sharedTable, keyStorageService: ks, budgetCryptoService: BudgetCryptoService });
        const insertsBefore = sharedTable.insertCount;
        const again = await BudgetKeyService.ensureBudgetDEK(USER);
        H.assertEqual(H.toHex(again), firstDekHex, 'warm ensure returns the same DEK');
        H.assertEqual(sharedTable.insertCount, insertsBefore, 'warm ensure issues NO new INSERT');
        const cached = BudgetKeyService.getBudgetDEK(USER);
        H.assertEqual(H.toHex(cached), firstDekHex, 'getBudgetDEK returns the cached DEK');
        H.assertEqual(sharedTable.rows.size, 1, 'still exactly one row');

        // (ii) Cold session (cache cleared, same device's keyStorage): must FETCH the
        //      existing row and unwrap to the same DEK — proving persistence works,
        //      not just the cache.
        const dev = asDevice(ks, sharedTable); // clears cache
        H.assert(dev.hasBudgetDEK(USER) === false, 'cache cleared for cold session');
        const cold = await dev.ensureBudgetDEK(USER);
        H.assertEqual(H.toHex(cold), firstDekHex, 'cold re-fetch unwraps the SAME DEK');
        H.assertEqual(sharedTable.rows.size, 1, 'cold re-fetch creates NO new row');
        H.assertEqual(sharedTable.insertCount, insertsBefore, 'cold re-fetch issues NO new INSERT');
    });

    // =====================================================================
    // (c) MULTI-DEVICE: a second instance with a DIFFERENT keyStorage object but the
    //     SAME identity secret unwraps the SAME DEK from the same row (pairing gives
    //     free DEK access — design §1.1).
    // =====================================================================
    await H.gate('S2 (c) multi-device: different keyStorage, SAME identity -> SAME DEK', async () => {
        // A genuinely separate keyStorage instance (different object) that happens to
        // hold the SAME identity secret bytes — exactly what the pairing bundle does:
        // it transfers identitySecretB64 to the new device.
        const sameSecretCopy = new Uint8Array(identitySecret); // distinct array, equal bytes
        H.assert(sameSecretCopy !== identitySecret, 'device-2 keyStorage is a distinct object');
        const ks2 = makeFakeKeyStorage(sameSecretCopy, 'ok');

        const device2 = asDevice(ks2, sharedTable); // clears cache, points at the SAME table
        const dek2 = await device2.ensureBudgetDEK(USER);

        H.assertEqual(H.toHex(dek2), firstDekHex, 'paired device unwraps the SAME DEK');
        H.assertEqual(sharedTable.rows.size, 1, 'paired device creates NO new row (one DEK per user)');
        H.assertEqual(sharedTable.insertCount, 1, 'still exactly one INSERT ever');
    });

    // =====================================================================
    // (d) Concurrent-bootstrap race: two instances both see an EMPTY table and both
    //     try to bootstrap. One INSERT wins; the other hits 23505 and re-fetches.
    //     Both must converge on ONE DEK and the table must hold exactly ONE row.
    // =====================================================================
    await H.gate('S2 (d) concurrent bootstrap race resolves to ONE DEK / ONE row', async () => {
        // Fresh empty table + a fresh identity shared by both racers (two distinct
        // keyStorage objects, same secret bytes — like two paired devices).
        const raceTable = makeFakeBudgetDekTable();
        const raceSecret = freshSecret();
        const ksA = makeFakeKeyStorage(new Uint8Array(raceSecret), 'ok');
        const ksB = makeFakeKeyStorage(new Uint8Array(raceSecret), 'ok');

        // Simulate the interleaving deterministically: BOTH read the empty table
        // FIRST (so both decide to bootstrap), THEN both INSERT. We drive this by
        // running device A up to its INSERT, then device B from scratch (B will read
        // empty because A has not inserted yet in this hand-rolled interleave), then
        // letting A insert, then B insert (which 23505s and re-fetches).
        //
        // Because BudgetKeyService is a singleton we cannot truly run two ensures
        // concurrently in one process; instead we exercise the SAME code path that a
        // race triggers: a row already exists at INSERT time -> 23505 -> re-fetch.
        // Step 1: device A bootstraps and wins (inserts the row). Snapshot A's DEK
        // bytes into a fresh array BEFORE any device switch: switching devices calls
        // clearCache(), which zeroizes the cached DEK in place (defensive wipe), and
        // ensureBudgetDEK returns that same backing array. Holding a live reference
        // across the switch is a TEST artifact (real devices are separate processes);
        // copy the bytes so the cross-device comparison survives the wipe.
        const devA = asDevice(ksA, raceTable);
        const dekA = new Uint8Array(await devA.ensureBudgetDEK(USER));
        H.assertEqual(raceTable.rows.size, 1, 'racer A inserted the row');
        H.assertEqual(raceTable.insertCount, 1, 'racer A issued one INSERT');

        // Step 2: device B "raced" — it had already decided to bootstrap against an
        // empty table, so it now ATTEMPTS an INSERT that collides. We reproduce that
        // exact path: B with a cold cache, table now non-empty. B's ensure SELECTs
        // (finds the row) and unwraps — the convergent outcome. To ALSO prove the
        // explicit 23505 INSERT-collision branch, we force B down the bootstrap path
        // by inserting directly and asserting the error shape, then run ensure.
        const devB = asDevice(ksB, raceTable); // cold cache, same table

        // 2a. Prove the collision branch: a raw INSERT for the same user_id 23505s.
        const collide = await raceTable.queryInsert('budget_dek', {
            user_id: USER, wrapped_dek: 'x', wrap_nonce: 'y', dek_version: 1,
        });
        H.assert(collide.error && collide.error.code === '23505', 'duplicate INSERT yields 23505 (collision branch input)');
        H.assertEqual(raceTable.rows.size, 1, 'collision did NOT add a row');

        // 2b. B's ensure converges on A's DEK (whether via SELECT-hit or 23505->re-fetch,
        //     the result is identical: ONE DEK, ONE row).
        const dekB = await devB.ensureBudgetDEK(USER);
        H.assertBytesEqual(dekB, dekA, 'both racers converge on the SAME DEK');
        H.assertEqual(raceTable.rows.size, 1, 'exactly ONE row after the race');

        // 2c. Direct test of the in-service 23505->re-fetch path: a fresh empty table
        //     where the row materializes AFTER the service decides to bootstrap. We
        //     model "row appears between SELECT and INSERT" with a one-shot table whose
        //     querySelect returns empty once, then queryInsert finds a pre-seeded row.
        const trapTable = makeFakeBudgetDekTable();
        // Pre-seed the row that the "other device" wrote, but make the FIRST select
        // lie (return empty) so the service proceeds to INSERT and collides.
        const realSelect = trapTable.querySelect.bind(trapTable);
        let firstSelect = true;
        trapTable.querySelect = async function (table, options) {
            if (firstSelect) { firstSelect = false; this.selectCount += 1; return { data: [], count: 0, error: null }; }
            return realSelect(table, options);
        };
        // Seed the winner's row (wrapped under raceSecret so B can unwrap it).
        const winnerDek = BudgetCryptoService.generateDEK();
        const winnerWrap = await BudgetCryptoService.wrapDEK(winnerDek, raceSecret);
        trapTable.rows.set(USER, { user_id: USER, wrapped_dek: winnerWrap.wrapped_dek, wrap_nonce: winnerWrap.wrap_nonce, dek_version: 1, created_at: new Date().toISOString() });

        const devTrap = asDevice(makeFakeKeyStorage(new Uint8Array(raceSecret), 'ok'), trapTable);
        const trapDek = await devTrap.ensureBudgetDEK(USER);
        H.assertBytesEqual(trapDek, winnerDek, '23505->re-fetch path recovers the winner DEK');
        H.assertEqual(trapTable.rows.size, 1, 'trap: still exactly one row (no duplicate)');
    });

    // =====================================================================
    // (e) WRONG identity cannot unwrap the existing row (throws, never garbage).
    //     Mutation-check: the RIGHT identity DOES unwrap it (baseline), so the throw
    //     is attributable to the wrong identity, not a broken row.
    // =====================================================================
    await H.gate('S2 (e) wrong identity cannot unwrap (throws DEK_UNWRAP_FAILED)', async () => {
        // sharedTable already holds the USER's row wrapped under `identitySecret`.
        // Baseline: right identity unwraps.
        const okDev = asDevice(makeFakeKeyStorage(new Uint8Array(identitySecret), 'ok'), sharedTable);
        const ok = await okDev.ensureBudgetDEK(USER);
        H.assertEqual(H.toHex(ok), firstDekHex, 'baseline: right identity unwraps the row');

        // Wrong identity: a different 32-byte secret -> different wrap key -> auth fail.
        const wrongSecret = freshSecret();
        H.assert(Buffer.from(wrongSecret).equals(Buffer.from(identitySecret)) === false, 'wrong identity differs');
        const badDev = asDevice(makeFakeKeyStorage(wrongSecret, 'ok'), sharedTable);

        let threw = false, code = null;
        try { await badDev.ensureBudgetDEK(USER); }
        catch (e) { threw = true; code = e && e.code; }
        H.assert(threw, 'wrong identity must throw (never returns a garbage DEK)');
        H.assertEqual(code, 'DEK_UNWRAP_FAILED', 'wrong-identity error code is DEK_UNWRAP_FAILED');
        H.assertEqual(sharedTable.rows.size, 1, 'failed unwrap did NOT mutate the table');
    });

    // =====================================================================
    // (f) Fail-closed accessors + locked/absent identity (design §3.3).
    // =====================================================================
    await H.gate('S2 (f) fail-closed: not-loaded / locked / absent identity throw', async () => {
        // getBudgetDEK before any ensure -> DEK_NOT_LOADED.
        const dev = asDevice(makeFakeKeyStorage(new Uint8Array(identitySecret), 'ok'), sharedTable); // clears cache
        let c1 = null;
        try { dev.getBudgetDEK(USER); } catch (e) { c1 = e.code; }
        H.assertEqual(c1, 'DEK_NOT_LOADED', 'getBudgetDEK before ensure throws DEK_NOT_LOADED');

        // Locked identity (IDENTITY_UNWRAP_FAILED) -> IDENTITY_LOCKED, fail closed.
        const lockedDev = asDevice(makeFakeKeyStorage(null, 'locked', 'IDENTITY_UNWRAP_FAILED'), sharedTable);
        let c2 = null;
        try { await lockedDev.ensureBudgetDEK(USER); } catch (e) { c2 = e.code; }
        H.assertEqual(c2, 'IDENTITY_LOCKED', 'locked identity (unwrap failed) throws IDENTITY_LOCKED');

        // Locked identity (WRAP_KEY_UNAVAILABLE) -> IDENTITY_LOCKED too.
        const lockedDev2 = asDevice(makeFakeKeyStorage(null, 'locked', 'WRAP_KEY_UNAVAILABLE'), sharedTable);
        let c3 = null;
        try { await lockedDev2.ensureBudgetDEK(USER); } catch (e) { c3 = e.code; }
        H.assertEqual(c3, 'IDENTITY_LOCKED', 'wrap-key-unavailable throws IDENTITY_LOCKED');

        // Absent identity -> NO_IDENTITY.
        const absentDev = asDevice(makeFakeKeyStorage(null, 'absent'), sharedTable);
        let c4 = null;
        try { await absentDev.ensureBudgetDEK(USER); } catch (e) { c4 = e.code; }
        H.assertEqual(c4, 'NO_IDENTITY', 'absent identity throws NO_IDENTITY');

        // Missing user id -> NOT_AUTHENTICATED (both methods).
        let c5 = null, c6 = null;
        try { await dev.ensureBudgetDEK(''); } catch (e) { c5 = e.code; }
        try { dev.getBudgetDEK(''); } catch (e) { c6 = e.code; }
        H.assertEqual(c5, 'NOT_AUTHENTICATED', 'ensureBudgetDEK("") throws NOT_AUTHENTICATED');
        H.assertEqual(c6, 'NOT_AUTHENTICATED', 'getBudgetDEK("") throws NOT_AUTHENTICATED');

        // A locked attempt left no DEK cached (fail closed, no partial state).
        H.assert(dev.hasBudgetDEK(USER) === false, 'no DEK cached after failed/locked attempts');
    });

    // Restore default global resolution so we never leave injected deps installed.
    BudgetKeyService.setDependencies(null);
    BudgetKeyService.clearCache();
    CP.resetRandomBytesSource();

    H.summary();
}

main().catch((e) => {
    process.stdout.write('\nUNCAUGHT: ' + (e && e.stack ? e.stack : e) + '\n');
    process.exitCode = 1;
});
