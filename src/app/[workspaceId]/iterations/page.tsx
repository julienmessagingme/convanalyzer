import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { ConversationTabs } from "@/components/conversations/conversation-tabs";
import { IterationsTable } from "@/components/iterations/iterations-table";
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
  const { workspaceId } = await params;
  const filters = await searchParams;

  const tab: ConversationType =
    typeof filters.tab === "string" && filters.tab === "agent"
      ? "agent"
      : "bot";

  const supabase = createServiceClient();

  // Get counts for tabs
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

  // Fetch message_count for active tab (paginated to bypass 1000-row limit)
  const conversations = await fetchAllRows<{ message_count: number }>(
    supabase
      .from("conversations")
      .select("message_count")
      .eq("workspace_id", workspaceId)
      .eq("type", tab)
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
      <h1 className="text-2xl font-bold text-gray-900">
        Repartition par iterations
      </h1>

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
      />

      <p className="text-xs text-gray-400">
        1 iteration = 1 echange aller-retour (message + reponse).
        Calcul : ceil(nombre de messages / 2).
      </p>
    </div>
  );
}
