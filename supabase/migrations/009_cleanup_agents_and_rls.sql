-- 009_cleanup_agents_and_rls.sql
--
-- Part 1: re-map the 6 agents from the orphan workspace 'mieuxassure' to the
-- real workspace '225831', then drop the orphan workspace. Verified before
-- writing: 0 rows reference 'mieuxassure' in conversations, messages, tags,
-- conversation_tags, suggested_tags, kb_suggestions, user_workspaces.
--
-- Part 2: enable Row Level Security (defense-in-depth). The app exclusively
-- uses SUPABASE_SERVICE_ROLE_KEY via src/lib/supabase/server.ts, which has
-- BYPASSRLS in Supabase. No anon key is exposed. Enabling RLS with no
-- policies therefore:
--   - keeps the app fully functional (service_role bypasses)
--   - blocks any future accidental exposure via anon/authenticated roles
--
-- Run in the Supabase SQL Editor (project muhhlsijojxzrppjexhg).

BEGIN;

-- ============================================================================
-- Part 1: agents + orphan workspace cleanup
-- ============================================================================

-- Sanity guard: abort if something unexpected references the orphan workspace
DO $$
DECLARE
  orphan_refs int;
BEGIN
  SELECT
    (SELECT count(*) FROM conversations WHERE workspace_id='mieuxassure') +
    (SELECT count(*) FROM messages      WHERE workspace_id='mieuxassure') +
    (SELECT count(*) FROM tags          WHERE workspace_id='mieuxassure') +
    (SELECT count(*) FROM suggested_tags WHERE workspace_id='mieuxassure') +
    (SELECT count(*) FROM kb_suggestions WHERE workspace_id='mieuxassure')
  INTO orphan_refs;
  IF orphan_refs > 0 THEN
    RAISE EXCEPTION 'Orphan workspace still has % refs outside agents — aborting', orphan_refs;
  END IF;
END $$;

-- Re-parent agents. PK is (id, workspace_id) composite; no FK points at it,
-- so updating workspace_id is safe.
UPDATE agents
   SET workspace_id = '225831',
       synced_at    = now()
 WHERE workspace_id = 'mieuxassure';

-- Drop the orphan workspace row
DELETE FROM workspaces WHERE id = 'mieuxassure';

-- ============================================================================
-- Part 2: enable RLS on all application tables
-- ============================================================================

ALTER TABLE workspaces        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_workspaces   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags              ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggested_tags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE kb_suggestions    ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================================
-- Post-apply verification (run manually after COMMIT)
-- ============================================================================
-- SELECT id, name, hostname FROM workspaces;                    -- expect 1 row (225831)
-- SELECT id, name, workspace_id FROM agents;                    -- expect 6 rows, all 225831
-- SELECT schemaname, tablename, rowsecurity
--   FROM pg_tables
--  WHERE schemaname='public' AND tablename IN (
--    'workspaces','users','user_workspaces','agents','conversations',
--    'messages','tags','conversation_tags','suggested_tags','kb_suggestions'
--  );                                                           -- expect rowsecurity=t for all
