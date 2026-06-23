-- ============================================================================
-- BUDGET E2E ENVELOPE COLUMNS — idempotent, non-destructive. Run ONCE on an
-- existing money_tracker/shared database to add the encrypted-envelope columns to
-- the budget tables that hold sensitive data: user_months (the per-month JSONB
-- blob table) and pots (BUDGET_E2E_DESIGN.md §2.1/§2.2, staged plan S3).
-- Safe to re-run. Mirrors the DDL folded into
-- database/setup/fresh-install-complete.sql so a from-scratch install already
-- includes these columns.
--
-- SCHEMA ONLY — this is staged plan S3. It adds storage for ciphertext; it does
-- NOT wire any client code (that is S4) and does NOT touch existing data. Every
-- new column is NULLABLE and additive, so existing PLAINTEXT rows are untouched:
-- they keep enc_payload/enc_nonce = NULL and enc_version = 0 (legacy plaintext)
-- and continue to be read from their plaintext columns. The S5 dual-read window
-- branches on enc_version (0 = read plaintext columns, 1 = read enc_payload).
--
-- GRANULARITY (per the design, §1.2): ONE per-ROW envelope per table, NOT
-- per-column. user_months gets a single enc_payload covering the JSON of all
-- SEVEN sensitive JSONB columns (date_range, weekly_breakdown, fixed_costs,
-- variable_costs, unplanned_expenses, income_sources, pots); pots gets a single
-- enc_payload over JSON{name, estimatedAmount, actualAmount, comments}.
--
-- NO RLS / GRANT CHANGE: the envelope columns are plain columns on tables that
-- already have owner-only row policies (user_months_*_own, pots_*_own) and
-- table-level GRANTs to authenticated. RLS in Postgres is row-scoped, not
-- column-scoped, and the existing GRANTs cover all columns — so the new columns
-- are automatically covered by the existing row grants. No policy or grant change
-- is needed.
--
-- NO DROP TABLE / NO DROP COLUMN / NO DATA CHANGE. The pots ALTER COLUMN name
-- DROP NOT NULL only RELAXES a constraint (so an encrypted-only insert needs no
-- plaintext name in S4); it is a no-op if name is already nullable and changes no
-- data. The legacy plaintext columns are NOT dropped here — that happens at
-- cutover (BUDGET_E2E_DESIGN.md §6 step 7), not in S3.
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- user_months — single per-row envelope over all seven sensitive JSONB columns.
-- ----------------------------------------------------------------------------
ALTER TABLE user_months ADD COLUMN IF NOT EXISTS enc_payload TEXT;
ALTER TABLE user_months ADD COLUMN IF NOT EXISTS enc_nonce   TEXT;
ALTER TABLE user_months ADD COLUMN IF NOT EXISTS enc_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN user_months.enc_payload IS 'E2E: base64 secretbox ciphertext of JSON over all seven sensitive JSONB columns (BUDGET_E2E_DESIGN.md §2.1). NULL on legacy plaintext rows.';
COMMENT ON COLUMN user_months.enc_nonce IS 'E2E: base64 24-byte secretbox nonce for enc_payload. NULL on legacy plaintext rows.';
COMMENT ON COLUMN user_months.enc_version IS 'E2E envelope version / dual-read discriminator: 0 = legacy plaintext (read JSONB columns), 1 = encrypted (read enc_payload).';

-- ----------------------------------------------------------------------------
-- pots — single per-row envelope over JSON{name, estimatedAmount, actualAmount,
-- comments}. name is relaxed to nullable so an encrypted-only insert (S4) needs
-- no plaintext name; existing rows keep their name and are untouched.
-- ----------------------------------------------------------------------------
ALTER TABLE pots ADD COLUMN IF NOT EXISTS enc_payload TEXT;
ALTER TABLE pots ADD COLUMN IF NOT EXISTS enc_nonce   TEXT;
ALTER TABLE pots ADD COLUMN IF NOT EXISTS enc_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pots ALTER COLUMN name DROP NOT NULL;

COMMENT ON COLUMN pots.enc_payload IS 'E2E: base64 secretbox ciphertext of JSON{name, estimatedAmount, actualAmount, comments} (BUDGET_E2E_DESIGN.md §2.2). NULL on legacy plaintext rows.';
COMMENT ON COLUMN pots.enc_nonce IS 'E2E: base64 24-byte secretbox nonce for enc_payload. NULL on legacy plaintext rows.';
COMMENT ON COLUMN pots.enc_version IS 'E2E envelope version / dual-read discriminator: 0 = legacy plaintext (read typed columns), 1 = encrypted (read enc_payload).';

COMMIT;
