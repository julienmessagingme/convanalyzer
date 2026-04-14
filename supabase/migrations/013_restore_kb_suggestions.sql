-- 013_restore_kb_suggestions.sql
-- Restore the kb_suggestions table that was dropped in migration 010.
-- The module is still needed — only the table was missing.

CREATE TABLE IF NOT EXISTS kb_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id text REFERENCES workspaces(id),
  question text,
  suggested_answer text,
  source_conversation_ids uuid[],
  frequency int DEFAULT 1,
  impact_score int DEFAULT 0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE kb_suggestions ENABLE ROW LEVEL SECURITY;
