import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getSessionFromMiddlewareHeader,
  isRestrictedSession,
} from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const session = await getSessionFromMiddlewareHeader();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isRestrictedSession(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

  const supabase = createServiceClient();

  const [{ data: tags }, { data: suggested }] = await Promise.all([
    supabase
      .from("tags")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("conversation_count", { ascending: false }),
    supabase
      .from("suggested_tags")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .order("source_conversation_count", { ascending: false }),
  ]);

  return NextResponse.json({ tags: tags ?? [], suggestedTags: suggested ?? [] });
}
