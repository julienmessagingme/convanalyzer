-- 008_auth.sql
-- Multi-tenant authentication: local admin + SSO clients via hostname mapping
--
-- Model:
--   - `users` table stores both local users (admin w/ password) and SSO shadow
--     users (auto-created on first proxied request from a client site).
--   - `user_workspaces` junction restricts which workspaces each user can see.
--     Admins (role='admin') bypass this check and see all workspaces in code.
--   - `workspaces.hostname` maps a client subdomain to exactly one workspace
--     for SSO routing (e.g. 'mieuxassure.messagingme.app' -> '225831').

-- 1. Add hostname column to workspaces for SSO routing
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS hostname text UNIQUE;

-- 2. Users table (local admins + SSO shadow users)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text,                                     -- NULL for SSO users
  role text NOT NULL CHECK (role IN ('admin', 'client')),
  auth_type text NOT NULL CHECK (auth_type IN ('local', 'sso')),
  external_hostname text,                                 -- for SSO: source hostname
  external_id text,                                       -- for SSO: user id on source site
  created_at timestamptz DEFAULT now(),
  last_login_at timestamptz,
  -- A given email can be local OR come from one specific external hostname.
  -- NULL external_hostname = local. Unique per (email, external_hostname) pair.
  UNIQUE (email, external_hostname)
);

-- Local users must have a password, SSO users must not
ALTER TABLE users
  ADD CONSTRAINT users_auth_consistency CHECK (
    (auth_type = 'local' AND password_hash IS NOT NULL AND external_hostname IS NULL) OR
    (auth_type = 'sso'   AND password_hash IS NULL     AND external_hostname IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
-- Unique to support ON CONFLICT upsert in findOrCreateSsoUser.
-- Partial index: only SSO rows have (external_hostname, external_id) set.
CREATE UNIQUE INDEX IF NOT EXISTS users_sso_lookup_unique_idx
  ON users (external_hostname, external_id)
  WHERE external_hostname IS NOT NULL;

-- 3. user_workspaces junction (N:M users <-> workspaces)
CREATE TABLE IF NOT EXISTS user_workspaces (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS user_workspaces_workspace_idx
  ON user_workspaces (workspace_id);

-- 4. Seed admin: julien@messagingme.fr
-- Password: Jaus650dl+ (bcrypt 10 rounds)
-- Admin role bypasses user_workspaces in app code and sees all workspaces.
INSERT INTO users (email, password_hash, role, auth_type)
VALUES (
  'julien@messagingme.fr',
  '$2b$10$R8aiOtBNDhQ8alJ70MDD2ODS/5IdusXUqfa6HG0B9Oc9fRLab2GyS',
  'admin',
  'local'
)
ON CONFLICT (email, external_hostname) DO NOTHING;

-- 5. Map MieuxAssure subdomain to its workspace (225831 has the real data)
UPDATE workspaces
SET hostname = 'mieuxassure.messagingme.app'
WHERE id = '225831' AND hostname IS NULL;
