-- 006_audit_fixes.sql
-- Add missing urgency_score column, cascading deletes, and performance indexes

-- Add urgency_score if missing
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS urgency_score float;

-- Cascading deletes: messages -> conversations
ALTER TABLE messages
  DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey,
  ADD CONSTRAINT messages_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- Cascading deletes: conversation_tags -> conversations
ALTER TABLE conversation_tags
  DROP CONSTRAINT IF EXISTS conversation_tags_conversation_id_fkey,
  ADD CONSTRAINT conversation_tags_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- Composite index for workspace + type queries (dashboard, conversations page)
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_type
  ON conversations (workspace_id, type);

-- Partial index for scored conversations (pipeline queries)
CREATE INDEX IF NOT EXISTS idx_conversations_scored
  ON conversations (workspace_id)
  WHERE scoring_status = 'scored';

-- Composite index for message queries by workspace + sender_type
CREATE INDEX IF NOT EXISTS idx_messages_workspace_sender
  ON messages (workspace_id, sender_type);
