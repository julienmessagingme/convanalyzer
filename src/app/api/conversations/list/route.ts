import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getTagsByFrequency } from "@/lib/supabase/queries";
import { searchConversations } from "@/lib/supabase/search";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import type { Conversation } from "@/types/database";

const PAGE_SIZE = 20;

/**
 * GET /api/conversations/list?workspace_id=X&tab=bot&page=1&...
 *
 * Returns paginated, filtered conversation list with tag map, resume map,
 * tab counts, and all tags. Consolidates all the server-side logic that was
 * previously in the conversations page.tsx server component.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromMiddlewareHeader();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isRestrictedSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id is required" },
      { status: 400 }
    );
  }

  const tab = sp.get("tab") === "agent" ? "agent" : "bot";
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const sentiment = sp.get("sentiment") || undefined;
  const urgency = sp.get("urgency") || undefined;
  const tagId = sp.get("tag") || undefined;
  const dateFrom = sp.get("date_from") || undefined;
  const dateTo = sp.get("date_to") || undefined;
  const escalated = sp.get("escalated") || undefined;
  const sentimentScoreRaw = sp.get("sentiment_score") || undefined;
  const urgencyScoreRaw = sp.get("urgency_score") || undefined;
  const q = sp.get("q")?.trim() || undefined;
  const modeRaw = sp.get("mode") || undefined;

  const INT_REGEX = /^-?\d+$/;
  const sentimentScore =
    sentimentScoreRaw && INT_REGEX.test(sentimentScoreRaw)
      ? parseInt(sentimentScoreRaw, 10)
      : undefined;
  const urgencyScore =
    urgencyScoreRaw && INT_REGEX.test(urgencyScoreRaw)
      ? parseInt(urgencyScoreRaw, 10)
      : undefined;
  const mode: "combined" | "text" | "semantic" =
    modeRaw === "text" || modeRaw === "semantic" ? modeRaw : "combined";

  const supabase = createServiceClient();

  // Parallel: tags + tab counts
  const [allTags, { count: botCount }, { count: agentCount }] =
    await Promise.all([
      getTagsByFrequency(workspaceId),
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

  // Keyword search
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
      console.error("[conversations/list] keyword search failed:", err);
      keywordConvIds = [];
    }
  }

  // Tag filter
  let tagConvIds: string[] | undefined;
  if (tagId === "untagged") {
    const [{ data: taggedConvRows }, { data: allConvs }] = await Promise.all([
      supabase
        .from("conversation_tags")
        .select("conversation_id, conversations!inner(workspace_id)")
        .eq("conversations.workspace_id", workspaceId),
      supabase
        .from("conversations")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("type", tab),
    ]);
    const taggedIds = new Set(
      (taggedConvRows ?? []).map((r) => r.conversation_id as string)
    );
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

  // Build paginated query
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("conversations")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .eq("type", tab)
    .order("failure_score", { ascending: false })
    .range(from, to);

  if (sentiment === "negative") query = query.lt("sentiment_score", 0);
  else if (sentiment === "neutral") query = query.eq("sentiment_score", 0);
  else if (sentiment === "positive") query = query.gt("sentiment_score", 0);

  if (urgency === "low") query = query.lt("urgency_score", 3);
  else if (urgency === "high") query = query.gte("urgency_score", 3);

  if (escalated === "yes") query = query.eq("escalated", true);
  else if (escalated === "no") query = query.eq("escalated", false);

  if (sentimentScore !== undefined)
    query = query.eq("sentiment_score", sentimentScore);
  if (urgencyScore !== undefined)
    query = query.eq("urgency_score", urgencyScore);
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);

  // Intersect tag + keyword filters
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

  // Build tag map + resume map in parallel
  const tagMap: Record<string, { id: string; label: string }[]> = {};
  const resumeMap: Record<string, string> = {};
  if (convList.length > 0) {
    const convIds = convList.map((c) => c.id);
    const [{ data: convTags }, { data: clientMessages }] = await Promise.all([
      supabase
        .from("conversation_tags")
        .select("conversation_id, tag_id")
        .in("conversation_id", convIds),
      supabase
        .from("messages")
        .select("conversation_id, content")
        .eq("workspace_id", workspaceId)
        .eq("sender_type", "client")
        .in("conversation_id", convIds)
        .order("sequence", { ascending: true }),
    ]);

    if (convTags && convTags.length > 0) {
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

    if (clientMessages) {
      for (const msg of clientMessages) {
        if (!resumeMap[msg.conversation_id]) {
          const content = msg.content || "";
          resumeMap[msg.conversation_id] =
            content.length > 200 ? content.slice(0, 200) : content;
        }
      }
    }
  }

  return NextResponse.json({
    conversations: convList,
    tagMap,
    resumeMap,
    botCount: botCount ?? 0,
    agentCount: agentCount ?? 0,
    totalPages,
    totalCount,
    allTags,
  });
}
