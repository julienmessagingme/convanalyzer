/**
 * Auth configuration constants read from environment.
 *
 * All env vars are read lazily inside getters so that edge runtime modules
 * can import this file without crashing at build time if a var is missing.
 */

export const COOKIE_NAME = "ca_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days for admin local sessions
export const SSO_TTL_SECONDS = 60 * 60; // 1 hour for SSO shadow sessions (refreshed by proxy)

export const PROXY_HEADER_SECRET = "x-proxy-secret";
export const PROXY_HEADER_EMAIL = "x-user-email";
export const PROXY_HEADER_ID = "x-user-id";
export const PROXY_HEADER_ROLE = "x-user-role";

/**
 * Hostname used for the admin entry point (direct to Vercel).
 * Any other hostname is treated as a client SSO hostname and must pass through
 * the reverse proxy with valid X-Proxy-* headers.
 */
export function getAdminHostname(): string {
  return process.env.ADMIN_HOSTNAME ?? "convanalyzer.messagingme.app";
}

export function getAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing AUTH_SECRET environment variable");
  return new TextEncoder().encode(secret);
}

export function getProxyAuthSecret(): string {
  const secret = process.env.PROXY_AUTH_SECRET;
  if (!secret) throw new Error("Missing PROXY_AUTH_SECRET environment variable");
  return secret;
}
