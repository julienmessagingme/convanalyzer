import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/utils/api-key";

const updateTagSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

/**
 * PATCH /api/tags/[tagId]
 * Updates a tag's label and/or description.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tagId } = await params;

    const body = await request.json();
    const parsed = updateTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    if (!parsed.data.label && parsed.data.description === undefined) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("tags")
      .update(parsed.data)
      .eq("id", tagId)
      .select()
      .single();

    if (error) {
      console.error("Error updating tag:", error.message);
      return NextResponse.json(
        { error: "Failed to update tag" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    return NextResponse.json({ tag: data });
  } catch (err) {
    console.error("Unexpected error in PATCH /api/tags/[tagId]:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tags/[tagId]
 * Deletes a tag and cascades to conversation_tags.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ tagId: string }> }
) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { tagId } = await params;
    const supabase = createServiceClient();

    // Delete conversation_tags first (cascade)
    await supabase.from("conversation_tags").delete().eq("tag_id", tagId);

    // Delete the tag
    const { error } = await supabase.from("tags").delete().eq("id", tagId);

    if (error) {
      console.error("Error deleting tag:", error.message);
      return NextResponse.json(
        { error: "Failed to delete tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Unexpected error in DELETE /api/tags/[tagId]:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
