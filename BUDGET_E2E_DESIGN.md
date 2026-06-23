# Client-Side End-to-End Encryption of Budget Data — money_tracker

Status: design, implementable. Date: 2026-06-23.
Roadmap item #2 (co-#1 with forward secrecy).

Goal: make the "privacy-first budgeting" pitch true server-side. Today every amount,
description, category, payee and note in `user_months` / `pots` is stored **plaintext** in
Supabase. After this change the server stores only opaque ciphertext plus a minimal set of
structural columns needed for RLS and ordering. All decryption happens on the user's paired
devices, keyed off the **existing X25519 identity** in `auth_db/encryption` — no second password.

---

## 0. The fact that drives the whole design

Budget data is **not** normalized into per-transaction rows. It lives as **per-month JSONB
document blobs**:

`user_months` (`database/setup/fresh-install-complete.sql:114`) has one row per
`(user_id, year, month)` with seven JSONB columns: `date_range`, `weekly_breakdown`,
`fixed_costs`, `variable_costs`, `unplanned_expenses`, `income_sources`, `pots`. The standalone
`pots` table (`:202`) has typed columns `name TEXT`, `estimated_amount NUMERIC`,
`actual_amount NUMERIC`, `comments TEXT`.

There is **no server-side SQL `SUM`/`GROUP BY`/`WHERE` over any sensitive field.** Every
aggregate, sort, filter and chart is pure client-side JS over already-fetched objects
(`shared/services/calculationService.js`). The DB layer only ever filters on
`user_id`, `year`, `month`, `id` — all structural.

Consequence: E2E for budget data reduces to **encrypt the blob on write, decrypt on read**.
We give up no server-side query we actually use. This is the Actual Budget / Budgero model
(encrypt the whole budget client-side; server stores opaque blobs; all math is local). It is the
opposite of the Firefly III mistake of per-column ciphertext, which broke sorting/search and made
re-keying painful — that is the trap; per-blob is the win.

---

## 1. (a) Chosen approach + why — DEK model, granularity, plaintext set

### 1.1 Two-layer key model (DEK wrapped under the existing identity KEK)

- **DEK** — one random 32-byte key per user. Encrypts every budget blob with NaCl `secretbox`
  (XSalsa20-Poly1305) via the **existing** `CryptoPrimitivesService.encrypt(jsonString, dek)`
  → `{ciphertext, nonce}` base64 (`cryptoPrimitivesService.js:241`). This is exactly the budget
  primitive; both nonces route through the seedable RNG seam (`randomBytes`, `:112`), which is
  what makes the test gates deterministic.
- **KEK** — the user's **existing** X25519 identity secret, already managed and wrapped at rest in
  IndexedDB under a non-extractable AES-GCM key (`keyStorageService._wrapSecret:257` /
  `getIdentityKeys:368`, the SM-02 mechanism). We add **no second password** (hard constraint).

**Wrapping the DEK so every paired device can unwrap it.** Derive a symmetric wrap key from the
identity secret with the existing HKDF, then `secretbox` the DEK under it. This mirrors the
existing `deriveBackupKey` / `deriveDeviceKey` pattern verbatim (`keyDerivationService.js:74,85`),
which call `_hkdf(masterSecret, info, 32)`; `_hkdf` auto-derives a context salt from `info` when
none is passed (`:99,144`), so no new salt management is introduced:

```
wrapKey      = KeyDerivationService._hkdf(identitySecret, "MoneyTracker:BudgetDEK:v1", 32)
{ct, nonce}  = CryptoPrimitivesService.encryptBytes(DEK, wrapKey)   // raw-bytes secretbox
```

The wrapped DEK is stored server-side in one RLS-scoped row (schema §2). **Why multi-device is
free:** `wrapKey` is a pure function of the identity secret, and the pairing flow already transfers
the identity secret to a new device (`keyManagementService.exportPairingBundle:2017` ships
`identitySecretB64`; `importPairingBundle:2078` installs it). So a freshly paired device
re-derives `wrapKey`, fetches the one `budget_dek` row, and unwraps the **same** DEK. The
recovery-key and password restore paths recover the identity secret too, so they recover DEK
access. **No pairing-bundle version bump is required** — the DEK rides for free inside the identity
that the bundle already carries.

**One DEK per user, not per month** — trivial wrapping, and the whole budget re-keys by re-wrapping
one row. The `dek_version` column reserves space for the future forward-secrecy item (per-epoch DEKs)
without forcing it now.

### 1.2 Granularity — per-blob (per record), NOT per-field

Encrypt at JSONB-document granularity: one `secretbox` over the JSON of all sensitive columns per
`user_months` row, and one per `pots` row. Per-field is rejected: the app deserializes the whole
month anyway (so field-granularity buys nothing functionally), and per-field leaks structure and
cardinality (how many line items, presence of notes) — Firefly's exact error. One secretbox per row
also means trivial nonce handling (fresh 24-byte nonce per write) and trivial re-keying.

Use NaCl `secretbox` (not WebCrypto AES-GCM) to match the rest of the stack and to keep the
deterministic-RNG seam the test gates depend on.

### 1.3 What stays plaintext (and the hard line)

| Column | Plaintext? | Why |
|---|---|---|
| `user_id` | yes | RLS predicate `auth.uid() = user_id` |
| `id`, `created_at`, `updated_at` | yes | row identity, sync, ordering |
| `year`, `month` | yes | the list/sort/pagination/upsert key (UNIQUE + `idx_user_months_year_month`); coarse metadata only |
| `month_name` | yes | derivable from `month`; no financial info |
| the 7 JSONB columns (amounts, categories, payees, notes) | **CIPHERTEXT** | this is the entire privacy promise |
| `pots.name/estimated_amount/actual_amount/comments` | **CIPHERTEXT** | same |

**Hard line:** NEVER promote an amount, total, category or payee to a plaintext, bucketed, or
range column — no "month total" hint, no amount buckets, no blind index. The plaintext set is
exactly `{ownership, time-bucket, row-identity, sync timestamps}` and nothing financial. This is
enforced by a CI lint gate (§8 gate 6).

---

## 2. (b) Exact schema changes

### 2.1 `user_months` — add an envelope, keep structural columns

```sql
ALTER TABLE user_months
  ADD COLUMN enc_payload TEXT,            -- base64 secretbox of JSON{date_range, weekly_breakdown,
                                          --   fixed_costs, variable_costs, unplanned_expenses,
                                          --   income_sources, pots}
  ADD COLUMN enc_nonce   TEXT,            -- base64 24-byte nonce
  ADD COLUMN enc_version INTEGER NOT NULL DEFAULT 0;   -- 0 = legacy plaintext, 1 = encrypted
```

The seven JSONB columns are kept during the dual-read window (§6) and dropped at cutover. JSONB
columns DEFAULT to `'[]'`/`'{}'`; migration nulls them to those defaults once the row is encrypted.
No DDL is strictly required to *hold* ciphertext (an envelope could live inside a JSONB column), but
explicit `enc_*` columns make the lint gate and the `enc_version` discriminator clean.

### 2.2 `pots` — typed columns cannot hold ciphertext, so add an envelope

```sql
ALTER TABLE pots
  ADD COLUMN enc_payload TEXT,            -- base64 secretbox of JSON{name, estimatedAmount, actualAmount, comments}
  ADD COLUMN enc_nonce   TEXT,
  ADD COLUMN enc_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pots ALTER COLUMN name DROP NOT NULL;   -- name no longer required once encrypted
```

At cutover, `name/estimated_amount/actual_amount/comments` are dropped (or `name` nulled and the
NUMERICs zeroed during the dual-read window).

### 2.3 New `budget_dek` table (one wrapped DEK per user)

```sql
CREATE TABLE budget_dek (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wrapped_dek TEXT NOT NULL,             -- base64 secretbox ciphertext of the 32-byte DEK
  wrap_nonce  TEXT NOT NULL,             -- base64 24-byte nonce
  dek_version INTEGER NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE budget_dek ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_dek_select_own ON budget_dek FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY budget_dek_insert_own ON budget_dek FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY budget_dek_update_own ON budget_dek FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY budget_dek_delete_own ON budget_dek FOR DELETE USING (auth.uid() = user_id);
```

### 2.4 `settings` (mild sensitivity, scheduled with the same pattern, lower priority)

`default_fixed_costs`, `default_variable_categories`, `default_pots` (JSONB) leak naming
conventions. Same envelope pattern (`enc_payload/enc_nonce/enc_version`); `currency`/`font_size`
stay plaintext (display + non-financial). Land after the `user_months`/`pots` core.

### 2.5 Cross-user sharing — wrapped DEK per share (only place needing new key distribution)

`data_shares` (`:717`) + RLS `user_months_select_shared` (`:750`) /
`user_months_update_shared` (`:774`) let a recipient read/write the **owner's** row. Under E2E the
recipient cannot decrypt unless the DEK is wrapped to their identity public key. Add to
`data_shares`:

```sql
ALTER TABLE data_shares
  ADD COLUMN wrapped_dek TEXT,           -- DEK sealed to the recipient's identity pubkey
  ADD COLUMN wrap_nonce  TEXT,
  ADD COLUMN wrap_eph_pub TEXT;          -- ephemeral X25519 pubkey for the box seal
```

On `createDataShare` (`databaseService.js:3211`): resolve the recipient's current identity pubkey
via the existing `HistoricalKeysService.getCurrentPublicKey` (`historicalKeysService.js:152`,
`identity_keys` has RLS `select_all`), seal the DEK with `box` (ephemeral keypair +
`deriveSharedSecret`), store the three fields. On the recipient side, unseal with the identity
secret to recover the owner's DEK, then decrypt shared months. Revoking a share should re-key (new
DEK, re-wrap all rows + the owner's `budget_dek`) — call out as a known cost. **Sharing is staged
LAST** (§9 stage 7); it is the one genuinely new piece of crypto plumbing.

---

## 3. (c) Read/write path changes — precise call sites

Single chokepoints, all in
`lib/auth_db/database/services/databaseService.js`. The DEK is fetched/unwrapped once per session
and held in memory by a new `BudgetCryptoService` (a thin wrapper over `CryptoPrimitivesService` +
the `budget_dek` row + `KeyStorageService`), mirroring how identity keys are cached.

### 3.1 Write (encrypt) — `transformMonthToDatabase:2769`

Today it returns a record with the seven JSONB fields in the clear (`:2776-2782`). Change it to
bundle those into one JSON, encrypt, and emit the envelope:

```js
transformMonthToDatabase(monthData, year, month, userId = null) {
    const now = new Date().toISOString();
    const sensitive = {
        dateRange: monthData.dateRange || {},
        weeklyBreakdown: monthData.weeklyBreakdown || [],
        fixedCosts: monthData.fixedCosts || [],
        variableCosts: monthData.variableCosts || [],
        unplannedExpenses: monthData.unplannedExpenses || [],
        incomeSources: monthData.incomeSources || [],
        pots: monthData.pots || []
    };
    const dek = BudgetCryptoService.requireDek();              // throws if unavailable (fail closed)
    const { ciphertext, nonce } = CryptoPrimitivesService.encrypt(JSON.stringify(sensitive), dek);
    const record = {
        year, month,
        month_name: monthData.monthName || this.getMonthName(month),
        enc_payload: ciphertext, enc_nonce: nonce, enc_version: 1,
        updated_at: now, created_at: monthData.createdAt || now
    };
    if (userId !== null) record.user_id = userId;
    return record;   // no plaintext financial column is ever emitted
}
```

Same edit shape for `transformPotToDatabase:2817` (envelope of `{name, estimatedAmount,
actualAmount, comments}`) and later `transformSettingsToDatabase:2851`.
`saveMonth:2151` (which calls the transform at `:2227`) and the pots/settings save paths
(`:2509`, `:2691`) need no change — they already route through these transforms. CSV import flows
through `saveMonth` too (§5), so it is covered automatically.

### 3.2 Read (decrypt) — `transformDatabaseToMonth` (inverse of `:2769`)

Branch on `enc_version`:

```js
transformDatabaseToMonth(dbRecord) {
    let s;
    if (dbRecord.enc_version === 1) {
        const dek = BudgetCryptoService.requireDek();
        s = JSON.parse(CryptoPrimitivesService.decrypt(dbRecord.enc_payload, dbRecord.enc_nonce, dek));
    } else {
        s = {                                  // legacy plaintext (dual-read window)
            dateRange: dbRecord.date_range, weeklyBreakdown: dbRecord.weekly_breakdown,
            fixedCosts: dbRecord.fixed_costs, variableCosts: dbRecord.variable_costs,
            unplannedExpenses: dbRecord.unplanned_expenses, incomeSources: dbRecord.income_sources,
            pots: dbRecord.pots
        };
    }
    return { /* id, year, month, monthName, createdAt, updatedAt, ...s */ };
}
```

`getAllMonths:1603` and `getMonth` call the inverse transform after `querySelect`; downstream
`CalculationService.calculateMonthTotals` (`calculationService.js:13`) runs unchanged on the
decrypted object. Same inverse-transform branch for `transformPotFromDatabase:2800` and
`transformSettingsFromDatabase:2836`.

### 3.3 Fail-closed posture

`BudgetCryptoService.requireDek()` throws if the DEK is not loaded (DB row missing AND not yet
bootstrapped, or wrap-key derivation failed). Reads then surface an error rather than returning
plaintext or garbage, mirroring `nullEncryptionFacade.js`. A tampered ciphertext throws inside
`decrypt` (Poly1305 auth failure, `:270`).

---

## 4. (d) Aggregation/reporting strategy + performance

**Strategy: decrypt-then-aggregate, entirely client-side — already the app's model.** The only new
step is one `decrypt` between fetch and the existing JS math.

Currently-server-side aggregate queries that must move client-side: **none.** Confirmed by grep of
`databaseService.js` — every budget query filters only on `user_id/year/month/id` and all financial
math is in `calculationService.js`:
- `calculateMonthTotals:13` (`forEach` over the JSONB arrays)
- `calculateWeekTotals:86` (`reduce`)
- `calculateTrend:107`
- `calculateSavings:146`

All four already run on decrypted objects post-fetch and are unaffected. There is nothing to port.

**Performance / pagination implications.** The working set is **months, not transactions** — tens of
rows for a year, not thousands.
- Sort / paginate / "jump to month" use plaintext `(year, month)` on the existing index; fetch a
  page of rows and decrypt only that page — no need to decrypt all history to list which months
  exist or to render one month.
- A 12-month report decrypts ~12 small secretboxes (sub-millisecond-class) then runs the existing
  JS sums. Not a performance concern at this data scale.
- Multi-year reporting decrypts lazily by year bucket; cache decrypted month objects in memory for
  the session to avoid re-decrypting on chart re-render.

**Search** (descriptions/payees): there is **no server-side search today**, so nothing is lost.
Search = decrypt the candidate months client-side and `String.includes`/regex in memory, lazily by
year. **No HMAC blind indexes** — they leak equality/frequency of payees and amounts to the server,
reintroduce a key to manage, and break the zero-knowledge promise. The blob model makes them
unnecessary.

---

## 5. (e) CSV import — encrypt on device

CSV/OFX import is already fully client-side: `FileReader` → parse in `shared/utils/csvHandler.js` →
build month object → `saveMonth(..., forceUserTable=true)` (export is the inverse via
`shared/services/fileService.js`). Because import converges on the **same encrypt-on-write
chokepoint** (`transformMonthToDatabase`, §3.1), `enc_payload = secretbox(JSON, DEK)` happens
automatically. **The raw CSV never leaves the device and is never uploaded.**

Ingest is a parameter, as required: manual entry, CSV, or a future **client-side** Plaid flow all
produce an in-browser month object that flows through the same encrypt path; the encryption boundary
is independent of ingest. Caveat for the separate ingest decision: a **server-side** Plaid/aggregator
path would see plaintext transactions before encryption and break the guarantee (same caveat Actual
Budget documents — bank-sync tokens/data are not covered by E2E). Keep Plaid client-side to preserve
the property.

---

## 6. (f) Migration of existing plaintext rows — dual-read, idempotent, no data loss

Clean break is forbidden. Use the `enc_version` discriminator (0 = legacy plaintext, 1 = encrypted).

1. **Dual-read window.** `getMonth`/`getAllMonths`/`getAllPots` branch on `enc_version` (§3.2):
   decrypt if 1, read legacy columns if 0. The app — including reporting/charts — works correctly on
   a mixed history.
2. **DEK bootstrap on first post-feature login.** If `budget_dek` has no row: generate DEK, wrap
   under the identity (§1.1), INSERT. If a row exists, unwrap it. Idempotent (PK = `user_id`).
3. **One-time client migration on login** (after DEK available). Query
   `WHERE user_id = me AND (enc_version = 0 OR enc_version IS NULL)`, page through, and for each row:
   build the object from plaintext columns → `secretbox(JSON, DEK)` → a single `UPDATE` that sets
   `enc_payload, enc_nonce, enc_version = 1` **and** resets the legacy JSONB columns to their
   defaults (`'[]'::jsonb` / `'{}'::jsonb`). Runs as the user under existing RLS UPDATE — no service
   role. Same for `pots`.
4. **Verify-before-destroy.** Within each row, `decrypt(enc_payload) === original JSON` **before**
   clearing legacy columns. Never destroy plaintext you have not proven you can read back (mirrors
   the existing "validate before clearAll" discipline in `restoreFromPassword`).
5. **Idempotency / crash-safety.** The `WHERE enc_version = 0` filter means a re-run only touches
   un-migrated rows; a crash mid-batch leaves a clean mix the dual-read handles. Migrate in small
   batches (~10 rows) so a closed tab loses at most one batch; each row's flip is atomic.
6. **Multi-device interaction.** All devices share one DEK (§1.1), so any device can migrate any row
   and any device can read the result. Migration is naturally convergent: whichever device logs in
   first migrates; others see already-`enc_version=1` rows and skip them. If two devices race the
   same row, the second's UPDATE is a no-op against an already-migrated row (re-encrypting the same
   content with a fresh nonce is harmless; the `WHERE enc_version=0` guard usually prevents it
   entirely).
7. **Cutover.** After a deployment window where telemetry shows active users migrated, drop the
   legacy plaintext columns and remove the dual-read branch. Inactive users migrate lazily on next
   login; the dual-read branch stays until the columns are dropped.

---

## 7. (g) DEK lifecycle + multi-device via the existing pairing bundle

- **Create:** generated once at bootstrap (§6.2), wrapped under the identity, stored in
  `budget_dek`.
- **Load:** at session start, fetch `budget_dek`, derive `wrapKey` from the identity secret,
  unwrap, cache in `BudgetCryptoService` (and optionally wrap-at-rest in IndexedDB via
  `KeyStorageService._wrapSecret`, adding a `budget_dek` object store = a `MoneyTrackerEncryption`
  DB v4 `onupgradeneeded` bump — optional offline-availability hardening).
- **Multi-device:** **no new distribution.** `exportPairingBundle:2017` already ships the identity
  secret (`identitySecretB64`); the new device re-derives `wrapKey`, fetches the one `budget_dek`
  row, unwraps the same DEK. No bundle version bump. (Optional: also stash `budgetDekB64` in the
  bundle for a device that paired before publishing identity-to-server — not required for
  correctness.)
- **Restore:** password/recovery-key restore recover the identity secret, hence the DEK.
- **Re-key (future / on share revocation):** generate a new DEK, re-encrypt all rows, re-wrap the
  one `budget_dek` row (and any `data_shares`), bump `dek_version`. Single-row wrap makes this
  cheap; reserved for the forward-secrecy roadmap item.

---

## 8. (h) Deterministic test gates (no browser, no runtime crypto)

Run as standalone node files in the existing harness style
(`node lib/auth_db/encryption/tests/sN_*.test.js`). `_harness.js` loads vendored TweetNaCl, provides
`global.crypto` for HKDF, and exposes the **seeded RNG seam** (`setRandomBytesSource`); `_idb_shim.js`
covers IndexedDB. New file e.g. `s10_budget_e2e.test.js`.

1. **Round-trip:** seed RNG → encrypt a fixture month → assert
   `decrypt(enc_payload, enc_nonce, DEK)` byte-equals the original JSON. Fixed seed ⇒ fixed
   ciphertext ⇒ snapshot-testable.
2. **Aggregate equivalence (core correctness):** assert
   `calculateMonthTotals(decrypt(encrypt(month)))` deep-equals `calculateMonthTotals(month)` for a
   fixtures set — i.e. aggregate-over-decrypted == aggregate-over-plaintext. Same for
   `calculateWeekTotals/Trend/Savings`.
3. **Wrap/unwrap + multi-device:** from a fixed identity secret derive `wrapKey`, wrap a fixed DEK,
   assert unwrap recovers it; run `exportPairingBundle` → `importPairingBundle` against the IDB shim
   on a second simulated device and assert it unwraps the **same** DEK and decrypts the fixture.
4. **Migration idempotency:** seed a mix of `enc_version` 0/1 rows, run migration twice; assert
   (a) all rows end at version 1, (b) legacy columns reset, (c) decrypted content == originals,
   (d) the second run issues zero UPDATEs.
5. **Wrong-key fails:** decrypt a fixture with a different DEK / different identity secret → throws
   (auth failure), never returns plaintext.
6. **No-financial-plaintext lint:** static scan asserting the only plaintext columns emitted by
   `transformMonthToDatabase`/`transformPotToDatabase` are the allow-list
   `{user_id, id, year, month, month_name, created_at, updated_at, enc_payload, enc_nonce,
   enc_version}`. Fails CI if anyone adds an amount/total/category column. This is the structural
   guard that keeps the pitch true.
7. **Tamper / fail-closed:** flip one byte of `enc_payload` → decrypt throws; with no DEK loaded,
   `requireDek` throws and the read/write path refuses rather than returning plaintext.

---

## 9. (i) Staged build plan (small, testable steps)

1. **`BudgetCryptoService` + gates 1, 5, 7.** Pure crypto wrapper over `CryptoPrimitivesService`;
   `encryptMonth/decryptMonth`, `requireDek`, fail-closed. No DB, no UI. Land round-trip / wrong-key
   / tamper gates first.
2. **DEK wrap + `budget_dek` table + gate 3.** HKDF `deriveBudgetWrapKey`, wrap/unwrap, schema +
   RLS, bootstrap-on-login. Multi-device gate via pairing bundle.
3. **Schema envelope columns** on `user_months` + `pots` (`enc_payload/enc_nonce/enc_version`),
   migration files only (no behavior change yet).
4. **Write path:** edit `transformMonthToDatabase` + `transformPotToDatabase` to emit envelopes;
   gate 6 (lint) green. New rows now ciphertext.
5. **Read path (dual-read):** branch the inverse transforms on `enc_version`; gates 2 + the
   dual-read equivalence. App reads mixed history correctly.
6. **Migration on login + gate 4.** Idempotent batched re-encrypt, verify-before-destroy.
7. **Cross-user sharing:** `data_shares` wrapped-DEK (seal to recipient pubkey via
   `getCurrentPublicKey`); update `createDataShare` + shared-read path. (Hardest; last.)
8. **Settings envelope** (lower priority), then **cutover**: telemetry-gated drop of legacy
   plaintext columns + removal of dual-read branch.

Commit + push per stage with gates green (per the repo's commit-and-push-every-step directive).

---

## 10. (j) Honest limitations

- **Metadata still visible server-side:** `user_id`, `id`, `year`, `month`, `month_name`, row
  counts and `created_at`/`updated_at` timestamps. The server learns *that* you budget and *which
  months and how often you edit*, never any amount/category/payee/note. `field_locks.field_path`
  (`:806`, RLS `select_all`) further leaks which JSON path is being edited (structure/activity, not
  values) — flagged, out of core scope.
- **No server-side search or reporting.** All search/aggregation is client-side; very large
  multi-year reports decrypt month-by-month in the browser. Acceptable at month-blob scale.
- **Trust in the served JS.** GitHub Pages serves the client; a malicious deploy could exfiltrate
  the DEK. E2E protects against a compromised/curious *backend*, not a compromised *frontend
  delivery* — same threat model as all browser-delivered E2E (Actual, Budgero). Mitigations
  (SRI/pinning) are out of scope.
- **Bank-sync ingest is parameterized.** At-rest encryption is independent of ingest. A
  **client-side** Plaid path preserves the guarantee; a **server-side** aggregator would see
  plaintext before encryption and is incompatible — that decision is pending and explicitly out of
  this design.
- **Sharing widens the trust set** to each recipient's identity key, and share revocation requires a
  re-key (new DEK + re-encrypt) to be cryptographically meaningful.
- **No forward secrecy yet** for budget data (roadmap #1). One long-lived DEK means a future
  identity-secret compromise can decrypt all history; `dek_version` reserves the per-epoch path.

---

## Key source references

- Schema: `database/setup/fresh-install-complete.sql` — `user_months:114`, `pots:202`,
  `data_shares:717` + shared RLS `:750`/`:774`, `field_locks:806`.
- Encrypt/decrypt chokepoints: `lib/auth_db/database/services/databaseService.js` —
  `transformMonthToDatabase:2769`, `transformPotToDatabase:2817`, `transformSettingsToDatabase:2851`
  (+ `*FromDatabase` inverses `:2800/:2836`); `saveMonth:2151`, `getAllMonths:1603`,
  `createDataShare:3211`.
- Client aggregation: `shared/services/calculationService.js:13/86/107/146`.
- CSV: `shared/utils/csvHandler.js`, `shared/services/fileService.js`.
- Reusable crypto: `lib/auth_db/encryption/services/cryptoPrimitivesService.js`
  (`encrypt:241`, `decrypt:263`, `encryptBytes:283`, RNG seam `:112/137`),
  `keyDerivationService.js` (`_hkdf:99`, `deriveBackupKey:74`/`deriveDeviceKey:85` pattern),
  `keyStorageService.js` (`_wrapSecret:257`/`getIdentityKeys:368`),
  `keyManagementService.js` (`exportPairingBundle:2017`/`importPairingBundle:2078`),
  `historicalKeysService.js:152`; fail-closed `encryption/facade/nullEncryptionFacade.js`.
- Test harness: `lib/auth_db/encryption/tests/_harness.js`, `_idb_shim.js`, `s0_primitives.test.js`.
