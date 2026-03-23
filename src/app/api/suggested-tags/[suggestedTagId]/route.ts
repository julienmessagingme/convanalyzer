import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { validateApiKey } from "@/lib/utils/api-key";

const updateSchema = z.object({
  status: z.enum(["accepted", "rejected"]),
});

/**
 * PATCH /api/suggested-tags/[suggestedTagId]
 * Updates a suggested tag's status to 'accepted' or 'rejected'.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ suggestedTagId: string }> }
) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { suggestedTagId } = await params;

    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("suggested_tags")
      .update({ status: parsed.data.status })
      .eq("id", suggestedTagId)
      .select()
      .single();

    if (error) {
      console.error("Error updating suggested tag:", error.message);
      return NextResponse.json(
        { error: "Failed to update suggested tag" },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "Suggested tag not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ suggestedTag: data });
  } catch (err) {
    console.error(
      "Unexpected error in PATCH /api/suggested-tags/[suggestedTagId]:",
      err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
