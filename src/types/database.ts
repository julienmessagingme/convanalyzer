// TypeScript types matching supabase/migrations/001_init.sql

export type ConversationType = "bot" | "agent";
export type SenderType = "bot" | "agent" | "client";

export interface Workspace {
  id: string;
  name: string;
  uchat_api_key: string | null;
  channel: string;
  is_active: boolean;
  created_at: string;
}

export interface Agent {
  id: number;
  workspace_id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
  synced_at: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  external_id: string;
  client_id: string;
  type: ConversationType;
  agent_id: number | null;
  started_at: string | null;
  ended_at: string | null;
  message_count: number;
  escalated: boolean;
  failure_score: number;
  sentiment_score: number | null;
  urgency_score: number | null;
  raw_payload: unknown;
  scoring_status: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  workspace_id: string;
  sender_type: SenderType;
  agent_id: number | null;
  sent_at: string | null;
  content: string;
  msg_type: string;
  sequence: number;
  embedding: number[] | null;
  embedding_status: string;
  embedding_model: string | null;
  failure_signal: string | null;
  failure_score: number | null;
  failure_reason: string | null;
  created_at: string;
}

/** Canonical format used by parsers -- the normalized output before DB insert */
export interface NormalizedMessage {
  sender_type: SenderType;
  content: string;
  timestamp: string | null;
  sequence: number;
  msg_type: string;
  agent_id?: number;
}

export type TagAssigner = "ai" | "human";

export interface Tag {
  id: string;
  workspace_id: string;
  label: string;
  description: string | null;
  kind: string; // kept for DB compat, always 'human'
  conversation_count: number;
  created_at: string;
}

export interface SuggestedTag {
  id: string;
  workspace_id: string;
  label: string;
  description: string | null;
  source_conversation_count: number;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

export interface ConversationTag {
  conversation_id: string;
  tag_id: string;
  assigned_by: TagAssigner;
  confidence: number | null;
  created_at: string;
}

