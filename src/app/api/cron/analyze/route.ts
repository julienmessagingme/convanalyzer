import { NextResponse } from "next/server";
import { runAnalysisPipeline } from "@/lib/analysis/pipeline";
import { validateApiKey } from "@/lib/utils/api-key";

export const maxDuration = 60; // Vercel hobby plan max

/**
 * GET /api/cron/analyze
 * Vercel cron endpoint. Protected by CRON_SECRET Bearer token.
 * Configured in vercel.json: { "crons": [{ "path": "/api/cron/analyze", "schedule": "0 2 * * *" }] }
 */
export async function GET(request: Request) {
  try {
    // Validate CRON_SECRET Bearer token
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runAnalysisPipeline();
    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/analyze] Unexpected error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/analyze
 * Manual trigger for development/testing. Protected by x-api-key header.
 */
export async function POST(request: Request) {
  try {
    if (!validateApiKey(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runAnalysisPipeline();
    return NextResponse.json(result);
  } catch (err) {
    console.error(
      "[cron/analyze] Unexpected error:",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
