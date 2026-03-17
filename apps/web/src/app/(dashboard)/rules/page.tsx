"use client";

import { useState, useEffect, useCallback } from "react";
import type { AlertRule, ApiResponse } from "@osp/shared";

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

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "Never";
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  motion: "Motion",
  person: "Person Detected",
  vehicle: "Vehicle Detected",
  animal: "Animal Detected",
  camera_offline: "Camera Offline",
  camera_online: "Camera Online",
  tampering: "Tampering",
  audio: "Audio Event",
  custom: "Custom",
};

export default function RulesPage() {
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
      const json: ApiResponse<AlertRule[]> = await response.json();
      if (json.success && json.data) {
        setRules(json.data);
      } else {
        setError(json.error?.message ?? "Failed to load rules");
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

  const handleToggleEnabled = useCallback(
    async (ruleId: string, currentEnabled: boolean) => {
      try {
        const response = await fetch(`${API_URL}/api/v1/rules/${ruleId}`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ enabled: !currentEnabled }),
        });
        const json: ApiResponse<AlertRule> = await response.json();
        if (json.success) {
          setRules((prev) =>
            prev.map((r) => (r.id === ruleId ? { ...r, enabled: !currentEnabled } : r)),
          );
        }
      } catch {
        // User can retry by toggling again
      }
    },
    [],
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Alert Rules</h1>
        <button className="px-4 py-2 text-sm rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors">
          Create Rule
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
          <span className="ml-3 text-sm">Loading rules...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4 text-sm text-[var(--color-error)]">
          <p className="font-medium mb-1">Failed to load rules</p>
          <p className="text-xs opacity-80">{error}</p>
          <button onClick={fetchRules} className="mt-2 text-xs underline hover:no-underline">
            Try again
          </button>
        </div>
      )}

      {/* Rules list */}
      {!loading && !error && (
        <>
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-[var(--color-muted)]">
              <svg
                className="w-16 h-16 mb-4 opacity-30"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <p className="text-lg font-medium mb-1">No alert rules</p>
              <p className="text-sm">Create your first rule to get notified about events.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{rule.name}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
                        {EVENT_TYPE_LABELS[rule.triggerEvent] ?? rule.triggerEvent}
                      </span>
                      {rule.priority > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">
                          Priority {rule.priority}
                        </span>
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-[var(--color-muted)]">{rule.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
                      <span>Last triggered: {formatRelativeTime(rule.lastTriggeredAt)}</span>
                      <span>24h triggers: {rule.triggerCount24h}</span>
                      <span>Actions: {rule.actions.length}</span>
                      <span>Cooldown: {rule.cooldownSec}s</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggleEnabled(rule.id, rule.enabled)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        rule.enabled ? "bg-[var(--color-success)]" : "bg-gray-600"
                      }`}
                      role="switch"
                      aria-checked={rule.enabled}
                      aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          rule.enabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
