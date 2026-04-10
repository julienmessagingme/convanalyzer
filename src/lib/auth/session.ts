import "server-only";
import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { verifySession } from "./jwt";
import {
  COOKIE_NAME,
  PROXY_HEADER_EMAIL,
  PROXY_HEADER_ID,
  PROXY_HEADER_SECRET,
  SSO_TTL_SECONDS,
  getProxyAuthSecret,
} from "./config";
import type { Session, LocalUserRow, UserRole, AuthType } from "./types";

/**
 * Server-only auth helpers.
 * Uses bcrypt (Node runtime) and the Supabase service client.
 * Do NOT import this from middleware.ts (edge runtime).
 */

/**
 * Hostnames whose SSO client sessions get a restricted UI:
 * only the Dashboard tab and the 7-day period button are accessible.
 *
 * This is ONLY enforced for role === "client" sessions. Admin sessions
 * (role === "admin") are ALWAYS unrestricted, even when browsing via
 * the client subdomain — admins get full access regardless of how they
 * reach the dashboard.
 */
const RESTRICTED_SSO_HOSTNAMES = new Set<string>([
  "mieuxassure.messagingme.app",
]);

/**
 * Returns true if this session should see the restricted UI
 * (Dashboard only, 7 days only). Admin sessions are NEVER restricted.
 */
export function isRestrictedSession(session: Session | null): boolean {
  if (!session) return false;
  if (session.role === "admin") return false;
  if (!session.externalHostname) return false;
  return RESTRICTED_SSO_HOSTNAMES.has(session.externalHostname);
}

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
 * Find or create an SSO shadow user identified by (external_hostname,
 * external_id).
 *
 * Uses a SELECT-then-INSERT/UPDATE pattern rather than PostgREST upsert,
 * because the unique index users_sso_lookup_unique_idx is partial
 * (WHERE external_hostname IS NOT NULL) and PostgREST cannot express the
 * matching ON CONFLICT clause. The race window on concurrent first logins
 * is handled by catching the unique-violation error and re-selecting.
 */
export async function findOrCreateSsoUser(args: {
  externalHostname: string;
  externalId: string;
  email: string;
  role: UserRole;
}): Promise<{ id: string; email: string; role: UserRole; authType: AuthType }> {
  const supabase = createServiceClient();
  const email = args.email.toLowerCase().trim();
  const nowIso = new Date().toISOString();

  // 1. Try to find existing shadow user
  const existing = await supabase
    .from("users")
    .select("id, email, role")
    .eq("external_hostname", args.externalHostname)
    .eq("external_id", args.externalId)
    .maybeSingle();

  if (existing.data) {
    // Fire-and-forget: bump last_login_at + keep email in sync with origin
    void supabase
      .from("users")
      .update({ last_login_at: nowIso, email })
      .eq("id", existing.data.id);
    return {
      id: existing.data.id,
      email: existing.data.email,
      role: existing.data.role as UserRole,
      authType: "sso",
    };
  }

  // 2. Insert a new shadow user
  const inserted = await supabase
    .from("users")
    .insert({
      email,
      role: args.role,
      auth_type: "sso",
      external_hostname: args.externalHostname,
      external_id: args.externalId,
      last_login_at: nowIso,
    })
    .select("id, email, role")
    .single();

  if (inserted.data) {
    return {
      id: inserted.data.id,
      email: inserted.data.email,
      role: inserted.data.role as UserRole,
      authType: "sso",
    };
  }

  // 3. Race: another request inserted between our SELECT and INSERT.
  // Re-select to pick up the winning row.
  if (inserted.error?.code === "23505") {
    const retry = await supabase
      .from("users")
      .select("id, email, role")
      .eq("external_hostname", args.externalHostname)
      .eq("external_id", args.externalId)
      .single();
    if (retry.data) {
      return {
        id: retry.data.id,
        email: retry.data.email,
        role: retry.data.role as UserRole,
        authType: "sso",
      };
    }
  }

  throw new Error(
    `Failed to upsert SSO user: ${inserted.error?.message ?? "unknown"}`
  );
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
 * Tries three sources in order:
 *  1. The `x-ca-session` synthetic header injected by middleware (edge).
 *     Works when Vercel Edge propagates request-header rewrites to the
 *     node runtime server components — which is inconsistent in practice.
 *  2. The `ca_session` cookie directly. Always present for admin local
 *     sessions and for returning SSO visits where the browser already
 *     stored the cookie from a previous response.
 *  3. The raw SSO proxy headers (X-Proxy-Secret + X-User-* + client host).
 *     Covers the *very first* SSO request where the middleware set the
 *     ca_session cookie on the response but the browser has not seen it
 *     yet, so the current request has no cookie. Server components can
 *     still validate the reverse-proxy headers directly because the
 *     shared PROXY_AUTH_SECRET is the true source of trust.
 */
export async function getSessionFromMiddlewareHeader(): Promise<Session | null> {
  const h = await headers();

  // 1. Middleware-injected header
  const token = h.get("x-ca-session");
  if (token) {
    const session = await verifySession(token);
    if (session) return session;
  }

  // 2. Existing browser cookie
  const cookieSession = await getSession();
  if (cookieSession) return cookieSession;

  // 3. Fresh SSO proxy headers (first visit)
  const proxySecret = h.get(PROXY_HEADER_SECRET);
  if (!proxySecret) return null;

  let expectedSecret: string;
  try {
    expectedSecret = getProxyAuthSecret();
  } catch {
    return null;
  }
  if (proxySecret !== expectedSecret) return null;

  const email = h.get(PROXY_HEADER_EMAIL);
  const externalId = h.get(PROXY_HEADER_ID);
  const clientHost = (
    h.get("x-client-hostname") ??
    h.get("x-forwarded-host") ??
    ""
  )
    .toLowerCase()
    .split(":")[0];
  if (!email || !externalId || !clientHost) return null;

  const now = Math.floor(Date.now() / 1000);
  return {
    userId: `sso:${clientHost}:${externalId}`,
    email: email.toLowerCase(),
    role: "client",
    authType: "sso",
    externalHostname: clientHost,
    iat: now,
    exp: now + SSO_TTL_SECONDS,
  };
}
