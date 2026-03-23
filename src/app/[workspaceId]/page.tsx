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
  getTrendData,
  getTagsByFrequency,
  getConversationsForScatter,
  getTagMatrixData,
} from "@/lib/supabase/queries";
import { PeriodSelector } from "@/components/layout/period-selector";
import { ExportPdfButton } from "@/components/export/export-pdf-button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { TagCloud } from "@/components/dashboard/tag-cloud";
import { SentimentScatter } from "@/components/dashboard/sentiment-scatter";
import { TagMatrix } from "@/components/dashboard/tag-matrix";
import { EmptyState } from "@/components/ui/empty-state";

interface DashboardPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    period?: string;
    date_from?: string;
    date_to?: string;
    granularity?: string;
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
    granularity = "day",
  } = await searchParams;

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

  const validGranularity = (["day", "week", "month"] as const).includes(
    granularity as "day" | "week" | "month"
  )
    ? (granularity as "day" | "week" | "month")
    : "day";

  const [metrics, trendData, tags, scatterConversations, tagMatrixData] = await Promise.all([
    getWorkspaceMetrics(workspaceId, dateFrom, dateTo),
    getTrendData(workspaceId, dateFrom, dateTo, validGranularity),
    getTagsByFrequency(workspaceId),
    getConversationsForScatter(workspaceId),
    getTagMatrixData(workspaceId),
  ]);

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
            trendData,
          }}
        />
      </div>

      <PeriodSelector
        currentPeriod={period}
        currentGranularity={validGranularity}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Tendances
          </h2>
          <TrendChart data={trendData} />
        </div>
        <div className="lg:col-span-1 bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
          <TagCloud tags={tags} workspaceId={workspaceId} />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Matrice Conversations
        </h2>
        <p className="text-xs text-gray-400 mb-4">1 point = 1 conversation. Cliquez pour voir le detail. Filtrez par tag.</p>
        <SentimentScatter
          conversations={scatterConversations}
          workspaceId={workspaceId}
          tags={tags.map((t) => ({ id: t.id, label: t.label }))}
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Matrice par Theme
        </h2>
        <p className="text-xs text-gray-400 mb-4">1 bulle = 1 tag. Position = moyenne des conversations du tag. Taille = nombre de conversations.</p>
        <TagMatrix tags={tagMatrixData} />
      </div>
    </div>
  );
}
