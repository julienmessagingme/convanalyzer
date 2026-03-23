import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/utils/api-key";

const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  uchat_api_key: z.string().optional(),
  channel: z.string().default("whatsapp"),
});

/**
 * GET /api/workspaces
 * Returns all active workspaces WITHOUT uchat_api_key (security).
 */
export async function GET(request: Request) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, channel, is_active, created_at")
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching workspaces:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch workspaces" },
        { status: 500 }
      );
    }

    return NextResponse.json({ workspaces: data });
  } catch (err) {
    console.error("Unexpected error in GET /api/workspaces:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/workspaces
 * Creates or updates a workspace via upsert on id.
 * Never returns uchat_api_key in the response.
 */
export async function POST(request: Request) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = workspaceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("workspaces")
      .upsert(parsed.data, { onConflict: "id" })
      .select("id, name, channel, is_active, created_at")
      .single();

    if (error) {
      console.error("Error upserting workspace:", error.message);
      return NextResponse.json(
        { error: "Failed to create/update workspace" },
        { status: 500 }
      );
    }

    return NextResponse.json({ workspace: data });
  } catch (err) {
    console.error("Unexpected error in POST /api/workspaces:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
