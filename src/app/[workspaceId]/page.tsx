import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

interface DashboardPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    period?: string;
    date_from?: string;
    date_to?: string;
    matrix_type?: string;
    matrix_q?: string;
    matrix_mode?: string;
  }>;
}

export default async function DashboardPage({
  params,
  searchParams,
}: DashboardPageProps) {
  const { workspaceId } = await params;
  const {
    period = "30d",
    date_from,
    date_to,
    matrix_type,
    matrix_q,
    matrix_mode,
  } = await searchParams;

  const session = await getSessionFromMiddlewareHeader();
  const restricted = isRestrictedSession(session);

  return (
    <DashboardClient
      workspaceId={workspaceId}
      restrictedMode={restricted}
      initialPeriod={restricted ? "7d" : period}
      initialDateFrom={date_from}
      initialDateTo={date_to}
      initialMatrixType={matrix_type}
      initialMatrixQ={matrix_q}
      initialMatrixMode={matrix_mode}
    />
  );
}
