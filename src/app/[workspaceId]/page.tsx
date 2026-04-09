import { subDays, formatISO } from "date-fns";
import {
  TrendingDown,
  MessageSquare,
  BarChart3,
  Bot,
  User,
} from "lucide-react";
import {
  getWorkspaceMetrics,
  getTagsByFrequency,
  getConversationsForScatter,
} from "@/lib/supabase/queries";
import { searchConversations } from "@/lib/supabase/search";
import { PeriodSelector } from "@/components/layout/period-selector";
import { ExportPdfButton } from "@/components/export/export-pdf-button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TagCloud } from "@/components/dashboard/tag-cloud";
import { DensityHeatmap } from "@/components/dashboard/density-heatmap";
import { TagHeatmap } from "@/components/dashboard/tag-heatmap";
import { MatrixFilters } from "@/components/dashboard/matrix-filters";
import { EmptyState } from "@/components/ui/empty-state";

interface DashboardPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    period?: string;
    date_from?: string;
    date_to?: string;
    matrix_type?: string;
    matrix_q?: string;
    matrix_mode?: string;
  }>;
}

export default async function DashboardPage({
  params,
  searchParams,
}: DashboardPageProps) {
  const { workspaceId } = await params;
  const {
    period = "30d",
    date_from,
    date_to,
    matrix_type,
    matrix_q,
    matrix_mode,
  } = await searchParams;

  const matrixType: "bot" | "agent" | null =
    matrix_type === "bot" || matrix_type === "agent" ? matrix_type : null;
  const matrixQuery = typeof matrix_q === "string" ? matrix_q.trim() : "";
  const matrixSearchMode: "combined" | "text" | "semantic" =
    matrix_mode === "text" || matrix_mode === "semantic"
      ? matrix_mode
      : "combined";

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
      dateFrom = date_from ?? formatISO(subDays(now, 30), { representation: "date" });
      dateTo = date_to ?? dateTo;
      break;
    case "30d":
    default:
      dateFrom = formatISO(subDays(now, 30), { representation: "date" });
      break;
  }

  const [metrics, tags, scatterConversations] = await Promise.all([
    getWorkspaceMetrics(workspaceId, dateFrom, dateTo),
    getTagsByFrequency(workspaceId),
    getConversationsForScatter(workspaceId),
  ]);

  // Filter conversations for the "Matrice Conversations" panel.
  // - type filter: bot / agent / all
  // - keyword filter: hybrid (text + semantic) search
  // Both filters are combinable. `scatterConversations` stays untouched
  // so TagHeatmap can still aggregate across every scored conversation.
  let matrixKeywordIds: Set<string> | null = null;
  if (matrixQuery) {
    try {
      const searchResult = await searchConversations(
        workspaceId,
        matrixQuery,
        matrixSearchMode
      );
      const ids = new Set<string>();
      for (const m of searchResult.groups.bot.conversations) {
        ids.add(m.conversation.id);
      }
      for (const m of searchResult.groups.agent.conversations) {
        ids.add(m.conversation.id);
      }
      matrixKeywordIds = ids;
    } catch (err) {
      console.error("[dashboard] matrix keyword search failed:", err);
      matrixKeywordIds = new Set();
    }
  }

  const matrixConversations = scatterConversations.filter((c) => {
    if (matrixType && c.type !== matrixType) return false;
    if (matrixKeywordIds && !matrixKeywordIds.has(c.id)) return false;
    return true;
  });

  const periodLabels: Record<string, string> = {
    "7d": "sur 7 jours",
    "30d": "sur 30 jours",
    "90d": "sur 90 jours",
    custom: "periode personnalisee",
  };
  const subtitle = periodLabels[period] ?? "sur 30 jours";

  if (metrics.totalConversations === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center justify-center min-h-[60vh]">
          <EmptyState
            title="Aucune conversation analysee"
            description="Configurez votre webhook pour commencer."
            icon={<BarChart3 className="h-12 w-12" />}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <ExportPdfButton
          variant="dashboard"
          data={{
            period: subtitle,
            metrics,
            tags: tags.map((t) => ({ label: t.label, conversation_count: t.conversation_count })),
          }}
        />
      </div>

      <PeriodSelector
        currentPeriod={period}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Conversations IA"
          value={metrics.botConversations}
          subtitle={subtitle}
          icon={<Bot className="h-5 w-5" />}
        />
        <KpiCard
          title="Transferees a un humain"
          value={`${metrics.escalatedConversations} (${metrics.tauxTransfert.toFixed(0)}%)`}
          subtitle={subtitle}
          icon={<TrendingDown className="h-5 w-5" />}
        />
        <KpiCard
          title="Conversations agent"
          value={metrics.agentConversations}
          subtitle={subtitle}
          icon={<User className="h-5 w-5" />}
        />
        <KpiCard
          title="Total conversations"
          value={metrics.totalConversations}
          subtitle={subtitle}
          icon={<MessageSquare className="h-5 w-5" />}
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
        <TagCloud tags={tags} workspaceId={workspaceId} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Matrice Conversations
        </h2>
        <p className="text-xs text-gray-400 mb-4">Densite de conversations. Plus la zone est rouge, plus il y a de conversations. Cliquez une zone pour filtrer la liste.</p>
        <MatrixFilters />
        <DensityHeatmap
          conversations={matrixConversations}
          workspaceId={workspaceId}
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Matrice par Theme
        </h2>
        <p className="text-xs text-gray-400 mb-4">Selectionnez un theme pour voir la densite de ses conversations sur la grille sentiment / urgence. Cliquez une zone pour filtrer la liste.</p>
        <TagHeatmap
          conversations={scatterConversations}
          workspaceId={workspaceId}
          tags={tags.map((t) => ({ id: t.id, label: t.label }))}
        />
      </div>
    </div>
  );
}
