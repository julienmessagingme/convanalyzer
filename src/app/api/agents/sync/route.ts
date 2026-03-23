import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/utils/api-key";

/** Normalized agent shape from UChat API */
interface UchatAgent {
  id: number;
  name: string;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
}

/**
 * Adapter function: Fetches team members from UChat API.
 * Isolated for easy modification when the exact API contract is verified
 * with real data from UChat.
 */
async function fetchUChatTeamMembers(apiKey: string): Promise<UchatAgent[]> {
  const url = "https://ai.messagingme.app/api/team-members";

  // Try Bearer auth first
  let response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  // If Bearer auth fails, try X-API-KEY header as fallback
  if (response.status === 401 || response.status === 403) {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
    });
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "No response body");
    throw new Error(
      `UChat API returned ${response.status}: ${text.substring(0, 200)}`
    );
  }

  const json = await response.json();

  // Normalize response -- adapt this mapping when real API response structure is confirmed
  const members = Array.isArray(json) ? json : json.data ?? json.members ?? [];

  if (!Array.isArray(members)) {
    throw new Error(
      "UChat API returned unexpected format: expected array of team members"
    );
  }

  return members.map(
    (member: Record<string, unknown>): UchatAgent => ({
      id: Number(member.id),
      name: String(member.name ?? member.full_name ?? "Unknown"),
      email: member.email ? String(member.email) : null,
      role: member.role ? String(member.role) : null,
      avatar_url: member.avatar_url
        ? String(member.avatar_url)
        : member.image
          ? String(member.image)
          : member.avatar
            ? String(member.avatar)
            : null,
    })
  );
}

const syncSchema = z.object({
  workspace_id: z.string().min(1),
});

/**
 * POST /api/agents/sync
 * Syncs team members from UChat API into the agents table for a workspace.
 */
export async function POST(request: Request) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = syncSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { workspace_id: workspaceId } = parsed.data;

    console.log("Syncing agents for workspace:", workspaceId);

    // Verify workspace exists and get its API key
    const supabase = createServiceClient();
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("id, uchat_api_key")
      .eq("id", workspaceId)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    if (!workspace.uchat_api_key) {
      return NextResponse.json(
        { error: "Workspace has no UChat API key configured" },
        { status: 400 }
      );
    }

    // Fetch team members from UChat API via adapter
    let agents: UchatAgent[];
    try {
      agents = await fetchUChatTeamMembers(workspace.uchat_api_key);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown UChat API error";
      console.error("UChat API error for workspace", workspaceId, ":", message);
      return NextResponse.json(
        { error: "UChat API error", details: message },
        { status: 502 }
      );
    }

    // Upsert each agent into the agents table scoped by workspace_id
    const now = new Date().toISOString();

    for (const agent of agents) {
      const { error: upsertError } = await supabase.from("agents").upsert(
        {
          id: agent.id,
          workspace_id: workspaceId,
          name: agent.name,
          email: agent.email,
          role: agent.role,
          avatar_url: agent.avatar_url,
          synced_at: now,
        },
        { onConflict: "id,workspace_id" }
      );

      if (upsertError) {
        console.error(
          `Failed to upsert agent ${agent.id}:`,
          upsertError.message
        );
      }
    }

    return NextResponse.json({
      synced_count: agents.length,
      workspace_id: workspaceId,
    });
  } catch (err) {
    console.error("Unexpected error in POST /api/agents/sync:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
