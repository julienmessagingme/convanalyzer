"use client";

import { useCallback, useEffect, useState } from "react";
import { ConversationTabs } from "@/components/conversations/conversation-tabs";
import { IterationsTable } from "@/components/iterations/iterations-table";
import { PeriodSelector } from "@/components/layout/period-selector";

interface BucketRow {
  label: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

interface IterationsData {
  buckets: BucketRow[];
  totalConvs: number;
  totalIterations: number;
  avgIterations: number;
  maxPct: number;
  botCount: number;
  agentCount: number;
  dateFrom: string;
  dateTo: string;
}

interface IterationsClientProps {
  workspaceId: string;
  initialTab: "bot" | "agent";
  initialPeriod: string;
  initialDateFrom?: string;
  initialDateTo?: string;
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ""}`} />
  );
}

export function IterationsClient({
  workspaceId,
  initialTab,
  initialPeriod,
  initialDateFrom,
  initialDateTo,
}: IterationsClientProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const [tab, setTab] = useState<"bot" | "agent">(initialTab);
  const [period, setPeriod] = useState(initialPeriod);
  const [customFrom, setCustomFrom] = useState(initialDateFrom);
  const [customTo, setCustomTo] = useState(initialDateTo);

  const [data, setData] = useState<IterationsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      workspace_id: workspaceId,
      tab,
      period,
    });
    if (period === "custom" && customFrom) params.set("date_from", customFrom);
    if (period === "custom" && customTo) params.set("date_to", customTo);

    fetch(`${basePath}/api/iterations/list?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [basePath, workspaceId, tab, period, customFrom, customTo]);

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "bot") params.set("tab", tab);
    if (period !== "30d") params.set("period", period);
    if (period === "custom" && customFrom) params.set("date_from", customFrom);
    if (period === "custom" && customTo) params.set("date_to", customTo);
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [tab, period, customFrom, customTo]);

  // Handlers
  const handleTabChange = useCallback((newTab: "bot" | "agent") => {
    setTab(newTab);
  }, []);

  const handlePeriodChange = useCallback((newPeriod: string) => {
    setPeriod(newPeriod);
    if (newPeriod !== "custom") {
      setCustomFrom(undefined);
      setCustomTo(undefined);
    }
  }, []);

  const handleDateChange = useCallback(
    (key: "date_from" | "date_to", value: string) => {
      if (key === "date_from") setCustomFrom(value);
      else setCustomTo(value);
    },
    []
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">
          Repartition par iterations
        </h1>
        <PeriodSelector
          currentPeriod={period}
          onPeriodChange={handlePeriodChange}
          onDateChange={handleDateChange}
          dateFrom={customFrom}
          dateTo={customTo}
        />
      </div>

      <ConversationTabs
        activeTab={tab}
        botCount={data?.botCount ?? 0}
        agentCount={data?.agentCount ?? 0}
        onTabChange={handleTabChange}
      />

      {/* Stats */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total conversations</p>
            <p className="text-2xl font-bold text-gray-900">
              {data?.totalConvs ?? 0}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Iterations moyennes</p>
            <p className="text-2xl font-bold text-gray-900">
              {data?.avgIterations ?? 0}
            </p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total iterations</p>
            <p className="text-2xl font-bold text-gray-900">
              {data?.totalIterations ?? 0}
            </p>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        <IterationsTable
          buckets={data?.buckets ?? []}
          maxPct={data?.maxPct ?? 1}
          workspaceId={workspaceId}
          type={tab}
          dateFrom={data?.dateFrom ?? ""}
          dateTo={data?.dateTo ?? ""}
        />
      )}

      <p className="text-xs text-gray-400">
        1 iteration = 1 echange aller-retour (message + reponse). Calcul :
        ceil(nombre de messages / 2).
      </p>
    </div>
  );
}
