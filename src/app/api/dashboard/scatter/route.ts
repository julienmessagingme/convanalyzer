import { NextRequest, NextResponse } from "next/server";
import { getConversationsForScatter } from "@/lib/supabase/queries";
import { getSessionFromMiddlewareHeader } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const session = await getSessionFromMiddlewareHeader();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspace_id is required" },
      { status: 400 }
    );
  }

  const conversations = await getConversationsForScatter(workspaceId);
  return NextResponse.json(
    { conversations },
    {
      headers: {
        // Workspace-scoped data: 30s browser cache, 2 min SWR window.
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      },
    }
  );
}
