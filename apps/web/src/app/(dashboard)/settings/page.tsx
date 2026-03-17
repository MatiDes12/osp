"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { User, Camera, ApiResponse, UserRole } from "@osp/shared";
import { transformCameras, transformUsers } from "@/lib/transforms";
import {
  Camera as CameraIcon,
  Users,
  Shield,
  HardDrive,
  Puzzle,
  Building2,
  CreditCard,
  Key,
  UserPlus,
  MoreHorizontal,
  Plus,
  Download,
  Trash2,
  Pencil,
  X,
  Check,
  AlertCircle,
} from "lucide-react";

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

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */
type SettingsTab =
  | "cameras"
  | "users"
  | "notifications"
  | "recording"
  | "extensions"
  | "tenant"
  | "billing"
  | "apikeys";

const NAV_ITEMS: readonly {
  key: SettingsTab;
  label: string;
  icon: typeof CameraIcon;
}[] = [
  { key: "cameras", label: "Cameras", icon: CameraIcon },
  { key: "users", label: "Users & Roles", icon: Users },
  { key: "notifications", label: "Notifications", icon: Shield },
  { key: "recording", label: "Recording", icon: HardDrive },
  { key: "extensions", label: "Extensions", icon: Puzzle },
  { key: "tenant", label: "Tenant", icon: Building2 },
  { key: "billing", label: "Billing", icon: CreditCard },
  { key: "apikeys", label: "API Keys", icon: Key },
];

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  admin: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  operator: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  viewer: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const RECORDING_MODES = [
  { value: "motion", label: "Motion-triggered", description: "Record only when motion is detected" },
  { value: "continuous", label: "Continuous", description: "Record 24/7 without interruption" },
  { value: "off", label: "Off", description: "No automatic recording" },
] as const;

const STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  online: { dot: "bg-green-500", text: "text-green-400" },
  offline: { dot: "bg-zinc-600", text: "text-zinc-500" },
  connecting: { dot: "bg-amber-500", text: "text-amber-400" },
  error: { dot: "bg-red-500", text: "text-red-400" },
  disabled: { dot: "bg-zinc-700", text: "text-zinc-600" },
};

interface Extension {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly description: string;
  readonly iconUrl: string | null;
  readonly installs: number;
  readonly installed: boolean;
  readonly version: string;
}

const STUB_EXTENSIONS: readonly Extension[] = [
  {
    id: "1",
    name: "License Plate Recognition",
    author: "OSP Team",
    description: "Automatically detect and log license plates from camera feeds using ML.",
    iconUrl: null,
    installs: 2_340,
    installed: true,
    version: "2.1.0",
  },
  {
    id: "2",
    name: "Face Recognition",
    author: "OSP Team",
    description: "Identify known faces and trigger alerts for unknown persons.",
    iconUrl: null,
    installs: 1_890,
    installed: false,
    version: "1.4.2",
  },
  {
    id: "3",
    name: "Slack Notifications",
    author: "Community",
    description: "Forward alerts and events to Slack channels in real-time.",
    iconUrl: null,
    installs: 3_120,
    installed: true,
    version: "1.0.5",
  },
  {
    id: "4",
    name: "S3 Backup",
    author: "Community",
    description: "Automatically archive recordings to Amazon S3 or compatible storage.",
    iconUrl: null,
    installs: 980,
    installed: false,
    version: "1.2.0",
  },
  {
    id: "5",
    name: "MQTT Bridge",
    author: "Community",
    description: "Publish events to MQTT brokers for smart home integration.",
    iconUrl: null,
    installs: 1_450,
    installed: false,
    version: "0.9.1",
  },
  {
    id: "6",
    name: "Heatmap Analytics",
    author: "OSP Team",
    description: "Generate motion heatmaps for foot traffic analysis and zone optimization.",
    iconUrl: null,
    installs: 760,
    installed: false,
    version: "1.1.0",
  },
];

/* ------------------------------------------------------------------ */
/*  Skeleton loaders                                                   */
/* ------------------------------------------------------------------ */
function TableRowSkeleton({ cols }: { readonly cols: number }) {
  return (
    <tr className="border-b border-zinc-800/50">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function ExtensionCardSkeleton() {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-12 w-12 rounded-lg bg-zinc-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-28 bg-zinc-800 rounded" />
          <div className="h-3 w-20 bg-zinc-800 rounded" />
        </div>
      </div>
      <div className="h-3 w-full bg-zinc-800 rounded mb-2" />
      <div className="h-3 w-3/4 bg-zinc-800 rounded" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toast notification                                                 */
/* ------------------------------------------------------------------ */
function Toast({
  message,
  onClose,
}: {
  readonly message: string;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-4">
      <Check className="h-4 w-4 shrink-0" />
      {message}
      <button
        onClick={onClose}
        className="ml-2 text-green-400/60 hover:text-green-400 transition-colors duration-150 cursor-pointer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("tenant");
  const [toast, setToast] = useState<string | null>(null);

  // Tenant / General state
  const [tenantName, setTenantName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [defaultRecordingMode, setDefaultRecordingMode] = useState<
    "motion" | "continuous" | "off"
  >("motion");
  const [generalSaving, setGeneralSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Dirty tracking for save button
  const initialTenantRef = useRef({ name: "", timezone: "UTC", mode: "motion" });
  const isDirty =
    tenantName !== initialTenantRef.current.name ||
    timezone !== initialTenantRef.current.timezone ||
    defaultRecordingMode !== initialTenantRef.current.mode;

  // Users state
  const [users, setUsers] = useState<readonly User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>("viewer");

  // Cameras state
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [camerasLoading, setCamerasLoading] = useState(false);

  // Extensions state
  const [extTab, setExtTab] = useState<"installed" | "marketplace">("installed");

  // Fetch tenant settings
  useEffect(() => {
    async function fetchSettings() {
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}/api/v1/tenants/current`, {
          headers: getAuthHeaders(),
        });
        const json = await response.json();
        if (json.success && json.data) {
          const raw = json.data as Record<string, unknown>;
          const settings = (raw.settings ?? {}) as Record<string, unknown>;
          const name = (raw.name as string) ?? "";
          const tz = (settings.timezone as string) ?? "UTC";
          const mode = ((settings.default_recording_mode as string) ?? (settings.defaultRecordingMode as string) ?? "motion") as "motion" | "continuous" | "off";
          setTenantName(name);
          setTimezone(tz);
          setDefaultRecordingMode(mode);
          initialTenantRef.current = { name, timezone: tz, mode };
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenants/current/users`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        setUsers(transformUsers(json.data as Record<string, unknown>[]));
      } else {
        setUsersError(json.error?.message ?? "Failed to load users");
      }
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : "Network error");
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // Fetch cameras
  const fetchCameras = useCallback(async () => {
    setCamerasLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/cameras`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        setCameras(transformCameras(json.data as Record<string, unknown>[]));
      }
    } catch {
      // Fail silently
    } finally {
      setCamerasLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "users") fetchUsers();
    if (activeTab === "cameras") fetchCameras();
  }, [activeTab, fetchUsers, fetchCameras]);

  const handleSaveGeneral = useCallback(async () => {
    setGeneralSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenants/current`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: tenantName,
          settings: { timezone, defaultRecordingMode },
        }),
      });
      const json = await response.json();
      if (json.success) {
        initialTenantRef.current = {
          name: tenantName,
          timezone,
          mode: defaultRecordingMode,
        };
        setToast("Settings saved successfully");
      }
    } catch {
      // Error handling
    } finally {
      setGeneralSaving(false);
    }
  }, [tenantName, timezone, defaultRecordingMode]);

  // Unsaved changes warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const filteredExtensions =
    extTab === "installed"
      ? STUB_EXTENSIONS.filter((e) => e.installed)
      : STUB_EXTENSIONS;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-6">
      {/* ── Left nav ──────────────────────────────────────────── */}
      <div className="w-56 shrink-0 bg-zinc-950 border-r border-zinc-800 py-4">
        <nav className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`relative w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 cursor-pointer ${
                  active
                    ? "bg-zinc-900 text-zinc-50"
                    : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300"
                }`}
              >
                {active && (
                  <span className="absolute left-0 inset-y-1 w-0.5 rounded-full bg-blue-500" />
                )}
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Right content ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ── Tenant tab ─────────────────────────────────────── */}
        {activeTab === "tenant" && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-zinc-50 mb-6">
              Organization
            </h2>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-zinc-900 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 space-y-5">
                {/* Tenant name */}
                <div>
                  <label
                    htmlFor="tenant-name"
                    className="block text-sm font-medium text-zinc-300 mb-1.5"
                  >
                    Tenant Name
                  </label>
                  <input
                    id="tenant-name"
                    type="text"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-150"
                    placeholder="Your organization name"
                  />
                </div>

                {/* Timezone */}
                <div>
                  <label
                    htmlFor="timezone"
                    className="block text-sm font-medium text-zinc-300 mb-1.5"
                  >
                    Timezone
                  </label>
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full appearance-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-150 cursor-pointer"
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

                {/* Default recording mode */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">
                    Default Recording Mode
                  </label>
                  <div className="space-y-2">
                    {RECORDING_MODES.map((mode) => (
                      <label
                        key={mode.value}
                        className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors duration-150 ${
                          defaultRecordingMode === mode.value
                            ? "border-blue-500/50 bg-blue-500/5"
                            : "border-zinc-800 hover:border-zinc-700"
                        }`}
                      >
                        <input
                          type="radio"
                          name="recordingMode"
                          value={mode.value}
                          checked={defaultRecordingMode === mode.value}
                          onChange={(e) =>
                            setDefaultRecordingMode(
                              e.target.value as "motion" | "continuous" | "off",
                            )
                          }
                          className="mt-0.5 accent-blue-500"
                        />
                        <div>
                          <span className="text-sm font-medium text-zinc-200">
                            {mode.label}
                          </span>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {mode.description}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Save */}
                <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
                  {isDirty && (
                    <span className="text-xs text-amber-400">
                      Unsaved changes
                    </span>
                  )}
                  <button
                    onClick={handleSaveGeneral}
                    disabled={generalSaving || !isDirty}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {generalSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Users tab ──────────────────────────────────────── */}
        {activeTab === "users" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-zinc-50">
                  Team Members
                </h2>
                <p className="text-sm text-zinc-500 mt-1">
                  Manage who has access to your organization.
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Invite User
              </button>
            </div>

            {usersLoading && (
              <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/80">
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Last Active</th>
                      <th className="px-4 py-3 font-medium w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    <TableRowSkeleton cols={4} />
                    <TableRowSkeleton cols={4} />
                    <TableRowSkeleton cols={4} />
                  </tbody>
                </table>
              </div>
            )}

            {usersError && !usersLoading && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4" />
                  <span className="font-medium">Failed to load users</span>
                </div>
                <p className="text-xs text-red-400/80">{usersError}</p>
                <button
                  onClick={fetchUsers}
                  className="mt-2 text-xs underline hover:no-underline cursor-pointer"
                >
                  Try again
                </button>
              </div>
            )}

            {!usersLoading && !usersError && (
              <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
                {users.length === 0 ? (
                  <div className="py-12 text-center text-zinc-500">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No users found.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/80">
                          <th className="px-4 py-3 font-medium">User</th>
                          <th className="px-4 py-3 font-medium">Role</th>
                          <th className="px-4 py-3 font-medium">Last Active</th>
                          <th className="px-4 py-3 font-medium w-12" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/50">
                        {users.map((user) => (
                          <tr
                            key={user.id}
                            className="hover:bg-zinc-800/30 transition-colors duration-150"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {user.avatarUrl ? (
                                  <img
                                    src={user.avatarUrl}
                                    alt=""
                                    className="h-8 w-8 rounded-full"
                                  />
                                ) : (
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-semibold text-blue-400">
                                    {user.displayName.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-zinc-50">
                                    {user.displayName}
                                  </p>
                                  <p className="text-xs text-zinc-500">
                                    {user.email}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border capitalize ${
                                  ROLE_COLORS[user.role] ??
                                  "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                                }`}
                              >
                                {user.role}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-zinc-500">
                                {user.lastLoginAt
                                  ? new Date(
                                      user.lastLoginAt,
                                    ).toLocaleDateString()
                                  : "Never"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Invite modal */}
            {showInviteModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-md p-6 shadow-xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-zinc-50">
                      Invite Team Member
                    </h3>
                    <button
                      onClick={() => setShowInviteModal(false)}
                      className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="colleague@company.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                        Role
                      </label>
                      <select
                        value={inviteRole}
                        onChange={(e) =>
                          setInviteRole(e.target.value as UserRole)
                        }
                        className="w-full appearance-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      >
                        <option value="viewer">Viewer</option>
                        <option value="operator">Operator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setShowInviteModal(false)}
                        className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          setShowInviteModal(false);
                          setInviteEmail("");
                          setToast("Invitation sent");
                        }}
                        disabled={!inviteEmail}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
                      >
                        Send Invite
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Cameras tab ────────────────────────────────────── */}
        {activeTab === "cameras" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-zinc-50">Cameras</h2>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 cursor-pointer">
                <Plus className="h-3.5 w-3.5" />
                Add Camera
              </button>
            </div>

            <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
              {camerasLoading ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/80">
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Protocol</th>
                      <th className="px-4 py-3 font-medium">Connection</th>
                      <th className="px-4 py-3 font-medium">Last Seen</th>
                      <th className="px-4 py-3 font-medium w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <TableRowSkeleton cols={6} />
                    <TableRowSkeleton cols={6} />
                    <TableRowSkeleton cols={6} />
                  </tbody>
                </table>
              ) : cameras.length === 0 ? (
                <div className="py-12 text-center text-zinc-500">
                  <CameraIcon className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No cameras configured.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/80">
                        <th className="px-4 py-3 font-medium">Name</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Protocol</th>
                        <th className="px-4 py-3 font-medium">Connection</th>
                        <th className="px-4 py-3 font-medium">Last Seen</th>
                        <th className="px-4 py-3 font-medium w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {cameras.map((cam) => {
                        const statusStyle = STATUS_COLORS[cam.status] ?? {
                          dot: "bg-zinc-600",
                          text: "text-zinc-500",
                        };
                        return (
                          <tr
                            key={cam.id}
                            className="hover:bg-zinc-800/30 transition-colors duration-150"
                          >
                            <td className="px-4 py-3 font-medium text-zinc-50">
                              {cam.name}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className={`h-2 w-2 rounded-full ${statusStyle.dot}`}
                                />
                                <span
                                  className={`text-xs capitalize ${statusStyle.text}`}
                                >
                                  {cam.status}
                                </span>
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 uppercase">
                                {cam.protocol}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-zinc-500 max-w-[200px] truncate block">
                                {cam.connectionUri}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-zinc-500">
                                {cam.lastSeenAt
                                  ? new Date(
                                      cam.lastSeenAt,
                                    ).toLocaleString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })
                                  : "Never"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button className="p-1 text-zinc-500 hover:text-red-400 transition-colors duration-150 cursor-pointer">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Extensions tab ─────────────────────────────────── */}
        {activeTab === "extensions" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-zinc-50">Extensions</h2>
              <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
                {(["installed", "marketplace"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setExtTab(tab)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors duration-150 capitalize cursor-pointer ${
                      extTab === tab
                        ? "bg-zinc-800 text-zinc-50"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredExtensions.map((ext) => (
                <div
                  key={ext.id}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 hover:border-zinc-700 transition-colors duration-200"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800">
                      <Puzzle className="h-6 w-6 text-zinc-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-50 truncate">
                        {ext.name}
                      </p>
                      <p className="text-xs text-zinc-500">{ext.author}</p>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 mb-3 line-clamp-2">
                    {ext.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">
                      {ext.installs.toLocaleString()} installs
                    </span>
                    {ext.installed ? (
                      <button className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors duration-150 cursor-pointer">
                        Configure
                      </button>
                    ) : (
                      <button className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 transition-colors duration-150 cursor-pointer">
                        <Download className="h-3 w-3" />
                        Install
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Notifications tab ──────────────────────────────── */}
        {activeTab === "notifications" && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-zinc-50 mb-6">
              Notifications
            </h2>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
              <div className="space-y-4">
                {[
                  {
                    label: "Push Notifications",
                    desc: "Receive alerts on your mobile device",
                  },
                  {
                    label: "Email Notifications",
                    desc: "Get email alerts for critical events",
                  },
                  {
                    label: "Digest Summary",
                    desc: "Daily summary of all events",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        {item.label}
                      </p>
                      <p className="text-xs text-zinc-500">{item.desc}</p>
                    </div>
                    <button
                      className="relative inline-flex h-5 w-9 items-center rounded-full bg-green-500 transition-colors duration-150 cursor-pointer"
                      role="switch"
                      aria-checked={true}
                    >
                      <span className="inline-block h-3.5 w-3.5 translate-x-4 rounded-full bg-white transition-transform duration-150" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Recording tab ──────────────────────────────────── */}
        {activeTab === "recording" && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-zinc-50 mb-6">
              Recording Settings
            </h2>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Retention Period
                </label>
                <select className="w-full appearance-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                  <option>7 days</option>
                  <option>14 days</option>
                  <option>30 days</option>
                  <option>60 days</option>
                  <option>90 days</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Storage Limit
                </label>
                <select className="w-full appearance-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                  <option>50 GB</option>
                  <option>100 GB</option>
                  <option>250 GB</option>
                  <option>500 GB</option>
                  <option>1 TB</option>
                  <option>Unlimited</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Video Quality
                </label>
                <select className="w-full appearance-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer">
                  <option>Original (highest quality)</option>
                  <option>High (1080p)</option>
                  <option>Medium (720p)</option>
                  <option>Low (480p)</option>
                </select>
              </div>
              <div className="pt-2 border-t border-zinc-800">
                <button
                  disabled
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white opacity-40 cursor-not-allowed"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Billing tab ────────────────────────────────────── */}
        {activeTab === "billing" && (
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold text-zinc-50 mb-6">Billing</h2>
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-medium text-zinc-200">
                    Current Plan
                  </p>
                  <p className="text-2xl font-bold text-blue-400 mt-1">Pro</p>
                </div>
                <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 border border-blue-500/20">
                  Active
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 py-4 border-t border-zinc-800">
                <div>
                  <p className="text-xs text-zinc-500">Cameras</p>
                  <p className="text-lg font-semibold text-zinc-50 font-mono">
                    5 / 25
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Storage Used</p>
                  <p className="text-lg font-semibold text-zinc-50 font-mono">
                    42 GB
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Next Billing</p>
                  <p className="text-lg font-semibold text-zinc-50 font-mono">
                    Apr 1
                  </p>
                </div>
              </div>
              <div className="pt-4 border-t border-zinc-800">
                <button className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-150 cursor-pointer">
                  Manage Subscription
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── API Keys tab ───────────────────────────────────── */}
        {activeTab === "apikeys" && (
          <div className="max-w-2xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-zinc-50">API Keys</h2>
                <p className="text-sm text-zinc-500 mt-1">
                  Manage API keys for programmatic access.
                </p>
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 cursor-pointer">
                <Plus className="h-3.5 w-3.5" />
                Create Key
              </button>
            </div>

            <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
              <div className="py-12 text-center text-zinc-500">
                <Key className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No API keys created yet.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Create a key to integrate with the OSP API.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
