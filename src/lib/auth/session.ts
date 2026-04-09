import "server-only";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySession } from "./jwt";
import { COOKIE_NAME } from "./config";
import type { Session, LocalUserRow, UserRole, AuthType } from "./types";

/**
 * Server-only auth helpers.
 * Uses bcrypt (Node runtime) and the Supabase service client.
 * Do NOT import this from middleware.ts (edge runtime).
 */

/**
 * Reads and verifies the session cookie from the incoming request.
 * Returns null if no cookie or invalid/expired token.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySession(token);
}

/**
 * Returns the session or throws (for server components that require auth).
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthenticated");
  }
  return session;
}

/**
 * Authenticate a local user by email + password.
 * Returns the user row on success, null on any failure (wrong email, wrong
 * password, SSO user, etc).
 */
export async function loginLocal(
  email: string,
  password: string
): Promise<LocalUserRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, password_hash, role, auth_type")
    .eq("email", email.toLowerCase().trim())
    .is("external_hostname", null)
    .eq("auth_type", "local")
    .maybeSingle();

  if (error || !data || !data.password_hash) return null;

  const ok = await bcrypt.compare(password, data.password_hash);
  if (!ok) return null;

  // Fire-and-forget last_login_at update
  void supabase
    .from("users")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", data.id);

  return data as LocalUserRow;
}

/**
 * Upsert an SSO shadow user from proxy headers and return it.
 *
 * A shadow user is identified by (external_hostname, external_id). Uses the
 * partial unique index users_sso_lookup_unique_idx for atomic upsert — no
 * race condition on concurrent first-login requests.
 */
export async function findOrCreateSsoUser(args: {
  externalHostname: string;
  externalId: string;
  email: string;
  role: UserRole;
}): Promise<{ id: string; email: string; role: UserRole; authType: AuthType }> {
  const supabase = createServiceClient();
  const email = args.email.toLowerCase().trim();

  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        email,
        role: args.role,
        auth_type: "sso",
        external_hostname: args.externalHostname,
        external_id: args.externalId,
        last_login_at: new Date().toISOString(),
      },
      {
        onConflict: "external_hostname,external_id",
        ignoreDuplicates: false,
      }
    )
    .select("id, email, role")
    .single();

  if (error || !data) {
    throw new Error(
      `Failed to upsert SSO user: ${error?.message ?? "unknown"}`
    );
  }

  return {
    id: data.id,
    email: data.email,
    role: data.role as UserRole,
    authType: "sso",
  };
}

/**
 * Returns the list of workspaces the session can access.
 *
 * - Admin (local): all active workspaces.
 * - Client (local or SSO): workspaces mapped via user_workspaces, plus the
 *   workspace mapped to their externalHostname if any.
 */
export async function listAccessibleWorkspaces(
  session: Session
): Promise<{ id: string; name: string }[]> {
  const supabase = createServiceClient();

  if (session.role === "admin") {
    const { data } = await supabase
      .from("workspaces")
      .select("id, name")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    return data ?? [];
  }

  // Client: union of explicit grants + hostname-mapped workspace
  const ids = new Set<string>();

  const { data: grants } = await supabase
    .from("user_workspaces")
    .select("workspace_id")
    .eq("user_id", session.userId);
  for (const g of grants ?? []) ids.add(g.workspace_id);

  if (session.externalHostname) {
    const { data: mapped } = await supabase
      .from("workspaces")
      .select("id")
      .eq("hostname", session.externalHostname)
      .maybeSingle();
    if (mapped) ids.add(mapped.id);
  }

  if (ids.size === 0) return [];

  const { data } = await supabase
    .from("workspaces")
    .select("id, name")
    .in("id", Array.from(ids))
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/**
 * Assert the session can read the given workspace. Returns true/false; the
 * caller decides whether to 404 or redirect.
 */
export async function canAccessWorkspace(
  session: Session,
  workspaceId: string
): Promise<boolean> {
  if (session.role === "admin") return true;

  const supabase = createServiceClient();

  // Hostname-mapped shortcut
  if (session.externalHostname) {
    const { data: mapped } = await supabase
      .from("workspaces")
      .select("id")
      .eq("hostname", session.externalHostname)
      .eq("id", workspaceId)
      .maybeSingle();
    if (mapped) return true;
  }

  const { data } = await supabase
    .from("user_workspaces")
    .select("workspace_id")
    .eq("user_id", session.userId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  return !!data;
}

/**
 * Helper to read the session from the incoming request.
 *
 * Tries two sources in order:
 *  1. The `x-ca-session` synthetic header injected by middleware for the
 *     current request (used by SSO on the very first proxied request where
 *     the browser hasn't received the cookie yet).
 *  2. The `ca_session` cookie directly — always present for admin/local
 *     sessions and for returning SSO visits.
 *
 * The two-source strategy exists because Next.js middleware cannot set the
 * request cookies for the current request, only the response cookies.
 */
export async function getSessionFromMiddlewareHeader(): Promise<Session | null> {
  const h = await headers();
  const token = h.get("x-ca-session");
  if (token) {
    const session = await verifySession(token);
    if (session) return session;
  }
  // Fallback: read the cookie directly. Covers the admin flow and returning
  // SSO visits where the browser already holds a valid ca_session cookie.
  return getSession();
}
