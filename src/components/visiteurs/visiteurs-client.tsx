"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { EmptyState } from "@/components/ui/empty-state";
import { SentimentBadge } from "./sentiment-badge";
import { UrgencyBadge } from "./urgency-badge";

const PAGE_SIZE = 50;

const CHIPS = [
  { label: "Tous", value: "1" },
  { label: "2+", value: "2" },
  { label: "3+", value: "3" },
  { label: "5+", value: "5" },
  { label: "7+", value: "7" },
];

interface VisitorSummary {
  clientId: string;
  visitCount: number;
  avgSentiment: number | null;
  avgUrgency: number | null;
  avgFailure: number | null;
  lastVisit: string | null;
  firstVisit: string | null;
}

interface ListData {
  visitors: VisitorSummary[];
  totalCount: number;
  pageOffset: number;
  hasPrev: boolean;
  hasNext: boolean;
}

interface VisiteursClientProps {
  workspaceId: string;
  initialMin: string;
  initialOffset: number;
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  try {
    return formatDistanceToNow(parseISO(dateStr), {
      addSuffix: true,
      locale: fr,
    });
  } catch {
    return "--";
  }
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded-lg ${className ?? ""}`} />
  );
}

export function VisiteursClient({
  workspaceId,
  initialMin,
  initialOffset,
}: VisiteursClientProps) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const [min, setMin] = useState(initialMin);
  const [offset, setOffset] = useState(initialOffset);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      workspace_id: workspaceId,
      min,
      offset: String(offset),
    });
    fetch(`${basePath}/api/visiteurs/list?${params}`)
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
  }, [basePath, workspaceId, min, offset]);

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams();
    if (min !== "2") params.set("min", min);
    if (offset > 0) params.set("offset", String(offset));
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [min, offset]);

  const handleMinChange = useCallback((value: string) => {
    setMin(value);
    setOffset(0);
  }, []);

  const visitors = data?.visitors ?? [];
  const totalCount = data?.totalCount ?? 0;
  const hasPrev = data?.hasPrev ?? false;
  const hasNext = data?.hasNext ?? false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          Visiteurs recurrents
        </h1>
        <span className="text-sm text-gray-500">
          {totalCount}{" "}
          {totalCount !== 1 ? "visiteurs trouves" : "visiteur trouve"}
        </span>
      </div>

      {/* Frequency filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500">Frequence minimale :</span>
        {CHIPS.map((chip) => {
          const isActive = min === chip.value;
          return (
            <button
              key={chip.value}
              onClick={() => handleMinChange(chip.value)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : visitors.length === 0 ? (
        <EmptyState
          title="Aucun visiteur trouve"
          description={`Aucun contact n'a ${
            parseInt(min) > 1
              ? `au moins ${min} conversations`
              : "de conversation"
          } dans ce workspace.`}
          icon={<Users className="h-12 w-12" />}
        />
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-[1fr_80px_110px_110px_150px_150px] gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Contact
              </span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-center">
                Visites
              </span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-center">
                Sentiment
              </span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide text-center">
                Urgence
              </span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Derniere visite
              </span>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Premiere visite
              </span>
            </div>

            <div className="divide-y divide-gray-100">
              {visitors.map((visitor) => (
                <Link
                  key={visitor.clientId}
                  href={`/${workspaceId}/visiteurs/${encodeURIComponent(visitor.clientId)}`}
                  className="grid grid-cols-[1fr_80px_110px_110px_150px_150px] gap-4 px-4 py-3 hover:bg-gray-50 transition-colors items-center"
                >
                  <span className="font-mono text-xs text-gray-700 truncate">
                    {visitor.clientId}
                  </span>
                  <span className="flex justify-center">
                    <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                      {visitor.visitCount}
                    </span>
                  </span>
                  <span className="flex justify-center">
                    <SentimentBadge
                      score={
                        visitor.avgSentiment !== null
                          ? Math.round(visitor.avgSentiment * 10) / 10
                          : null
                      }
                    />
                  </span>
                  <span className="flex justify-center">
                    <UrgencyBadge
                      score={
                        visitor.avgUrgency !== null
                          ? Math.round(visitor.avgUrgency * 10) / 10
                          : null
                      }
                    />
                  </span>
                  <span className="text-xs text-gray-500">
                    {relativeDate(visitor.lastVisit)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {relativeDate(visitor.firstVisit)}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {(hasPrev || hasNext) && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, totalCount)} sur{" "}
                {totalCount}
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={!hasPrev}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border transition-colors ${
                    hasPrev
                      ? "border-gray-200 hover:bg-gray-50"
                      : "border-gray-100 text-gray-300 cursor-not-allowed"
                  }`}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Precedent
                </button>
                <button
                  disabled={!hasNext}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded border transition-colors ${
                    hasNext
                      ? "border-gray-200 hover:bg-gray-50"
                      : "border-gray-100 text-gray-300 cursor-not-allowed"
                  }`}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
