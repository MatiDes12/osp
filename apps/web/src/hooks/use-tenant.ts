"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  Tenant,
  TenantSettings,
  TenantBranding,
  TenantUsage,
  User,
  ApiResponse,
  InviteUserInput,
} from "@osp/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

// --- useTenant ---

interface UseTenantReturn {
  readonly tenant: Tenant | null;
  readonly loading: boolean;
  readonly updateSettings: (data: Partial<TenantSettings>) => Promise<void>;
  readonly updateBranding: (data: Partial<TenantBranding>) => Promise<void>;
}

export function useTenant(): UseTenantReturn {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTenant = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenant`, {
        headers: getAuthHeaders(),
      });
      const json: ApiResponse<Tenant> = await response.json();
      if (json.success && json.data) {
        setTenant(json.data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTenant();
  }, [fetchTenant]);

  const updateSettings = useCallback(
    async (data: Partial<TenantSettings>): Promise<void> => {
      const response = await fetch(`${API_URL}/api/v1/tenant/settings`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const json: ApiResponse<Tenant> = await response.json();
      if (!json.success || !json.data) {
        throw new Error(
          json.error?.message ?? "Failed to update settings",
        );
      }
      setTenant(json.data);
    },
    [],
  );

  const updateBranding = useCallback(
    async (data: Partial<TenantBranding>): Promise<void> => {
      const response = await fetch(`${API_URL}/api/v1/tenant/branding`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const json: ApiResponse<Tenant> = await response.json();
      if (!json.success || !json.data) {
        throw new Error(
          json.error?.message ?? "Failed to update branding",
        );
      }
      setTenant(json.data);
    },
    [],
  );

  return { tenant, loading, updateSettings, updateBranding };
}

// --- useTenantUsers ---

interface UseTenantUsersReturn {
  readonly users: readonly User[];
  readonly loading: boolean;
  readonly inviteUser: (data: InviteUserInput) => Promise<User>;
  readonly updateRole: (userId: string, role: string) => Promise<void>;
  readonly removeUser: (userId: string) => Promise<void>;
}

export function useTenantUsers(): UseTenantUsersReturn {
  const [users, setUsers] = useState<readonly User[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenant/users`, {
        headers: getAuthHeaders(),
      });
      const json: ApiResponse<User[]> = await response.json();
      if (json.success && json.data) {
        setUsers(json.data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const inviteUser = useCallback(
    async (data: InviteUserInput): Promise<User> => {
      const response = await fetch(
        `${API_URL}/api/v1/tenant/users/invite`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify(data),
        },
      );
      const json: ApiResponse<User> = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to invite user");
      }
      setUsers((prev) => [...prev, json.data!]);
      return json.data;
    },
    [],
  );

  const updateRole = useCallback(
    async (userId: string, role: string): Promise<void> => {
      const response = await fetch(
        `${API_URL}/api/v1/tenant/users/${userId}/role`,
        {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ role }),
        },
      );
      const json: ApiResponse<void> = await response.json();
      if (!json.success) {
        throw new Error(
          json.error?.message ?? "Failed to update user role",
        );
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, role: role as User["role"] } : u,
        ),
      );
    },
    [],
  );

  const removeUser = useCallback(
    async (userId: string): Promise<void> => {
      const response = await fetch(
        `${API_URL}/api/v1/tenant/users/${userId}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        },
      );
      const json: ApiResponse<void> = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to remove user");
      }
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    },
    [],
  );

  return { users, loading, inviteUser, updateRole, removeUser };
}

// --- useTenantUsage ---

interface UseTenantUsageReturn {
  readonly usage: TenantUsage | null;
  readonly loading: boolean;
}

export function useTenantUsage(): UseTenantUsageReturn {
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenant/usage`, {
        headers: getAuthHeaders(),
      });
      const json: ApiResponse<TenantUsage> = await response.json();
      if (json.success && json.data) {
        setUsage(json.data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return { usage, loading };
}
