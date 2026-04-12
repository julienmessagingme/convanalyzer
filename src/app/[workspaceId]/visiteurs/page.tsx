import Link from "next/link";
import { Users, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { ForbiddenPage } from "@/components/ui/forbidden-page";
import { EmptyState } from "@/components/ui/empty-state";
import { SentimentBadge } from "@/components/visiteurs/sentiment-badge";
import { UrgencyBadge } from "@/components/visiteurs/urgency-badge";
import { VisitorFrequencyFilter } from "@/components/visiteurs/visitor-frequency-filter";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";

const PAGE_SIZE = 50;

interface VisiteurPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface RawConvRow {
  client_id: string | null;
  sentiment_score: number | null;
  urgency_score: number | null;
  failure_score: number;
  started_at: string | null;
  created_at: string;
}

interface RpcVisitorRow {
  client_id: string;
  visit_count: number;
  avg_sentiment: number | null;
  avg_urgency: number | null;
  avg_failure: number | null;
  first_visit: string | null;
  last_visit: string | null;
}

interface VisitorSummary {
  clientId: string;
  visitCount: number;
  avgSentiment: number | null;
  avgUrgency: number | null;
  avgFailure: number | null;
  lastVisit: string | null;
  firstVisit: string | null;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function aggregateVisitors(rows: RawConvRow[]): VisitorSummary[] {
  const groups = new Map<string, RawConvRow[]>();

  for (const row of rows) {
    if (!row.client_id) continue;
    const existing = groups.get(row.client_id);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.client_id, [row]);
    }
  }

  const summaries: VisitorSummary[] = [];
  for (const [clientId, convs] of Array.from(groups)) {
    const dates = convs
      .map((c: RawConvRow) => c.started_at ?? c.created_at)
      .filter(Boolean)
      .sort();

    summaries.push({
      clientId,
      visitCount: convs.length,
      avgSentiment: avg(
        convs
          .map((c: RawConvRow) => c.sentiment_score)
          .filter((s: number | null): s is number => s !== null)
      ),
      avgUrgency: avg(
        convs
          .map((c: RawConvRow) => c.urgency_score)
          .filter((u: number | null): u is number => u !== null)
      ),
      avgFailure: avg(convs.map((c: RawConvRow) => c.failure_score)),
      lastVisit: dates[dates.length - 1] ?? null,
      firstVisit: dates[0] ?? null,
    });
  }

  return summaries;
}

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "--";
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: fr });
  } catch {
    return "--";
  }
}

function buildUrl(
  basePath: string,
  params: Record<string, string>
): string {
  const qs = new URLSearchParams(params).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export default async function VisiteurPage({
  params,
  searchParams,
}: VisiteurPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const filters = await searchParams;

  const minRaw = typeof filters.min === "string" ? filters.min : "2";
  const minVisits = Math.max(1, parseInt(minRaw, 10) || 2);

  const offsetRaw = typeof filters.offset === "string" ? filters.offset : "0";
  const pageOffset = Math.max(0, parseInt(offsetRaw, 10) || 0);

  const supabase = createServiceClient();

  // Try RPC first (requires migration 011 applied in prod)
  let allVisitors: VisitorSummary[];

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_visitor_stats",
    { p_workspace_id: workspaceId }
  );

  if (!rpcError && rpcData) {
    allVisitors = (rpcData as RpcVisitorRow[]).map((row) => ({
      clientId: row.client_id,
      visitCount: Number(row.visit_count),
      avgSentiment: row.avg_sentiment !== null ? Number(row.avg_sentiment) : null,
      avgUrgency: row.avg_urgency !== null ? Number(row.avg_urgency) : null,
      avgFailure: row.avg_failure !== null ? Number(row.avg_failure) : null,
      firstVisit: row.first_visit,
      lastVisit: row.last_visit,
    }));
  } else {
    // Fallback: fetch raw rows and aggregate in JS
    const rawConvs = await fetchAllRows<RawConvRow>(
      supabase
        .from("conversations")
        .select(
          "client_id, sentiment_score, urgency_score, failure_score, started_at, created_at"
        )
        .eq("workspace_id", workspaceId)
        .not("client_id", "is", null)
    );
    allVisitors = aggregateVisitors(rawConvs);
  }

  const filtered = allVisitors
    .filter((v) => v.visitCount >= minVisits)
    .sort((a, b) => {
      if (b.visitCount !== a.visitCount) return b.visitCount - a.visitCount;
      const aDate = a.lastVisit ?? "";
      const bDate = b.lastVisit ?? "";
      return bDate.localeCompare(aDate);
    });

  const totalCount = filtered.length;
  const visitors = filtered.slice(pageOffset, pageOffset + PAGE_SIZE);
  const basePath = `/${workspaceId}/visiteurs`;

  const prevOffset = Math.max(0, pageOffset - PAGE_SIZE);
  const nextOffset = pageOffset + PAGE_SIZE;
  const hasPrev = pageOffset > 0;
  const hasNext = nextOffset < totalCount;

  const sharedParams = (offset: number) =>
    ({ min: String(minVisits), offset: String(offset) });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Visiteurs recurrents</h1>
        <span className="text-sm text-gray-500">
          {totalCount}{" "}
          {totalCount !== 1 ? "visiteurs trouves" : "visiteur trouve"}
        </span>
      </div>

      <VisitorFrequencyFilter currentMin={String(minVisits)} basePath={basePath} />

      {visitors.length === 0 ? (
        <EmptyState
          title="Aucun visiteur trouve"
          description={`Aucun contact n'a ${minVisits > 1 ? `au moins ${minVisits} conversations` : "de conversation"} dans ce workspace.`}
          icon={<Users className="h-12 w-12" />}
        />
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {/* Header row */}
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

            {/* Data rows */}
            <div className="divide-y divide-gray-100">
              {visitors.map((visitor) => {
                const href = `/${workspaceId}/visiteurs/${encodeURIComponent(visitor.clientId)}`;
                return (
                  <Link
                    key={visitor.clientId}
                    href={href}
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
                );
              })}
            </div>
          </div>

          {/* Pagination */}
          {(hasPrev || hasNext) && (
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                {pageOffset + 1}–{Math.min(pageOffset + PAGE_SIZE, totalCount)} sur {totalCount}
              </span>
              <div className="flex items-center gap-2">
                {hasPrev ? (
                  <Link
                    href={buildUrl(basePath, sharedParams(prevOffset))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Precedent
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-100 text-gray-300 cursor-not-allowed">
                    <ChevronLeft className="h-4 w-4" />
                    Precedent
                  </span>
                )}
                {hasNext ? (
                  <Link
                    href={buildUrl(basePath, sharedParams(nextOffset))}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    Suivant
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-gray-100 text-gray-300 cursor-not-allowed">
                    Suivant
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
