import type { ApiResponse } from "@osp/shared/types";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./auth";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

interface RequestOptions {
  readonly method?: string;
  readonly body?: unknown;
  readonly params?: Record<string, string | number | undefined>;
  readonly requiresAuth?: boolean;
}

function buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
  const url = new URL(path, API_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(buildUrl("/api/v1/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      await clearTokens();
      return null;
    }

    const result: ApiResponse<{ accessToken: string; refreshToken: string }> =
      await response.json();

    if (result.success && result.data) {
      await setTokens(result.data.accessToken, result.data.refreshToken);
      return result.data.accessToken;
    }

    await clearTokens();
    return null;
  } catch {
    await clearTokens();
    return null;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = "GET", body, params, requiresAuth = true } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (requiresAuth) {
    const token = await getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const url = buildUrl(path, params);

  let response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && requiresAuth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } else {
      return {
        success: false,
        data: null,
        error: {
          code: "UNAUTHORIZED",
          message: "Session expired. Please log in again.",
          requestId: "",
          timestamp: new Date().toISOString(),
        },
        meta: null,
      };
    }
  }

  return response.json();
}

export const api = {
  get: <T>(path: string, params?: Record<string, string | number | undefined>) =>
    apiRequest<T>(path, { params }),

  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "POST", body }),

  put: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "PUT", body }),

  delete: <T>(path: string) =>
    apiRequest<T>(path, { method: "DELETE" }),
} as const;
