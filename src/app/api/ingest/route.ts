import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/utils/api-key";
import { webhookPayloadSchema } from "@/lib/parsers/schemas";
import { detectFormat } from "@/lib/parsers/detect";
import { parseFormatA } from "@/lib/parsers/format-a";
import { parseFormatB } from "@/lib/parsers/format-b";
import { parseFormatC } from "@/lib/parsers/format-c";
import { normalizedToMessageRow } from "@/lib/parsers/normalize";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * POST /api/ingest
 *
 * Webhook endpoint for conversation ingestion.
 * Accepts both Format A (agent) and Format B (bot) conversations.
 * Auto-detects format, parses to canonical schema, preserves raw payload,
 * and handles duplicates gracefully via ON CONFLICT DO NOTHING.
 */
export async function POST(request: Request) {
  try {
    // 1. Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Parse JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    // 3. Validate payload with Zod
    const parseResult = webhookPayloadSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const payload = parseResult.data;
    const supabase = createServiceClient();

    // 4. Verify workspace exists
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("id", payload.workspace_id)
      .single();

    if (wsError || !workspace) {
      return NextResponse.json(
        { error: "Unknown workspace_id" },
        { status: 404 }
      );
    }

    // 5. Detect message format
    const format = detectFormat(payload.messages);
    if (format === "unknown") {
      return NextResponse.json(
        { error: "Unknown message format" },
        { status: 400 }
      );
    }

    // 6. Parse messages with appropriate parser
    //    Format C (UChat conversation synthesis) is used for both bot and agent
    //    The conversation_type field in the payload determines the type
    const { normalized, agentId } =
      format === "format-a"
        ? parseFormatA(payload.messages)
        : format === "format-c"
          ? parseFormatC(payload.messages)
          : parseFormatB(payload.messages);

    // 7. Determine conversation type
    //    Priority: explicit conversation_type field > format-based detection
    const conversationType: "agent" | "bot" =
      payload.conversation_type ??
      (format === "format-a" || format === "format-c" ? "agent" : "bot");

    // 8. Determine timestamps from first/last messages
    const timestamps = normalized
      .map((m) => m.timestamp)
      .filter((t): t is string => t !== null);
    const startedAt = timestamps.length > 0 ? timestamps[0] : null;
    const endedAt =
      timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;

    // 9. Upsert conversation (ON CONFLICT DO NOTHING via ignoreDuplicates)
    //    With .select(), returns array: [row] if new, [] if duplicate.
    const { data: upsertData, error: upsertError } = await supabase
      .from("conversations")
      .upsert(
        {
          workspace_id: payload.workspace_id,
          external_id: payload.external_id,
          client_id: payload.client_id,
          type: conversationType,
          agent_id: agentId,
          message_count: normalized.length,
          raw_payload: body,
          started_at: startedAt,
          ended_at: endedAt,
          scoring_status: "pending",
        },
        {
          onConflict: "workspace_id,external_id",
          ignoreDuplicates: true,
        }
      )
      .select();

    if (upsertError) {
      console.error(
        "[POST /api/ingest] Upsert error:",
        upsertError.message
      );
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // 10. Check for duplicate: upsert with ignoreDuplicates + .select()
    //     returns empty array when the row already existed (ON CONFLICT DO NOTHING)
    const upsertRows = upsertData as Record<string, unknown>[] | null;
    const isNew = Array.isArray(upsertRows) && upsertRows.length > 0;

    if (!isNew) {
      // Duplicate -- conversation already existed. Look up existing record.
      const { data: existing } = await supabase
        .from("conversations")
        .select("*")
        .eq("workspace_id", payload.workspace_id)
        .eq("external_id", payload.external_id)
        .single();

      if (existing) {
        return NextResponse.json({
          conversation_id: existing.id,
          message_count: existing.message_count,
          type: existing.type,
          workspace_id: payload.workspace_id,
          duplicate: true,
        });
      }

      // Fallback: something unexpected -- still return success
      return NextResponse.json({
        workspace_id: payload.workspace_id,
        external_id: payload.external_id,
        duplicate: true,
      });
    }

    // 11. New conversation -- get the conversation ID from upsert result
    const conversationId = upsertRows[0].id as string;

    // 12. Batch insert messages
    if (normalized.length > 0) {
      const messageRows = normalized.map((msg) =>
        normalizedToMessageRow(msg, conversationId, payload.workspace_id)
      );

      const { error: msgError } = await supabase.from("messages").insert(messageRows);
      if (msgError) {
        console.error(
          "[POST /api/ingest] Message insert error:",
          msgError.message
        );
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    }

    // 13. Success response
    return NextResponse.json({
      conversation_id: conversationId,
      message_count: normalized.length,
      type: conversationType,
      workspace_id: payload.workspace_id,
    });
  } catch (err) {
    // Catch-all: do NOT leak stack traces
    console.error("[POST /api/ingest] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
