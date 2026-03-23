import { z } from "zod";

/**
 * Base webhook payload schema.
 * Validates the top-level structure common to both Format A and Format B.
 */
export const webhookPayloadSchema = z.object({
  workspace_id: z.string().min(1),
  external_id: z.string().min(1),
  client_id: z.string().min(1),
  conversation_type: z.enum(["bot", "agent"]).optional(),
  messages: z.array(z.unknown()).min(1),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

/**
 * Format B message schema (bot conversations).
 * Structure: { role: "user" | "assistant", content: string }
 */
export const formatBMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type FormatBMessage = z.infer<typeof formatBMessageSchema>;

/**
 * Format A message object schema (agent conversations).
 * Uses .passthrough() to tolerate unexpected extra fields from UChat.
 */
export const formatAMessageObjectSchema = z
  .object({
    type: z.string().default("text"),
    agent_id: z.number().optional(),
    time: z.string().optional(),
    text: z.string().default(""),
    url: z.string().optional(),
  })
  .passthrough();

export type FormatAMessageObject = z.infer<typeof formatAMessageObjectSchema>;
