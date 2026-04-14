import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import { VisiteursClient } from "@/components/visiteurs/visiteurs-client";

interface VisiteurPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VisiteurPage({
  params,
  searchParams,
}: VisiteurPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const filters = await searchParams;

  const initialMin = typeof filters.min === "string" ? filters.min : "2";
  const initialOffset = Math.max(
    0,
    parseInt(String(filters.offset ?? "0"), 10) || 0
  );

  return (
    <VisiteursClient
      workspaceId={workspaceId}
      initialMin={initialMin}
      initialOffset={initialOffset}
    />
  );
}
