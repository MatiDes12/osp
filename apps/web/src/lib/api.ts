import { createOSPClient } from "@osp/shared";
import { logApiCall, logApiResponse, logApiError } from "@/stores/action-log";
import { isTokenExpiringSoon } from "@/lib/jwt";

// Wrap fetch to auto-log API requests to the action log panel.
const originalFetch = globalThis.fetch;

const instrumentedFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = init?.method ?? "GET";

  // Only log calls to our API, not Next.js internals.
  const isApiCall =
    url.includes("/api/") || url.includes("/health") || url.includes(":3000");

  if (!isApiCall) {
    return originalFetch(input, init);
  }

  const path = new URL(url, "http://localhost").pathname;
  logApiCall(method, path);

  const start = performance.now();
  try {
    const response = await originalFetch(input, init);
    const duration = Math.round(performance.now() - start);
    logApiResponse(method, path, response.status, duration);
    return response;
  } catch (err) {
    const duration = Math.round(performance.now() - start);
    logApiError(method, path, err instanceof Error ? err.message : String(err));
    logApiResponse(method, path, 0, duration);
    throw err;
  }
};

// Only instrument in browser (not during SSR).
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  globalThis.fetch = instrumentedFetch;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000";

// Auto-refresh token on 401 before redirecting to login
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing) return refreshPromise!;
  const refreshToken = localStorage.getItem("osp_refresh_token");
  if (!refreshToken) return false;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await originalFetch(`${API_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const json = await res.json();
      if (json.data?.accessToken) {
        localStorage.setItem("osp_access_token", json.data.accessToken);
        localStorage.setItem("osp_refresh_token", json.data.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export const api = createOSPClient({
  baseUrl: API_URL,
  getAccessToken: () => {
    if (typeof window === "undefined") return null;
    const token = localStorage.getItem("osp_access_token");
    // Proactively refresh if token expires within 2 minutes
    if (token && isTokenExpiringSoon(token, 120)) {
      tryRefreshToken(); // fire-and-forget, next request will use new token
    }
    return token;
  },
  onUnauthorized: async () => {
    if (typeof window === "undefined") return;
    // Try to refresh before logging out
    const refreshed = await tryRefreshToken();
    if (!refreshed) {
      localStorage.removeItem("osp_access_token");
      localStorage.removeItem("osp_refresh_token");
      window.location.href = "/login";
    }
    // If refreshed, the next request will use the new token automatically
  },
});
