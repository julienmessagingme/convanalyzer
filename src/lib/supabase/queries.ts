import { createServiceClient } from "./server";
import { fetchAllRows } from "./paginate";
import type { Tag, ConversationTag, KbSuggestion } from "@/types/database";

/**
 * Get aggregate metrics for a workspace within a date range.
 *
 * Uses the `get_dashboard_metrics` RPC (migration 014) which collapses
 * 4 COUNT(*) Promise.all queries into a single COUNT FILTER query.
 * Falls back to the 4-query version if the RPC is not yet deployed,
 * so a code rollout that lands before the migration does not break.
 */
export async function getWorkspaceMetrics(
  workspaceId: string,
  dateFrom: string,
  dateTo: string
) {
  const supabase = createServiceClient();
  const dateToEnd = `${dateTo}T23:59:59`;

  // Fast path: single RPC call.
  // Note: RETURNS TABLE always yields an array via PostgREST, so we unwrap
  // data[0] manually instead of using .single() (matches the existing
  // get_visitor_stats call pattern in src/app/api/visiteurs/list/route.ts).
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_dashboard_metrics",
    {
      p_workspace_id: workspaceId,
      p_date_from: dateFrom,
      p_date_to: dateToEnd,
    }
  );

  const row = Array.isArray(rpcData) ? rpcData[0] : null;
  if (!rpcError && row) {
    const total = Number(row.total_conversations) || 0;
    const botTotal = Number(row.bot_conversations) || 0;
    const agentTotal = Number(row.agent_conversations) || 0;
    const escalated = Number(row.escalated_conversations) || 0;
    const tauxTransfert = botTotal > 0 ? (escalated / botTotal) * 100 : 0;
    return {
      totalConversations: total,
      botConversations: botTotal,
      agentConversations: agentTotal,
      escalatedConversations: escalated,
      tauxTransfert,
    };
  }

  // Fallback: legacy 4-query version. Used only if the RPC is missing
  // (e.g. migration 014 not applied yet). Logged so we notice.
  console.warn(
    "[getWorkspaceMetrics] RPC get_dashboard_metrics failed, falling back to 4x COUNT:",
    rpcError?.message ?? "no row returned"
  );

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
      .lte("created_at", dateToEnd),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("type", "bot")
      .gte("created_at", dateFrom)
      .lte("created_at", dateToEnd),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("type", "bot")
      .eq("escalated", true)
      .gte("created_at", dateFrom)
      .lte("created_at", dateToEnd),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("type", "agent")
      .gte("created_at", dateFrom)
      .lte("created_at", dateToEnd),
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
 * Get KB suggestions for a workspace, ordered by impact_score and frequency.
 */
export async function getKbSuggestions(
  workspaceId: string
): Promise<KbSuggestion[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("kb_suggestions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("impact_score", { ascending: false })
    .order("frequency", { ascending: false });

  return (data as KbSuggestion[]) ?? [];
}

/**
 * Get ALL conversations with sentiment_score for the scatter plot.
 * Uses fetchAllRows to bypass PostgREST 1000-row default limit.
 */
export async function getConversationsForScatter(
  workspaceId: string
) {
  const supabase = createServiceClient();

  const conversations = await fetchAllRows<{
    id: string;
    sentiment_score: number;
    urgency_score: number | null;
    message_count: number;
    failure_score: number;
    type: string;
    started_at: string | null;
    created_at: string;
  }>(
    supabase
      .from("conversations")
      .select(
        "id, sentiment_score, urgency_score, message_count, failure_score, type, started_at, created_at"
      )
      .eq("workspace_id", workspaceId)
      .not("sentiment_score", "is", null)
      .order("created_at", { ascending: false })
  );

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

