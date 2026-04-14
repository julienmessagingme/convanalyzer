import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import { SearchClient } from "@/components/search/search-client";

interface SearchPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SearchPage({
  params,
  searchParams,
}: SearchPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const filters = await searchParams;

  const query = typeof filters.q === "string" ? filters.q.trim() : "";
  const mode =
    typeof filters.mode === "string" &&
    ["text", "semantic", "combined"].includes(filters.mode)
      ? (filters.mode as "text" | "semantic" | "combined")
      : "combined";
  const tab =
    typeof filters.tab === "string" && filters.tab === "agent"
      ? "agent"
      : "bot";

  return (
    <SearchClient
      workspaceId={workspaceId}
      initialQuery={query}
      initialMode={mode}
      initialTab={tab}
    />
  );
}
