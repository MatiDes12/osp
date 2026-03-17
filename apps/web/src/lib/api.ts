import { createOSPClient } from "@osp/shared";
import { logApiCall, logApiResponse, logApiError } from "@/stores/action-log";

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

export const api = createOSPClient({
  baseUrl: process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000",
  getAccessToken: () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("osp_access_token");
  },
  onUnauthorized: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("osp_access_token");
      localStorage.removeItem("osp_refresh_token");
      window.location.href = "/login";
    }
  },
});
