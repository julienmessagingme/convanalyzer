import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import { ConversationsClient } from "@/components/conversations/conversations-client";

interface ConversationsPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConversationsPage({
  params,
  searchParams,
}: ConversationsPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;
  const raw = await searchParams;

  const tab =
    typeof raw.tab === "string" && raw.tab === "agent" ? "agent" : "bot";
  const page = Math.max(
    1,
    parseInt(String(raw.page ?? "1"), 10) || 1
  );

  // Extract string filters for initial state
  const filterKeys = [
    "date_from",
    "date_to",
    "sentiment",
    "urgency",
    "escalated",
    "tag",
    "sentiment_score",
    "urgency_score",
    "q",
    "mode",
  ];
  const initialFilters: Record<string, string> = {};
  for (const key of filterKeys) {
    const val = raw[key];
    if (typeof val === "string" && val) {
      initialFilters[key] = val;
    }
  }

  return (
    <ConversationsClient
      workspaceId={workspaceId}
      initialTab={tab as "bot" | "agent"}
      initialPage={page}
      initialFilters={initialFilters}
    />
  );
}
