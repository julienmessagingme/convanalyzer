import { NextResponse, type NextRequest } from "next/server";
import { signSsoSession, verifySession } from "@/lib/auth/jwt";
import {
  COOKIE_NAME,
  SSO_TTL_SECONDS,
  PROXY_HEADER_SECRET,
  PROXY_HEADER_EMAIL,
  PROXY_HEADER_ID,
  PROXY_HEADER_ROLE,
  getAdminHostname,
  getProxyAuthSecret,
} from "@/lib/auth/config";

/**
 * Edge middleware — protects the app with two auth modes:
 *
 * 1. Admin hostname (convanalyzer.messagingme.app):
 *    - User logs in at /login with email+password (bcrypt compare happens in
 *      the /api/auth/login Node route, NOT here).
 *    - This middleware just checks the `ca_session` cookie and redirects to
 *      /login if missing/invalid.
 *
 * 2. Client hostname (e.g. mieuxassure.messagingme.app):
 *    - Reverse proxy (Nginx auth_request) injects X-User-* and X-Proxy-Secret
 *      headers after validating the user's session on the main site.
 *    - Middleware validates the proxy secret, mints a short-lived JWT, sets
 *      it as the `ca_session` cookie and on a synthetic `x-ca-session` header
 *      for server components to read in the SAME request.
 *    - No login form ever shown on client hostnames.
 *
 * Edge-safe: only uses jose + Web APIs. No bcrypt, no pg.
 *
 * Because we need server components to be able to create SSO shadow users in
 * the DB (which requires the Node runtime), the middleware cannot do that
 * here. Instead, it sets the JWT containing externalHostname+externalId, and
 * the Node-side auth code (session.ts) ensures a shadow user exists on first
 * use.
 *
 * IMPORTANT: the middleware-minted SSO JWT uses a synthetic userId (the
 * external_id prefixed with 'sso:'). The shadow-user upsert replaces this
 * with the real uuid in the cookie on the next proxied request. In practice
 * this means the first request after any SSO refresh hits a server action
 * that calls findOrCreateSsoUser and rewrites the cookie. For simplicity in
 * Phase 3, the landing page and workspace layout call a helper that resolves
 * the real userId from externalHostname+externalId and attaches it.
 */

function ciHeader(req: NextRequest, name: string): string | null {
  return req.headers.get(name);
}

function getHost(req: NextRequest): string {
  // In proxied flows, the reverse proxy sets a custom X-Client-Hostname header
  // because cross-platform chains (Cloudflare → NPM → Vercel) rewrite
  // X-Forwarded-Host to the Host used to route on the innermost platform,
  // which would hide the real client hostname. X-Client-Hostname is a custom
  // header that no platform touches, so it survives the full chain.
  const raw = (
    req.headers.get("x-client-hostname") ??
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    ""
  ).toLowerCase();
  return raw.split(":")[0];
}

// Paths on the admin host that are public (no auth required).
const ADMIN_PUBLIC_PATHS = new Set<string>([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
]);

/**
 * We still defensively check paths inside the handler in case the matcher
 * config drifts, but the primary exclusion happens via the `matcher` at the
 * bottom of this file.
 */
const ALWAYS_PUBLIC_PREFIXES = [
  "/api/ingest",
  "/api/cron/",
];

function isAlwaysPublic(pathname: string): boolean {
  return ALWAYS_PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow webhooks, cron, static assets.
  if (isAlwaysPublic(pathname)) {
    return NextResponse.next();
  }

  const host = getHost(req);
  const adminHost = getAdminHostname();

  // -----------------------------------------------------------
  // Case A: Admin hostname → cookie-based auth
  // -----------------------------------------------------------
  const isAdminHost =
    host === adminHost ||
    host === "localhost" || // dev server (port is stripped by getHost)
    host === "127.0.0.1" ||
    host.endsWith(".vercel.app"); // preview deployments
  if (isAdminHost) {
    // Public admin routes
    if (ADMIN_PUBLIC_PATHS.has(pathname)) {
      return NextResponse.next();
    }

    const token = req.cookies.get(COOKIE_NAME)?.value;
    const session = token ? await verifySession(token) : null;

    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // Pass the raw JWT forward for server components to decode.
    const res = NextResponse.next({
      request: {
        headers: new Headers({
          ...Object.fromEntries(req.headers),
          "x-ca-session": token!,
        }),
      },
    });
    return res;
  }

  // -----------------------------------------------------------
  // Case B: Client hostname (SSO via reverse proxy)
  // -----------------------------------------------------------
  const proxySecret = ciHeader(req, PROXY_HEADER_SECRET);
  const email = ciHeader(req, PROXY_HEADER_EMAIL);
  const externalId = ciHeader(req, PROXY_HEADER_ID);
  const role = ciHeader(req, PROXY_HEADER_ROLE);

  let expectedSecret: string;
  try {
    expectedSecret = getProxyAuthSecret();
  } catch {
    return new NextResponse("Server misconfiguration: PROXY_AUTH_SECRET missing", {
      status: 500,
    });
  }

  if (!proxySecret || proxySecret !== expectedSecret) {
    return new NextResponse("Forbidden: missing or invalid proxy authentication", {
      status: 403,
    });
  }
  if (!email || !externalId) {
    return new NextResponse("Forbidden: missing user identity from proxy", {
      status: 403,
    });
  }

  // Mint a transient SSO session. userId is synthetic until session.ts
  // resolves it to the real DB uuid on the first Node-side call.
  const syntheticUserId = `sso:${host}:${externalId}`;
  const token = await signSsoSession({
    userId: syntheticUserId,
    email: email.toLowerCase(),
    role: role === "admin" ? "client" : "client", // client hostnames cannot grant admin role here
    authType: "sso",
    externalHostname: host,
  });

  const res = NextResponse.next({
    request: {
      headers: new Headers({
        ...Object.fromEntries(req.headers),
        "x-ca-session": token,
      }),
    },
  });

  // Also set the cookie so that subsequent API calls work without relying on
  // the proxy headers being re-forwarded on every request.
  res.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SSO_TTL_SECONDS,
    path: "/",
  });
  return res;
}

export const config = {
  matcher: [
    // Run on everything except:
    // - Next.js static assets
    // - Favicon
    // - Webhook ingestion endpoint (UChat, external callers)
    // - Vercel cron endpoints (protected by CRON_SECRET bearer)
    "/((?!_next/static|_next/image|favicon.ico|api/ingest|api/cron).*)",
  ],
};
