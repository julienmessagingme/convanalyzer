import { timingSafeEqual } from "crypto";

/**
 * Validates the x-api-key header against the INTERNAL_API_KEY env var.
 * Uses timing-safe comparison to prevent timing attacks.
 * Returns false if header or env var is missing.
 */
export function validateApiKey(request: Request): boolean {
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!apiKey || !expectedKey) {
    return false;
  }

  // Encode both keys to Buffer for timing-safe comparison
  const apiKeyBuffer = Buffer.from(apiKey, "utf-8");
  const expectedBuffer = Buffer.from(expectedKey, "utf-8");

  // Prevent length-based timing leak: if lengths differ, compare
  // the provided key against itself (always true) but return false.
  // This ensures constant-time execution regardless of length mismatch.
  if (apiKeyBuffer.length !== expectedBuffer.length) {
    // Still do a comparison to avoid timing leak on length check
    timingSafeEqual(apiKeyBuffer, apiKeyBuffer);
    return false;
  }

  return timingSafeEqual(apiKeyBuffer, expectedBuffer);
}
