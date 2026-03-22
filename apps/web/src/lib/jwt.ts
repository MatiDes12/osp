export interface JWTPayload {
  readonly sub: string;
  readonly email: string;
  readonly tenant_id?: string;
  readonly role?: string;
  readonly exp: number;
  readonly display_name?: string;
  readonly user_metadata?: Record<string, unknown>;
  /** Supabase may put tenant here in some flows */
  readonly app_metadata?: Record<string, unknown>;
}

export function decodeJWT(token: string): JWTPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    // JWTs use base64url encoding — convert to standard base64 before decoding
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    return JSON.parse(atob(padded)) as JWTPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const decoded = decodeJWT(token);
  if (!decoded) return true;
  return decoded.exp * 1000 < Date.now();
}

/**
 * OSP tenant UUID for the logged-in user. Supabase often stores it under
 * `user_metadata.tenant_id`, not the JWT top level — so we check both.
 */
export function getTenantIdFromAccessToken(token: string | null): string | null {
  if (!token) return null;
  const decoded = decodeJWT(token);
  if (!decoded) return null;
  if (typeof decoded.tenant_id === "string" && decoded.tenant_id.length > 0) {
    return decoded.tenant_id;
  }
  const um = decoded.user_metadata?.["tenant_id"];
  if (typeof um === "string" && um.length > 0) return um;
  const am = decoded.app_metadata?.["tenant_id"];
  if (typeof am === "string" && am.length > 0) return am;
  return null;
}
