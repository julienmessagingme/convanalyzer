-- 010_trim_storage.sql
--
-- Free up Supabase free-tier storage (500 MB limit).
-- Run AFTER deploying the INGEST_ENABLED=false kill-switch in /api/ingest so
-- no new data arrives while we trim.
--
-- Strategy:
--   1. DROP dead table kb_suggestions (CLAUDE.md confirms unused)
--   2. DELETE oldest ~10 % of conversations (cascades messages + tags +
--      embeddings via FK ON DELETE CASCADE set in migration 006)
--   3. NULL out raw_payload on everything kept (duplicates messages table)
--
-- Expected frees (estimates):
--   - 1 321 conversations + 11 871 messages + ~1 400 conversation_tags
--   - 6 101 vector(1536) embeddings (~36 MB raw)
--   - ~21 MB raw_payload duplication
--   - HNSW index shrinks proportionally after VACUUM
--
-- VACUUM FULL must run OUTSIDE this transaction — see bottom of file.

BEGIN;

-- ============================================================================
-- 1. Drop the dead kb_suggestions table
-- ============================================================================
-- CLAUDE.md confirms: "ancien systeme, peut etre supprime". No UI reference,
-- still used by src/lib/analysis/kb-suggester.ts but that path is disabled
-- in the cron pipeline. Safe to drop.
DROP TABLE IF EXISTS kb_suggestions;

-- ============================================================================
-- 2. Re-assert ON DELETE CASCADE on FKs into conversations
-- ============================================================================
-- Migration 006 set these up but the 23503 error on 2026-04-11 proved the
-- constraints were missing (or had been silently recreated without CASCADE).
-- Idempotent DROP IF EXISTS + ADD makes this self-healing.
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey,
  ADD CONSTRAINT messages_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE conversation_tags
  DROP CONSTRAINT IF EXISTS conversation_tags_conversation_id_fkey,
  ADD CONSTRAINT conversation_tags_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- ============================================================================
-- 3. Delete oldest 10.2 % of conversations (cascades to messages + tags)
-- ============================================================================
-- Cutoff 2026-03-26 = 1 321 conv (10.2 %).
DELETE FROM conversations
 WHERE created_at < '2026-03-26T00:00:00Z';

-- ============================================================================
-- 3. NULL raw_payload on everything remaining
-- ============================================================================
-- raw_payload stores the original webhook JSON, but every message is also
-- normalized into the messages table. Keeping it costs ~1.8 KB per row with
-- zero incremental value after ingest. Drop the data (not the column, in
-- case we ever need to re-enable capture for debug).
UPDATE conversations
   SET raw_payload = NULL
 WHERE raw_payload IS NOT NULL;

COMMIT;

-- ============================================================================
-- Post-commit: run OUTSIDE a transaction (one statement at a time).
-- VACUUM FULL takes an exclusive lock and cannot run inside BEGIN/COMMIT.
-- ============================================================================
--
--   VACUUM FULL messages;
--   VACUUM FULL conversations;
--   VACUUM FULL conversation_tags;
--   REINDEX INDEX idx_messages_embedding_hnsw;
--
-- Then verify in Supabase dashboard > Database > Reports > Database size.
