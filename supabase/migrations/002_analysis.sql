-- Phase 2: Analysis infrastructure migration
-- Run this in the Supabase SQL Editor after Phase 1 migration is applied.

-- 1. HNSW vector index on messages.embedding for cosine similarity
-- Replaces the deferred IVFFlat index from Phase 1 (HNSW works on empty tables)
create index if not exists idx_messages_embedding_hnsw
  on messages using hnsw (embedding vector_cosine_ops);

-- 2. Add prompt_version column to messages (tracks which LLM prompt version scored it)
alter table messages add column if not exists prompt_version text;

-- 3. Processing queue partial indexes for efficient pending-item lookups
create index if not exists idx_conversations_scoring_status
  on conversations(scoring_status)
  where scoring_status = 'pending';

create index if not exists idx_messages_embedding_status
  on messages(embedding_status)
  where embedding_status = 'pending';

-- 4. RPC function for cosine similarity queries
-- Used by rule scorer for client_repetition detection
create or replace function match_similar_messages(
  query_embedding vector(1536),
  match_threshold float default 0.85,
  match_count int default 5,
  filter_workspace_id text default null
)
returns table (
  id uuid,
  conversation_id uuid,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
    select
      m.id,
      m.conversation_id,
      m.content,
      (1 - (m.embedding <=> query_embedding))::float as similarity
    from messages m
    where m.embedding is not null
      and m.embedding_status = 'done'
      and (filter_workspace_id is null or m.workspace_id = filter_workspace_id)
      and (1 - (m.embedding <=> query_embedding)) >= match_threshold
    order by m.embedding <=> query_embedding
    limit match_count;
end;
$$;
