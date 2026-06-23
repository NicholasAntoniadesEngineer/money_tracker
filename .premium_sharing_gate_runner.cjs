/**
 * .premium_sharing_gate_runner.cjs  (UNTRACKED, throwaway gate runner)
 *
 * Node-level assertion of the PRODUCT-DECISION revision of the H-3 entitlement fix:
 *     MESSAGING IS FREE; Premium gates CROSS-USER SHARING (creating a data_share).
 *
 * Run:
 *     node .premium_sharing_gate_runner.cjs        (from the money_tracker repo root)
 *
 * There is no live Postgres in this checkout, so this runner does a STATIC + LOGIC
 * verification of the canonical SQL rather than executing it:
 *
 *   1. STATIC: confirms
 *        - is_premium_active / expire_overdue_trials / the pg_cron schedule are present
 *          in EVERY canonical file they belong in,
 *        - MESSAGING IS FREE: the messages_insert_participant policy has NO
 *          is_premium_active() check in ANY location (free messaging),
 *        - SHARING IS GATED: the data_shares owner-INSERT WITH CHECK requires
 *          is_premium_active(auth.uid()) (Premium = creating a cross-user share),
 *        - definition-before-use: is_premium_active is defined BEFORE the data_shares
 *          INSERT policy in the all-in-one installer,
 *        - no lib/ mirror was edited, DEFINER funcs pin search_path, no DROP TABLE.
 *
 *   2. LOGIC: ports the EXACT is_premium_active WHERE predicate to JS and asserts the
 *      truth table — most importantly that an EXPIRED trial is NOT premium (so an
 *      expired-trial owner can no longer CREATE a share) while a LIVE trial /
 *      active-Premium IS, and Free / past_due / canceled are NOT.
 *
 * Mirrors the .s7 / .s10 throwaway-runner convention (no npm deps, edits nothing).
 */

'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const GH = path.resolve(__dirname, '..'); // .../GitHub
const F = {
  payments:    path.join(GH, 'payments_app/backend/sql/complete-setup.sql'),
  paymentsMig: path.join(GH, 'payments_app/backend/sql/apply-premium-entitlement.sql'),
  secure:      path.join(GH, 'secure_db/sql/complete-setup.sql'),
  secureMig:   path.join(GH, 'secure_db/sql/apply-premium-entitlement-bootstrap.sql'),
  mt:          path.join(GH, 'money_tracker/database/setup/fresh-install-complete.sql'),
  mtMig:       path.join(GH, 'money_tracker/database/setup/apply-premium-sharing-gate.sql'),
};

let pass = 0;
function ok(name, cond) {
  assert.ok(cond, 'FAIL: ' + name);
  pass++;
  console.log('  ok  - ' + name);
}
function read(p) { return fs.readFileSync(p, 'utf8'); }

console.log('\n[premium-sharing] static checks');

const files = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, read(p)]));

// --- the retired messaging-gate migration files must NOT exist anymore ---
for (const stale of [
  'payments_app/backend/sql/apply-premium-message-gate.sql',
  'secure_db/sql/apply-premium-message-gate.sql',
  'money_tracker/database/setup/apply-premium-message-gate.sql',
]) {
  ok(`retired migration absent: ${stale}`, !fs.existsSync(path.join(GH, stale)));
}

// --- is_premium_active present where it must be ---
ok('payments complete-setup defines is_premium_active', /CREATE OR REPLACE FUNCTION is_premium_active\(p_uid UUID\)/.test(files.payments));
ok('secure_db complete-setup defines is_premium_active (bootstrap)', /CREATE OR REPLACE FUNCTION is_premium_active\(p_uid UUID\)/.test(files.secure));
ok('money_tracker installer defines is_premium_active', /CREATE OR REPLACE FUNCTION is_premium_active\(p_uid UUID\)/.test(files.mt));
ok('payments migration defines is_premium_active', /CREATE OR REPLACE FUNCTION is_premium_active\(p_uid UUID\)/.test(files.paymentsMig));
ok('secure_db bootstrap migration defines is_premium_active', /CREATE OR REPLACE FUNCTION is_premium_active\(p_uid UUID\)/.test(files.secureMig));
ok('money_tracker sharing migration defines is_premium_active', /CREATE OR REPLACE FUNCTION is_premium_active\(p_uid UUID\)/.test(files.mtMig));

// --- secure_db bootstrap is fail-CLOSED (to_regclass guard returning FALSE) ---
ok('secure_db complete-setup bootstrap fail-closes on missing subscriptions',
  /to_regclass\('public\.subscriptions'\) IS NULL[\s\S]{0,160}RETURN FALSE;/.test(files.secure));
ok('secure_db migration bootstrap fail-closes on missing subscriptions',
  /to_regclass\('public\.subscriptions'\) IS NULL[\s\S]{0,200}RETURN FALSE;/.test(files.secureMig));

// --- expire_overdue_trials + pg_cron scheduling present (payments + mt + their migrations) ---
for (const k of ['payments', 'mt', 'paymentsMig', 'mtMig']) {
  ok(`${k}: expire_overdue_trials defined`, /CREATE OR REPLACE FUNCTION expire_overdue_trials\(\)/.test(files[k]));
  ok(`${k}: pg_cron schedule guarded by pg_extension check`,
    /pg_extension WHERE extname = 'pg_cron'[\s\S]{0,400}cron\.schedule\(\s*'expire-overdue-trials'/.test(files[k]));
  ok(`${k}: expire_overdue_trials NOT granted to authenticated (REVOKE ALL ... FROM PUBLIC)`,
    /REVOKE ALL ON FUNCTION expire_overdue_trials\(\) FROM PUBLIC;/.test(files[k]));
}

// --- MESSAGING IS FREE: messages_insert_participant must have NO is_premium_active check ---
for (const k of ['secure', 'mt']) {
  const m = files[k].match(/CREATE POLICY messages_insert_participant ON messages[\s\S]*?\n    \);/);
  ok(`${k}: messages_insert_participant policy present`, !!m);
  ok(`${k}: messages gate has NO is_premium_active (free messaging)`,
    !!m && !/is_premium_active/.test(m[0]));
  // sanity: the participant/block checks are still there
  ok(`${k}: messages gate still binds sender + conversation + is_blocked`,
    !!m && /auth\.uid\(\) = sender_id/.test(m[0]) && /is_blocked\(/.test(m[0]));
}
// the retired migrations are gone; the only remaining migration that mentions messages
// at all must NOT add a premium gate to a messages policy.
ok('secure_db migration does NOT create/alter a messages premium gate',
  !/CREATE POLICY messages_insert_participant[\s\S]*is_premium_active/.test(files.secureMig));

// --- SHARING IS GATED: data_shares owner-INSERT WITH CHECK must require is_premium_active ---
for (const k of ['mt', 'mtMig']) {
  const d = files[k].match(/CREATE POLICY data_shares_insert_as_owner ON data_shares[\s\S]*?\);/);
  ok(`${k}: data_shares_insert_as_owner policy present`, !!d);
  ok(`${k}: data_shares owner-INSERT requires is_premium_active(auth.uid())`,
    !!d && /AND[\s\S]*public\.is_premium_active\(auth\.uid\(\)\)/.test(d[0]));
  ok(`${k}: data_shares owner-INSERT still asserts auth.uid() = owner_user_id`,
    !!d && /auth\.uid\(\) = owner_user_id/.test(d[0]));
}

// --- definition-before-use: is_premium_active defined BEFORE data_shares INSERT policy ---
for (const k of ['mt', 'mtMig']) {
  const defIdx = files[k].indexOf('CREATE OR REPLACE FUNCTION is_premium_active');
  const useIdx = files[k].indexOf('CREATE POLICY data_shares_insert_as_owner');
  ok(`${k}: is_premium_active defined before data_shares INSERT policy`,
    defIdx >= 0 && useIdx >= 0 && defIdx < useIdx);
}

// --- SELECT / accept paths NOT premium-gated (expired-trial owner keeps reading) ---
for (const k of ['mt']) {
  const sel = files[k].match(/CREATE POLICY data_shares_select_involved ON data_shares[\s\S]*?\);/);
  ok(`${k}: data_shares SELECT is NOT premium-gated`, !!sel && !/is_premium_active/.test(sel[0]));
  const rcp = files[k].match(/CREATE POLICY data_shares_update_as_recipient ON data_shares[\s\S]*?\);/);
  ok(`${k}: recipient accept/reject UPDATE is NOT premium-gated`, !!rcp && !/is_premium_active/.test(rcp[0]));
}

// --- every SECURITY DEFINER function we touched pins search_path = public ---
function definerBlocksPinSearchPath(src, fnName) {
  const re = new RegExp('CREATE OR REPLACE FUNCTION ' + fnName + '\\([^)]*\\)[\\s\\S]*?AS \\$', 'g');
  let m, all = true, count = 0;
  while ((m = re.exec(src))) {
    count++;
    const head = m[0];
    if (/SECURITY DEFINER/.test(head) && !/SET search_path = public/.test(head)) all = false;
  }
  return count > 0 && all;
}
ok('payments: is_premium_active DEFINER pins search_path', definerBlocksPinSearchPath(files.payments, 'is_premium_active'));
ok('payments: expire_overdue_trials DEFINER pins search_path', definerBlocksPinSearchPath(files.payments, 'expire_overdue_trials'));
ok('secure_db: is_premium_active DEFINER pins search_path', definerBlocksPinSearchPath(files.secure, 'is_premium_active'));
ok('money_tracker: is_premium_active DEFINER pins search_path', definerBlocksPinSearchPath(files.mt, 'is_premium_active'));
ok('mt sharing migration: is_premium_active DEFINER pins search_path', definerBlocksPinSearchPath(files.mtMig, 'is_premium_active'));

// --- no DROP TABLE introduced (idempotent, non-destructive migrations) ---
for (const k of ['paymentsMig', 'secureMig', 'mtMig']) {
  ok(`${k}: contains no DROP TABLE`, !/DROP\s+TABLE/i.test(files[k]));
}

// --- lib/ mirrors must be UNCHANGED vs their canonical source (we did not touch them) ---
const libPaymentsMirror = path.join(GH, 'money_tracker/lib/payments_app/backend/sql/complete-setup.sql');
if (fs.existsSync(libPaymentsMirror)) {
  ok('lib/ payments mirror does NOT contain is_premium_active (left untouched)',
    !/is_premium_active/.test(read(libPaymentsMirror)));
}

console.log('\n[premium-sharing] predicate truth-table (exact port of the SQL WHERE clause)');

// Port of: (status='active' AND plan=Premium)
//       OR (status='trial'  AND trial_end IS NOT NULL AND trial_end > NOW())
function isPremiumActive(row, now = new Date()) {
  const trialLive = row.trial_end != null && new Date(row.trial_end) > now;
  return (row.status === 'active' && row.plan === 'Premium') ||
         (row.status === 'trial' && trialLive);
}

const now = new Date('2026-06-23T12:00:00Z');
const past = new Date('2026-05-01T00:00:00Z').toISOString();   // expired
const future = new Date('2026-07-01T00:00:00Z').toISOString(); // still live

const cases = [
  // [label, row, expected]  (expected == "may CREATE a share")
  ['active + Premium => may share', { status: 'active', plan: 'Premium', trial_end: null }, true],
  ['active + Free => may NOT share', { status: 'active', plan: 'Free', trial_end: null }, false],
  ['LIVE trial (future trial_end) => may share', { status: 'trial', plan: 'Premium', trial_end: future }, true],
  ['EXPIRED trial (past trial_end) => may NOT share', { status: 'trial', plan: 'Premium', trial_end: past }, false],
  ['trial with NULL trial_end => may NOT share', { status: 'trial', plan: 'Premium', trial_end: null }, false],
  ['past_due + Premium => may NOT share', { status: 'past_due', plan: 'Premium', trial_end: null }, false],
  ['canceled + Premium => may NOT share', { status: 'canceled', plan: 'Premium', trial_end: null }, false],
  ['unpaid + Premium => may NOT share', { status: 'unpaid', plan: 'Premium', trial_end: null }, false],
  ['no row (undefined plan/status) => may NOT share', { status: undefined, plan: undefined, trial_end: null }, false],
];

for (const [label, row, expected] of cases) {
  ok(label, isPremiumActive(row, now) === expected);
}

// The headline bypass: a stale status='trial' with a long-past trial_end must be DENIED.
ok('BYPASS CLOSED: never-downgraded expired trial cannot create a share',
  isPremiumActive({ status: 'trial', plan: 'Premium', trial_end: past }, now) === false);

console.log(`\n[premium-sharing] ALL ${pass} assertions passed.\n`);
