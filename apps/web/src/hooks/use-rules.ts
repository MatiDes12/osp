"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  AlertRule,
  ApiResponse,
  CreateRuleInput,
  UpdateRuleInput,
} from "@osp/shared";
import { transformRule, transformRules, isSnakeCaseRow } from "@/lib/transforms";

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

interface UseRulesReturn {
  readonly rules: readonly AlertRule[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
  readonly createRule: (data: CreateRuleInput) => Promise<AlertRule>;
  readonly updateRule: (
    id: string,
    data: UpdateRuleInput,
  ) => Promise<AlertRule>;
  readonly deleteRule: (id: string) => Promise<void>;
  readonly toggleRule: (id: string, enabled: boolean) => Promise<void>;
}

export function useRules(): UseRulesReturn {
  const [rules, setRules] = useState<readonly AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/rules`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        setRules(transformRules(json.data as Record<string, unknown>[]));
      } else {
        setError(json.error?.message ?? "Failed to fetch rules");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = useCallback(
    async (data: CreateRuleInput): Promise<AlertRule> => {
      const response = await fetch(`${API_URL}/api/v1/rules`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const json = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to create rule");
      }
      const raw = json.data as Record<string, unknown>;
      const rule = isSnakeCaseRow(raw) ? transformRule(raw) : (raw as unknown as AlertRule);
      setRules((prev) => [...prev, rule]);
      return rule;
    },
    [],
  );

  const updateRule = useCallback(
    async (id: string, data: UpdateRuleInput): Promise<AlertRule> => {
      const response = await fetch(`${API_URL}/api/v1/rules/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const json = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to update rule");
      }
      const raw = json.data as Record<string, unknown>;
      const rule = isSnakeCaseRow(raw) ? transformRule(raw) : (raw as unknown as AlertRule);
      setRules((prev) =>
        prev.map((r) => (r.id === id ? rule : r)),
      );
      return rule;
    },
    [],
  );

  const deleteRule = useCallback(
    async (id: string): Promise<void> => {
      const response = await fetch(`${API_URL}/api/v1/rules/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json: ApiResponse<void> = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to delete rule");
      }
      setRules((prev) => prev.filter((r) => r.id !== id));
    },
    [],
  );

  const toggleRule = useCallback(
    async (id: string, enabled: boolean): Promise<void> => {
      // Optimistic update
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled } : r)),
      );

      try {
        const response = await fetch(`${API_URL}/api/v1/rules/${id}`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ enabled }),
        });
        const json: ApiResponse<AlertRule> = await response.json();
        if (!json.success) {
          // Rollback
          setRules((prev) =>
            prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)),
          );
          throw new Error(json.error?.message ?? "Failed to toggle rule");
        }
      } catch (err) {
        setRules((prev) =>
          prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)),
        );
        throw err;
      }
    },
    [],
  );

  return {
    rules,
    loading,
    error,
    refetch: fetchRules,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
  };
}
