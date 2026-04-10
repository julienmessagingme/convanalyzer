import { createServiceClient } from "@/lib/supabase/server";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import type { Tag } from "@/types/database";

interface AnalyticsPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function AnalyticsPage({ params }: AnalyticsPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const supabase = createServiceClient();

  const { data: tags } = await supabase
    .from("tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("label");

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Analytics</h2>
      <AnalyticsDashboard
        workspaceId={workspaceId}
        tags={(tags as Tag[]) ?? []}
      />
    </div>
  );
}
