-- Index composite pour les requêtes visiteurs (workspace_id, client_id)
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_client
  ON conversations (workspace_id, client_id)
  WHERE client_id IS NOT NULL;

-- RPC get_visitor_stats : agrège les conversations par client_id pour un workspace
-- Remplace le fetchAllRows + GROUP BY JS côté serveur
CREATE OR REPLACE FUNCTION get_visitor_stats(p_workspace_id uuid)
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
AS $$
  SELECT
    c.client_id,
    COUNT(*)::bigint                              AS visit_count,
    AVG(c.sentiment_score)                        AS avg_sentiment,
    AVG(c.urgency_score)                          AS avg_urgency,
    AVG(c.failure_score)                          AS avg_failure,
    MIN(COALESCE(c.started_at, c.created_at))    AS first_visit,
    MAX(COALESCE(c.started_at, c.created_at))    AS last_visit
  FROM conversations c
  WHERE c.workspace_id = p_workspace_id
    AND c.client_id IS NOT NULL
  GROUP BY c.client_id
$$;
