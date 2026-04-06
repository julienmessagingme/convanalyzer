import { createServiceClient } from "./server";
import { startOfWeek, format } from "date-fns";
import type { Tag, ConversationTag, KbSuggestion } from "@/types/database";

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
 * Get trend data grouped by time granularity.
 */
export async function getTrendData(
  workspaceId: string,
  dateFrom: string,
  dateTo: string,
  granularity: "day" | "week" | "month"
) {
  const supabase = createServiceClient();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("created_at, failure_score, type")
    .eq("workspace_id", workspaceId)
    .gte("created_at", dateFrom)
    .lte("created_at", `${dateTo}T23:59:59`)
    .order("created_at", { ascending: true });

  if (!conversations || conversations.length === 0) return [];

  const groups = new Map<
    string,
    { conversations: number; failures: number }
  >();

  for (const conv of conversations) {
    const date = new Date(conv.created_at);
    let key: string;

    switch (granularity) {
      case "day":
        key = format(date, "yyyy-MM-dd");
        break;
      case "week":
        key = format(startOfWeek(date, { weekStartsOn: 1 }), "yyyy-MM-dd");
        break;
      case "month":
        key = format(date, "yyyy-MM");
        break;
    }

    const group = groups.get(key) ?? { conversations: 0, failures: 0 };
    group.conversations++;
    if (conv.failure_score > 5) {
      group.failures++;
    }
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([date, data]) => ({
    date,
    conversations: data.conversations,
    failures: data.failures,
    tauxEchec:
      data.conversations > 0
        ? (data.failures / data.conversations) * 100
        : 0,
  }));
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

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", conversationId)
    .single();

  if (!conversation) return null;

  const { data: messages } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("workspace_id", workspaceId)
    .order("sequence", { ascending: true });

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
 * Get conversations with sentiment_score for the scatter plot.
 * Returns the most recent conversations that have been sentiment-scored.
 */
export async function getConversationsForScatter(
  workspaceId: string,
  limit = 200
) {
  const supabase = createServiceClient();

  const { data: conversations } = await supabase
    .from("conversations")
    .select(
      "id, sentiment_score, urgency_score, message_count, failure_score, type, started_at, created_at"
    )
    .eq("workspace_id", workspaceId)
    .not("sentiment_score", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!conversations || conversations.length === 0) return [];

  // Fetch tags for these conversations
  const convIds = conversations.map((c) => c.id);
  const { data: convTags } = await supabase
    .from("conversation_tags")
    .select("conversation_id, tag_id, tags(id, label)")
    .in("conversation_id", convIds);

  // Build tag map per conversation
  const tagMap = new Map<string, { id: string; label: string }[]>();
  if (convTags) {
    for (const ct of convTags) {
      const tag = ct.tags as unknown as { id: string; label: string } | null;
      if (!tag) continue;
      const existing = tagMap.get(ct.conversation_id) || [];
      existing.push({ id: tag.id, label: tag.label });
      tagMap.set(ct.conversation_id, existing);
    }
  }

  return conversations.map((c) => ({
    ...c,
    tags: tagMap.get(c.id) || [],
  }));
}

/**
 * Get average sentiment/urgency per tag for the tag matrix.
 */
export async function getTagMatrixData(workspaceId: string) {
  const supabase = createServiceClient();

  // Get all tags for this workspace
  const { data: tags } = await supabase
    .from("tags")
    .select("id, label")
    .eq("workspace_id", workspaceId);

  if (!tags || tags.length === 0) return [];

  // Get all conversation_tags with conversation scores
  const { data: ctJoin } = await supabase
    .from("conversation_tags")
    .select("tag_id, conversations(sentiment_score, urgency_score)")
    .in(
      "tag_id",
      tags.map((t) => t.id)
    );

  // Compute averages per tag
  const tagStats = new Map<
    string,
    { sentSum: number; urgSum: number; count: number }
  >();

  if (ctJoin) {
    for (const ct of ctJoin) {
      const conv = ct.conversations as unknown as {
        sentiment_score: number | null;
        urgency_score: number | null;
      } | null;
      if (!conv || conv.sentiment_score === null) continue;

      const prev = tagStats.get(ct.tag_id) || {
        sentSum: 0,
        urgSum: 0,
        count: 0,
      };
      prev.sentSum += conv.sentiment_score ?? 0;
      prev.urgSum += conv.urgency_score ?? 0;
      prev.count++;
      tagStats.set(ct.tag_id, prev);
    }
  }

  return tags.map((tag) => {
    const stats = tagStats.get(tag.id);
    return {
      id: tag.id,
      label: tag.label,
      avgSentiment: stats && stats.count > 0 ? stats.sentSum / stats.count : 0,
      avgUrgency: stats && stats.count > 0 ? stats.urgSum / stats.count : 0,
      conversationCount: stats?.count ?? 0,
    };
  });
}
