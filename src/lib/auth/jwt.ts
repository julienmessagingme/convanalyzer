import { SignJWT, jwtVerify } from "jose";
import {
  getAuthSecret,
  SESSION_TTL_SECONDS,
  SSO_TTL_SECONDS,
} from "./config";
import type { Session } from "./types";

/**
 * Edge-safe JWT helpers.
 * Uses HS256 with AUTH_SECRET. No Node-only deps.
 */

const ALG = "HS256";

type NewSessionPayload = Omit<Session, "iat" | "exp">;

export async function signSession(
  payload: NewSessionPayload,
  ttlSeconds: number = SESSION_TTL_SECONDS
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(getAuthSecret());
}

export async function signSsoSession(
  payload: NewSessionPayload
): Promise<string> {
  return signSession(payload, SSO_TTL_SECONDS);
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), {
      algorithms: [ALG],
    });
    if (
      typeof payload.userId !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.authType !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    return payload as unknown as Session;
  } catch {
    return null;
  }
}
