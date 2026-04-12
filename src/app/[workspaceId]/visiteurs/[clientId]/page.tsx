import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, User, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { createServiceClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/paginate";
import { ForbiddenPage } from "@/components/ui/forbidden-page";
import { SentimentBadge } from "@/components/visiteurs/sentiment-badge";
import { UrgencyBadge } from "@/components/visiteurs/urgency-badge";
import { formatScore } from "@/lib/utils/scores";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import type { Conversation, Tag } from "@/types/database";

interface VisiteurDetailPageProps {
  params: Promise<{ workspaceId: string; clientId: string }>;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function relativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "--";
  try {
    return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: fr });
  } catch {
    return "--";
  }
}

function absoluteDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "--";
  try {
    return format(parseISO(dateStr), "dd MMM yyyy", { locale: fr });
  } catch {
    return "--";
  }
}

export default async function VisiteurDetailPage({
  params,
}: VisiteurDetailPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId, clientId: encodedClientId } = await params;
  const clientId = decodeURIComponent(encodedClientId);

  const supabase = createServiceClient();

  // Fetch all conversations for this visitor (scoped by workspace)
  const conversations = await fetchAllRows<Conversation>(
    supabase
      .from("conversations")
      .select(
        "id, workspace_id, external_id, client_id, type, started_at, ended_at, message_count, escalated, failure_score, sentiment_score, urgency_score, scoring_status, created_at, agent_id, raw_payload"
      )
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .order("started_at", { ascending: false })
  );

  if (conversations.length === 0) {
    notFound();
  }

  // Aggregate metrics
  const sentimentValues = conversations
    .map((c) => c.sentiment_score)
    .filter((s): s is number => s !== null);
  const urgencyValues = conversations
    .map((c) => c.urgency_score)
    .filter((u): u is number => u !== null);
  const failureValues = conversations.map((c) => c.failure_score);

  const avgSentiment = avg(sentimentValues);
  const avgUrgency = avg(urgencyValues);
  const avgFailure = avg(failureValues);

  // Sentiment trend: compare last 2 scored conversations
  let sentimentTrend: "up" | "down" | "stable" | null = null;
  if (sentimentValues.length >= 2) {
    // conversations is sorted desc (most recent first)
    const scored = conversations.filter((c) => c.sentiment_score !== null);
    if (scored.length >= 2) {
      const latest = scored[0].sentiment_score!;
      const previous = scored[1].sentiment_score!;
      const diff = latest - previous;
      if (diff > 0.5) sentimentTrend = "up";
      else if (diff < -0.5) sentimentTrend = "down";
      else sentimentTrend = "stable";
    }
  }

  // Dates
  const dates = conversations
    .map((c) => c.started_at ?? c.created_at)
    .filter(Boolean)
    .sort();
  const firstVisit = dates[0] ?? null;
  const lastVisit = dates[dates.length - 1] ?? null;

  // Fetch tags for all conversations
  const convIds = conversations.map((c) => c.id);

  const [convTagRows, allTagsData] = await Promise.all([
    supabase
      .from("conversation_tags")
      .select("conversation_id, tag_id")
      .in("conversation_id", convIds),
    supabase
      .from("tags")
      .select("id, label")
      .eq("workspace_id", workspaceId),
  ]);

  const tagLookup = new Map<string, string>();
  for (const tag of (allTagsData.data as Pick<Tag, "id" | "label">[]) ?? []) {
    tagLookup.set(tag.id, tag.label);
  }

  // Tag frequency across all conversations
  const tagFrequency = new Map<string, { label: string; count: number }>();
  for (const ct of convTagRows.data ?? []) {
    const label = tagLookup.get(ct.tag_id);
    if (label) {
      const existing = tagFrequency.get(ct.tag_id);
      if (existing) {
        existing.count += 1;
      } else {
        tagFrequency.set(ct.tag_id, { label, count: 1 });
      }
    }
  }
  const topTags = Array.from(tagFrequency.values()).sort(
    (a, b) => b.count - a.count
  );

  // Per-conversation tag map
  const convTagMap = new Map<string, string[]>();
  for (const ct of convTagRows.data ?? []) {
    const label = tagLookup.get(ct.tag_id);
    if (label) {
      const existing = convTagMap.get(ct.conversation_id);
      if (existing) {
        existing.push(label);
      } else {
        convTagMap.set(ct.conversation_id, [label]);
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/${workspaceId}/visiteurs`}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux visiteurs
      </Link>

      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-mono">
              {clientId}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {conversations.length} conversation
              {conversations.length !== 1 ? "s" : ""} &bull; Premiere visite :{" "}
              {absoluteDate(firstVisit)} &bull; Derniere :{" "}
              {relativeDate(lastVisit)}
            </p>
          </div>
        </div>
      </div>

      {/* Metriques agregees */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Metriques agregees
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Sentiment moyen"
            value={
              avgSentiment !== null ? (
                <div className="flex items-center gap-2">
                  <SentimentBadge
                    score={Math.round(avgSentiment * 10) / 10}
                  />
                  {sentimentTrend === "up" && (
                    <TrendingUp className="h-4 w-4 text-green-500" />
                  )}
                  {sentimentTrend === "down" && (
                    <TrendingDown className="h-4 w-4 text-red-500" />
                  )}
                  {sentimentTrend === "stable" && (
                    <Minus className="h-4 w-4 text-gray-400" />
                  )}
                </div>
              ) : (
                <span className="text-gray-400 text-sm">--</span>
              )
            }
          />
          <MetricCard
            label="Urgence moyenne"
            value={
              <UrgencyBadge
                score={
                  avgUrgency !== null
                    ? Math.round(avgUrgency * 10) / 10
                    : null
                }
              />
            }
          />
          <MetricCard
            label="Score echec moyen"
            value={
              <span className="text-sm font-semibold text-gray-700">
                {avgFailure !== null
                  ? formatScore(Math.round(avgFailure * 10) / 10)
                  : "--"}
              </span>
            }
          />
          <MetricCard
            label="Conversations"
            value={
              <span className="text-2xl font-bold text-gray-900">
                {conversations.length}
              </span>
            }
          />
        </div>
      </div>

      {/* Tags recurrents */}
      {topTags.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Tags recurrents
          </h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap gap-2">
              {topTags.map((tag) => (
                <span
                  key={tag.label}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-700 text-sm"
                >
                  {tag.label}
                  <span className="bg-green-200 text-green-800 text-xs font-semibold rounded-full px-1.5 py-0.5">
                    {tag.count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Historique des conversations */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Historique des conversations
        </h2>
        <div className="space-y-3">
          {conversations.map((conv) => {
            const TypeIcon = conv.type === "bot" ? Bot : User;
            const tags = convTagMap.get(conv.id) ?? [];
            const convDate = conv.started_at ?? conv.created_at;
            return (
              <Link
                key={conv.id}
                href={`/${workspaceId}/conversations/${conv.id}`}
                className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  {/* Type */}
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                    <TypeIcon className="h-3.5 w-3.5" />
                    {conv.type === "bot" ? "Bot" : "Agent"}
                  </span>

                  {/* Date */}
                  <span className="text-xs text-gray-500">
                    {absoluteDate(convDate)}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({relativeDate(convDate)})
                  </span>

                  {/* Messages */}
                  <span className="text-xs text-gray-500">
                    {conv.message_count} msg
                  </span>

                  {/* Sentiment */}
                  <SentimentBadge score={conv.sentiment_score} />

                  {/* Urgency */}
                  <UrgencyBadge score={conv.urgency_score} />

                  {/* Tags */}
                  {tags.map((label) => (
                    <span
                      key={label}
                      className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700"
                    >
                      {label}
                    </span>
                  ))}

                  {/* Escalated */}
                  {conv.escalated && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700">
                      Transfere
                    </span>
                  )}

                  {/* Scoring status */}
                  {conv.scoring_status && conv.scoring_status !== "scored" && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
                      {conv.scoring_status}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-2">{label}</p>
      <div className="flex items-center">{value}</div>
    </div>
  );
}
