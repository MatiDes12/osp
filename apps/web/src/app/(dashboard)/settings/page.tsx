"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import type { User, Camera, ApiResponse, UserRole } from "@osp/shared";
import { transformCameras, transformUsers } from "@/lib/transforms";
import { showToast } from "@/stores/toast";
import {
  useNotificationPrefsStore,
  type NotificationPrefs,
} from "@/stores/notification-prefs";
import { requestNotificationPermission } from "@/lib/notifications";
import {
  isTauri,
  getAutostartEnabled,
  toggleAutostart,
  showNativeNotification,
} from "@/lib/tauri";
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
  Loader2,
  Bell,
  Clock,
  Monitor,
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
  | "apikeys"
  | "desktop";

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
  { key: "desktop", label: "Desktop App", icon: Monitor },
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

interface MarketplaceExtension {
  readonly id: string;
  readonly name: string;
  readonly author_name: string;
  readonly author_email: string;
  readonly description: string;
  readonly icon_url: string | null;
  readonly install_count: number;
  readonly version: string;
  readonly categories: readonly string[];
  readonly status: string;
  readonly manifest: Record<string, unknown>;
}

interface InstalledExtension {
  readonly id: string;
  readonly extension_id: string;
  readonly enabled: boolean;
  readonly installed_version: string;
  readonly config: Record<string, unknown>;
  readonly installed_at: string;
  readonly extension: MarketplaceExtension;
}

const CATEGORY_COLORS: Record<string, string> = {
  alerts: "bg-red-500/10 text-red-400 border-red-500/20",
  integrations: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  analytics: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  ai: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  security: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  reports: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  storage: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

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
/*  Recording Settings Panel                                           */
/* ------------------------------------------------------------------ */
function RecordingSettingsPanel() {
  const [motionTailSec, setMotionTailSec] = useState<number>(10);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/config/keys/MOTION_TAIL_MS`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.value != null) {
          setMotionTailSec(Math.round(Number(json.data.value) / 1000));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/config/keys/MOTION_TAIL_MS`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ value: String(motionTailSec * 1000), scope: "global" }),
      });
      const json = await res.json();
      if (!json.success) {
        setSaveError(json.error?.message ?? "Failed to save");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-zinc-50 mb-6">Recording Settings</h2>
      <div className="space-y-4">
        {/* Motion recording tail */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
          <h3 className="text-sm font-semibold text-zinc-200 mb-1">Motion Recording Tail</h3>
          <p className="text-xs text-zinc-500 mb-4">
            How long to keep recording after the last motion frame before stopping. Applies to all cameras using motion-triggered recording.
          </p>
          <div className="flex items-center gap-3 mb-1">
            <input
              type="range"
              min={1}
              max={60}
              value={motionTailSec}
              disabled={loading}
              onChange={(e) => setMotionTailSec(Number(e.target.value))}
              className="flex-1 h-1.5 rounded-full appearance-none bg-zinc-700 accent-blue-500 cursor-pointer disabled:opacity-50"
            />
            <span className="text-sm font-mono text-zinc-300 w-14 text-right">{motionTailSec}s</span>
          </div>
          <div className="flex justify-between text-[10px] text-zinc-600 mb-4">
            <span>1s</span>
            <span>60s</span>
          </div>
          {saveError && <p className="text-xs text-red-400 mb-3">{saveError}</p>}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Retention / quality stubs */}
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-zinc-400 mb-1">Storage & Quality</h3>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Retention Period</label>
            <select disabled className="w-full appearance-none rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-500 cursor-not-allowed opacity-60">
              <option>30 days</option>
            </select>
            <p className="text-[10px] text-zinc-600 mt-1">Coming soon</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Storage Limit</label>
            <select disabled className="w-full appearance-none rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-500 cursor-not-allowed opacity-60">
              <option>Unlimited</option>
            </select>
            <p className="text-[10px] text-zinc-600 mt-1">Coming soon</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop App Settings Panel                                         */
/* ------------------------------------------------------------------ */
function DesktopSettingsPanel() {
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(null);
  const [toggling, setToggling] = useState(false);
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    getAutostartEnabled().then(setAutostartEnabled);
  }, []);

  const handleAutostartToggle = async () => {
    setToggling(true);
    try {
      const next = await toggleAutostart();
      setAutostartEnabled(next);
    } finally {
      setToggling(false);
    }
  };

  const handleTestNotification = async () => {
    await showNativeNotification("OSP Test", "Native notifications are working.");
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-50">Desktop App</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Settings specific to the OSP desktop application.
        </p>
      </div>

      {/* Auto-start */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-zinc-100">Start at Login</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Automatically launch OSP when you log in to your computer.
            </p>
          </div>
          <button
            onClick={() => void handleAutostartToggle()}
            disabled={toggling || autostartEnabled === null}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40 ${
              autostartEnabled ? "bg-blue-500" : "bg-zinc-700"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                autostartEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Window behaviour */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-5 space-y-3">
        <p className="text-sm font-medium text-zinc-100">Window Behaviour</p>
        <div className="flex items-start gap-3">
          <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-zinc-300">Minimize to tray on close</p>
            <p className="text-xs text-zinc-500">
              Clicking × hides the window. OSP keeps running in the system tray.
              Right-click the tray icon and choose <span className="text-zinc-300">Quit OSP</span> to exit fully.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-zinc-300">Tray tooltip with live camera count</p>
            <p className="text-xs text-zinc-500">
              Hover the tray icon to see how many cameras are online and how many unread alerts you have.
            </p>
          </div>
        </div>
      </div>

      {/* Native notifications */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-100">Native Notifications</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Event alerts are sent as OS-level notifications instead of browser notifications.
            </p>
          </div>
          <button
            onClick={() => void handleTestNotification()}
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            {testSent ? (
              <><Check className="h-3.5 w-3.5 text-green-400" /> Sent</>
            ) : (
              <><Bell className="h-3.5 w-3.5" /> Test</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete confirmation modal                                          */
/* ------------------------------------------------------------------ */
function ConfirmDeleteModal({
  cameraName,
  onConfirm,
  onCancel,
}: {
  readonly cameraName: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-50">Delete Camera</h3>
            <p className="text-sm text-zinc-500">This action cannot be undone.</p>
          </div>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          Are you sure you want to delete <span className="font-medium text-zinc-200">{cameraName}</span>?
          All associated recordings and events will be permanently removed.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors duration-150 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors duration-150 cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Notifications tab (extracted component)                            */
/* ------------------------------------------------------------------ */

const SEVERITY_OPTIONS: readonly {
  value: NotificationPrefs["severityThreshold"];
  label: string;
  desc: string;
}[] = [
  { value: "all", label: "All Severities", desc: "Low, medium, high, and critical" },
  { value: "high", label: "High & Critical", desc: "Only high and critical events" },
  { value: "critical", label: "Critical Only", desc: "Only critical events" },
];

function NotificationsTab() {
  const prefs = useNotificationPrefsStore();

  const handlePushToggle = async () => {
    if (!prefs.pushEnabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        showToast("Browser notification permission denied", "error");
        return;
      }
    }
    prefs.setPref("pushEnabled", !prefs.pushEnabled);
    showToast(
      !prefs.pushEnabled ? "Push notifications enabled" : "Push notifications disabled",
      "info",
    );
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-zinc-50 mb-6">Notifications</h2>

      {/* ── Toggle switches ── */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 space-y-5">
        {/* Push Notifications */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bell className="h-4 w-4 text-zinc-400" />
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Push Notifications
              </p>
              <p className="text-xs text-zinc-500">
                Receive browser alerts for events
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handlePushToggle()}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150 cursor-pointer ${
              prefs.pushEnabled ? "bg-green-500" : "bg-zinc-700"
            }`}
            role="switch"
            aria-checked={prefs.pushEnabled}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150 ${
                prefs.pushEnabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Email Alerts */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-zinc-400" />
            <div>
              <p className="text-sm font-medium text-zinc-200">Email Alerts</p>
              <p className="text-xs text-zinc-500">
                Get email alerts for events
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => prefs.setPref("emailEnabled", !prefs.emailEnabled)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150 cursor-pointer ${
              prefs.emailEnabled ? "bg-green-500" : "bg-zinc-700"
            }`}
            role="switch"
            aria-checked={prefs.emailEnabled}
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150 ${
                prefs.emailEnabled ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div className="h-px bg-zinc-800" />

        {/* Severity Threshold */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Severity Threshold
          </label>
          <p className="text-xs text-zinc-500 mb-2">
            Only receive notifications for events at or above this severity
          </p>
          <select
            value={prefs.severityThreshold}
            onChange={(e) =>
              prefs.setPref(
                "severityThreshold",
                e.target.value as NotificationPrefs["severityThreshold"],
              )
            }
            className="w-full appearance-none rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            {SEVERITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} &mdash; {opt.desc}
              </option>
            ))}
          </select>
        </div>

        <div className="h-px bg-zinc-800" />

        {/* Quiet Hours */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-zinc-400" />
              <div>
                <p className="text-sm font-medium text-zinc-200">
                  Quiet Hours
                </p>
                <p className="text-xs text-zinc-500">
                  Suppress notifications during this time range
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                prefs.setPref("quietHoursEnabled", !prefs.quietHoursEnabled)
              }
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-150 cursor-pointer ${
                prefs.quietHoursEnabled ? "bg-green-500" : "bg-zinc-700"
              }`}
              role="switch"
              aria-checked={prefs.quietHoursEnabled}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150 ${
                  prefs.quietHoursEnabled ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {prefs.quietHoursEnabled && (
            <div className="flex items-center gap-3 pl-7">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">
                  Start
                </label>
                <input
                  type="time"
                  value={prefs.quietHoursStart}
                  onChange={(e) =>
                    prefs.setPref("quietHoursStart", e.target.value)
                  }
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="text-zinc-500 mt-5">&ndash;</span>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">End</label>
                <input
                  type="time"
                  value={prefs.quietHoursEnd}
                  onChange={(e) =>
                    prefs.setPref("quietHoursEnd", e.target.value)
                  }
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Note about dashboard */}
      <p className="mt-4 text-xs text-zinc-500">
        Note: Dashboard is optimized for dark mode. Theme preferences apply to
        landing and auth pages.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as SettingsTab) ?? "tenant";
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

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

  // Invite state
  const [inviteSaving, setInviteSaving] = useState(false);

  // Camera delete state
  const [deletingCameraId, setDeletingCameraId] = useState<string | null>(null);
  const cameraToDelete = cameras.find((c) => c.id === deletingCameraId);

  // Extensions state
  const [extTab, setExtTab] = useState<"installed" | "marketplace">("marketplace");
  const [marketplaceExts, setMarketplaceExts] = useState<readonly MarketplaceExtension[]>([]);
  const [installedExts, setInstalledExts] = useState<readonly InstalledExtension[]>([]);
  const [extensionsLoading, setExtensionsLoading] = useState(false);
  const [installingExtId, setInstallingExtId] = useState<string | null>(null);

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

  // Fetch marketplace extensions
  const fetchMarketplace = useCallback(async () => {
    setExtensionsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/extensions/marketplace`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        setMarketplaceExts(json.data as MarketplaceExtension[]);
      }
    } catch {
      // Fail silently
    } finally {
      setExtensionsLoading(false);
    }
  }, []);

  // Fetch installed extensions
  const fetchInstalled = useCallback(async () => {
    setExtensionsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/extensions`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        setInstalledExts(json.data as InstalledExtension[]);
      }
    } catch {
      // Fail silently
    } finally {
      setExtensionsLoading(false);
    }
  }, []);

  // Install extension
  const handleInstallExtension = useCallback(async (extensionId: string) => {
    setInstallingExtId(extensionId);
    try {
      const response = await fetch(`${API_URL}/api/v1/extensions`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ extensionId }),
      });
      const json = await response.json();
      if (json.success) {
        showToast("Extension installed successfully", "success");
        fetchInstalled();
        fetchMarketplace();
      } else {
        showToast(json.error?.message ?? "Failed to install extension", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setInstallingExtId(null);
    }
  }, [fetchInstalled, fetchMarketplace]);

  useEffect(() => {
    if (activeTab === "users") fetchUsers();
    if (activeTab === "cameras") fetchCameras();
    if (activeTab === "extensions") {
      fetchMarketplace();
      fetchInstalled();
    }
  }, [activeTab, fetchUsers, fetchCameras, fetchMarketplace, fetchInstalled]);

  const handleSaveGeneral = useCallback(async () => {
    setGeneralSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenants/current`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: tenantName,
          settings: { timezone, default_recording_mode: defaultRecordingMode },
        }),
      });
      const json = await response.json();
      if (json.success) {
        initialTenantRef.current = {
          name: tenantName,
          timezone: timezone,
          mode: defaultRecordingMode,
        };
        showToast("Settings saved successfully", "success");
      } else {
        showToast(json.error?.message ?? "Failed to save settings", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setGeneralSaving(false);
    }
  }, [tenantName, timezone, defaultRecordingMode]);

  const handleInviteUser = useCallback(async () => {
    if (!inviteEmail) return;
    setInviteSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/tenants/current/users/invite`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      const json = await response.json();
      if (json.success) {
        showToast("Invitation sent successfully", "success");
        setShowInviteModal(false);
        setInviteEmail("");
        fetchUsers();
      } else {
        showToast(json.error?.message ?? "Failed to send invite", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setInviteSaving(false);
    }
  }, [inviteEmail, inviteRole, fetchUsers]);

  const handleDeleteCamera = useCallback(async (cameraId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/cameras/${cameraId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success) {
        setCameras((prev) => prev.filter((c) => c.id !== cameraId));
        showToast("Camera deleted successfully", "success");
      } else {
        showToast(json.error?.message ?? "Failed to delete camera", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Network error", "error");
    } finally {
      setDeletingCameraId(null);
    }
  }, []);

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

  const installedExtIds = new Set(installedExts.map((e) => e.extension_id));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-6">
      {/* ── Left nav ──────────────────────────────────────────── */}
      <div className="w-56 shrink-0 bg-zinc-950 border-r border-zinc-800 py-4">
        <nav className="space-y-0.5 px-2">
          {NAV_ITEMS.filter((item) => item.key !== "desktop" || isTauri()).map((item) => {
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
                        onClick={handleInviteUser}
                        disabled={!inviteEmail || inviteSaving}
                        className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors duration-150 disabled:opacity-40 cursor-pointer"
                      >
                        {inviteSaving ? "Sending..." : "Send Invite"}
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
                                <button
                                  onClick={() => setDeletingCameraId(cam.id)}
                                  className="p-1 text-zinc-500 hover:text-red-400 transition-colors duration-150 cursor-pointer"
                                >
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

            {extensionsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <ExtensionCardSkeleton />
                <ExtensionCardSkeleton />
                <ExtensionCardSkeleton />
                <ExtensionCardSkeleton />
                <ExtensionCardSkeleton />
                <ExtensionCardSkeleton />
              </div>
            ) : extTab === "installed" ? (
              installedExts.length === 0 ? (
                <div className="py-12 text-center text-zinc-500">
                  <Puzzle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No extensions installed yet.</p>
                  <p className="text-xs text-zinc-600 mt-1">
                    Browse the marketplace to find extensions.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {installedExts.map((inst) => {
                    const ext = inst.extension;
                    if (!ext) return null;
                    return (
                      <div
                        key={inst.id}
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
                            <p className="text-xs text-zinc-500">{ext.author_name}</p>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-400 mb-2 line-clamp-2">
                          {ext.description}
                        </p>
                        {ext.categories && ext.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {ext.categories.map((cat) => (
                              <span
                                key={cat}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                  CATEGORY_COLORS[cat] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                                }`}
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">
                            v{inst.installed_version}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            inst.enabled
                              ? "bg-green-500/10 text-green-400"
                              : "bg-zinc-500/10 text-zinc-500"
                          }`}>
                            {inst.enabled ? "Active" : "Disabled"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              marketplaceExts.length === 0 ? (
                <div className="py-12 text-center text-zinc-500">
                  <Puzzle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No extensions available.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {marketplaceExts.map((ext) => {
                    const isInstalled = installedExtIds.has(ext.id);
                    const isInstalling = installingExtId === ext.id;
                    return (
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
                            <p className="text-xs text-zinc-500">{ext.author_name}</p>
                          </div>
                        </div>
                        <p className="text-sm text-zinc-400 mb-2 line-clamp-2">
                          {ext.description}
                        </p>
                        {ext.categories && ext.categories.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {ext.categories.map((cat) => (
                              <span
                                key={cat}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                  CATEGORY_COLORS[cat] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                                }`}
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-zinc-500">
                            {ext.install_count.toLocaleString()} installs
                          </span>
                          {isInstalled ? (
                            <span className="inline-flex items-center gap-1 rounded-md border border-green-500/30 px-3 py-1 text-xs text-green-400">
                              <Check className="h-3 w-3" />
                              Installed
                            </span>
                          ) : (
                            <button
                              onClick={() => handleInstallExtension(ext.id)}
                              disabled={isInstalling}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 transition-colors duration-150 cursor-pointer disabled:opacity-50"
                            >
                              {isInstalling ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="h-3 w-3" />
                              )}
                              {isInstalling ? "Installing..." : "Install"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        )}

        {/* ── Notifications tab ──────────────────────────────── */}
        {activeTab === "notifications" && <NotificationsTab />}

        {/* ── Recording tab ──────────────────────────────────── */}
        {activeTab === "recording" && (
          <RecordingSettingsPanel />
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

        {/* ── Desktop App tab ─────────────────────────────────── */}
        {activeTab === "desktop" && <DesktopSettingsPanel />}
      </div>

      {/* Delete camera confirmation */}
      {deletingCameraId && cameraToDelete && (
        <ConfirmDeleteModal
          cameraName={cameraToDelete.name}
          onConfirm={() => handleDeleteCamera(deletingCameraId)}
          onCancel={() => setDeletingCameraId(null)}
        />
      )}
    </div>
  );
}
