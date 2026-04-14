import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/utils/api-key";
import { generateKbSuggestions } from "@/lib/analysis/kb-suggester";

/**
 * POST /api/suggestions/generate
 *
 * Triggers KB suggestion generation for a workspace.
 * Protected by x-api-key header (same pattern as ingest route).
 * Accepts { workspace_id: string } in request body.
 */
export async function POST(request: Request) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { workspace_id?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    const count = await generateKbSuggestions(body.workspace_id);

    return NextResponse.json({ success: true, count });
  } catch (err) {
    console.error(
      "[POST /api/suggestions/generate] Unexpected error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
