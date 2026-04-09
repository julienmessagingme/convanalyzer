import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { FilterBar } from "@/components/conversations/filter-bar";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ConversationTabs } from "@/components/conversations/conversation-tabs";
import { Pagination } from "@/components/conversations/pagination";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import { searchConversations } from "@/lib/supabase/search";
import type { Conversation, Tag } from "@/types/database";
import type { CsvConversationRow } from "@/lib/export/csv";

const INT_REGEX = /^-?\d+$/;

const PAGE_SIZE = 20;

interface ConversationsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConversationsPage({
  params,
  searchParams,
}: ConversationsPageProps) {
  const { workspaceId } = await params;
  const filters = await searchParams;

  const page = Math.max(1, parseInt(String(filters.page ?? "1"), 10) || 1);
  const tab =
    typeof filters.tab === "string" && filters.tab === "agent"
      ? "agent"
      : "bot";
  const sentiment =
    typeof filters.sentiment === "string" ? filters.sentiment : undefined;
  const urgency =
    typeof filters.urgency === "string" ? filters.urgency : undefined;
  const tagId =
    typeof filters.tag === "string" ? filters.tag : undefined;
  const dateFrom =
    typeof filters.date_from === "string" ? filters.date_from : undefined;
  const dateTo =
    typeof filters.date_to === "string" ? filters.date_to : undefined;
  const escalated =
    typeof filters.escalated === "string" ? filters.escalated : undefined;

  // Exact-score filters from matrix click-through
  const sentimentScoreRaw =
    typeof filters.sentiment_score === "string"
      ? filters.sentiment_score
      : undefined;
  const urgencyScoreRaw =
    typeof filters.urgency_score === "string"
      ? filters.urgency_score
      : undefined;
  const sentimentScore =
    sentimentScoreRaw && INT_REGEX.test(sentimentScoreRaw)
      ? parseInt(sentimentScoreRaw, 10)
      : undefined;
  const urgencyScore =
    urgencyScoreRaw && INT_REGEX.test(urgencyScoreRaw)
      ? parseInt(urgencyScoreRaw, 10)
      : undefined;

  // Keyword search
  const q =
    typeof filters.q === "string" && filters.q.trim().length > 0
      ? filters.q.trim()
      : undefined;
  const modeRaw = typeof filters.mode === "string" ? filters.mode : undefined;
  const mode: "combined" | "text" | "semantic" =
    modeRaw === "text" || modeRaw === "semantic" ? modeRaw : "combined";

  const supabase = createServiceClient();

  // Fetch tags for filter dropdown
  const { data: tagsData } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("conversation_count", { ascending: false });

  const allTags = (tagsData as Tag[]) ?? [];

  // Get counts for both tabs
  const [{ count: botCount }, { count: agentCount }] = await Promise.all([
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("type", "bot"),
    supabase
      .from("conversations")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("type", "agent"),
  ]);

  // Keyword search: collect matching conversation IDs (intersected with tag filter later)
  let keywordConvIds: string[] | undefined;
  if (q) {
    try {
      const searchResult = await searchConversations(workspaceId, q, mode);
      const ids: string[] = [];
      for (const m of searchResult.groups.bot.conversations) {
        ids.push(m.conversation.id);
      }
      for (const m of searchResult.groups.agent.conversations) {
        ids.push(m.conversation.id);
      }
      keywordConvIds = ids;
    } catch (err) {
      console.error("[conversations page] keyword search failed:", err);
      keywordConvIds = [];
    }
  }

  // If tag filter is set, find conversation IDs with that tag
  // Special case: "untagged" means conversations with NO tags at all
  let tagConvIds: string[] | undefined;
  if (tagId === "untagged") {
    // Find all conversations that have at least one tag
    const { data: taggedConvRows } = await supabase
      .from("conversation_tags")
      .select("conversation_id");

    const taggedIds = new Set(
      (taggedConvRows ?? []).map((r) => r.conversation_id as string)
    );

    // Get all conversation IDs for this workspace
    const { data: allConvs } = await supabase
      .from("conversations")
      .select("id")
      .eq("workspace_id", workspaceId);

    const untaggedIds = (allConvs ?? [])
      .map((c) => c.id as string)
      .filter((id) => !taggedIds.has(id));

    tagConvIds = untaggedIds.length > 0 ? untaggedIds : [];
  } else if (tagId) {
    const { data: convTags } = await supabase
      .from("conversation_tags")
      .select("conversation_id")
      .eq("tag_id", tagId);

    if (convTags && convTags.length > 0) {
      tagConvIds = convTags.map((ct) => ct.conversation_id);
    } else {
      tagConvIds = [];
    }
  }

  // Build conversations query — filtered by active tab type
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("conversations")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("type", tab)
    .order("failure_score", { ascending: false })
    .range(from, to);

  // Sentiment filter
  if (sentiment === "negative") {
    query = query.lt("sentiment_score", 0);
  } else if (sentiment === "neutral") {
    query = query.eq("sentiment_score", 0);
  } else if (sentiment === "positive") {
    query = query.gt("sentiment_score", 0);
  }
  // Urgency filter
  if (urgency === "low") {
    query = query.lt("urgency_score", 3);
  } else if (urgency === "high") {
    query = query.gte("urgency_score", 3);
  }
  // Escalated filter (bot tab only)
  if (escalated === "yes") {
    query = query.eq("escalated", true);
  } else if (escalated === "no") {
    query = query.eq("escalated", false);
  }
  // Exact-score filters (from matrix click)
  if (sentimentScore !== undefined) {
    query = query.eq("sentiment_score", sentimentScore);
  }
  if (urgencyScore !== undefined) {
    query = query.eq("urgency_score", urgencyScore);
  }
  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }
  if (dateTo) {
    query = query.lte("created_at", `${dateTo}T23:59:59`);
  }

  // Intersect tag and keyword ID filters
  let idFilter: string[] | undefined;
  if (tagConvIds !== undefined && keywordConvIds !== undefined) {
    const keywordSet = new Set(keywordConvIds);
    idFilter = tagConvIds.filter((id) => keywordSet.has(id));
  } else if (tagConvIds !== undefined) {
    idFilter = tagConvIds;
  } else if (keywordConvIds !== undefined) {
    idFilter = keywordConvIds;
  }
  if (idFilter !== undefined) {
    if (idFilter.length === 0) {
      query = query.in("id", ["__no_match__"]);
    } else {
      query = query.in("id", idFilter);
    }
  }

  const { data: conversations, count } = await query;
  const convList = (conversations as Conversation[]) ?? [];
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Build tag map for displayed conversations
  const tagMap: Record<string, { id: string; label: string }[]> = {};
  if (convList.length > 0) {
    const convIds = convList.map((c) => c.id);

    const { data: convTags } = await supabase
      .from("conversation_tags")
      .select("conversation_id, tag_id")
      .in("conversation_id", convIds);

    if (convTags && convTags.length > 0) {
      // Build tag label lookup
      const tagLookup = new Map<string, { id: string; label: string }>();
      for (const t of allTags) {
        tagLookup.set(t.id, { id: t.id, label: t.label });
      }

      for (const ct of convTags) {
        const tagInfo = tagLookup.get(ct.tag_id);
        if (tagInfo) {
          if (!tagMap[ct.conversation_id]) {
            tagMap[ct.conversation_id] = [];
          }
          tagMap[ct.conversation_id].push(tagInfo);
        }
      }
    }
  }

  // Build resume map: conversation ID -> first client message content (truncated 200 chars)
  const resumeMap: Record<string, string> = {};
  if (convList.length > 0) {
    const convIds = convList.map((c) => c.id);
    const { data: clientMessages } = await supabase
      .from("messages")
      .select("conversation_id, content")
      .eq("workspace_id", workspaceId)
      .eq("sender_type", "client")
      .in("conversation_id", convIds)
      .order("sequence", { ascending: true });

    if (clientMessages) {
      for (const msg of clientMessages) {
        if (!resumeMap[msg.conversation_id]) {
          const content = msg.content || "";
          resumeMap[msg.conversation_id] = content.length > 200
            ? content.slice(0, 200)
            : content;
        }
      }
    }
  }

  // Build CSV export data - use first tag label as topic for CSV
  const csvData: CsvConversationRow[] = convList.map((c) => ({
    created_at: c.created_at,
    topic: tagMap[c.id]?.map((t) => t.label).join(", ") ?? "",
    failure_score: c.failure_score,
    resume: resumeMap[c.id] ?? "",
  }));

  // Build current filters for FilterBar (exclude type since tabs handle it)
  const currentFilters: Record<string, string> = {};
  for (const key of [
    "date_from",
    "date_to",
    "sentiment",
    "urgency",
    "escalated",
    "tag",
    "sentiment_score",
    "urgency_score",
    "q",
    "mode",
  ]) {
    const val = filters[key];
    if (typeof val === "string") {
      currentFilters[key] = val;
    }
  }

  // Build "clear matrix filter" URL preserving everything else
  const matrixFilterActive =
    sentimentScore !== undefined || urgencyScore !== undefined;
  let clearMatrixHref = "";
  if (matrixFilterActive) {
    const cleared = new URLSearchParams();
    for (const [k, v] of Object.entries(currentFilters)) {
      if (k === "sentiment_score" || k === "urgency_score") continue;
      cleared.set(k, v);
    }
    if (tab !== "bot") cleared.set("tab", tab);
    const qs = cleared.toString();
    clearMatrixHref = qs ? `?${qs}` : "";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
        <ExportCsvButton conversations={csvData} />
      </div>

      <ConversationTabs
        activeTab={tab}
        botCount={botCount ?? 0}
        agentCount={agentCount ?? 0}
      />

      <FilterBar tags={allTags} currentFilters={currentFilters} activeTab={tab} />

      {matrixFilterActive && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <div className="text-sm text-blue-900">
            <span className="font-semibold">Filtre matrice actif :</span>{" "}
            {urgencyScore !== undefined && (
              <span>Urgence = {urgencyScore}</span>
            )}
            {urgencyScore !== undefined && sentimentScore !== undefined && (
              <span> · </span>
            )}
            {sentimentScore !== undefined && (
              <span>
                Sentiment ={" "}
                {sentimentScore > 0 ? `+${sentimentScore}` : sentimentScore}
              </span>
            )}
          </div>
          <Link
            href={clearMatrixHref || "?"}
            className="text-sm text-blue-700 hover:text-blue-900 font-medium"
          >
            Effacer
          </Link>
        </div>
      )}

      <ConversationList
        conversations={convList}
        tagMap={tagMap}
        workspaceId={workspaceId}
        availableTags={allTags}
      />

      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  );
}
