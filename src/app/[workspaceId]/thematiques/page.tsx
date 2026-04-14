import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import { ThematiquesClient } from "@/components/thematiques/thematiques-client";

interface ThematiquesPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ThematiquesPage({
  params,
  searchParams,
}: ThematiquesPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const filters = await searchParams;

  const axis =
    typeof filters.axis === "string" && filters.axis === "urgency"
      ? "urgency"
      : "sentiment";

  return (
    <ThematiquesClient workspaceId={workspaceId} initialAxis={axis} />
  );
}
