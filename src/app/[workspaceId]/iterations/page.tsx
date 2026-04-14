import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import { IterationsClient } from "@/components/iterations/iterations-client";

interface IterationsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function IterationsPage({
  params,
  searchParams,
}: IterationsPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const filters = await searchParams;

  const tab =
    typeof filters.tab === "string" && filters.tab === "agent"
      ? "agent"
      : "bot";
  const period =
    typeof filters.period === "string" ? filters.period : "30d";
  const dateFrom =
    typeof filters.date_from === "string" ? filters.date_from : undefined;
  const dateTo =
    typeof filters.date_to === "string" ? filters.date_to : undefined;

  return (
    <IterationsClient
      workspaceId={workspaceId}
      initialTab={tab as "bot" | "agent"}
      initialPeriod={period}
      initialDateFrom={dateFrom}
      initialDateTo={dateTo}
    />
  );
}
