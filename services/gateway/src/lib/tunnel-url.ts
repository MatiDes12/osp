/** Host suffixes for ngrok dev tunnels — always use HTTPS from the gateway to avoid redirect/header edge cases. */
const NGROK_HOST_SUFFIXES = [".ngrok-free.dev", ".ngrok-free.app", ".ngrok.app"];

export function isNgrokTunnelHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return NGROK_HOST_SUFFIXES.some((s) => h.endsWith(s));
}

/**
 * Forces https:// for ngrok tunnel base URLs when stored or fetched as http://.
 * Returns null for null/undefined/empty; invalid URLs are returned trimmed unchanged.
 */
export function normalizeEdgeTunnelUrl(
  url: string | null | undefined,
): string | null {
  if (url == null || !String(url).trim()) return null;
  const trimmed = String(url).trim();
  try {
    const u = new URL(trimmed);
    if (isNgrokTunnelHost(u.hostname) && u.protocol === "http:") {
      u.protocol = "https:";
    }
    // Avoid trailing slash on origin-only URLs — `${base}/api/...` must not become `//api`.
    if (u.pathname === "/" && u.search === "" && u.hash === "") {
      return `${u.protocol}//${u.host}`;
    }
    return u.href;
  } catch {
    return trimmed;
  }
}
