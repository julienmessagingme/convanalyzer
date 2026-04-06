import { createServiceClient } from "@/lib/supabase/server";
import { ConversationTabs } from "@/components/conversations/conversation-tabs";
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
  { label: "4-10", min: 4, max: 10 },
  { label: "11-20", min: 11, max: 20 },
  { label: "20+", min: 21, max: Infinity },
];

interface BucketRow {
  label: string;
  count: number;
  percentage: number;
}

function computeBuckets(messageCounts: number[]): BucketRow[] {
  const total = messageCounts.length;
  if (total === 0) {
    return BUCKETS.map((b) => ({ label: b.label, count: 0, percentage: 0 }));
  }

  return BUCKETS.map((bucket) => {
    const count = messageCounts.filter((mc) => {
      const iterations = Math.ceil(mc / 2);
      return iterations >= bucket.min && iterations <= bucket.max;
    }).length;
    return {
      label: bucket.label,
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

  // Fetch message_count for active tab
  const { data: conversations } = await supabase
    .from("conversations")
    .select("message_count")
    .eq("workspace_id", workspaceId)
    .eq("type", tab);

  const messageCounts = (conversations ?? []).map(
    (c) => (c as { message_count: number }).message_count
  );

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

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Iterations
              </th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                Conversations
              </th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                %
              </th>
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3">
                Repartition
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {buckets.map((bucket) => (
              <tr key={bucket.label} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {bucket.label}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700 text-right">
                  {bucket.count}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-gray-900 text-right">
                  {bucket.percentage}%
                </td>
                <td className="px-6 py-4">
                  <div className="w-full bg-gray-100 rounded-full h-4">
                    <div
                      className="bg-blue-500 h-4 rounded-full transition-all"
                      style={{
                        width: `${(bucket.percentage / maxPct) * 100}%`,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        1 iteration = 1 echange aller-retour (message + reponse).
        Calcul : ceil(nombre de messages / 2).
      </p>
    </div>
  );
}
