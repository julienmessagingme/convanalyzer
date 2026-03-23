import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/utils/api-key";

const assignTagSchema = z.object({
  tag_id: z.string().uuid(),
});

const removeTagSchema = z.object({
  tag_id: z.string().uuid(),
});

/**
 * POST /api/conversations/[convId]/tags
 * Manually assign a tag to a conversation (assigned_by='human').
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ convId: string }> }
) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { convId } = await params;

    const body = await request.json();
    const parsed = assignTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Verify conversation exists
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", convId)
      .single();

    if (convError || !conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    // Verify tag exists
    const { data: tag, error: tagError } = await supabase
      .from("tags")
      .select("id, conversation_count")
      .eq("id", parsed.data.tag_id)
      .single();

    if (tagError || !tag) {
      return NextResponse.json(
        { error: "Tag not found" },
        { status: 404 }
      );
    }

    // Insert conversation_tag (upsert to avoid duplicates)
    const { data, error } = await supabase
      .from("conversation_tags")
      .upsert(
        {
          conversation_id: convId,
          tag_id: parsed.data.tag_id,
          assigned_by: "human",
          confidence: null,
        },
        { onConflict: "conversation_id,tag_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error assigning tag:", error.message);
      return NextResponse.json(
        { error: "Failed to assign tag" },
        { status: 500 }
      );
    }

    // Increment conversation_count on the tag
    await supabase
      .from("tags")
      .update({
        conversation_count: (tag.conversation_count as number) + 1,
      })
      .eq("id", parsed.data.tag_id);

    return NextResponse.json({ conversation_tag: data }, { status: 201 });
  } catch (err) {
    console.error(
      "Unexpected error in POST /api/conversations/[convId]/tags:",
      err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/conversations/[convId]/tags
 * Remove a manual tag assignment from a conversation.
 * Expects JSON body with { tag_id }.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ convId: string }> }
) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { convId } = await params;

    const body = await request.json();
    const parsed = removeTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Get current count before deleting
    const { data: tag } = await supabase
      .from("tags")
      .select("id, conversation_count")
      .eq("id", parsed.data.tag_id)
      .single();

    // Delete the assignment
    const { error } = await supabase
      .from("conversation_tags")
      .delete()
      .eq("conversation_id", convId)
      .eq("tag_id", parsed.data.tag_id);

    if (error) {
      console.error("Error removing tag assignment:", error.message);
      return NextResponse.json(
        { error: "Failed to remove tag assignment" },
        { status: 500 }
      );
    }

    // Decrement conversation_count on the tag
    if (tag && (tag.conversation_count as number) > 0) {
      await supabase
        .from("tags")
        .update({
          conversation_count: (tag.conversation_count as number) - 1,
        })
        .eq("id", parsed.data.tag_id);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(
      "Unexpected error in DELETE /api/conversations/[convId]/tags:",
      err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
