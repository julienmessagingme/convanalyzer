import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";

const PAGE_SIZE = 50;

interface RawConvRow {
  client_id: string | null;
  sentiment_score: number | null;
  urgency_score: number | null;
  failure_score: number;
  started_at: string | null;
  created_at: string;
}

interface RpcVisitorRow {
  client_id: string;
  visit_count: number;
  avg_sentiment: number | null;
  avg_urgency: number | null;
  avg_failure: number | null;
  first_visit: string | null;
  last_visit: string | null;
}

interface VisitorSummary {
  clientId: string;
  visitCount: number;
  avgSentiment: number | null;
  avgUrgency: number | null;
  avgFailure: number | null;
  lastVisit: string | null;
  firstVisit: string | null;
}

function avgNum(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function aggregateVisitors(rows: RawConvRow[]): VisitorSummary[] {
  const groups = new Map<string, RawConvRow[]>();
  for (const row of rows) {
    if (!row.client_id) continue;
    const existing = groups.get(row.client_id);
    if (existing) existing.push(row);
    else groups.set(row.client_id, [row]);
  }

  const summaries: VisitorSummary[] = [];
  for (const [clientId, convs] of Array.from(groups)) {
    const dates = convs
      .map((c) => c.started_at ?? c.created_at)
      .filter(Boolean)
      .sort();
    summaries.push({
      clientId,
      visitCount: convs.length,
      avgSentiment: avgNum(
        convs.map((c) => c.sentiment_score).filter((s): s is number => s !== null)
      ),
      avgUrgency: avgNum(
        convs.map((c) => c.urgency_score).filter((u): u is number => u !== null)
      ),
      avgFailure: avgNum(convs.map((c) => c.failure_score)),
      lastVisit: dates[dates.length - 1] ?? null,
      firstVisit: dates[0] ?? null,
    });
  }
  return summaries;
}

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
    return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
  }

  const minVisits = Math.max(1, parseInt(sp.get("min") ?? "2", 10) || 2);
  const pageOffset = Math.max(0, parseInt(sp.get("offset") ?? "0", 10) || 0);

  const supabase = createServiceClient();

  let allVisitors: VisitorSummary[];

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_visitor_stats",
    { p_workspace_id: workspaceId }
  );

  if (!rpcError && rpcData) {
    allVisitors = (rpcData as RpcVisitorRow[]).map((row) => ({
      clientId: row.client_id,
      visitCount: Number(row.visit_count),
      avgSentiment: row.avg_sentiment !== null ? Number(row.avg_sentiment) : null,
      avgUrgency: row.avg_urgency !== null ? Number(row.avg_urgency) : null,
      avgFailure: row.avg_failure !== null ? Number(row.avg_failure) : null,
      firstVisit: row.first_visit,
      lastVisit: row.last_visit,
    }));
  } else {
    const rawConvs = await fetchAllRows<RawConvRow>(
      supabase
        .from("conversations")
        .select("client_id, sentiment_score, urgency_score, failure_score, started_at, created_at")
        .eq("workspace_id", workspaceId)
        .not("client_id", "is", null)
    );
    allVisitors = aggregateVisitors(rawConvs);
  }

  const filtered = allVisitors
    .filter((v) => v.visitCount >= minVisits)
    .sort((a, b) => {
      if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
      return (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "");
    });

  const totalCount = filtered.length;
  const visitors = filtered.slice(pageOffset, pageOffset + PAGE_SIZE);

  return NextResponse.json({
    visitors,
    totalCount,
    pageOffset,
    pageSize: PAGE_SIZE,
    hasPrev: pageOffset > 0,
    hasNext: pageOffset + PAGE_SIZE < totalCount,
  });
}
