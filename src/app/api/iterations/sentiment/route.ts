import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";

/**
 * GET /api/iterations/sentiment?workspace_id=X&min=4&max=6&type=bot
 * Returns sentiment distribution for conversations in a given iteration range.
 */
export async function GET(req: NextRequest) {
  // Auth gate: require a valid session. Restricted SSO clients cannot read
  // iterations data since the iterations page is not in their offer.
  const session = await getSessionFromMiddlewareHeader();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isRestrictedSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const min = parseInt(sp.get("min") ?? "1", 10);
  const max = parseInt(sp.get("max") ?? "999", 10);
  const type = sp.get("type") ?? "bot";
  const dateFrom = sp.get("date_from");
  const dateTo = sp.get("date_to");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch all conversations with sentiment_score, urgency_score and message_count
  let query = supabase
    .from("conversations")
    .select("message_count, sentiment_score, urgency_score")
    .eq("workspace_id", workspaceId)
    .eq("type", type)
    .not("sentiment_score", "is", null);

  if (dateFrom) {
    query = query.gte("created_at", `${dateFrom}T00:00:00`);
  }
  if (dateTo) {
    query = query.lte("created_at", `${dateTo}T23:59:59`);
  }

  const conversations = await fetchAllRows<{
    message_count: number;
    sentiment_score: number | null;
    urgency_score: number | null;
  }>(query);

  // Filter by iteration range
  const matching = conversations.filter((c) => {
    const iterations = Math.ceil(c.message_count / 2);
    return iterations >= min && iterations <= max;
  });

  // Build sentiment distribution (-5 to +5)
  const distribution: Record<number, number> = {};
  for (let i = -5; i <= 5; i++) {
    distribution[i] = 0;
  }

  // Build urgency distribution (0 to 5)
  const urgencyDistribution: Record<number, number> = {};
  for (let i = 0; i <= 5; i++) {
    urgencyDistribution[i] = 0;
  }

  let sentimentSum = 0;
  let urgencySum = 0;
  let urgencyCount = 0;
  for (const c of matching) {
    const score = Math.round(c.sentiment_score!);
    const clamped = Math.max(-5, Math.min(5, score));
    distribution[clamped]++;
    sentimentSum += c.sentiment_score!;

    if (c.urgency_score !== null) {
      const u = Math.round(c.urgency_score);
      const uClamped = Math.max(0, Math.min(5, u));
      urgencyDistribution[uClamped]++;
      urgencySum += c.urgency_score;
      urgencyCount++;
    }
  }

  const avgSentiment = matching.length > 0
    ? Math.round((sentimentSum / matching.length) * 10) / 10
    : null;

  const avgUrgency = urgencyCount > 0
    ? Math.round((urgencySum / urgencyCount) * 10) / 10
    : null;

  return NextResponse.json({
    total: matching.length,
    avgSentiment,
    distribution,
    avgUrgency,
    urgencyDistribution,
    urgencyTotal: urgencyCount,
  });
}
