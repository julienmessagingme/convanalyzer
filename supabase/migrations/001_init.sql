-- Extension vectorielle (a activer aussi dans le dashboard Supabase)
create extension if not exists vector;

-- Workspaces (un par client MessagingMe)
create table workspaces (
  id text primary key,                    -- ex: "mieuxassure"
  name text not null,                     -- ex: "MieuxAssure"
  uchat_api_key text,                     -- cle API UChat du workspace
  channel text default 'whatsapp',
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Agents (synchronises via GET /team-members)
create table agents (
  id int not null,
  workspace_id text references workspaces(id),
  name text,
  email text,
  role text,
  avatar_url text,
  synced_at timestamptz default now(),
  primary key (id, workspace_id)
);

-- Conversations
create table conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id text references workspaces(id),
  external_id text,                       -- ID unique cote MessagingMe
  client_id text,                         -- identifiant du contact
  type text check (type in ('bot', 'agent')),
  agent_id int,                           -- si type = 'agent'
  started_at timestamptz,
  ended_at timestamptz,
  message_count int,
  escalated boolean default false,        -- bot -> agent detecte
  failure_score int default 0,            -- 0-10, calcule en batch
  raw_payload jsonb,                      -- payload JSON brut avant parsing
  scoring_status text default 'pending',  -- file d'attente scoring Phase 2
  created_at timestamptz default now(),
  unique(workspace_id, external_id)
);

-- Messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id),
  workspace_id text references workspaces(id), -- denormalise pour perf requetes
  sender_type text check (sender_type in ('bot', 'agent', 'client')),
  agent_id int,
  sent_at timestamptz,
  content text,
  msg_type text default 'text',
  sequence int not null,                  -- ordre du message dans la conversation
  embedding vector(1536),                 -- OpenAI, uniquement sur sender_type='client'
  embedding_status text default 'pending', -- file d'attente embedding Phase 2
  embedding_model text,                   -- nom du modele d'embedding utilise
  failure_signal text,                    -- null | 'off_topic' | 'uncertainty' | 'repetition' | 'no_answer'
  failure_score int,                      -- 0-10, uniquement sur messages bot
  failure_reason text,                    -- explication LLM en francais
  created_at timestamptz default now()
);

-- Topics detectes par clustering semantique
create table topics (
  id uuid primary key default gen_random_uuid(),
  workspace_id text references workspaces(id),
  label text,
  description text,
  message_count int default 0,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz default now()
);

-- Liaison message <-> topic (many-to-many)
create table message_topics (
  message_id uuid references messages(id),
  topic_id uuid references topics(id),
  score float,
  primary key (message_id, topic_id)
);

-- Suggestions d'amelioration de la base de connaissance IA
create table kb_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id text references workspaces(id),
  question text,
  suggested_answer text,
  source_conversation_ids uuid[],
  frequency int default 1,               -- nb de fois detectee
  impact_score int default 0,            -- 0-10, priorite
  status text default 'pending',         -- 'pending' | 'approved' | 'rejected'
  created_at timestamptz default now()
);

-- B-tree indexes pour performance requetes
create index idx_conversations_workspace on conversations(workspace_id);
create index idx_conversations_workspace_created on conversations(workspace_id, created_at);
create index idx_messages_conversation on messages(conversation_id);
create index idx_messages_workspace on messages(workspace_id);
create index idx_agents_workspace on agents(workspace_id);

-- TODO Phase 2: CREATE INDEX after embeddings are populated. IVFFlat on empty table produces bad results.
-- create index idx_messages_embedding on messages using ivfflat (embedding vector_cosine_ops)
--   with (lists = 100);

-- Seed data: workspace MieuxAssure
insert into workspaces (id, name, channel) values ('mieuxassure', 'MieuxAssure', 'whatsapp');
