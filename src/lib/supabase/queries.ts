import { createServiceClient } from "./server";
import { fetchAllRows } from "./paginate";
import type { Tag, ConversationTag } from "@/types/database";

/**
 * Get aggregate metrics for a workspace within a date range.
 */
export async function getWorkspaceMetrics(
  workspaceId: string,
  dateFrom: string,
  dateTo: string
) {
  const supabase = createServiceClient();

  const [
    { count: totalConversations },
    { count: botConversations },
    { count: escalatedConversations },
    { count: agentConversations },
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", dateFrom)
      .lte("created_at", `${dateTo}T23:59:59`),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("type", "bot")
      .gte("created_at", dateFrom)
      .lte("created_at", `${dateTo}T23:59:59`),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("type", "bot")
      .eq("escalated", true)
      .gte("created_at", dateFrom)
      .lte("created_at", `${dateTo}T23:59:59`),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("type", "agent")
      .gte("created_at", dateFrom)
      .lte("created_at", `${dateTo}T23:59:59`),
  ]);

  const total = totalConversations ?? 0;
  const botTotal = botConversations ?? 0;
  const agentTotal = agentConversations ?? 0;
  const escalated = escalatedConversations ?? 0;
  const tauxTransfert = botTotal > 0 ? (escalated / botTotal) * 100 : 0;

  return {
    totalConversations: total,
    botConversations: botTotal,
    agentConversations: agentTotal,
    escalatedConversations: escalated,
    tauxTransfert,
  };
}

/**
 * Get all tags for a workspace ordered by conversation_count descending.
 */
export async function getTagsByFrequency(
  workspaceId: string
): Promise<Tag[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("conversation_count", { ascending: false });

  return (data as Tag[]) ?? [];
}

/**
 * Get tags for a specific conversation with joined tag data.
 */
export async function getConversationTags(
  conversationId: string
): Promise<(ConversationTag & { tag: Tag })[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("conversation_tags")
    .select("*, tag:tags(*)")
    .eq("conversation_id", conversationId);

  return (data as (ConversationTag & { tag: Tag })[]) ?? [];
}

/**
 * Get a single conversation with its messages.
 */
export async function getConversationWithMessages(
  workspaceId: string,
  conversationId: string
) {
  const supabase = createServiceClient();

  const [{ data: conversation }, { data: messages }] = await Promise.all([
    supabase
      .from("conversations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", conversationId)
      .single(),
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .eq("workspace_id", workspaceId)
      .order("sequence", { ascending: true }),
  ]);

  if (!conversation) return null;

  return {
    conversation,
    messages: messages ?? [],
  };
}

/**
 * Get conversations with sentiment_score for the scatter plot.
 * Returns the most recent 5000 conversations that have been sentiment-scored.
 */
export async function getConversationsForScatter(
  workspaceId: string
) {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("conversations")
    .select(
      "id, sentiment_score, urgency_score, message_count, failure_score, type, started_at, created_at"
    )
    .eq("workspace_id", workspaceId)
    .not("sentiment_score", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);

  const conversations = (data as {
    id: string;
    sentiment_score: number;
    urgency_score: number | null;
    message_count: number;
    failure_score: number;
    type: string;
    started_at: string | null;
    created_at: string;
  }[]) ?? [];

  if (conversations.length === 0) return [];

  // Fetch ALL conversation_tags for the workspace via inner join.
  // We cannot use .in("conversation_id", convIds) here because convIds can be
  // thousands of UUIDs, blowing past the PostgREST URL length limit.
  const convTags = await fetchAllRows<Record<string, unknown>>(
    supabase
      .from("conversation_tags")
      .select(
        "conversation_id, tag_id, tags(id, label), conversations!inner(workspace_id)"
      )
      .eq("conversations.workspace_id", workspaceId) as unknown as {
      range: (
        from: number,
        to: number
      ) => PromiseLike<{
        data: Record<string, unknown>[] | null;
        error: { message: string } | null;
      }>;
    }
  );

  // Build tag map per conversation
  const tagMap = new Map<string, { id: string; label: string }[]>();
  for (const ct of convTags) {
    const tag = ct.tags as { id: string; label: string } | null;
    const convId = ct.conversation_id as string;
    if (!tag || !convId) continue;
    const existing = tagMap.get(convId) || [];
    existing.push({ id: tag.id, label: tag.label });
    tagMap.set(convId, existing);
  }

  return conversations.map((c) => ({
    ...c,
    tags: tagMap.get(c.id) || [],
  }));
}

