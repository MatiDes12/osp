"use client";

import { useState, useEffect, useCallback } from "react";
import type { User, ApiResponse } from "@osp/shared";
import type { LoginResponse } from "@osp/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const ACCESS_TOKEN_KEY = "osp_access_token";
const REFRESH_TOKEN_KEY = "osp_refresh_token";

interface UseAuthReturn {
  readonly user: User | null;
  readonly loading: boolean;
  readonly isAuthenticated: boolean;
  readonly login: (email: string, password: string) => Promise<void>;
  readonly register: (data: {
    email: string;
    password: string;
    displayName: string;
    tenantName: string;
  }) => Promise<void>;
  readonly logout: () => Promise<void>;
}

function storeTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/me`, {
        headers: getAuthHeaders(),
      });

      if (response.status === 401) {
        clearTokens();
        setUser(null);
        return;
      }

      const json: ApiResponse<User> = await response.json();
      if (json.success && json.data) {
        setUser(json.data);
      } else {
        clearTokens();
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json: ApiResponse<LoginResponse> = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Login failed");
      }
      storeTokens(json.data.accessToken, json.data.refreshToken);
      setUser(json.data.user);
    },
    [],
  );

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      displayName: string;
      tenantName: string;
    }): Promise<void> => {
      const response = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json: ApiResponse<LoginResponse> = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Registration failed");
      }
      storeTokens(json.data.accessToken, json.data.refreshToken);
      setUser(json.data.user);
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch(`${API_URL}/api/v1/auth/logout`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
    } catch {
      // Proceed with local cleanup even if server call fails
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  return {
    user,
    loading,
    isAuthenticated: user !== null,
    login,
    register,
    logout,
  };
}
