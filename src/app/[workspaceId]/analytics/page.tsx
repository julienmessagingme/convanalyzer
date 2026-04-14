import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import { AnalyticsClient } from "@/components/analytics/analytics-client";

interface AnalyticsPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function AnalyticsPage({ params }: AnalyticsPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;

  return <AnalyticsClient workspaceId={workspaceId} />;
}
