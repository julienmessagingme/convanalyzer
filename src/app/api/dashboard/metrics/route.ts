import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceMetrics } from "@/lib/supabase/queries";
import { getSessionFromMiddlewareHeader } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const session = await getSessionFromMiddlewareHeader();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const workspaceId = sp.get("workspace_id");
  const dateFrom = sp.get("date_from");
  const dateTo = sp.get("date_to");

  if (!workspaceId || !dateFrom || !dateTo) {
    return NextResponse.json(
      { error: "workspace_id, date_from and date_to are required" },
      { status: 400 }
    );
  }

  const metrics = await getWorkspaceMetrics(workspaceId, dateFrom, dateTo);
  return NextResponse.json(metrics);
}
