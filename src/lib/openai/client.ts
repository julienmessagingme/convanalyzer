import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Returns a singleton OpenAI client instance.
 * Throws a clear error if OPENAI_API_KEY is missing.
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY environment variable. Set it in .env.local or Vercel dashboard."
    );
  }

  client = new OpenAI({ apiKey });
  return client;
}
