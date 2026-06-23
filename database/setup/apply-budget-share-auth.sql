-- ============================================================================
-- SEC-H4 LIVE-DB FIX — authenticated, context-bound budget-DEK share seal.
--   Idempotent, non-destructive. Run ONCE on an existing money_tracker/shared
--   database to add the columns the hardened (authenticated) share seal needs.
--   Safe to re-run. Mirrors the DDL folded into
--   database/setup/fresh-install-complete.sql.
--
-- THE HOLE (H-4): the original S7 seal (BudgetCryptoService.sealDEKToRecipient) was
--   an ANONYMOUS nacl box — a fresh ephemeral key DH'd against the recipient pubkey,
--   with NO owner static identity in the DH and NO context binding, AND the recipient
--   key was resolved by a RAW identity_keys read (RLS USING(true)), NOT the TOFU pin.
--   A curious server could therefore (a) substitute the recipient key and recover the
--   DEK, and (b) forge a share to a recipient (no proof of origin); nothing bound
--   (owner, recipient, dek_version, share_id), so a seal could be lifted onto another
--   row.
--
-- THE FIX (client crypto; this migration is the schema half):
--   * sealDEKToRecipient now uses an AUTHENTICATED static+ephemeral box:
--       DH_ss = DH(ownerIdentitySecret, recipientPub)   (owner authentication)
--       DH_es = DH(ephemeralSecret,     recipientPub)   (freshness)
--       wrapKey = SHA-512-KDF( DH_ss || DH_es || info )
--       info bound to (owner IK, recipient IK, owner_id, recipient_id,
--                      dek_version, share_id)
--   * the recipient key is resolved through KeyManagementService._getPinnedPeerKey
--     (TOFU, fail-closed), and unsealDEK verifies the bound owner IK == the PINNED
--     sender key + the full context before returning the DEK.
--   Schema change: persist the OWNER identity pubkey + dek_version bound into the seal
--   so the recipient can verify origin and rebuild the context.
--
-- COLUMNS ADDED (additive + nullable):
--   wrap_owner_ik TEXT     — base64 OWNER identity X25519 PUBLIC key bound into the seal
--   dek_version   INTEGER  — owner budget-DEK generation bound into the seal context
--
-- RE-SEAL / MIGRATION NOTE (REQUIRED):
--   Existing rows sealed under the OLD anonymous v1 construction have wrap_owner_ik =
--   NULL. The hardened unsealDEK FAILS CLOSED on a NULL wrap_owner_ik (an anonymous
--   seal is unauthenticated by construction and must not be trusted). Those shares
--   therefore stop decrypting until the OWNER RE-CREATES / re-saves the share, which
--   re-seals it with the authenticated v2 construction (createDataShare re-seals on
--   every create/update). No automated server-side migration is possible (the server
--   never holds the DEK or the owner identity secret — that is the whole point). Action
--   for the user: owners re-open + re-save each active share once after deploying the
--   new client. This is a deliberate fail-closed trade — a silent v1 read-through would
--   re-open H-4.
--
-- NO DROP TABLE / NO DROP COLUMN / NO DATA CHANGE.
-- ============================================================================
BEGIN;

ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS wrap_owner_ik TEXT;
ALTER TABLE data_shares ADD COLUMN IF NOT EXISTS dek_version   INTEGER;

COMMENT ON COLUMN data_shares.wrap_owner_ik IS 'E2E sharing (SEC-H4): base64 OWNER identity X25519 PUBLIC key bound into the authenticated seal. The recipient verifies this equals the PINNED (TOFU) sender key before accepting the DEK, and the static-static DH leg over it authenticates the seal origin (no anonymous box).';
COMMENT ON COLUMN data_shares.dek_version  IS 'E2E sharing (SEC-H4): the owner budget-DEK generation bound into the seal HKDF context (owner_id, recipient_id, owner IK, recipient IK, dek_version, share_id), so a seal cannot be replayed across versions/rows.';

-- The column-scoped UPDATE grant that lets the OWNER persist these seal columns is
-- applied by apply-data-shares-with-check.sql (SEC-C1). If you are applying ONLY this
-- migration, also run that one so the GRANT UPDATE(... wrap_owner_ik, dek_version ...)
-- is in place; otherwise an owner PATCH of these columns would be rejected (42501).

COMMIT;
