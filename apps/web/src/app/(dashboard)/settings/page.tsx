"use client";

import { useState, useEffect, useCallback } from "react";
import type { User, ApiResponse } from "@osp/shared";

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

type SettingsTab = "general" | "users" | "branding";

const RECORDING_MODES = [
  { value: "motion", label: "Motion-triggered" },
  { value: "continuous", label: "Continuous" },
  { value: "off", label: "Off" },
] as const;

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-purple-500/10 text-purple-400",
  admin: "bg-blue-500/10 text-blue-400",
  operator: "bg-green-500/10 text-green-400",
  viewer: "bg-gray-500/10 text-gray-400",
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  // General settings state
  const [tenantName, setTenantName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [defaultRecordingMode, setDefaultRecordingMode] = useState<
    "motion" | "continuous" | "off"
  >("motion");
  const [generalSaving, setGeneralSaving] = useState(false);
  const [generalSuccess, setGeneralSuccess] = useState(false);

  // Users state
  const [users, setUsers] = useState<readonly User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  // Fetch tenant settings
  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/v1/tenant`, {
          headers: getAuthHeaders(),
        });
        const json = await response.json();
        if (json.success && json.data) {
          setTenantName(json.data.name ?? "");
          setTimezone(json.data.settings?.timezone ?? "UTC");
          setDefaultRecordingMode(
            json.data.settings?.defaultRecordingMode ?? "motion",
          );
        }
      } catch {
        // Use defaults if fetch fails
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  // Fetch users when tab switches
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/users`, {
        headers: getAuthHeaders(),
      });
      const json: ApiResponse<User[]> = await response.json();
      if (json.success && json.data) {
        setUsers(json.data);
      } else {
        setUsersError(json.error?.message ?? "Failed to load users");
      }
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "users") {
      fetchUsers();
    }
  }, [activeTab, fetchUsers]);

  const handleSaveGeneral = useCallback(async () => {
    setGeneralSaving(true);
    setGeneralSuccess(false);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenant`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: tenantName,
          settings: {
            timezone,
            defaultRecordingMode,
          },
        }),
      });
      const json = await response.json();
      if (json.success) {
        setGeneralSuccess(true);
        setTimeout(() => setGeneralSuccess(false), 3000);
      }
    } catch {
      // Show nothing special for now
    } finally {
      setGeneralSaving(false);
    }
  }, [tenantName, timezone, defaultRecordingMode]);

  const tabs: readonly { key: SettingsTab; label: string }[] = [
    { key: "general", label: "General" },
    { key: "users", label: "Users" },
    { key: "branding", label: "Branding" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-[var(--color-border)] mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-[var(--color-primary)] text-[var(--color-fg)]"
                : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-fg)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* General Tab */}
      {activeTab === "general" && (
        <div className="max-w-xl space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-[var(--color-muted)]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
              <span className="ml-3 text-sm">Loading settings...</span>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="tenant-name" className="block text-sm font-medium mb-1">
                  Organization Name
                </label>
                <input
                  id="tenant-name"
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label htmlFor="timezone" className="block text-sm font-medium mb-1">
                  Timezone
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Berlin">Berlin</option>
                  <option value="Europe/Paris">Paris</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                  <option value="Asia/Shanghai">Shanghai</option>
                  <option value="Australia/Sydney">Sydney</option>
                </select>
              </div>

              <div>
                <label htmlFor="recording-mode" className="block text-sm font-medium mb-1">
                  Default Recording Mode
                </label>
                <select
                  id="recording-mode"
                  value={defaultRecordingMode}
                  onChange={(e) =>
                    setDefaultRecordingMode(e.target.value as "motion" | "continuous" | "off")
                  }
                  className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                >
                  {RECORDING_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveGeneral}
                  disabled={generalSaving}
                  className="px-4 py-2 text-sm rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50"
                >
                  {generalSaving ? "Saving..." : "Save Changes"}
                </button>
                {generalSuccess && (
                  <span className="text-sm text-[var(--color-success)]">Settings saved.</span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Users Tab */}
      {activeTab === "users" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-muted)]">
              Manage who has access to your organization.
            </p>
            <button className="px-4 py-2 text-sm rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors">
              Invite User
            </button>
          </div>

          {usersLoading && (
            <div className="flex items-center justify-center py-12 text-[var(--color-muted)]">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
              <span className="ml-3 text-sm">Loading users...</span>
            </div>
          )}

          {usersError && !usersLoading && (
            <div className="rounded-md border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-4 text-sm text-[var(--color-error)]">
              <p>{usersError}</p>
              <button onClick={fetchUsers} className="mt-2 text-xs underline hover:no-underline">
                Try again
              </button>
            </div>
          )}

          {!usersLoading && !usersError && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
              {users.length === 0 ? (
                <div className="py-12 text-center text-[var(--color-muted)]">
                  <p className="text-sm">No users found.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[var(--color-muted)] border-b border-[var(--color-border)] bg-[var(--color-bg)]">
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Email</th>
                        <th className="px-4 py-3">Role</th>
                        <th className="px-4 py-3">Last Login</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {users.map((user) => (
                        <tr key={user.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center text-xs font-medium text-[var(--color-primary)]">
                                {user.displayName.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium">{user.displayName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted)]">{user.email}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded capitalize ${
                                ROLE_COLORS[user.role] ?? "bg-gray-500/10 text-gray-400"
                              }`}
                            >
                              {user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[var(--color-muted)]">
                            {user.lastLoginAt
                              ? new Date(user.lastLoginAt).toLocaleDateString()
                              : "Never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Branding Tab */}
      {activeTab === "branding" && (
        <div className="max-w-xl">
          <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-card)] p-8 text-center">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-[var(--color-muted)] opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
              />
            </svg>
            <h3 className="text-sm font-medium mb-1">Branding Customization</h3>
            <p className="text-sm text-[var(--color-muted)]">
              Custom logo, colors, and fonts. Available on Business and Enterprise plans.
            </p>
            <button className="mt-4 px-4 py-2 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors">
              Upgrade Plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
