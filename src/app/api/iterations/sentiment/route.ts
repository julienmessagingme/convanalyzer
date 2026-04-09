import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";

/**
 * GET /api/iterations/sentiment?workspace_id=X&min=4&max=6&type=bot
 * Returns sentiment distribution for conversations in a given iteration range.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const min = parseInt(sp.get("min") ?? "1", 10);
  const max = parseInt(sp.get("max") ?? "999", 10);
  const type = sp.get("type") ?? "bot";

  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch all conversations with sentiment_score and message_count
  const conversations = await fetchAllRows<{
    message_count: number;
    sentiment_score: number | null;
  }>(
    supabase
      .from("conversations")
      .select("message_count, sentiment_score")
      .eq("workspace_id", workspaceId)
      .eq("type", type)
      .not("sentiment_score", "is", null)
  );

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

  let sentimentSum = 0;
  for (const c of matching) {
    const score = Math.round(c.sentiment_score!);
    const clamped = Math.max(-5, Math.min(5, score));
    distribution[clamped]++;
    sentimentSum += c.sentiment_score!;
  }

  const avgSentiment = matching.length > 0
    ? Math.round((sentimentSum / matching.length) * 10) / 10
    : null;

  return NextResponse.json({
    total: matching.length,
    avgSentiment,
    distribution,
  });
}
