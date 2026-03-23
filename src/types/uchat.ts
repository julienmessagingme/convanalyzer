// Types for raw UChat webhook payloads

export interface WebhookPayload {
  workspace_id: string;
  external_id: string;
  client_id: string;
  messages: unknown[];
}

/** Direction indicator for Format A messages */
export type FormatADirection = "Sent" | "";

/** Format A: agent conversation message object */
export interface FormatAMessageObject {
  type: string;
  agent_id?: number;
  time?: string;
  text?: string;
  url?: string;
}

/** Format B: bot conversation message */
export interface FormatBMessage {
  role: "user" | "assistant";
  content: string;
}
