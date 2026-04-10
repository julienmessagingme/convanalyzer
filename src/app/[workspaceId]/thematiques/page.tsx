import { getConversationsForScatter } from "@/lib/supabase/queries";
import { ThematiquesTabs } from "@/components/thematiques/thematiques-tabs";
import { LevelCard } from "@/components/thematiques/level-card";
import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";

interface ThematiquesPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type ConvWithTags = Awaited<
  ReturnType<typeof getConversationsForScatter>
>[number];

interface TagDistribution {
  id: string;
  label: string;
  count: number;
  percentage: number;
}

interface LevelBucket {
  level: number;
  total: number;
  tags: TagDistribution[];
}

const SENTIMENT_LEVELS = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const URGENCY_LEVELS = [5, 4, 3, 2, 1, 0];

function buildDistribution(
  conversations: ConvWithTags[],
  getLevel: (c: ConvWithTags) => number | null,
  levels: number[]
): LevelBucket[] {
  const byLevel = new Map<
    number,
    {
      total: number;
      tagCounts: Map<string, { label: string; count: number }>;
    }
  >();
  for (const level of levels) {
    byLevel.set(level, { total: 0, tagCounts: new Map() });
  }

  for (const c of conversations) {
    const lvl = getLevel(c);
    if (lvl == null) continue;
    const bucket = byLevel.get(lvl);
    if (!bucket) continue;
    bucket.total++;
    for (const tag of c.tags) {
      const existing =
        bucket.tagCounts.get(tag.id) ?? { label: tag.label, count: 0 };
      existing.count++;
      bucket.tagCounts.set(tag.id, existing);
    }
  }

  return levels.map((level) => {
    const bucket = byLevel.get(level)!;
    const tags: TagDistribution[] = Array.from(bucket.tagCounts.entries())
      .map(([id, data]) => ({
        id,
        label: data.label,
        count: data.count,
        percentage:
          bucket.total > 0
            ? Math.round((data.count / bucket.total) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.percentage - a.percentage);
    return { level, total: bucket.total, tags };
  });
}

export default async function ThematiquesPage({
  params,
  searchParams,
}: ThematiquesPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const filters = await searchParams;

  const axis: "sentiment" | "urgency" =
    typeof filters.axis === "string" && filters.axis === "urgency"
      ? "urgency"
      : "sentiment";

  const conversations = await getConversationsForScatter(workspaceId);

  const getLevel =
    axis === "sentiment"
      ? (c: ConvWithTags) => c.sentiment_score ?? null
      : (c: ConvWithTags) => c.urgency_score ?? null;

  const levels = axis === "sentiment" ? SENTIMENT_LEVELS : URGENCY_LEVELS;
  const buckets = buildDistribution(conversations, getLevel, levels);

  const totalScored = buckets.reduce((sum, b) => sum + b.total, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Thematiques</h1>
        <p className="text-sm text-gray-500 mt-1">
          Distribution des themes par niveau de{" "}
          {axis === "sentiment" ? "sentiment" : "urgence"}.{" "}
          {totalScored} conversations analysees.
        </p>
      </div>

      <ThematiquesTabs activeAxis={axis} workspaceId={workspaceId} />

      <div className="rounded-md bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-900">
        Les pourcentages indiquent la part des conversations a ce niveau
        marquees avec le theme. Les barres ne somment pas a 100% car certaines
        conversations n&apos;ont pas de tag et une conversation peut avoir
        jusqu&apos;a 2 tags.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {buckets.map((bucket) => (
          <LevelCard
            key={bucket.level}
            level={bucket.level}
            total={bucket.total}
            tags={bucket.tags}
            axis={axis}
            workspaceId={workspaceId}
          />
        ))}
      </div>
    </div>
  );
}
