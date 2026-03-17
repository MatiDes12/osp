export interface JWTPayload {
  readonly sub: string;
  readonly email: string;
  readonly tenant_id?: string;
  readonly role?: string;
  readonly exp: number;
  readonly display_name?: string;
  readonly user_metadata?: Record<string, unknown>;
}

export function decodeJWT(token: string): JWTPayload | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload)) as JWTPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const decoded = decodeJWT(token);
  if (!decoded) return true;
  return decoded.exp * 1000 < Date.now();
}
