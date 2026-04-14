import { NextRequest, NextResponse } from "next/server";
import { subDays, formatISO } from "date-fns";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";

const BUCKETS = [
  { label: "1-3", min: 1, max: 3 },
  { label: "4-6", min: 4, max: 6 },
  { label: "7-9", min: 7, max: 9 },
  { label: "10-12", min: 10, max: 12 },
  { label: "13-15", min: 13, max: 15 },
  { label: ">15", min: 16, max: Infinity },
];

function computeBuckets(messageCounts: number[]) {
  const total = messageCounts.length;
  if (total === 0) {
    return BUCKETS.map((b) => ({
      label: b.label, min: b.min, max: b.max, count: 0, percentage: 0,
    }));
  }
  return BUCKETS.map((bucket) => {
    const count = messageCounts.filter((mc) => {
      const iterations = Math.ceil(mc / 2);
      return iterations >= bucket.min && iterations <= bucket.max;
    }).length;
    return {
      label: bucket.label,
      min: bucket.min,
      max: bucket.max,
      count,
      percentage: Math.round((count / total) * 1000) / 10,
    };
  });
}

function computeDateRange(
  period: string,
  customFrom?: string,
  customTo?: string
): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const dateTo =
    period === "custom" && customTo
      ? customTo
      : formatISO(now, { representation: "date" });

  let dateFrom: string;
  switch (period) {
    case "7d":
      dateFrom = formatISO(subDays(now, 7), { representation: "date" });
      break;
    case "90d":
      dateFrom = formatISO(subDays(now, 90), { representation: "date" });
      break;
    case "custom":
      dateFrom = customFrom ?? formatISO(subDays(now, 30), { representation: "date" });
      break;
    case "30d":
    default:
      dateFrom = formatISO(subDays(now, 30), { representation: "date" });
      break;
  }
  return { dateFrom, dateTo };
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

  const tab = sp.get("tab") === "agent" ? "agent" : "bot";
  const period = sp.get("period") ?? "30d";
  const { dateFrom, dateTo } = computeDateRange(
    period,
    sp.get("date_from") ?? undefined,
    sp.get("date_to") ?? undefined
  );

  const dateFromIso = `${dateFrom}T00:00:00`;
  const dateToIso = `${dateTo}T23:59:59`;

  const supabase = createServiceClient();

  const [{ count: botCount }, { count: agentCount }, conversations] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("type", "bot")
        .gte("created_at", dateFromIso)
        .lte("created_at", dateToIso),
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("type", "agent")
        .gte("created_at", dateFromIso)
        .lte("created_at", dateToIso),
      fetchAllRows<{ message_count: number }>(
        supabase
          .from("conversations")
          .select("message_count")
          .eq("workspace_id", workspaceId)
          .eq("type", tab)
          .gte("created_at", dateFromIso)
          .lte("created_at", dateToIso)
      ),
    ]);

  const messageCounts = conversations
    .map((c) => c.message_count)
    .filter((mc) => mc > 0);

  const buckets = computeBuckets(messageCounts);
  const totalConvs = messageCounts.length;
  const totalIterations = messageCounts.reduce(
    (s, mc) => s + Math.ceil(mc / 2),
    0
  );
  const avgIterations =
    totalConvs > 0 ? Math.round((totalIterations / totalConvs) * 10) / 10 : 0;
  const maxPct = Math.max(...buckets.map((b) => b.percentage), 1);

  return NextResponse.json({
    buckets,
    totalConvs,
    totalIterations,
    avgIterations,
    maxPct,
    botCount: botCount ?? 0,
    agentCount: agentCount ?? 0,
    dateFrom,
    dateTo,
  });
}
