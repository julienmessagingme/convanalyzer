-- Suggested tags proposed by AI for user review
create table suggested_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references workspaces(id),
  label text not null,
  description text,
  source_conversation_count int default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz default now()
);
create index idx_suggested_tags_workspace on suggested_tags(workspace_id, status);
