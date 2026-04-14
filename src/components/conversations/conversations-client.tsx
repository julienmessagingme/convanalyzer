"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversationTabs } from "./conversation-tabs";
import { FilterBar } from "./filter-bar";
import { ConversationList } from "./conversation-list";
import { Pagination } from "./pagination";
import { ExportCsvButton } from "@/components/export/export-csv-button";
import type { Conversation, Tag } from "@/types/database";
import type { CsvConversationRow } from "@/lib/export/csv";

interface ConversationsClientProps {
  workspaceId: string;
  initialTab: "bot" | "agent";
  initialPage: number;
  initialFilters: Record<string, string>;
}

interface ListData {
  conversations: Conversation[];
  tagMap: Record<string, { id: string; label: string }[]>;
  resumeMap: Record<string, string>;
  botCount: number;
  agentCount: number;
  totalPages: number;
  totalCount: number;
  allTags: Tag[];
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ""}`}
    />
  );
}

export function ConversationsClient({
  workspaceId,
  initialTab,
  initialPage,
  initialFilters,
}: ConversationsClientProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  // Filter state
  const [tab, setTab] = useState<"bot" | "agent">(initialTab);
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);

  // Data state
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);

  // Build query params from current state
  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("workspace_id", workspaceId);
    params.set("tab", tab);
    if (page > 1) params.set("page", String(page));
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    return params;
  }, [workspaceId, tab, page, filters]);

  // Fetch data on any filter/tab/page change
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = buildParams();
    fetch(`${basePath}/api/conversations/list?${params}`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("[conversations] fetch error:", err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [basePath, buildParams]);

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "bot") params.set("tab", tab);
    if (page > 1) params.set("page", String(page));
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [tab, page, filters]);

  // Handlers
  const handleTabChange = useCallback((newTab: "bot" | "agent") => {
    setTab(newTab);
    setPage(1);
  }, []);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
    setPage(1);
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  // CSV data
  const csvData = useMemo<CsvConversationRow[]>(() => {
    if (!data) return [];
    return data.conversations.map((c) => ({
      created_at: c.created_at,
      topic: data.tagMap[c.id]?.map((t) => t.label).join(", ") ?? "",
      failure_score: c.failure_score,
      resume: data.resumeMap[c.id] ?? "",
    }));
  }, [data]);

  // Matrix filter banner
  const sentimentScore = filters.sentiment_score;
  const urgencyScore = filters.urgency_score;
  const matrixFilterActive = sentimentScore !== undefined || urgencyScore !== undefined;

  const clearMatrixFilter = useCallback(() => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next.sentiment_score;
      delete next.urgency_score;
      return next;
    });
    setPage(1);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
        <ExportCsvButton conversations={csvData} />
      </div>

      <ConversationTabs
        activeTab={tab}
        botCount={data?.botCount ?? 0}
        agentCount={data?.agentCount ?? 0}
        onTabChange={handleTabChange}
      />

      <FilterBar
        tags={data?.allTags ?? []}
        currentFilters={filters}
        activeTab={tab}
        onFilterChange={handleFilterChange}
      />

      {matrixFilterActive && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <div className="text-sm text-blue-900">
            <span className="font-semibold">Filtre matrice actif :</span>{" "}
            {urgencyScore !== undefined && (
              <span>Urgence = {urgencyScore}</span>
            )}
            {urgencyScore !== undefined && sentimentScore !== undefined && (
              <span> &middot; </span>
            )}
            {sentimentScore !== undefined && (
              <span>
                Sentiment ={" "}
                {Number(sentimentScore) > 0
                  ? `+${sentimentScore}`
                  : sentimentScore}
              </span>
            )}
          </div>
          <button
            onClick={clearMatrixFilter}
            className="text-sm text-blue-700 hover:text-blue-900 font-medium"
          >
            Effacer
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : (
        <ConversationList
          conversations={data?.conversations ?? []}
          tagMap={data?.tagMap ?? {}}
          workspaceId={workspaceId}
          availableTags={data?.allTags ?? []}
        />
      )}

      <Pagination
        currentPage={page}
        totalPages={data?.totalPages ?? 1}
        onPageChange={handlePageChange}
      />
    </div>
  );
}
