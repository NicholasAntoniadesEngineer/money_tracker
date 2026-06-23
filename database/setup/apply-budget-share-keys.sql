-- ============================================================================
-- BUDGET E2E CROSS-USER SHARING — wrapped DEK per share. Idempotent,
-- non-destructive. Run ONCE on an existing money_tracker/shared database to add
-- the per-share sealed-DEK columns that let a RECIPIENT decrypt budget data an
-- owner shared with them (BUDGET_E2E_DESIGN.md §2.5 / §7, staged plan S7).
-- Safe to re-run. Mirrors the DDL folded into
-- database/setup/fresh-install-complete.sql so a from-scratch install already
-- includes these columns.
--
-- WHY: after S1-S6 every user_months / pots row is ciphertext under the OWNER's
-- budget DEK. The existing share RLS (user_months_select_shared / _update_shared)
-- lets a recipient READ/WRITE the owner's row, but they cannot DECRYPT it with
-- their OWN DEK. S7 seals the owner's DEK to the recipient's identity X25519
-- public key on the share row, so the recipient can unseal it with their identity
-- secret and decrypt the shared rows. This is the ONLY place in the E2E design
-- that needs new key DISTRIBUTION (every other path rides the existing identity).
--
-- HOW (client side, no server crypto):
--   SEAL   (owner, createDataShare): ephemeral keypair eph; shared =
--           box(DEK, nonce, recipientIdentityPub, eph.secret); store
--           wrapped_dek = base64(box ciphertext), wrap_nonce, wrap_eph_pub =
--           base64(eph.public).
--   UNSEAL (recipient, shared-read): DEK =
--           box.open(wrapped_dek, wrap_nonce, wrap_eph_pub, recipientIdentitySecret),
--           then decrypt the shared user_months / pots row with THAT DEK.
-- The server stores ONLY opaque ciphertext + the ephemeral public key — never the
-- unwrapped DEK and never any budget plaintext.
--
-- ADDITIVE + NULLABLE: legacy/un-sealed shares leave all three columns NULL; the
-- recipient simply cannot decrypt that share (H11 per-row skip), exactly as
-- before S7. No existing data is touched.
--
-- RLS / GRANT: NO new policy or grant is needed.
--   * The existing data_shares_select_involved
--       (auth.uid() = owner_user_id OR auth.uid() = shared_with_user_id)
--     already lets the RECIPIENT read their own share row — including these three
--     new columns (RLS is row-scoped, not column-scoped; the existing GRANT to
--     authenticated covers all columns). So the recipient can fetch + unseal.
--   * The OWNER writes the columns via the existing data_shares_insert_as_owner /
--     data_shares_update_as_owner policies (createDataShare inserts/updates a row
--     the owner owns).
--   * wrapped_dek is opaque ciphertext: even though the recipient (and ONLY the
--     recipient, per the SELECT policy) can read it, it is useless without their
--     identity secret.
--
-- REVOCATION: the existing data_shares_delete_as_owner lets the owner DELETE the
-- share row, which removes the wrapped DEK AND (because user_months_select_shared
-- requires a status='accepted' data_shares row) cuts the recipient's RLS read
-- access in the same step. NOTE (design §7 / §10): deleting the row stops FUTURE
-- access, but a recipient who already cached the unsealed DEK could still decrypt
-- ciphertext they previously read; cryptographically-complete revocation requires
-- a full DEK RE-KEY (new DEK, re-encrypt all rows, re-wrap budget_dek + re-seal
-- the remaining shares) — reserved for the forward-secrecy roadmap item, out of
-- S7 scope.
--
-- NO DROP TABLE / NO DROP COLUMN / NO DATA CHANGE.
-- ============================================================================
BEGIN;

ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS wrapped_dek  TEXT;
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS wrap_nonce   TEXT;
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS wrap_eph_pub TEXT;

COMMENT ON COLUMN data_shares.wrapped_dek  IS 'E2E sharing: the OWNER budget DEK sealed (nacl.box) to the recipient identity pubkey (BUDGET_E2E_DESIGN.md §2.5). NULL on an un-sealed/legacy share — recipient then cannot decrypt.';
COMMENT ON COLUMN data_shares.wrap_nonce   IS 'E2E sharing: base64 24-byte nonce for the wrapped_dek box seal.';
COMMENT ON COLUMN data_shares.wrap_eph_pub IS 'E2E sharing: base64 ephemeral X25519 public key the recipient combines with their identity secret to unseal wrapped_dek.';

COMMIT;
