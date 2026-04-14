-- 012_perf_audit_fixes.sql
-- Corrections issues de l'audit Supabase best practices (2026-04-14)

-- 1. Index composite messages(conversation_id, sequence)
-- Couvre les queries getConversationWithMessages qui font
-- .eq("conversation_id", X).order("sequence", ASC)
-- Evite un sort en memoire sur les conversations longues.
CREATE INDEX IF NOT EXISTS idx_messages_conv_sequence
  ON messages (conversation_id, sequence);

-- 2. Fix get_visitor_stats : ajouter SET search_path = ''
-- Best practice Supabase pour les fonctions SECURITY DEFINER
-- afin d'eviter les attaques par search_path injection.
DROP FUNCTION IF EXISTS get_visitor_stats(text);

CREATE OR REPLACE FUNCTION get_visitor_stats(p_workspace_id text)
RETURNS TABLE (
  client_id    text,
  visit_count  bigint,
  avg_sentiment numeric,
  avg_urgency   numeric,
  avg_failure   numeric,
  first_visit   timestamptz,
  last_visit    timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.client_id,
    COUNT(*)::bigint                              AS visit_count,
    AVG(c.sentiment_score)                        AS avg_sentiment,
    AVG(c.urgency_score)                          AS avg_urgency,
    AVG(c.failure_score)                          AS avg_failure,
    MIN(COALESCE(c.started_at, c.created_at))    AS first_visit,
    MAX(COALESCE(c.started_at, c.created_at))    AS last_visit
  FROM public.conversations c
  WHERE c.workspace_id = p_workspace_id
    AND c.client_id IS NOT NULL
  GROUP BY c.client_id
$$;
