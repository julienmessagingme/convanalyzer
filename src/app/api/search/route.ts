import { NextRequest, NextResponse } from "next/server";
import { searchConversations } from "@/lib/supabase/search";
import { getTagsByFrequency } from "@/lib/supabase/queries";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";

/**
 * GET /api/search?workspace_id=X&q=terme&mode=combined
 *
 * Returns search results grouped by bot/agent with tags.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromMiddlewareHeader();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isRestrictedSession(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const q = sp.get("q")?.trim();

  if (!workspaceId || !q) {
    return NextResponse.json(
      { error: "workspace_id and q are required" },
      { status: 400 }
    );
  }

  const modeRaw = sp.get("mode");
  const mode: "combined" | "text" | "semantic" =
    modeRaw === "text" || modeRaw === "semantic" ? modeRaw : "combined";

  const [result, allTags] = await Promise.all([
    searchConversations(workspaceId, q, mode),
    getTagsByFrequency(workspaceId),
  ]);

  return NextResponse.json({
    result,
    allTags,
  });
}
