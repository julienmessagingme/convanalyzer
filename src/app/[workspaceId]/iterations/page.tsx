import { subDays, formatISO } from "date-fns";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { ConversationTabs } from "@/components/conversations/conversation-tabs";
import { IterationsTable } from "@/components/iterations/iterations-table";
import { PeriodSelector } from "@/components/layout/period-selector";
import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import type { ConversationType } from "@/types/database";

interface IterationsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface Bucket {
  label: string;
  min: number;
  max: number;
}

const BUCKETS: Bucket[] = [
  { label: "1-3", min: 1, max: 3 },
  { label: "4-6", min: 4, max: 6 },
  { label: "7-9", min: 7, max: 9 },
  { label: "10-12", min: 10, max: 12 },
  { label: "13-15", min: 13, max: 15 },
  { label: ">15", min: 16, max: Infinity },
];

interface BucketRow {
  label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

function computeBuckets(messageCounts: number[]): BucketRow[] {
  const total = messageCounts.length;
  if (total === 0) {
    return BUCKETS.map((b) => ({ label: b.label, min: b.min, max: b.max, count: 0, percentage: 0 }));
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

export default async function IterationsPage({
  params,
  searchParams,
}: IterationsPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const filters = await searchParams;

  const tab: ConversationType =
    typeof filters.tab === "string" && filters.tab === "agent"
      ? "agent"
      : "bot";

  // Period filter (mirrors dashboard behaviour)
  const period =
    typeof filters.period === "string" ? filters.period : "30d";
  const rawDateFrom =
    typeof filters.date_from === "string" ? filters.date_from : undefined;
  const rawDateTo =
    typeof filters.date_to === "string" ? filters.date_to : undefined;

  const now = new Date();
  let dateFrom: string;
  let dateTo: string = formatISO(now, { representation: "date" });

  switch (period) {
    case "7d":
      dateFrom = formatISO(subDays(now, 7), { representation: "date" });
      break;
    case "90d":
      dateFrom = formatISO(subDays(now, 90), { representation: "date" });
      break;
    case "custom":
      dateFrom =
        rawDateFrom ??
        formatISO(subDays(now, 30), { representation: "date" });
      dateTo = rawDateTo ?? dateTo;
      break;
    case "30d":
    default:
      dateFrom = formatISO(subDays(now, 30), { representation: "date" });
      break;
  }

  const dateFromIso = `${dateFrom}T00:00:00`;
  const dateToIso = `${dateTo}T23:59:59`;

  const supabase = createServiceClient();

  // Get counts for tabs (within period)
  const [{ count: botCount }, { count: agentCount }] = await Promise.all([
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
  ]);

  // Fetch message_count for active tab within period (paginated)
  const conversations = await fetchAllRows<{ message_count: number }>(
    supabase
      .from("conversations")
      .select("message_count")
      .eq("workspace_id", workspaceId)
      .eq("type", tab)
      .gte("created_at", dateFromIso)
      .lte("created_at", dateToIso)
  );

  // Exclude conversations with 0 messages (no iterations)
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">
          Repartition par iterations
        </h1>
        <PeriodSelector currentPeriod={period} />
      </div>

      <ConversationTabs
        activeTab={tab}
        botCount={botCount ?? 0}
        agentCount={agentCount ?? 0}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total conversations</p>
          <p className="text-2xl font-bold text-gray-900">{totalConvs}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Iterations moyennes</p>
          <p className="text-2xl font-bold text-gray-900">{avgIterations}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total iterations</p>
          <p className="text-2xl font-bold text-gray-900">{totalIterations}</p>
        </div>
      </div>

      {/* Table with clickable rows for sentiment distribution */}
      <IterationsTable
        buckets={buckets}
        maxPct={maxPct}
        workspaceId={workspaceId}
        type={tab}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />

      <p className="text-xs text-gray-400">
        1 iteration = 1 echange aller-retour (message + reponse).
        Calcul : ceil(nombre de messages / 2).
      </p>
    </div>
  );
}
