import { NextRequest, NextResponse } from "next/server";
import { searchConversations } from "@/lib/supabase/search";
import { getSessionFromMiddlewareHeader } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const session = await getSessionFromMiddlewareHeader();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const q = sp.get("q");
  const modeRaw = sp.get("mode");

  if (!workspaceId || !q) {
    return NextResponse.json(
      { error: "workspace_id and q are required" },
      { status: 400 }
    );
  }

  const mode: "combined" | "text" | "semantic" =
    modeRaw === "text" || modeRaw === "semantic" ? modeRaw : "combined";

  const result = await searchConversations(workspaceId, q, mode);
  const matchIds: string[] = [];
  for (const m of result.groups.bot.conversations) {
    matchIds.push(m.conversation.id);
  }
  for (const m of result.groups.agent.conversations) {
    matchIds.push(m.conversation.id);
  }

  return NextResponse.json({ matchIds });
}
