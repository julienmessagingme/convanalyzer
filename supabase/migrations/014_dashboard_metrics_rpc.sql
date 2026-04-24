-- 014_dashboard_metrics_rpc.sql
-- RPC qui remplace 4 COUNT(*) Promise.all dans getWorkspaceMetrics
-- (cf src/lib/supabase/queries.ts) par 1 seule query Postgres avec
-- COUNT FILTER. Gain : 4 round-trips Supabase -> 1.

-- Index composite pour rendre les filtres (workspace_id, type, created_at)
-- vraiment efficaces. Couvre aussi les requetes /conversations qui filtrent
-- par workspace + date range.
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_type_created
  ON conversations (workspace_id, type, created_at DESC);

DROP FUNCTION IF EXISTS get_dashboard_metrics(text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION get_dashboard_metrics(
  p_workspace_id text,
  p_date_from    timestamptz,
  p_date_to      timestamptz
)
RETURNS TABLE (
  total_conversations      bigint,
  bot_conversations        bigint,
  agent_conversations      bigint,
  escalated_conversations  bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    COUNT(*)::bigint                                                       AS total_conversations,
    COUNT(*) FILTER (WHERE c.type = 'bot')::bigint                         AS bot_conversations,
    COUNT(*) FILTER (WHERE c.type = 'agent')::bigint                       AS agent_conversations,
    COUNT(*) FILTER (WHERE c.type = 'bot' AND c.escalated)::bigint         AS escalated_conversations
  FROM public.conversations c
  WHERE c.workspace_id = p_workspace_id
    AND c.created_at >= p_date_from
    AND c.created_at <= p_date_to;
$$;
