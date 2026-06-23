/**
 * S10 GATES -- Budget E2E crypto (BUDGET_E2E_DESIGN.md staged plan S1).
 *
 * Run: node .s10_budget_runner.cjs        (from the money_tracker repo root)
 *
 * (This checkout declares "type":"module" in package.json, which forces every
 *  .js to ESM. The auth_db harness + primitive services are CommonJS, so this
 *  test is executed by the repo-root .s10_budget_runner.cjs shim, which loads
 *  the CommonJS modules with correct semantics WITHOUT touching the auth_db
 *  submodule or adding npm deps. See that file's header for the full rationale.)
 *
 * Exercises the PURE, standalone BudgetCryptoService (no DB, no UI) that lives
 * in money_tracker/shared/services/budgetCryptoService.js. It is a thin wrapper
 * over the auth_db CryptoPrimitivesService + KeyDerivationService primitives,
 * loaded via the submodule's _harness.js (vendored TweetNaCl through
 * vm.runInThisContext + WebCrypto HKDF). No npm deps are added; the auth_db
 * submodule is NOT modified (this test lives in money_tracker, not inside it).
 *
 * Gates (per the task spec):
 *   (a) Blob round-trip          -- encryptBlob -> decryptBlob === original, for a
 *                                   fixture with nested objects, numbers, strings, unicode.
 *   (b) Wrong-DEK fails          -- decryptBlob with a different DEK THROWS (never silent).
 *   (c) Tamper fails             -- flip one ciphertext byte AND one nonce byte
 *                                   (separately) -> decryptBlob THROWS.
 *   (d) DEK wrap/unwrap round-trip -- wrapDEK then unwrapDEK === DEK (byte-equal).
 *   (e) Wrong-identity unwrap fails -- unwrapDEK with a different identity secret THROWS.
 *   (f) Determinism / KAT        -- with a frozen RNG seed the envelope + wrapped DEK
 *                                   are byte-stable (snapshot/KAT anchor).
 *
 * Mutation-checks are woven into (b)/(c)/(d): we prove the negative gate would
 * have failed against the UNtampered input (i.e. the gate actually tests the
 * thing it claims), so a no-op "decrypt" can't pass these silently.
 */

const path = require('path');

// This test lives in money_tracker/shared/services/. The reusable test harness +
// primitives live in the auth_db submodule. Reach them by explicit relative path
// (the .cjs runner resolves these CommonJS .js files with correct semantics).
const HARNESS_PATH = path.resolve(
    __dirname, '../../lib/auth_db/encryption/tests/_harness.js'
);
const H = require(HARNESS_PATH);

// loadServices() wires nacl into CryptoPrimitivesService AND publishes both
// CryptoPrimitivesService + KeyDerivationService onto global, which is exactly
// what BudgetCryptoService._cp()/_kdf() resolve against under node.
const { CryptoPrimitivesService: CP, KeyDerivationService: KDF } = H.loadServices();

// Load the module under test (canonical money_tracker service, NOT a lib/ mirror).
const BUDGET_SERVICE_PATH = path.resolve(__dirname, './budgetCryptoService.js');
const BudgetCryptoService = require(BUDGET_SERVICE_PATH);

// ---------------------------------------------------------------------------
// A representative budget fixture: nested objects, arrays, numbers (incl.
// floats + negatives), strings, and unicode (emoji + accents + CJK).
// ---------------------------------------------------------------------------
function makeFixture() {
    return {
        dateRange: { start: '2026-01-01', end: '2026-01-31' },
        weeklyBreakdown: [
            { week: 1, spent: 123.45 },
            { week: 2, spent: -10.5 },   // refund => negative
        ],
        fixedCosts: [
            { name: 'Rent', amount: 1500, category: 'Housing' },
            { name: 'Café déjeuner ☕', amount: 12.99, note: 'résumé café — 日本語 🍱' },
        ],
        variableCosts: [{ name: 'Groceries', amount: 287.6 }],
        unplannedExpenses: [],
        incomeSources: [{ name: 'Salary', amount: 5000.0 }],
        pots: [
            { name: 'Emergency 🛟', estimatedAmount: 10000, actualAmount: 7250.75, comments: 'für Notfälle' },
        ],
        // edge values that JSON survives
        meta: { zero: 0, big: 9007199254740991, neg: -42, empty: '', deep: { a: { b: { c: 'leaf' } } } },
    };
}

function expectEnvelopeShape(env, label) {
    H.assertEqual(typeof env.enc_payload, 'string', `${label}: enc_payload is a base64 string`);
    H.assertEqual(typeof env.enc_nonce, 'string', `${label}: enc_nonce is a base64 string`);
    H.assertEqual(env.enc_version, BudgetCryptoService.ENC_VERSION, `${label}: enc_version === 1`);
    H.assertEqual(env.enc_version, 1, `${label}: ENC_VERSION constant is 1 (design §2.1)`);
}

// Async sibling of H.assertThrows: assert that awaiting fn() rejects. The
// harness's assertThrows is synchronous (it does not await), so async paths
// (wrapDEK/unwrapDEK/deriveBudgetWrapKey) must use this instead.
async function assertRejects(fn, msg) {
    let rejected = false;
    try { await fn(); } catch (e) { rejected = true; }
    H.assert(rejected, msg || 'expected async function to reject');
}

// Flip a single byte inside a base64-encoded blob, returning new base64.
function flipBase64Byte(b64, index) {
    const buf = Buffer.from(b64, 'base64');
    if (index >= buf.length) throw new Error('flip index out of range');
    buf[index] ^= 0x01;
    return buf.toString('base64');
}

async function main() {
    // =====================================================================
    // (a) Blob round-trip (nested objects / numbers / strings / unicode)
    // =====================================================================
    await H.gate('S10 (a) blob round-trip (nested/number/string/unicode)', async () => {
        CP.resetRandomBytesSource(); // secure (random nonce) for this gate
        const dek = BudgetCryptoService.generateDEK();
        H.assertEqual(dek.length, 32, 'generateDEK -> 32 bytes');

        const fixture = makeFixture();
        const env = BudgetCryptoService.encryptBlob(fixture, dek);
        expectEnvelopeShape(env, 'round-trip');

        const out = BudgetCryptoService.decryptBlob(env, dek);
        // Deep-equality via canonical JSON (key order preserved by JSON.stringify).
        H.assertEqual(
            JSON.stringify(out), JSON.stringify(fixture),
            'decryptBlob(encryptBlob(x)) deep-equals x'
        );
        // Spot-check unicode + nested + numeric types survived precisely.
        H.assertEqual(out.fixedCosts[1].note, 'résumé café — 日本語 🍱', 'unicode preserved');
        H.assertEqual(out.meta.deep.a.b.c, 'leaf', 'deep nesting preserved');
        H.assertEqual(out.weeklyBreakdown[1].spent, -10.5, 'negative float preserved');
        H.assertEqual(out.meta.big, 9007199254740991, 'large integer preserved');

        // Fresh nonce per write => two encrypts of the same blob differ, but both decrypt.
        const env2 = BudgetCryptoService.encryptBlob(fixture, dek);
        H.assert(env2.enc_nonce !== env.enc_nonce, 'fresh nonce per write (random source)');
        H.assertEqual(
            JSON.stringify(BudgetCryptoService.decryptBlob(env2, dek)), JSON.stringify(fixture),
            'second envelope also round-trips'
        );
    });

    // =====================================================================
    // (b) WRONG DEK fails to decrypt (throws, not silent)
    //     Mutation-check: prove the SAME envelope decrypts with the RIGHT dek,
    //     so the throw is attributable to the wrong key, not a broken envelope.
    // =====================================================================
    await H.gate('S10 (b) wrong DEK fails (throws, not silent)', async () => {
        CP.resetRandomBytesSource();
        const dek = BudgetCryptoService.generateDEK();
        const wrongDek = BudgetCryptoService.generateDEK();
        H.assert(Buffer.from(dek).equals(Buffer.from(wrongDek)) === false, 'two DEKs differ');

        const env = BudgetCryptoService.encryptBlob(makeFixture(), dek);

        // mutation-check: correct key works...
        const ok = BudgetCryptoService.decryptBlob(env, dek);
        H.assert(ok && typeof ok === 'object', 'right DEK decrypts (mutation-check baseline)');

        // ...wrong key throws (Poly1305 auth failure), never returns plaintext/garbage.
        H.assertThrows(() => BudgetCryptoService.decryptBlob(env, wrongDek),
            'wrong DEK must throw');
    });

    // =====================================================================
    // (c) TAMPER fails: flip one ciphertext byte and (separately) one nonce byte.
    //     Mutation-check: the un-flipped envelope decrypts; each single-bit flip
    //     makes decrypt throw.
    // =====================================================================
    await H.gate('S10 (c) tamper fails (ciphertext byte + nonce byte)', async () => {
        CP.resetRandomBytesSource();
        const dek = BudgetCryptoService.generateDEK();
        const env = BudgetCryptoService.encryptBlob(makeFixture(), dek);

        // baseline (mutation-check): un-tampered decrypts.
        H.assert(BudgetCryptoService.decryptBlob(env, dek) != null, 'baseline decrypts before tamper');

        // flip one ciphertext byte.
        const tcCipher = { ...env, enc_payload: flipBase64Byte(env.enc_payload, 0) };
        H.assert(tcCipher.enc_payload !== env.enc_payload, 'ciphertext actually changed');
        H.assertThrows(() => BudgetCryptoService.decryptBlob(tcCipher, dek),
            'flipped ciphertext byte must throw');

        // flip one nonce byte.
        const tcNonce = { ...env, enc_nonce: flipBase64Byte(env.enc_nonce, 0) };
        H.assert(tcNonce.enc_nonce !== env.enc_nonce, 'nonce actually changed');
        H.assertThrows(() => BudgetCryptoService.decryptBlob(tcNonce, dek),
            'flipped nonce byte must throw');

        // wrong version is also rejected before any crypto (version verify).
        H.assertThrows(() => BudgetCryptoService.decryptBlob({ ...env, enc_version: 0 }, dek),
            'unsupported enc_version must throw');
        H.assertThrows(() => BudgetCryptoService.decryptBlob({ ...env, enc_version: 99 }, dek),
            'unknown enc_version must throw');
    });

    // =====================================================================
    // (d) DEK wrap/unwrap round-trip (wrapDEK then unwrapDEK === DEK).
    //     Mutation-check: corrupt the wrapped_dek -> unwrap throws.
    // =====================================================================
    await H.gate('S10 (d) DEK wrap/unwrap round-trip', async () => {
        CP.resetRandomBytesSource();
        const dek = BudgetCryptoService.generateDEK();
        const identitySecret = BudgetCryptoService.generateDEK(); // any 32 random bytes act as the identity secret

        const wrapped = await BudgetCryptoService.wrapDEK(dek, identitySecret);
        H.assertEqual(typeof wrapped.wrapped_dek, 'string', 'wrapped_dek is base64 string');
        H.assertEqual(typeof wrapped.wrap_nonce, 'string', 'wrap_nonce is base64 string');

        const recovered = await BudgetCryptoService.unwrapDEK(wrapped, identitySecret);
        H.assertBytesEqual(recovered, dek, 'unwrapDEK(wrapDEK(dek)) === dek');

        // mutation-check: tamper the wrapped DEK ciphertext -> unwrap throws.
        const tampered = { ...wrapped, wrapped_dek: flipBase64Byte(wrapped.wrapped_dek, 0) };
        await assertRejects(() => BudgetCryptoService.unwrapDEK(tampered, identitySecret),
            'tampered wrapped_dek must throw');

        // the wrap key is a pure function of the identity secret (multi-device):
        // an independently-derived wrap key from the SAME identity unwraps too.
        const wrapKeyA = await BudgetCryptoService.deriveBudgetWrapKey(identitySecret);
        const wrapKeyB = await BudgetCryptoService.deriveBudgetWrapKey(identitySecret);
        H.assertBytesEqual(wrapKeyA, wrapKeyB, 'deriveBudgetWrapKey is deterministic per identity');
    });

    // =====================================================================
    // (e) WRONG-identity unwrap fails (throws, not silent / wrong DEK).
    //     Mutation-check: the SAME wrapped DEK unwraps under the RIGHT identity.
    // =====================================================================
    await H.gate('S10 (e) wrong-identity unwrap fails', async () => {
        CP.resetRandomBytesSource();
        const dek = BudgetCryptoService.generateDEK();
        const identityA = BudgetCryptoService.generateDEK();
        const identityB = BudgetCryptoService.generateDEK();
        H.assert(Buffer.from(identityA).equals(Buffer.from(identityB)) === false, 'two identities differ');

        const wrapped = await BudgetCryptoService.wrapDEK(dek, identityA);

        // mutation-check baseline: right identity recovers the DEK.
        const ok = await BudgetCryptoService.unwrapDEK(wrapped, identityA);
        H.assertBytesEqual(ok, dek, 'right identity unwraps (mutation-check baseline)');

        // wrong identity -> wrong wrap key -> auth failure -> throw.
        await assertRejects(() => BudgetCryptoService.unwrapDEK(wrapped, identityB),
            'wrong identity must throw');
    });

    // =====================================================================
    // (f) Determinism with a frozen RNG seed -> byte-stable envelope + wrapped
    //     DEK (KAT anchor). Same seed must yield the SAME bytes every run.
    // =====================================================================
    await H.gate('S10 (f) determinism / KAT (frozen seed)', async () => {
        // Install a deterministic RNG: this freezes the DEK, the blob nonce, and
        // the wrap nonce (all route through CryptoPrimitivesService.randomBytes).
        CP.setRandomBytesSource(H.makeDeterministicRng('s10-budget-kat-seed'));
        try {
            const dek = BudgetCryptoService.generateDEK();
            const dekHex = H.toHex(dek);

            const fixture = { amount: 42, note: 'kat ☕', items: [{ x: 1 }, { x: 2 }] };
            const env = BudgetCryptoService.encryptBlob(fixture, dek);
            expectEnvelopeShape(env, 'KAT');

            // A second run resets the SAME seed and must reproduce identical bytes.
            CP.setRandomBytesSource(H.makeDeterministicRng('s10-budget-kat-seed'));
            const dek2 = BudgetCryptoService.generateDEK();
            const env2 = BudgetCryptoService.encryptBlob(fixture, dek2);

            H.assertEqual(H.toHex(dek2), dekHex, 'frozen seed -> identical DEK');
            H.assertEqual(env2.enc_payload, env.enc_payload, 'frozen seed -> identical enc_payload');
            H.assertEqual(env2.enc_nonce, env.enc_nonce, 'frozen seed -> identical enc_nonce');

            // Wrapped-DEK is also byte-stable under the frozen seed.
            CP.setRandomBytesSource(H.makeDeterministicRng('s10-budget-kat-seed-wrap'));
            const identity = BudgetCryptoService.generateDEK();
            const wrapped = await BudgetCryptoService.wrapDEK(dek, identity);

            CP.setRandomBytesSource(H.makeDeterministicRng('s10-budget-kat-seed-wrap'));
            const identity2 = BudgetCryptoService.generateDEK();
            const wrapped2 = await BudgetCryptoService.wrapDEK(dek, identity2);
            H.assertEqual(wrapped2.wrapped_dek, wrapped.wrapped_dek, 'frozen seed -> identical wrapped_dek');
            H.assertEqual(wrapped2.wrap_nonce, wrapped.wrap_nonce, 'frozen seed -> identical wrap_nonce');

            // And the frozen envelope still round-trips + unwraps (KAT is live, not dead).
            H.assertEqual(
                JSON.stringify(BudgetCryptoService.decryptBlob(env, dek)), JSON.stringify(fixture),
                'KAT envelope round-trips'
            );
            const unwrapped = await BudgetCryptoService.unwrapDEK(wrapped, identity);
            H.assertBytesEqual(unwrapped, dek, 'KAT wrapped DEK unwraps to the DEK');

            // Print the anchored KAT values so they are captured in the gate output.
            process.stdout.write(`    KAT dek          = ${dekHex}\n`);
            process.stdout.write(`    KAT enc_nonce    = ${env.enc_nonce}\n`);
            process.stdout.write(`    KAT enc_payload  = ${env.enc_payload}\n`);
            process.stdout.write(`    KAT wrapped_dek  = ${wrapped.wrapped_dek}\n`);
            process.stdout.write(`    KAT wrap_nonce   = ${wrapped.wrap_nonce}\n`);
        } finally {
            CP.resetRandomBytesSource(); // never leave a deterministic source installed
        }
    });

    H.summary();
}

main().catch((e) => {
    process.stdout.write('\nUNCAUGHT: ' + (e && e.stack ? e.stack : e) + '\n');
    process.exitCode = 1;
});
