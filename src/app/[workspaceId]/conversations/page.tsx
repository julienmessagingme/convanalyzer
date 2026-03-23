import { createServiceClient } from "@/lib/supabase/server";
import { FilterBar } from "@/components/conversations/filter-bar";
import { ConversationList } from "@/components/conversations/conversation-list";
import { ConversationTabs } from "@/components/conversations/conversation-tabs";
import { Pagination } from "@/components/conversations/pagination";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import type { Conversation, Tag } from "@/types/database";
import type { CsvConversationRow } from "@/lib/export/csv";

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

  const supabase = createServiceClient();

  // Fetch tags for filter dropdown
  const { data: tagsData } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("conversation_count", { ascending: false });

  const allTags = (tagsData as Tag[]) ?? [];

  // Get counts for both tabs
  const { count: botCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("type", "bot");

  const { count: agentCount } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("type", "agent");

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
  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }
  if (dateTo) {
    query = query.lte("created_at", `${dateTo}T23:59:59`);
  }
  if (tagConvIds !== undefined) {
    if (tagConvIds.length === 0) {
      query = query.in("id", ["__no_match__"]);
    } else {
      query = query.in("id", tagConvIds);
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
  ]) {
    const val = filters[key];
    if (typeof val === "string") {
      currentFilters[key] = val;
    }
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
