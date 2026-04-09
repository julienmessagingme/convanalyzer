/**
 * Shared auth types.
 * Session is the decoded JWT payload carried in the `ca_session` cookie.
 */

export type UserRole = "admin" | "client";
export type AuthType = "local" | "sso";

export interface Session {
  userId: string;
  email: string;
  role: UserRole;
  authType: AuthType;
  /** For SSO sessions only: the hostname the user was authenticated on. */
  externalHostname?: string;
  /** Issued-at epoch seconds. */
  iat: number;
  /** Expires-at epoch seconds. */
  exp: number;
}

export interface LocalUserRow {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  auth_type: AuthType;
}
