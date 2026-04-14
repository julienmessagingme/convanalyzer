import { NextRequest, NextResponse } from "next/server";
import { getTagsByFrequency } from "@/lib/supabase/queries";
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

  const tags = await getTagsByFrequency(workspaceId);
  return NextResponse.json({ tags });
}
