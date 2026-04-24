"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { subDays, formatISO } from "date-fns";
import {
  TrendingDown,
  MessageSquare,
  BarChart3,
  Bot,
  User,
} from "lucide-react";
import { PeriodSelector } from "@/components/layout/period-selector";
import { ExportPdfButton } from "@/components/export/export-pdf-button";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { TagCloud } from "@/components/dashboard/tag-cloud";
import { DensityHeatmap } from "@/components/dashboard/density-heatmap";
import { TagHeatmap } from "@/components/dashboard/tag-heatmap";
import { MatrixFilters } from "@/components/dashboard/matrix-filters";
import { EmptyState } from "@/components/ui/empty-state";
import type { Tag } from "@/types/database";

interface Metrics {
  totalConversations: number;
  botConversations: number;
  agentConversations: number;
  escalatedConversations: number;
  tauxTransfert: number;
}

interface ScatterConversation {
  id: string;
  sentiment_score: number;
  urgency_score: number | null;
  message_count: number;
  failure_score: number;
  type: string;
  started_at: string | null;
  created_at: string;
  tags?: { id: string; label: string }[];
}

interface DashboardClientProps {
  workspaceId: string;
  restrictedMode: boolean;
  initialPeriod: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  initialMatrixType?: string;
  initialMatrixQ?: string;
  initialMatrixMode?: string;
}

const PERIOD_LABELS: Record<string, string> = {
  "7d": "sur 7 jours",
  "30d": "sur 30 jours",
  "90d": "sur 90 jours",
  custom: "periode personnalisee",
};

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
      dateFrom =
        customFrom ??
        formatISO(subDays(now, 30), { representation: "date" });
      break;
    case "30d":
    default:
      dateFrom = formatISO(subDays(now, 30), { representation: "date" });
      break;
  }
  return { dateFrom, dateTo };
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ""}`}
    />
  );
}

export function DashboardClient({
  workspaceId,
  restrictedMode,
  initialPeriod,
  initialDateFrom,
  initialDateTo,
  initialMatrixType,
  initialMatrixQ,
  initialMatrixMode,
}: DashboardClientProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  // Filter state
  const [period, setPeriod] = useState(
    restrictedMode ? "7d" : initialPeriod
  );
  const [customFrom, setCustomFrom] = useState(initialDateFrom);
  const [customTo, setCustomTo] = useState(initialDateTo);
  const [matrixType, setMatrixType] = useState(initialMatrixType ?? "all");
  const [matrixQ, setMatrixQ] = useState(initialMatrixQ ?? "");
  const [matrixMode, setMatrixMode] = useState(
    initialMatrixMode ?? "combined"
  );

  // Data state
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [scatterConversations, setScatterConversations] = useState<
    ScatterConversation[] | null
  >(null);
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(
    null
  );

  // Loading state
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [scatterLoading, setScatterLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);

  // Computed date range
  const { dateFrom, dateTo } = useMemo(
    () => computeDateRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  // ---------- Fetch: tags + scatter (once on mount) ----------
  useEffect(() => {
    const params = new URLSearchParams({ workspace_id: workspaceId });

    Promise.all([
      fetch(`${basePath}/api/dashboard/tags?${params}`).then((r) => r.json()),
      fetch(`${basePath}/api/dashboard/scatter?${params}`).then((r) =>
        r.json()
      ),
    ]).then(([tagsRes, scatterRes]) => {
      setTags(tagsRes.tags ?? []);
      setTagsLoading(false);
      setScatterConversations(scatterRes.conversations ?? []);
      setScatterLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // ---------- Fetch: metrics (on period/date change) ----------
  useEffect(() => {
    // AbortController prevents stale state when the user changes period
    // rapidly (e.g. 7d -> 30d -> 90d): in-flight requests for outdated
    // ranges are cancelled before they can overwrite fresher results.
    const controller = new AbortController();
    setMetricsLoading(true);
    const params = new URLSearchParams({
      workspace_id: workspaceId,
      date_from: dateFrom,
      date_to: dateTo,
    });
    fetch(`${basePath}/api/dashboard/metrics?${params}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => {
        setMetrics(data);
        setMetricsLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.error("[dashboard] metrics fetch failed:", err);
        setMetricsLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, dateFrom, dateTo]);

  // ---------- Matrix search (triggered by MatrixFilters callback) ----------
  // Track in-flight matrix-search request so we can cancel it when a newer
  // query starts. Without this, a slow request can overwrite a faster one
  // that started later.
  const matrixSearchAbortRef = useRef<AbortController | null>(null);

  const handleMatrixSearch = useCallback(
    (query: string, mode: string) => {
      setMatrixQ(query);
      setMatrixMode(mode);

      if (!query.trim()) {
        matrixSearchAbortRef.current?.abort();
        setSearchMatchIds(null);
        return;
      }

      // Cancel previous in-flight search.
      matrixSearchAbortRef.current?.abort();
      const controller = new AbortController();
      matrixSearchAbortRef.current = controller;

      setSearchLoading(true);
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        q: query.trim(),
        mode,
      });
      fetch(`${basePath}/api/dashboard/matrix-search?${params}`, {
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((data) => {
          setSearchMatchIds(new Set(data.matchIds ?? []));
          setSearchLoading(false);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error("[dashboard] matrix-search failed:", err);
          setSearchLoading(false);
        });
    },
    [workspaceId, basePath]
  );

  const handleMatrixClear = useCallback(() => {
    setMatrixQ("");
    setSearchMatchIds(null);
  }, []);

  // ---------- Matrix filtering (client-side) ----------
  const matrixConversations = useMemo(() => {
    if (!scatterConversations) return [];
    return scatterConversations.filter((c) => {
      if (matrixType !== "all" && c.type !== matrixType) return false;
      if (searchMatchIds && !searchMatchIds.has(c.id)) return false;
      return true;
    });
  }, [scatterConversations, matrixType, searchMatchIds]);

  // ---------- URL sync (deep-linking without navigation) ----------
  useEffect(() => {
    const params = new URLSearchParams();
    if (period !== "30d") params.set("period", period);
    if (period === "custom" && customFrom) params.set("date_from", customFrom);
    if (period === "custom" && customTo) params.set("date_to", customTo);
    if (matrixType !== "all") params.set("matrix_type", matrixType);
    if (matrixQ) {
      params.set("matrix_q", matrixQ);
      params.set("matrix_mode", matrixMode);
    }
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [period, customFrom, customTo, matrixType, matrixQ, matrixMode]);

  // ---------- Period change handler ----------
  const handlePeriodChange = useCallback(
    (newPeriod: string) => {
      if (restrictedMode && newPeriod !== "7d") return;
      setPeriod(newPeriod);
      if (newPeriod !== "custom") {
        setCustomFrom(undefined);
        setCustomTo(undefined);
      }
    },
    [restrictedMode]
  );

  const handleDateChange = useCallback(
    (key: "date_from" | "date_to", value: string) => {
      if (key === "date_from") setCustomFrom(value);
      else setCustomTo(value);
    },
    []
  );

  // ---------- Render ----------
  const subtitle = PERIOD_LABELS[period] ?? "sur 30 jours";

  // Empty state: show after metrics loaded and 0 conversations
  if (metrics && metrics.totalConversations === 0 && !metricsLoading) {
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
        {metrics && tags && (
          <ExportPdfButton
            variant="dashboard"
            data={{
              period: subtitle,
              metrics,
              tags: tags.map((t) => ({
                label: t.label,
                conversation_count: t.conversation_count,
              })),
            }}
          />
        )}
      </div>

      <PeriodSelector
        currentPeriod={period}
        restrictedMode={restrictedMode}
        onPeriodChange={handlePeriodChange}
        onDateChange={handleDateChange}
        dateFrom={customFrom}
        dateTo={customTo}
      />

      {/* KPI Cards */}
      {metricsLoading || !metrics ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
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
      )}

      {/* Tags */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tags</h2>
        {tagsLoading || !tags ? (
          <Skeleton className="h-16" />
        ) : (
          <TagCloud tags={tags} workspaceId={workspaceId} />
        )}
      </div>

      {/* Matrice Conversations */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Matrice Conversations
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Densite de conversations. Plus la zone est rouge, plus il y a de
          conversations. Cliquez une zone pour filtrer la liste.
        </p>
        <MatrixFilters
          matrixType={matrixType}
          matrixQ={matrixQ}
          matrixMode={matrixMode}
          onTypeChange={setMatrixType}
          onSearch={handleMatrixSearch}
          onClear={handleMatrixClear}
        />
        {scatterLoading || searchLoading ? (
          <Skeleton className="h-[340px]" />
        ) : (
          <DensityHeatmap
            conversations={matrixConversations}
            workspaceId={workspaceId}
          />
        )}
      </div>

      {/* Matrice par Theme */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Matrice par Theme
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Selectionnez un theme pour voir la densite de ses conversations sur la
          grille sentiment / urgence. Cliquez une zone pour filtrer la liste.
        </p>
        {scatterLoading || !tags ? (
          <Skeleton className="h-[400px]" />
        ) : (
          <TagHeatmap
            conversations={scatterConversations ?? []}
            workspaceId={workspaceId}
            tags={tags.map((t) => ({ id: t.id, label: t.label }))}
          />
        )}
      </div>
    </div>
  );
}
