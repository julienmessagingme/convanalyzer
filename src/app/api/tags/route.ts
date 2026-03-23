import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/utils/api-key";

const createTagSchema = z.object({
  workspace_id: z.string().min(1),
  label: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

/**
 * GET /api/tags?workspace_id=xxx
 * Returns all tags for a workspace, ordered by conversation_count desc.
 */
export async function GET(request: Request) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Missing workspace_id query parameter" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("tags")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("conversation_count", { ascending: false });

    if (error) {
      console.error("Error fetching tags:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch tags" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tags: data });
  } catch (err) {
    console.error("Unexpected error in GET /api/tags:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tags
 * Creates a new human tag for a workspace.
 */
export async function POST(request: Request) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Verify workspace exists
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", parsed.data.workspace_id)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: "Unknown workspace_id" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("tags")
      .insert({
        workspace_id: parsed.data.workspace_id,
        label: parsed.data.label,
        description: parsed.data.description ?? null,
        kind: "human",
        conversation_count: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating tag:", error.message);
      return NextResponse.json(
        { error: "Failed to create tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tag: data }, { status: 201 });
  } catch (err) {
    console.error("Unexpected error in POST /api/tags:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
