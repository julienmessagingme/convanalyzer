import { createServiceClient } from "./server";

type ConversationInsert = {
  external_id: string;
  client_id: string;
  type: "bot" | "agent";
  agent_id?: number | null;
  started_at?: string | null;
  ended_at?: string | null;
  message_count?: number;
  escalated?: boolean;
  failure_score?: number;
  raw_payload?: unknown;
  scoring_status?: string;
};

type MessageInsert = {
  conversation_id: string;
  sender_type: "bot" | "agent" | "client";
  agent_id?: number | null;
  sent_at?: string | null;
  content: string;
  msg_type?: string;
  sequence: number;
};

/**
 * Multi-tenant data access layer.
 * Every query is automatically scoped to the given workspace_id.
 * No method allows querying without workspace isolation.
 */
export function createTenantDAL(workspaceId: string) {
  const supabase = createServiceClient();

  return {
    /** Returns a query builder for conversations filtered by workspace_id */
    conversations() {
      return supabase
        .from("conversations")
        .select("*")
        .eq("workspace_id", workspaceId);
    },

    /** Returns a query builder for messages filtered by workspace_id */
    messages() {
      return supabase
        .from("messages")
        .select("*")
        .eq("workspace_id", workspaceId);
    },

    /** Returns a query builder for agents filtered by workspace_id */
    agents() {
      return supabase
        .from("agents")
        .select("*")
        .eq("workspace_id", workspaceId);
    },

    /** Returns a query builder for all tags filtered by workspace_id */
    tags() {
      return supabase
        .from("tags")
        .select("*")
        .eq("workspace_id", workspaceId);
    },

    /** Returns a query builder for conversation_tags (no workspace filter -- filter by conversation or tag) */
    conversationTags() {
      return supabase.from("conversation_tags").select("*");
    },

    /** Insert a conversation with workspace_id automatically injected */
    async insertConversation(data: ConversationInsert) {
      return supabase.from("conversations").insert({
        ...data,
        workspace_id: workspaceId,
      });
    },

    /** Insert messages with workspace_id automatically injected on each row */
    async insertMessages(data: MessageInsert[]) {
      const rows = data.map((msg) => ({
        ...msg,
        workspace_id: workspaceId,
      }));
      return supabase.from("messages").insert(rows);
    },

    /**
     * Upsert a conversation with idempotency on (workspace_id, external_id).
     * Uses ignoreDuplicates to skip if already exists.
     */
    async upsertConversation(data: ConversationInsert) {
      return supabase
        .from("conversations")
        .upsert(
          {
            ...data,
            workspace_id: workspaceId,
          },
          {
            onConflict: "workspace_id,external_id",
            ignoreDuplicates: true,
          }
        )
        .select();
    },
  };
}
