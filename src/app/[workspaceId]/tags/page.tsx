import { ForbiddenPage } from "@/components/ui/forbidden-page";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";
import { TagsClient } from "@/components/tags/tags-client";

interface TagsPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function TagsPage({ params }: TagsPageProps) {
  const session = await getSessionFromMiddlewareHeader();
  if (isRestrictedSession(session)) return <ForbiddenPage />;

  const { workspaceId } = await params;

  return <TagsClient workspaceId={workspaceId} />;
}
