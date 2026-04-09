import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/workspaces/[workspaceId]
 * Admin-only: update hostname for SSO routing.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const session = await getSession();
  if (!session || session.role !== "admin" || session.authType !== "local") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { workspaceId } = await params;

  let body: { hostname?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hostnameRaw = body.hostname;
  if (hostnameRaw !== null && typeof hostnameRaw !== "string") {
    return NextResponse.json(
      { error: "hostname doit être une chaîne ou null" },
      { status: 400 }
    );
  }

  const hostname =
    hostnameRaw === null ? null : hostnameRaw.trim().toLowerCase();

  if (hostname !== null) {
    // Basic hostname validation
    const hostnameRegex =
      /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
    if (!hostnameRegex.test(hostname)) {
      return NextResponse.json(
        { error: "Hostname invalide (ex: client.messagingme.app)" },
        { status: 400 }
      );
    }
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("workspaces")
    .update({ hostname })
    .eq("id", workspaceId);

  if (error) {
    // Unique violation most likely
    return NextResponse.json(
      { error: error.message.includes("duplicate") ? "Hostname déjà utilisé" : error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, hostname });
}
