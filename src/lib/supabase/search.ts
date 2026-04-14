import { createServiceClient } from "./server";
import { getOpenAIClient } from "@/lib/openai/client";
import type { Conversation } from "@/types/database";

export interface ConversationWithMatch {
  conversation: Conversation;
  matchType: "text" | "semantic" | "both";
  similarity: number | null;
  matchedSnippet: string;
  tags: { id: string; label: string }[];
}

export interface SearchGroup {
  count: number;
  avgSentiment: number | null;
  avgUrgency: number | null;
  conversations: ConversationWithMatch[];
}

export interface SearchResult {
  query: string;
  groups: { bot: SearchGroup; agent: SearchGroup };
  totalCount: number;
}

/**
 * Text search: exact word match on client messages content.
 * Uses PostgreSQL word-boundary regex (\m...\M) for exact word matching
 * so that searching "con" does NOT match "contrat".
 */
async function searchConversationsByText(
  workspaceId: string,
  query: string
): Promise<Map<string, string>> {
  const supabase = createServiceClient();
  // Escape regex special chars so user input is treated as literal text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // \m = word start, \M = word end (PostgreSQL regex word boundaries)
  const pattern = `\\m${escaped}\\M`;

  const { data } = await supabase
    .from("messages")
    .select("conversation_id, content")
    .eq("workspace_id", workspaceId)
    .eq("sender_type", "client")
    .filter("content", "~*", pattern)
    .limit(200);

  const results = new Map<string, string>();
  if (data) {
    for (const msg of data) {
      if (!results.has(msg.conversation_id)) {
        const content = msg.content || "";
        results.set(
          msg.conversation_id,
          content.length > 150 ? content.slice(0, 150) + "..." : content
        );
      }
    }
  }
  return results;
}

/**
 * Semantic search: embed query then call match_similar_messages RPC.
 * Returns a Map of conversation_id -> { snippet, similarity }.
 */
async function searchConversationsBySemantic(
  workspaceId: string,
  query: string
): Promise<Map<string, { snippet: string; similarity: number }>> {
  const results = new Map<string, { snippet: string; similarity: number }>();

  try {
    const openai = getOpenAIClient();

    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
    });

    const queryEmbedding = embeddingRes.data[0].embedding;

    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("match_similar_messages", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: 0.7,
      match_count: 50,
      filter_workspace_id: workspaceId,
    });

    if (data && !error) {
      for (const row of data) {
        const existing = results.get(row.conversation_id);
        // Keep the highest similarity match per conversation
        if (!existing || row.similarity > existing.similarity) {
          const content = row.content || "";
          results.set(row.conversation_id, {
            snippet:
              content.length > 150 ? content.slice(0, 150) + "..." : content,
            similarity: row.similarity,
          });
        }
      }
    }
  } catch (err) {
    console.error(
      "[search] Semantic search failed, falling back to text only:",
      err instanceof Error ? err.message : err
    );
  }

  return results;
}

/**
 * Orchestrator: runs text + semantic search based on mode,
 * merges results, fetches conversation metadata, groups by type.
 */
export async function searchConversations(
  workspaceId: string,
  query: string,
  mode: "combined" | "text" | "semantic" = "combined"
): Promise<SearchResult> {
  // Run searches based on mode
  let textResults = new Map<string, string>();
  let semanticResults = new Map<string, { snippet: string; similarity: number }>();

  if (mode === "combined") {
    [textResults, semanticResults] = await Promise.all([
      searchConversationsByText(workspaceId, query),
      searchConversationsBySemantic(workspaceId, query),
    ]);
  } else if (mode === "text") {
    textResults = await searchConversationsByText(workspaceId, query);
  } else {
    semanticResults = await searchConversationsBySemantic(workspaceId, query);
  }

  // Merge conversation IDs
  const allConvIds = new Set<string>();
  Array.from(textResults.keys()).forEach((id) => allConvIds.add(id));
  Array.from(semanticResults.keys()).forEach((id) => allConvIds.add(id));

  if (allConvIds.size === 0) {
    const emptyGroup: SearchGroup = {
      count: 0,
      avgSentiment: null,
      avgUrgency: null,
      conversations: [],
    };
    return {
      query,
      groups: { bot: { ...emptyGroup }, agent: { ...emptyGroup } },
      totalCount: 0,
    };
  }

  const convIds = Array.from(allConvIds);
  const supabase = createServiceClient();

  // Fetch conversations
  const { data: conversations } = await supabase
    .from("conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("id", convIds)
    .order("created_at", { ascending: false });

  const convList = (conversations as Conversation[]) ?? [];

  // Fetch tags for these conversations
  const { data: convTags } = await supabase
    .from("conversation_tags")
    .select("conversation_id, tag_id")
    .in("conversation_id", convIds);

  // Fetch tag labels
  const tagIds = Array.from(
    new Set((convTags ?? []).map((ct) => ct.tag_id as string))
  );
  const tagLookup = new Map<string, { id: string; label: string }>();
  if (tagIds.length > 0) {
    const { data: tags } = await supabase
      .from("tags")
      .select("id, label")
      .in("id", tagIds);
    if (tags) {
      for (const t of tags) {
        tagLookup.set(t.id, { id: t.id, label: t.label });
      }
    }
  }

  // Build tag map per conversation
  const tagMap = new Map<string, { id: string; label: string }[]>();
  if (convTags) {
    for (const ct of convTags) {
      const tagInfo = tagLookup.get(ct.tag_id);
      if (tagInfo) {
        const existing = tagMap.get(ct.conversation_id) ?? [];
        existing.push(tagInfo);
        tagMap.set(ct.conversation_id, existing);
      }
    }
  }

  // Build ConversationWithMatch entries
  const matches: ConversationWithMatch[] = convList.map((conv) => {
    const inText = textResults.has(conv.id);
    const inSemantic = semanticResults.has(conv.id);
    const matchType: "text" | "semantic" | "both" =
      inText && inSemantic ? "both" : inText ? "text" : "semantic";

    const snippet =
      textResults.get(conv.id) ??
      semanticResults.get(conv.id)?.snippet ??
      "";
    const similarity = semanticResults.get(conv.id)?.similarity ?? null;

    return {
      conversation: conv,
      matchType,
      similarity,
      matchedSnippet: snippet,
      tags: tagMap.get(conv.id) ?? [],
    };
  });

  // Group by type
  const botMatches = matches.filter((m) => m.conversation.type === "bot");
  const agentMatches = matches.filter((m) => m.conversation.type === "agent");

  function buildGroup(items: ConversationWithMatch[]): SearchGroup {
    if (items.length === 0) {
      return { count: 0, avgSentiment: null, avgUrgency: null, conversations: items };
    }

    const sentiments = items
      .map((m) => m.conversation.sentiment_score)
      .filter((s): s is number => s !== null);
    const urgencies = items
      .map((m) => m.conversation.urgency_score)
      .filter((u): u is number => u !== null);

    return {
      count: items.length,
      avgSentiment:
        sentiments.length > 0
          ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
          : null,
      avgUrgency:
        urgencies.length > 0
          ? urgencies.reduce((a, b) => a + b, 0) / urgencies.length
          : null,
      conversations: items,
    };
  }

  return {
    query,
    groups: {
      bot: buildGroup(botMatches),
      agent: buildGroup(agentMatches),
    },
    totalCount: matches.length,
  };
}
