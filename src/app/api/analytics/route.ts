import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";

/**
 * GET /api/analytics?workspace_id=X&tag_ids=id1,id2&date_from=2026-01-01&date_to=2026-03-23&show_sentiment=1&show_urgency=1
 *
 * Returns daily histogram data:
 * - count of conversations per day matching ALL selected tags (AND condition)
 * - optionally: avg sentiment and avg urgency per day
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const tagIdsRaw = sp.get("tag_ids");
  const dateFrom = sp.get("date_from");
  const dateTo = sp.get("date_to");
  const showSentiment = sp.get("show_sentiment") === "1";
  const showUrgency = sp.get("show_urgency") === "1";

  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const tagIds = tagIdsRaw ? tagIdsRaw.split(",").filter(Boolean) : [];

  // Step 1: Find conversation IDs matching ALL selected tags (AND)
  let conversationIds: string[] | null = null; // null = no tag filter

  if (tagIds.length > 0) {
    // For each tag, get the set of conversation_ids, then intersect
    const sets: Set<string>[] = [];
    for (const tagId of tagIds) {
      const rows = await fetchAllRows<{ conversation_id: string }>(
        supabase
          .from("conversation_tags")
          .select("conversation_id")
          .eq("tag_id", tagId)
      );
      const ids = rows.map((r) => r.conversation_id);
      sets.push(new Set(ids));
    }
    // Intersect all sets
    if (sets.length > 0) {
      let intersection = sets[0];
      for (let i = 1; i < sets.length; i++) {
        intersection = new Set(Array.from(intersection).filter((id) => sets[i].has(id)));
      }
      conversationIds = Array.from(intersection);
    }
    if (conversationIds && conversationIds.length === 0) {
      return NextResponse.json({ data: [] });
    }
  }

  // Step 2: Query conversations with date filter
  let query = supabase
    .from("conversations")
    .select("id, created_at, sentiment_score, urgency_score")
    .eq("workspace_id", workspaceId);

  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }
  if (dateTo) {
    query = query.lte("created_at", `${dateTo}T23:59:59`);
  }
  if (conversationIds) {
    query = query.in("id", conversationIds);
  }

  // Paginate to bypass PostgREST 1000-row limit
  const conversations = await fetchAllRows<{
    id: string;
    created_at: string;
    sentiment_score: number | null;
    urgency_score: number | null;
  }>(query);

  // Step 3: Group by day
  const dayMap = new Map<string, {
    count: number;
    sentimentSum: number;
    sentimentCount: number;
    urgencySum: number;
    urgencyCount: number;
  }>();

  for (const conv of conversations) {
    const day = (conv.created_at ?? "").slice(0, 10); // YYYY-MM-DD
    if (!day) continue;

    const entry = dayMap.get(day) ?? {
      count: 0,
      sentimentSum: 0,
      sentimentCount: 0,
      urgencySum: 0,
      urgencyCount: 0,
    };
    entry.count++;
    if (conv.sentiment_score != null) {
      entry.sentimentSum += conv.sentiment_score;
      entry.sentimentCount++;
    }
    if (conv.urgency_score != null) {
      entry.urgencySum += conv.urgency_score;
      entry.urgencyCount++;
    }
    dayMap.set(day, entry);
  }

  // Step 4: Build response array sorted by date
  const result = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const row: Record<string, unknown> = {
        date,
        count: d.count,
      };
      if (showSentiment && d.sentimentCount > 0) {
        row.avg_sentiment = Math.round((d.sentimentSum / d.sentimentCount) * 10) / 10;
      }
      if (showUrgency && d.urgencyCount > 0) {
        row.avg_urgency = Math.round((d.urgencySum / d.urgencyCount) * 10) / 10;
      }
      return row;
    });

  return NextResponse.json({ data: result });
}
