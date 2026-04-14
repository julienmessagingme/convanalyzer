import { NextRequest, NextResponse } from "next/server";
import { getConversationsForScatter } from "@/lib/supabase/queries";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";

const SENTIMENT_LEVELS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const URGENCY_LEVELS = [5, 4, 3, 2, 1, 0];

interface ConvWithTags {
  sentiment_score: number;
  urgency_score: number | null;
  tags: { id: string; label: string }[];
}

function buildDistribution(
  conversations: ConvWithTags[],
  getLevel: (c: ConvWithTags) => number | null,
  levels: number[]
) {
  const byLevel = new Map<
    number,
    { total: number; tagCounts: Map<string, { label: string; count: number }> }
  >();
  for (const level of levels) {
    byLevel.set(level, { total: 0, tagCounts: new Map() });
  }

  for (const c of conversations) {
    const lvl = getLevel(c);
    if (lvl == null) continue;
    const bucket = byLevel.get(lvl);
    if (!bucket) continue;
    bucket.total++;
    for (const tag of c.tags) {
      const existing = bucket.tagCounts.get(tag.id) ?? { label: tag.label, count: 0 };
      existing.count++;
      bucket.tagCounts.set(tag.id, existing);
    }
  }

  return levels.map((level) => {
    const bucket = byLevel.get(level)!;
    const tags = Array.from(bucket.tagCounts.entries())
      .map(([id, data]) => ({
        id,
        label: data.label,
        count: data.count,
        percentage: bucket.total > 0 ? Math.round((data.count / bucket.total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage);
    return { level, total: bucket.total, tags };
  });
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromMiddlewareHeader();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isRestrictedSession(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

  const axis = sp.get("axis") === "urgency" ? "urgency" : "sentiment";
  const conversations = await getConversationsForScatter(workspaceId);

  const getLevel = axis === "sentiment"
    ? (c: ConvWithTags) => c.sentiment_score ?? null
    : (c: ConvWithTags) => c.urgency_score ?? null;

  const levels = axis === "sentiment" ? SENTIMENT_LEVELS : URGENCY_LEVELS;
  const buckets = buildDistribution(conversations, getLevel, levels);
  const totalScored = buckets.reduce((sum, b) => sum + b.total, 0);

  return NextResponse.json({ buckets, totalScored, axis });
}
