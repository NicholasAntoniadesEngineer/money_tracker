/**
 * .queryupsert_onconflict_runner.cjs  (UNTRACKED, money_tracker-owned, throwaway runner)
 *
 * Focused assertion for the H5/H6 fix in the CANONICAL auth_db DatabaseService:
 * queryUpsert(table, data, { onConflict }) must issue a TRUE PostgREST upsert
 * (POST .../rest/v1/<table>?on_conflict=<col> with
 *  Prefer: resolution=merge-duplicates,return=representation) instead of a plain
 * insert-only POST that collides with the PRIMARY KEY (23505/409) on re-publish.
 *
 * queryUpsert needs a live DB so it has NO node gate; this runner instead stubs
 * fetch() and captures the request the method builds, then asserts the URL +
 * Prefer header. It loads the canonical databaseService.js by READING its source
 * and evaluating it (same read-only sandbox technique as the .s4s5 runner) — it
 * does NOT modify the submodule and adds NO npm deps.
 *
 * Default target is the canonical checkout
 *   ../auth_db/database/services/databaseService.js  (sibling of money_tracker)
 * override via:  node .queryupsert_onconflict_runner.cjs <path-to-databaseService.js>
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CANON = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, '../auth_db/database/services/databaseService.js');

let passed = 0, failed = 0;
function assert(cond, msg) {
    if (cond) { passed++; console.log(`  ok  - ${msg}`); }
    else { failed++; console.error(`  FAIL - ${msg}`); }
}

// --- Load the canonical DatabaseService in a sandbox that captures window.DatabaseService.
const src = fs.readFileSync(CANON, 'utf8');
const sandbox = {
    window: {},
    console,
    URL,
    Buffer,
    process,
    setTimeout,
    clearTimeout,
};
sandbox.globalThis = sandbox;
sandbox.self = sandbox;
vm.createContext(sandbox);
// fetch is referenced inside the methods; provide a sandbox-level stub we can swap per-test.
let lastRequest = null;
sandbox.fetch = async (url, init) => {
    lastRequest = { url, init };
    // Minimal Response-like object that _handleResponse() can consume (ok + json body).
    return {
        ok: true,
        status: 201,
        statusText: 'Created',
        headers: { get: () => 'application/json' },
        clone() { return this; },
        async text() { return JSON.stringify([{ ok: true }]); },
    };
};
vm.runInContext(src, sandbox, { filename: CANON });

const db = sandbox.window.DatabaseService;
assert(!!db && typeof db.queryUpsert === 'function', 'canonical DatabaseService.queryUpsert is exported');

// Minimal client + auth headers so the method can build a request without a real DB.
db.client = { supabaseUrl: 'https://example.supabase.co', supabaseKey: 'test-key' };
db._getAuthHeaders = function () {
    return {
        'apikey': 'test-key',
        'Authorization': 'Bearer test-key',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation', // mirrors the real helper's default
    };
};

(async () => {
    console.log('=== GATE: queryUpsert onConflict request construction ===');

    // 1) onConflict set -> true upsert path
    lastRequest = null;
    const res = await db.queryUpsert(
        'identity_keys',
        { user_id: 'u1', public_key: 'pk', current_epoch: 0 },
        { onConflict: 'user_id', returning: true }
    );

    assert(lastRequest !== null, 'onConflict path issued a fetch');
    const u = new URL(lastRequest.url);
    assert(u.pathname === '/rest/v1/identity_keys', 'URL path is /rest/v1/<table>');
    assert(u.searchParams.get('on_conflict') === 'user_id', 'URL has ?on_conflict=user_id');
    assert((lastRequest.init && lastRequest.init.method) === 'POST', 'method is POST');
    const prefer = lastRequest.init.headers['Prefer'];
    assert(prefer === 'resolution=merge-duplicates,return=representation',
        `Prefer is merge-duplicates,return=representation (got: ${prefer})`);
    assert(lastRequest.init.headers['apikey'] === 'test-key', 'apikey header preserved');
    assert(lastRequest.init.headers['Authorization'] === 'Bearer test-key', 'Authorization bearer preserved');
    assert(JSON.parse(lastRequest.init.body).user_id === 'u1', 'body carries the row data');
    assert(res && 'data' in res && 'error' in res && res.error === null,
        'returns {data,error} shape with error===null on success');

    // 2) no onConflict, no filter/identifier -> legacy plain POST (no on_conflict, default Prefer)
    lastRequest = null;
    await db.queryUpsert('some_table', { id: 1, v: 2 });
    assert(lastRequest !== null, 'plain path issued a fetch');
    const u2 = new URL(lastRequest.url);
    assert(u2.searchParams.get('on_conflict') === null, 'plain path does NOT add on_conflict');
    assert(lastRequest.init.headers['Prefer'] === 'return=representation',
        'plain path keeps default Prefer (insert-only, unchanged behavior)');

    console.log('========================================');
    console.log(`TOTAL ASSERTIONS: ${passed} passed, ${failed} failed`);
    if (failed === 0) console.log('ALL ASSERTIONS PASSED');
    console.log('========================================');
    process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
    console.error('RUNNER ERROR:', e);
    process.exit(1);
});
