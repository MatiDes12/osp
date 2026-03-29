"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
  getLocalNgrokAuthtoken,
  setLocalNgrokAuthtoken,
  clearLocalNgrokAuthtoken,
  NGROK_AUTHTOKEN_MIN_LEN,
  NGROK_AUTHTOKEN_DASHBOARD_URL,
} from "@/lib/local-agent-credentials";
import {
  getUseMeteredTurn,
  setUseMeteredTurn,
} from "@/lib/webrtc-prefs";
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
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Bell,
  Clock,
  Monitor,
  Copy,
  Eye,
  EyeOff,
  LogIn,
  Globe,
  ChevronDown,
  ChevronUp,
  Server,
  Wifi,
  WifiOff,
  RefreshCw,
  ExternalLink,
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
  | "desktop"
  | "sso"
  | "lpr"
  | "edge"
  | "config";

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
  { key: "sso", label: "SSO / Identity", icon: LogIn },
  { key: "lpr", label: "License Plates", icon: AlertCircle },
  { key: "edge", label: "Edge Agents", icon: Server },
  { key: "config", label: "Config & Secrets", icon: Globe },
  { key: "desktop", label: "Desktop App", icon: Monitor },
];

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  admin: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  operator: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  viewer: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const RECORDING_MODES = [
  {
    value: "motion",
    label: "Motion-triggered",
    description: "Record only when motion is detected",
  },
  {
    value: "continuous",
    label: "Continuous",
    description: "Record 24/7 without interruption",
  },
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

interface ApiKey {
  readonly id: string;
  readonly name: string;
  readonly key_prefix: string;
  readonly last_used_at: string | null;
  readonly expires_at: string | null;
  readonly created_at: string;
}

interface UsageStats {
  plan: string;
  cameras: { used: number; limit: number };
  users: { used: number; limit: number };
  storage: { usedBytes: number; limitBytes: number };
  extensions: { used: number; limit: number };
  recordings: { totalCount: number; totalDurationHours: number };
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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

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
    fetch(`${API_URL}/api/v1/config/keys/MOTION_TAIL_MS`, {
      headers: getAuthHeaders(),
    })
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
        body: JSON.stringify({
          value: String(motionTailSec * 1000),
          scope: "global",
        }),
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
      <h2 className="text-xl font-bold text-zinc-50 mb-6">
        Recording Settings
      </h2>
      <div className="space-y-4">
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
          <h3 className="text-sm font-semibold text-zinc-200 mb-1">
            Motion Recording Tail
          </h3>
          <p className="text-xs text-zinc-500 mb-4">
            How long to keep recording after the last motion frame before
            stopping.
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
            <span className="text-sm font-mono text-zinc-300 w-14 text-right">
              {motionTailSec}s
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-zinc-600 mb-4">
            <span>1s</span>
            <span>60s</span>
          </div>
          {saveError && (
            <p className="text-xs text-red-400 mb-3">{saveError}</p>
          )}
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {saved ? "Saved!" : saving ? "Saving..." : "Save"}
          </button>
        </div>

        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 space-y-5">
          <h3 className="text-sm font-semibold text-zinc-400 mb-1">
            Storage & Quality
          </h3>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Retention Period
            </label>
            <select
              disabled
              className="w-full appearance-none rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-500 cursor-not-allowed opacity-60"
            >
              <option>30 days</option>
            </select>
            <p className="text-[10px] text-zinc-600 mt-1">Coming soon</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Storage Limit
            </label>
            <select
              disabled
              className="w-full appearance-none rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-500 cursor-not-allowed opacity-60"
            >
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
  const [autostartEnabled, setAutostartEnabled] = useState<boolean | null>(
    null,
  );
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
    await showNativeNotification(
      "OSP Test",
      "Native notifications are working.",
    );
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

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-5 space-y-3">
        <p className="text-sm font-medium text-zinc-100">Window Behaviour</p>
        <div className="flex items-start gap-3">
          <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-zinc-300">Minimize to tray on close</p>
            <p className="text-xs text-zinc-500">
              Clicking × hides the window. OSP keeps running in the system tray.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Check className="h-4 w-4 text-green-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm text-zinc-300">
              Tray tooltip with live camera count
            </p>
            <p className="text-xs text-zinc-500">
              Hover the tray icon to see online cameras and unread alerts.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-zinc-100">
              Native Notifications
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Event alerts sent as OS-level notifications.
            </p>
          </div>
          <button
            onClick={() => void handleTestNotification()}
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            {testSent ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-400" /> Sent
              </>
            ) : (
              <>
                <Bell className="h-3.5 w-3.5" /> Test
              </>
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
            <h3 className="text-lg font-semibold text-zinc-50">
              Delete Camera
            </h3>
            <p className="text-sm text-zinc-500">
              This action cannot be undone.
            </p>
          </div>
        </div>
        <p className="text-sm text-zinc-400 mb-6">
          Are you sure you want to delete{" "}
          <span className="font-medium text-zinc-200">{cameraName}</span>? All
          associated recordings and events will be permanently removed.
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
/*  Notifications tab                                                  */
/* ------------------------------------------------------------------ */
const SEVERITY_OPTIONS: readonly {
  value: NotificationPrefs["severityThreshold"];
  label: string;
  desc: string;
}[] = [
  {
    value: "all",
    label: "All Severities",
    desc: "Low, medium, high, and critical",
  },
  {
    value: "high",
    label: "High & Critical",
    desc: "Only high and critical events",
  },
  { value: "critical", label: "Critical Only", desc: "Only critical events" },
];

function NotificationsTab() {
  const prefs = useNotificationPrefsStore();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load prefs from backend on mount
  useEffect(() => {
    fetch(`${API_URL}/api/v1/tenants/current`, { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.settings) {
          const notif = (json.data.settings as Record<string, unknown>)[
            "notification_preferences"
          ] as Record<string, unknown> | undefined;
          if (notif) {
            prefs.setPrefs({
              pushEnabled:
                (notif["pushEnabled"] as boolean | undefined) ??
                prefs.pushEnabled,
              emailEnabled:
                (notif["emailEnabled"] as boolean | undefined) ??
                prefs.emailEnabled,
              severityThreshold:
                (notif["severityThreshold"] as
                  | NotificationPrefs["severityThreshold"]
                  | undefined) ?? prefs.severityThreshold,
              quietHoursEnabled:
                (notif["quietHoursEnabled"] as boolean | undefined) ??
                prefs.quietHoursEnabled,
              quietHoursStart:
                (notif["quietHoursStart"] as string | undefined) ??
                prefs.quietHoursStart,
              quietHoursEnd:
                (notif["quietHoursEnd"] as string | undefined) ??
                prefs.quietHoursEnd,
            });
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const handlePushToggle = async () => {
    if (!prefs.pushEnabled) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        showToast("Browser notification permission denied", "error");
        return;
      }
    }
    prefs.setPref("pushEnabled", !prefs.pushEnabled);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/tenants/current`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          settings: {
            notificationPreferences: {
              pushEnabled: prefs.pushEnabled,
              emailEnabled: prefs.emailEnabled,
              severityThreshold: prefs.severityThreshold,
              quietHoursEnabled: prefs.quietHoursEnabled,
              quietHoursStart: prefs.quietHoursStart,
              quietHoursEnd: prefs.quietHoursEnd,
            },
          },
        }),
      });
      const json = await res.json();
      if (!json.success) {
        showToast(json.error?.message ?? "Failed to save", "error");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-zinc-50 mb-6">Notifications</h2>

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
                {opt.label} — {opt.desc}
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
                <p className="text-sm font-medium text-zinc-200">Quiet Hours</p>
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

        <div className="h-px bg-zinc-800" />

        <div className="flex items-center justify-between pt-1">
          {saved && <span className="text-xs text-green-400">Saved!</span>}
          <button
            onClick={() => void handleSave()}
            disabled={saving || !loaded}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving..." : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Billing tab                                                        */
/* ------------------------------------------------------------------ */
function UsageBar({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number;
  label: string;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-500";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-300 font-mono">
          {limit > 0 ? `${used} / ${limit}` : `${used}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function BillingTab() {
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/tenants/current/usage`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) setUsage(json.data as UsageStats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const planLabel = usage?.plan
    ? usage.plan.charAt(0).toUpperCase() + usage.plan.slice(1)
    : "—";

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-bold text-zinc-50 mb-6">Billing</h2>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-32 bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Plan */}
          <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-sm font-medium text-zinc-400">
                  Current Plan
                </p>
                <p className="text-2xl font-bold text-blue-400 mt-0.5">
                  {planLabel}
                </p>
              </div>
              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400 border border-blue-500/20">
                Active
              </span>
            </div>

            <div className="space-y-4">
              {usage && (
                <>
                  <UsageBar
                    label="Cameras"
                    used={usage.cameras.used}
                    limit={usage.cameras.limit}
                  />
                  <UsageBar
                    label="Users"
                    used={usage.users.used}
                    limit={usage.users.limit}
                  />
                  {usage.storage.limitBytes > 0 && (
                    <UsageBar
                      label={`Storage (${formatBytes(usage.storage.usedBytes)} used)`}
                      used={usage.storage.usedBytes}
                      limit={usage.storage.limitBytes}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Usage stats */}
          {usage && (
            <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6">
              <p className="text-sm font-semibold text-zinc-300 mb-4">
                Usage Summary
              </p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-zinc-500">Cameras</p>
                  <p className="text-lg font-semibold text-zinc-50 font-mono mt-0.5">
                    {usage.cameras.used}
                    {usage.cameras.limit > 0 && (
                      <span className="text-xs text-zinc-500 font-normal">
                        {" "}
                        / {usage.cameras.limit}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Users</p>
                  <p className="text-lg font-semibold text-zinc-50 font-mono mt-0.5">
                    {usage.users.used}
                    {usage.users.limit > 0 && (
                      <span className="text-xs text-zinc-500 font-normal">
                        {" "}
                        / {usage.users.limit}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Storage Used</p>
                  <p className="text-lg font-semibold text-zinc-50 font-mono mt-0.5">
                    {formatBytes(usage.storage.usedBytes)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500">Recording Time</p>
                  <p className="text-lg font-semibold text-zinc-50 font-mono mt-0.5">
                    {usage.recordings.totalDurationHours}h
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              disabled
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-500 cursor-not-allowed opacity-60"
            >
              Manage Subscription
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  API Keys tab                                                       */
/* ------------------------------------------------------------------ */
function ApiKeysTab() {
  const [keys, setKeys] = useState<readonly ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyVisible, setNewKeyVisible] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/api-keys`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (json.success && json.data) setKeys(json.data as ApiKey[]);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/api-keys`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: createName.trim() }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setNewKey(json.data.key as string);
        setNewKeyVisible(true);
        setCreateName("");
        setShowCreate(false);
        fetchKeys();
      } else {
        showToast(json.error?.message ?? "Failed to create key", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    try {
      const res = await fetch(`${API_URL}/api/v1/api-keys/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (json.success) {
        setKeys((prev) => prev.filter((k) => k.id !== id));
        showToast("API key revoked", "success");
      } else {
        showToast(json.error?.message ?? "Failed to revoke key", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-zinc-50">API Keys</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Manage API keys for programmatic access to the OSP API.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-600 transition-colors cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Key
        </button>
      </div>

      {/* New key banner — shown once after creation */}
      {newKey && (
        <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <p className="text-sm font-medium text-green-400">
                API key created
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                Copy this key now — it won&apos;t be shown again.
              </p>
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="p-1 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 rounded bg-zinc-950 px-3 py-2 text-xs font-mono text-zinc-200 truncate">
              {newKeyVisible ? newKey : "osp_" + "•".repeat(32)}
            </code>
            <button
              onClick={() => setNewKeyVisible((v) => !v)}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            >
              {newKeyVisible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => handleCopy(newKey, "new")}
              className="p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
            >
              {copiedId === "new" ? (
                <Check className="h-4 w-4 text-green-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Keys list */}
      <div className="bg-zinc-900 rounded-lg border border-zinc-800 overflow-hidden">
        {loading ? (
          <table className="w-full text-sm">
            <tbody>
              <TableRowSkeleton cols={4} />
              <TableRowSkeleton cols={4} />
            </tbody>
          </table>
        ) : keys.length === 0 ? (
          <div className="py-12 text-center text-zinc-500">
            <Key className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No API keys yet.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Create a key to integrate with the OSP API.
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800 bg-zinc-900/80">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Prefix</th>
                <th className="px-4 py-3 font-medium">Last Used</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {keys.map((key) => (
                <tr
                  key={key.id}
                  className="hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-zinc-50">
                    {key.name}
                  </td>
                  <td className="px-4 py-3">
                    <code className="text-xs font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                      osp_{key.key_prefix}…
                    </code>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-500 font-mono">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString()
                        : "Never"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-zinc-500 font-mono">
                      {new Date(key.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void handleRevoke(key.id)}
                      disabled={revokingId === key.id}
                      className="p-1 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40"
                      title="Revoke key"
                    >
                      {revokingId === key.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mt-3 text-xs text-zinc-600">
        API keys grant admin-level access. Keep them secret and rotate
        regularly.
      </p>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-50">
                Create API Key
              </h3>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setCreateName("");
                }}
                className="p-1 text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Key Name
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleCreate();
                  }}
                  autoFocus
                  placeholder="e.g. CI/CD Pipeline, Dashboard Integration"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    setShowCreate(false);
                    setCreateName("");
                  }}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleCreate()}
                  disabled={!createName.trim() || creating}
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  {creating ? "Creating..." : "Create Key"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SSO / Identity tab                                                 */
/* ------------------------------------------------------------------ */
type SsoProvider = "google" | "azure" | "github";

interface SsoConfig {
  id: string;
  provider: SsoProvider;
  enabled: boolean;
  allowed_domains: string[];
  auto_provision: boolean;
  default_role: string;
}

const SSO_PROVIDERS: {
  provider: SsoProvider;
  label: string;
  description: string;
}[] = [
  {
    provider: "google",
    label: "Google / Google Workspace",
    description:
      "Let users sign in with their Google or Google Workspace account.",
  },
  {
    provider: "azure",
    label: "Microsoft / Azure AD",
    description:
      "Integrate with Microsoft Entra ID (formerly Azure AD) or Active Directory.",
  },
  {
    provider: "github",
    label: "GitHub",
    description: "Let developers sign in with their GitHub account.",
  },
];

/* ------------------------------------------------------------------ */
/*  Config & Secrets Tab                                               */
/* ------------------------------------------------------------------ */

// All known env var keys grouped by section.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL
// are intentionally excluded — they must stay in process.env as bootstrap.
const CONFIG_SECTIONS: readonly {
  label: string;
  keys: readonly { key: string; description: string; sensitive?: boolean }[];
}[] = [
  {
    label: "App / Frontend",
    keys: [
      {
        key: "NEXT_PUBLIC_API_URL",
        description: "Gateway base URL used by the web app",
      },
      { key: "GATEWAY_PORT", description: "Gateway HTTP port" },
      { key: "WS_PORT", description: "WebSocket server port" },
      {
        key: "GATEWAY_CORS_ORIGINS",
        description: "Allowed CORS origins (comma-separated)",
      },
      {
        key: "RATE_LIMIT_FAIL_OPEN",
        description: "If true, allow requests when rate-limit backend is down",
      },
      {
        key: "API_TOKEN",
        description: "Internal service-to-service bearer token",
        sensitive: true,
      },
    ],
  },
  {
    label: "Redis",
    keys: [
      {
        key: "REDIS_URL",
        description: "Redis connection URL",
        sensitive: true,
      },
    ],
  },
  {
    label: "Cloudflare R2 / S3 Storage",
    keys: [
      { key: "R2_ACCOUNT_ID", description: "R2 account ID" },
      {
        key: "R2_ACCESS_KEY_ID",
        description: "R2 access key ID",
        sensitive: true,
      },
      {
        key: "R2_SECRET_ACCESS_KEY",
        description: "R2 secret access key",
        sensitive: true,
      },
      { key: "R2_BUCKET_NAME", description: "R2 bucket name" },
      { key: "R2_ENDPOINT", description: "R2 endpoint URL" },
    ],
  },
  {
    label: "Go Services (gRPC ports)",
    keys: [
      { key: "INGEST_GRPC_PORT", description: "Camera ingest gRPC port" },
      { key: "VIDEO_GRPC_PORT", description: "Video pipeline gRPC port" },
      { key: "EVENT_GRPC_PORT", description: "Event engine gRPC port" },
      {
        key: "EXTENSION_GRPC_PORT",
        description: "Extension runtime gRPC port",
      },
    ],
  },
  {
    label: "go2rtc",
    keys: [
      { key: "GO2RTC_API_URL", description: "go2rtc HTTP API base URL" },
      { key: "GO2RTC_RTSP_PORT", description: "go2rtc RTSP port" },
      { key: "GO2RTC_WEBRTC_PORT", description: "go2rtc WebRTC port" },
    ],
  },
  {
    label: "TURN / ICE Server (WebRTC)",
    keys: [
      {
        key: "TURN_SERVER_URL",
        description: "TURN server URL, e.g. turn:localhost:3478",
      },
      { key: "TURN_SERVER_USERNAME", description: "TURN server username" },
      {
        key: "TURN_SERVER_CREDENTIAL",
        description: "TURN server credential/password",
        sensitive: true,
      },
    ],
  },
  {
    label: "ClickHouse Analytics",
    keys: [
      { key: "CLICKHOUSE_URL", description: "ClickHouse HTTP URL" },
      { key: "CLICKHOUSE_USER", description: "ClickHouse username" },
      {
        key: "CLICKHOUSE_PASSWORD",
        description: "ClickHouse password",
        sensitive: true,
      },
      { key: "CLICKHOUSE_DATABASE", description: "ClickHouse database name" },
    ],
  },
  {
    label: "Recordings",
    keys: [
      {
        key: "RECORDINGS_DIR",
        description: "Local directory for event clips and thumbnails",
      },
    ],
  },
  {
    label: "Encryption",
    keys: [
      {
        key: "OSP_ENCRYPTION_KEY",
        description:
          "64-char hex AES-256 key for encrypting camera credentials",
        sensitive: true,
      },
    ],
  },
  {
    label: "AI Detection",
    keys: [
      {
        key: "AI_PROVIDER",
        description: "AI provider: none | openai | custom",
      },
      {
        key: "OPENAI_API_KEY",
        description: "OpenAI API key (used when AI_PROVIDER=openai)",
        sensitive: true,
      },
    ],
  },
  {
    label: "Extensions",
    keys: [
      {
        key: "EXTENSION_SANDBOX_DIR",
        description: "Directory for sandboxed extension bundles",
      },
      {
        key: "EXTENSION_ALLOW_INLINE_SOURCE",
        description: "Allow extensions with inline JS source (dev only)",
      },
    ],
  },
  {
    label: "Motion Detection Tuning",
    keys: [
      {
        key: "MOTION_SAMPLE_INTERVAL_MS",
        description: "How often to sample frames for motion (ms)",
      },
      {
        key: "MOTION_COOLDOWN_MS",
        description: "Cooldown between motion events per camera (ms)",
      },
    ],
  },
  {
    label: "Push Notifications",
    keys: [
      {
        key: "APNS_KEY_ID",
        description: "Apple Push Notification Service key ID",
      },
      { key: "APNS_TEAM_ID", description: "Apple developer team ID" },
      {
        key: "FCM_SERVER_KEY",
        description: "Firebase Cloud Messaging server key",
        sensitive: true,
      },
    ],
  },
  {
    label: "Email (SendGrid)",
    keys: [
      {
        key: "SENDGRID_API_KEY",
        description: "SendGrid API key (SG.xxx)",
        sensitive: true,
      },
      {
        key: "EMAIL_FROM",
        description:
          "From address for all outbound email, e.g. OSP Alerts <alerts@osp.dev>",
      },
    ],
  },
  {
    label: "Dual-write (Cloud mirrors)",
    keys: [
      {
        key: "SUPABASE_CLOUD_URL",
        description: "Cloud Supabase URL (kept in sync when running local DB)",
      },
      {
        key: "SUPABASE_CLOUD_SERVICE_ROLE_KEY",
        description: "Cloud Supabase service role key",
        sensitive: true,
      },
      {
        key: "DATABASE_CLOUD_URL",
        description: "Cloud Postgres direct URL for Go services",
        sensitive: true,
      },
    ],
  },
  {
    label: "Sentry Error Monitoring",
    keys: [
      {
        key: "SENTRY_DSN",
        description: "Sentry DSN (server-side)",
        sensitive: true,
      },
      {
        key: "NEXT_PUBLIC_SENTRY_DSN",
        description: "Sentry DSN (browser/public, safe to expose)",
      },
      {
        key: "SENTRY_AUTH_TOKEN",
        description: "Sentry auth token for source map uploads",
        sensitive: true,
      },
      { key: "SENTRY_ORG", description: "Sentry organisation slug" },
      { key: "SENTRY_PROJECT", description: "Sentry project slug" },
    ],
  },
  {
    label: "License Plate Recognition (LPR)",
    keys: [
      { key: "LPR_PROVIDER", description: "LPR provider (platerecognizer)" },
      {
        key: "LPR_API_KEY",
        description: "PlateRecognizer API token",
        sensitive: true,
      },
      {
        key: "LPR_REGIONS",
        description:
          "Optional region hint, e.g. us,gb,ca (leave blank for global)",
      },
    ],
  },
];

function ConfigTab() {
  const [dbKeys, setDbKeys] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/config/keys`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const j = (await res.json()) as { data: { keys: string[] } };
        setDbKeys(new Set(j.data.keys ?? []));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const startEdit = async (key: string) => {
    const res = await fetch(`${API_URL}/api/v1/config/keys/${key}`, {
      headers: getAuthHeaders(),
    });
    const j = (await res.json()) as { data: { value: string | null } };
    setEditValue(j.data.value ?? "");
    setEditing(key);
  };

  const saveEdit = async (key: string) => {
    setSaving(key);
    try {
      const res = await fetch(`${API_URL}/api/v1/config/keys/${key}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({ value: editValue, scope: "global" }),
      });
      if (!res.ok) {
        showToast("Failed to save", "error");
        return;
      }
      showToast(`${key} saved`, "success");
      setEditing(null);
      setDbKeys((prev) => new Set([...prev, key]));
    } finally {
      setSaving(null);
    }
  };

  const toggleReveal = (key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-zinc-50">Config &amp; Secrets</h2>
        <p className="text-sm text-zinc-400 mt-1">
          DB values override process.env at runtime. Bootstrap keys
          (SUPABASE_URL, service role key, DATABASE_URL) must remain in .env and
          are not shown here.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 bg-zinc-900 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {CONFIG_SECTIONS.map((section) => (
            <div
              key={section.label}
              className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
            >
              <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-800/40">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  {section.label}
                </h3>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {section.keys.map(({ key, description, sensitive }) => {
                  const inDb = dbKeys.has(key);
                  const isEditing = editing === key;
                  const isRevealed = revealed.has(key);
                  return (
                    <div
                      key={key}
                      className="px-4 py-3 flex items-center gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-zinc-200">
                            {key}
                          </code>
                          {inDb ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              DB
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-700/50 text-zinc-500 border border-zinc-700">
                              env
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {description}
                        </p>
                        {isEditing && (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="relative flex-1">
                              <input
                                type={
                                  sensitive && !isRevealed ? "password" : "text"
                                }
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                autoFocus
                                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-50 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder={`Enter value for ${key}`}
                              />
                              {sensitive && (
                                <button
                                  type="button"
                                  onClick={() => toggleReveal(key)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                                >
                                  {isRevealed ? (
                                    <EyeOff size={12} />
                                  ) : (
                                    <Eye size={12} />
                                  )}
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => saveEdit(key)}
                              disabled={saving === key}
                              className="flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                            >
                              {saving === key ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <Check size={11} />
                              )}
                              Save
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                      {!isEditing && (
                        <button
                          onClick={() => startEdit(key)}
                          className="shrink-0 flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors"
                        >
                          <Pencil size={11} />
                          {inDb ? "Edit" : "Set"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LPR Watchlist Tab                                                  */
/* ------------------------------------------------------------------ */
interface WatchlistEntry {
  id: string;
  plate: string;
  label: string;
  alert_on_detect: boolean;
  created_at: string;
}

function LprTab() {
  const [status, setStatus] = useState<{
    configured: boolean;
    provider: string;
  } | null>(null);
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newAlert, setNewAlert] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, listRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/lpr/status`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/v1/lpr/watchlist`, { headers: getAuthHeaders() }),
      ]);
      if (statusRes.ok) {
        const s = (await statusRes.json()) as {
          data: { configured: boolean; provider: string };
        };
        setStatus(s.data);
      }
      if (listRes.ok) {
        const l = (await listRes.json()) as { data: WatchlistEntry[] };
        setEntries(l.data ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    if (!newPlate.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/lpr/watchlist`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          plate: newPlate.trim(),
          label: newLabel.trim(),
          alertOnDetect: newAlert,
        }),
      });
      if (res.status === 409) {
        showToast("Plate already on watchlist", "error");
        return;
      }
      if (!res.ok) {
        showToast("Failed to add plate", "error");
        return;
      }
      showToast("Plate added", "success");
      setNewPlate("");
      setNewLabel("");
      setNewAlert(true);
      setShowAdd(false);
      void load();
    } finally {
      setAdding(false);
    }
  };

  const handleToggleAlert = async (entry: WatchlistEntry) => {
    await fetch(`${API_URL}/api/v1/lpr/watchlist/${entry.id}`, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({ alertOnDetect: !entry.alert_on_detect }),
    });
    void load();
  };

  const handleDelete = async (id: string) => {
    await fetch(`${API_URL}/api/v1/lpr/watchlist/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    showToast("Plate removed", "success");
    void load();
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-zinc-50">
            License Plate Recognition
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Manage your plate watchlist. Matched plates trigger high-severity
            alerts.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
        >
          <Plus size={15} /> Add Plate
        </button>
      </div>

      {/* Status banner */}
      {status && (
        <div
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 mb-6 text-sm ${status.configured ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" : "border-amber-500/30 bg-amber-500/5 text-amber-400"}`}
        >
          <AlertCircle size={15} />
          {status.configured
            ? `LPR active · Provider: ${status.provider}`
            : "LPR not configured. Set LPR_API_KEY and LPR_PROVIDER=platerecognizer in Settings → Config or your .env file."}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-200">
            New watchlist entry
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Plate number *
              </label>
              <input
                type="text"
                value={newPlate}
                onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                placeholder="ABC1234"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Label (optional)
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Staff – John, BANNED"
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newAlert}
              onChange={(e) => setNewAlert(e.target.checked)}
              className="accent-blue-500 w-4 h-4"
            />
            <span className="text-sm text-zinc-300">Alert on detect</span>
          </label>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={adding || !newPlate.trim()}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {adding ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Check size={13} />
              )}
              Add
            </button>
          </div>
        </div>
      )}

      {/* Watchlist table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {loading ? (
          <table className="w-full text-sm">
            <tbody>
              {[1, 2, 3].map((i) => (
                <TableRowSkeleton key={i} cols={4} />
              ))}
            </tbody>
          </table>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-sm">
            No plates on watchlist yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Plate
                </th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Label
                </th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Alert
                </th>
                <th className="px-4 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  Added
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="font-mono font-semibold text-zinc-100 tracking-wider bg-zinc-800 px-2 py-0.5 rounded">
                      {e.plate}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {e.label || <span className="text-zinc-600 italic">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleAlert(e)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${e.alert_on_detect ? "bg-blue-600" : "bg-zinc-700"}`}
                      title={e.alert_on_detect ? "Alerts on" : "Alerts off"}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${e.alert_on_detect ? "translate-x-4" : "translate-x-1"}`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(e.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="text-zinc-600 hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Edge Agents Tab ────────────────────────────────────────────────────────

type TunnelStatus =
  | "loading"
  | "not_configured"
  | "up"
  | "down"
  | "tunnel_error"
  | "tunnel_quota_exceeded";

interface TunnelHealth {
  status: TunnelStatus;
  latency_ms?: number;
  streams?: number;
  error?: string;
  error_code?: string;
  upgrade_url?: string;
}

function TunnelHealthCard() {
  const [health, setHealth] = useState<TunnelHealth>({ status: "loading" });
  const [checking, setChecking] = useState(false);

  const check = useCallback(async (showSpinner = true) => {
    if (showSpinner) setChecking(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/edge/agents/go2rtc-status`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = (await res.json()) as { data: TunnelHealth };
        setHealth(json.data ?? { status: "down" });
      } else {
        setHealth({ status: "down", error: `Gateway returned ${res.status}` });
      }
    } catch {
      setHealth({ status: "down", error: "Could not reach gateway" });
    } finally {
      setChecking(false);
    }
  }, []);

  // Poll every 30s automatically
  useEffect(() => {
    void check(false);
    const iv = setInterval(() => void check(false), 30_000);
    return () => clearInterval(iv);
  }, [check]);

  const { status, latency_ms, streams, error, error_code, upgrade_url } = health;

  const isQuotaExceeded = status === "tunnel_quota_exceeded";
  const isTunnelError = status === "tunnel_error";
  const isDown = status === "down";
  const isUp = status === "up";
  const isNotConfigured = status === "not_configured";

  const borderColor = isQuotaExceeded
    ? "border-red-700"
    : isTunnelError || isDown
      ? "border-amber-700"
      : isUp
        ? "border-green-800"
        : "border-zinc-800";

  return (
    <div className={`rounded-lg border ${borderColor} bg-zinc-900 p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-zinc-200 flex items-center gap-2">
          {status === "loading" && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          {isUp && <CheckCircle2 className="h-4 w-4 text-green-400" />}
          {(isDown || isTunnelError) && <AlertCircle className="h-4 w-4 text-amber-400" />}
          {isQuotaExceeded && <AlertTriangle className="h-4 w-4 text-red-400" />}
          {isNotConfigured && <WifiOff className="h-4 w-4 text-zinc-500" />}
          Tunnel health
        </h4>
        <button
          type="button"
          onClick={() => void check(true)}
          disabled={checking}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${checking ? "animate-spin" : ""}`} />
          Check now
        </button>
      </div>

      {/* Status row */}
      {status === "loading" && (
        <p className="text-xs text-zinc-500">Checking tunnel…</p>
      )}

      {isNotConfigured && (
        <p className="text-xs text-zinc-500">
          No online edge agent found. Start the agent and it will appear here.
        </p>
      )}

      {isUp && (
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="flex items-center gap-1 text-green-400">
            <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
            Tunnel OK
          </span>
          {latency_ms !== undefined && (
            <span className="text-zinc-400">Latency: <span className="text-zinc-200">{latency_ms} ms</span></span>
          )}
          {streams !== undefined && (
            <span className="text-zinc-400">Active streams: <span className="text-zinc-200">{streams}</span></span>
          )}
        </div>
      )}

      {(isDown || isTunnelError) && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-amber-400">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            Tunnel unreachable
            {error_code && <span className="ml-1 font-mono text-amber-300">({error_code})</span>}
          </div>
          {error && <p className="text-xs text-zinc-400">{error}</p>}
        </div>
      )}

      {isQuotaExceeded && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            Monthly bandwidth limit reached
            <span className="ml-1 font-mono">(ERR_NGROK_725)</span>
          </div>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Your ngrok free-tier account has used its monthly data allowance.
            Live video streams are paused until the limit resets or you upgrade.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={upgrade_url ?? "https://dashboard.ngrok.com/billing"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
            >
              Upgrade ngrok plan
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://dashboard.ngrok.com/get-started/your-authtoken"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-600 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
            >
              Get a new authtoken
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function MeteredTurnRelaySettings() {
  const [useTurn, setUseTurn] = useState(false);

  useEffect(() => {
    setUseTurn(getUseMeteredTurn());
  }, []);

  const handleToggle = () => {
    const next = !useTurn;
    setUseTurn(next);
    setUseMeteredTurn(next);
    showToast(
      next
        ? "TURN relay enabled. Open or refresh a live camera view to apply."
        : "STUN-only mode (default). Open or refresh a live camera view to apply.",
      "success",
    );
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-200">
              WebRTC TURN relay (Metered)
            </p>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
              Off by default for lower latency when your network and tunnel allow
              direct WebRTC. Turn on if live video fails behind strict NAT or
              firewalls (uses your gateway&apos;s TURN credentials when
              configured).
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 cursor-pointer ${
            useTurn ? "bg-sky-600" : "bg-zinc-700"
          }`}
          role="switch"
          aria-checked={useTurn}
          aria-label="Use TURN relay for WebRTC"
        >
          <span
            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150 ${
              useTurn ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}

function LocalPcAgentNgrokSettings() {
  const [draft, setDraft] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    setDraft(getLocalNgrokAuthtoken());
  }, []);

  const handleSave = () => {
    const t = draft.trim();
    if (t.length > 0 && t.length < NGROK_AUTHTOKEN_MIN_LEN) {
      showToast(
        `Ngrok authtoken should be at least ${NGROK_AUTHTOKEN_MIN_LEN} characters.`,
        "error",
      );
      return;
    }
    setLocalNgrokAuthtoken(t);
    showToast(
      t.length > 0
        ? "Ngrok authtoken saved in this browser"
        : "Ngrok authtoken cleared from this browser",
      "success",
    );
  };

  const handleClear = () => {
    clearLocalNgrokAuthtoken();
    setDraft("");
    showToast("Ngrok authtoken removed from this browser", "success");
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <h4 className="mb-1 text-sm font-medium text-zinc-200">
        PC agent — ngrok authtoken
      </h4>
      <p className="mb-3 text-xs text-zinc-500 leading-relaxed">
        Saved only in this browser (not on OSP servers). It pre-fills the
        camera connection wizard and the values used when you download{" "}
        <code className="text-zinc-400">.env.agent</code>. After you change it
        here, update <code className="text-zinc-400">NGROK_AUTHTOKEN</code> in
        your local Docker / Compose files and restart the{" "}
        <code className="text-zinc-400">osp-ngrok</code> container so the tunnel
        uses the new token.
      </p>
      <p className="mb-2 text-xs text-zinc-500">
        <a
          href={NGROK_AUTHTOKEN_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300"
        >
          Get or rotate your authtoken in ngrok
          <ExternalLink className="h-3 w-3" />
        </a>
      </p>
      <div className="relative">
        <input
          type={showSecret ? "text" : "password"}
          autoComplete="off"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste ngrok authtoken"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 py-2 pl-3 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setShowSecret((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:text-zinc-300"
          aria-label={showSecret ? "Hide token" : "Show token"}
        >
          {showSecret ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
        >
          Save
        </button>
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

interface EdgeAgent {
  id: string;
  agent_id: string;
  name: string;
  location: string | null;
  status: "online" | "offline" | "error";
  version: string | null;
  cameras_active: number;
  pending_events: number;
  synced_events: number;
  last_seen_at: string | null;
  created_at: string;
}

function EdgeAgentsTab() {
  const [agents, setAgents] = useState<EdgeAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/edge/agents`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = (await res.json()) as { data: EdgeAgent[] };
        setAgents(json.data ?? []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (agentId: string) => {
    await fetch(`${API_URL}/api/v1/edge/agents/${agentId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    showToast("Agent removed", "success");
    void load(true);
  };

  const statusColor = (s: EdgeAgent["status"]) => {
    if (s === "online") return "bg-green-500 text-green-400";
    if (s === "error") return "bg-red-500 text-red-400";
    return "bg-zinc-600 text-zinc-500";
  };

  const statusDot = (s: EdgeAgent["status"]) => {
    if (s === "online") return "bg-green-500";
    if (s === "error") return "bg-red-500";
    return "bg-zinc-600";
  };

  const relativeTime = (iso: string | null) => {
    if (!iso) return "never";
    const diff = Date.now() - new Date(iso).getTime();
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return `${secs}s ago`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    return `${Math.floor(secs / 3600)}h ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">Edge Agents</h3>
          <p className="mt-0.5 text-sm text-zinc-400">
            On-premise binaries that buffer events locally and sync to the
            cloud.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={refreshing}
          className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </button>
      </div>

      <TunnelHealthCard />

      <MeteredTurnRelaySettings />

      <LocalPcAgentNgrokSettings />

      {/* Setup instructions */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
        <h4 className="mb-2 text-sm font-medium text-zinc-200">
          Deploy an Edge Agent
        </h4>
        <p className="mb-3 text-xs text-zinc-400">
          Run one binary per site. It connects to a local go2rtc, detects motion
          offline, and syncs events here automatically.
        </p>
        <pre className="rounded-md bg-zinc-950 p-3 text-xs text-zinc-300 overflow-x-auto">{`# Docker
docker run -d --name osp-edge \\
  -e EDGE_AGENT_ID=site-01 \\
  -e EDGE_AGENT_NAME="Building A" \\
  -e CLOUD_GATEWAY_URL=https://your-gateway.fly.dev \\
  -e CLOUD_API_TOKEN=<your-api-key> \\
  -e TENANT_ID=<your-tenant-id> \\
  -e GO2RTC_URL=http://go2rtc:1984 \\
  -v edge-data:/data \\
  ghcr.io/matidesign/osp-edge-agent:latest`}</pre>
      </div>

      {/* Agent list */}
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 py-14 text-center">
          <Server className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-400">
            No edge agents registered
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            Deploy the edge agent binary at a remote site — it will appear here
            automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800">
                    {agent.status === "online" ? (
                      <Wifi className="h-4 w-4 text-green-400" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-zinc-500" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-100">
                        {agent.name}
                      </span>
                      <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${statusDot(agent.status)}`}
                        />
                        {agent.status}
                      </span>
                      {agent.version && (
                        <span className="text-[10px] text-zinc-600">
                          v{agent.version}
                        </span>
                      )}
                    </div>
                    {agent.location && (
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {agent.location}
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-zinc-600">
                      ID: {agent.agent_id} · Last seen:{" "}
                      {relativeTime(agent.last_seen_at)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDelete(agent.agent_id)}
                  className="cursor-pointer rounded p-1 text-zinc-600 transition-colors hover:text-red-400"
                  title="Remove agent"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {/* Stats row */}
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-zinc-800 pt-3">
                <div className="text-center">
                  <p className="text-lg font-semibold text-zinc-100">
                    {agent.cameras_active}
                  </p>
                  <p className="text-[10px] text-zinc-500">Cameras</p>
                </div>
                <div className="text-center">
                  <p
                    className={`text-lg font-semibold ${agent.pending_events > 0 ? "text-amber-400" : "text-zinc-100"}`}
                  >
                    {agent.pending_events}
                  </p>
                  <p className="text-[10px] text-zinc-500">Pending sync</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-zinc-100">
                    {agent.synced_events}
                  </p>
                  <p className="text-[10px] text-zinc-500">Synced</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SsoTab() {
  const [configs, setConfigs] = useState<SsoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SsoProvider | null>(null);
  const [expanded, setExpanded] = useState<SsoProvider | null>(null);
  const [domainInput, setDomainInput] = useState<Record<SsoProvider, string>>({
    google: "",
    azure: "",
    github: "",
  });

  useEffect(() => {
    fetch(`${API_URL}/api/v1/auth/sso/config`, {
      headers: getAuthHeaders(),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setConfigs(json.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function getConfig(provider: SsoProvider): SsoConfig | undefined {
    return configs.find((c) => c.provider === provider);
  }

  async function save(provider: SsoProvider, patch: Partial<SsoConfig>) {
    setSaving(provider);
    const existing = getConfig(provider);
    const body = { ...existing, ...patch };
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/sso/config/${provider}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        setConfigs((prev) => {
          const idx = prev.findIndex((c) => c.provider === provider);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = json.data;
            return next;
          }
          return [...prev, json.data];
        });
        showToast("SSO config saved", "success");
      } else {
        showToast(json.error?.message ?? "Save failed", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(null);
    }
  }

  async function toggleEnabled(provider: SsoProvider) {
    const cfg = getConfig(provider);
    await save(provider, { enabled: !cfg?.enabled });
  }

  async function addDomain(provider: SsoProvider) {
    const domain = domainInput[provider].trim().toLowerCase().replace(/^@/, "");
    if (!domain) return;
    const cfg = getConfig(provider);
    const existing = cfg?.allowed_domains ?? [];
    if (existing.includes(domain)) return;
    await save(provider, { allowed_domains: [...existing, domain] });
    setDomainInput((prev) => ({ ...prev, [provider]: "" }));
  }

  async function removeDomain(provider: SsoProvider, domain: string) {
    const cfg = getConfig(provider);
    await save(provider, {
      allowed_domains: (cfg?.allowed_domains ?? []).filter((d) => d !== domain),
    });
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-zinc-100">
          SSO / Identity Providers
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          Allow users to sign in with Google, Microsoft, or GitHub. Requires the
          corresponding OAuth app to be enabled in your Supabase project under{" "}
          <span className="font-medium text-zinc-300">
            Authentication → Providers
          </span>
          .
        </p>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
        {SSO_PROVIDERS.map(({ provider, label, description }) => {
          const cfg = getConfig(provider);
          const isEnabled = cfg?.enabled ?? false;
          const isExpanded = expanded === provider;
          const domains = cfg?.allowed_domains ?? [];

          return (
            <div key={provider}>
              {/* Provider row */}
              <div className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200">
                      {label}
                    </span>
                    {isEnabled && (
                      <span className="rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                        Enabled
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => toggleEnabled(provider)}
                    disabled={saving === provider}
                    className={`relative h-5 w-9 cursor-pointer rounded-full transition-colors duration-200 disabled:opacity-50 ${
                      isEnabled ? "bg-blue-500" : "bg-zinc-700"
                    }`}
                    aria-label={isEnabled ? "Disable" : "Enable"}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                        isEnabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>

                  {/* Expand */}
                  <button
                    type="button"
                    onClick={() => setExpanded(isExpanded ? null : provider)}
                    className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
                    aria-label="Configure"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expanded settings */}
              {isExpanded && (
                <div className="border-t border-zinc-800 bg-zinc-900/80 px-4 py-4 space-y-5">
                  {/* Domain restriction */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Allowed email domains
                    </label>
                    <p className="text-xs text-zinc-500 mb-2">
                      Leave empty to allow any email. Add domains (e.g.{" "}
                      <code className="text-zinc-400">acme.com</code>) to
                      restrict sign-in to those organisations.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {domains.map((d) => (
                        <span
                          key={d}
                          className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-300"
                        >
                          <Globe className="h-3 w-3 text-zinc-500" />
                          {d}
                          <button
                            type="button"
                            onClick={() => removeDomain(provider, d)}
                            className="ml-0.5 text-zinc-500 hover:text-red-400 transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="acme.com"
                        value={domainInput[provider]}
                        onChange={(e) =>
                          setDomainInput((prev) => ({
                            ...prev,
                            [provider]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) =>
                          e.key === "Enter" && addDomain(provider)
                        }
                        className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => addDomain(provider)}
                        className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-700"
                      >
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Auto-provision */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        Auto-provision users
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Automatically create an account on first SSO login.
                        Disable to require a manual invite.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        save(provider, {
                          auto_provision: !(cfg?.auto_provision ?? true),
                        })
                      }
                      disabled={saving === provider}
                      className={`relative mt-0.5 h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 disabled:opacity-50 ${
                        (cfg?.auto_provision ?? true)
                          ? "bg-blue-500"
                          : "bg-zinc-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                          (cfg?.auto_provision ?? true)
                            ? "translate-x-4"
                            : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Default role */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                      Default role for new SSO users
                    </label>
                    <select
                      value={cfg?.default_role ?? "viewer"}
                      onChange={(e) =>
                        save(provider, { default_role: e.target.value })
                      }
                      disabled={saving === provider}
                      className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="operator">Operator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Setup instructions */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <h4 className="text-sm font-medium text-zinc-300 mb-2">
          Setup instructions
        </h4>
        <ol className="space-y-1.5 text-xs text-zinc-400 list-decimal list-inside">
          <li>
            Go to your{" "}
            <span className="font-medium text-zinc-300">
              Supabase dashboard → Authentication → Providers
            </span>
            .
          </li>
          <li>
            Enable the desired provider (Google, Azure, GitHub) and paste your
            OAuth app credentials.
          </li>
          <li>
            Set the authorized redirect URI to{" "}
            <code className="text-zinc-300">
              {typeof window !== "undefined"
                ? window.location.origin
                : "https://your-domain.com"}
              /auth/callback
            </code>
            .
          </li>
          <li>
            Enable and configure the provider above, then users can sign in with
            it.
          </li>
        </ol>
      </div>
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
  const router = useRouter();
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
  const initialTenantRef = useRef({
    name: "",
    timezone: "UTC",
    mode: "motion",
  });
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
  const [extTab, setExtTab] = useState<"installed" | "marketplace">(
    "marketplace",
  );
  const [marketplaceExts, setMarketplaceExts] = useState<
    readonly MarketplaceExtension[]
  >([]);
  const [installedExts, setInstalledExts] = useState<
    readonly InstalledExtension[]
  >([]);
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
          const mode = ((settings.default_recording_mode as string) ??
            (settings.defaultRecordingMode as string) ??
            "motion") as "motion" | "continuous" | "off";
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
  const handleInstallExtension = useCallback(
    async (extensionId: string) => {
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
          showToast(
            json.error?.message ?? "Failed to install extension",
            "error",
          );
        }
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : "Network error",
          "error",
        );
      } finally {
        setInstallingExtId(null);
      }
    },
    [fetchInstalled, fetchMarketplace],
  );

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
      const response = await fetch(
        `${API_URL}/api/v1/tenants/current/users/invite`,
        {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
        },
      );
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
          {NAV_ITEMS.filter((item) => item.key !== "desktop" || isTauri()).map(
            (item) => {
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
            },
          )}
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
                  <div
                    key={i}
                    className="h-16 bg-zinc-900 rounded-lg animate-pulse"
                  />
                ))}
              </div>
            ) : (
              <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-6 space-y-5">
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
                <h2 className="text-xl font-bold text-zinc-50">Team Members</h2>
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
              <button
                onClick={() => router.push("/cameras/add")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 cursor-pointer"
              >
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
                                  ? new Date(cam.lastSeenAt).toLocaleString(
                                      undefined,
                                      {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      },
                                    )
                                  : "Never"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() =>
                                    router.push(
                                      `/cameras/${cam.id}?tab=settings`,
                                    )
                                  }
                                  className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
                                  title="Edit camera settings"
                                >
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
                            <p className="text-xs text-zinc-500">
                              {ext.author_name}
                            </p>
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
                                  CATEGORY_COLORS[cat] ??
                                  "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
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
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              inst.enabled
                                ? "bg-green-500/10 text-green-400"
                                : "bg-zinc-500/10 text-zinc-500"
                            }`}
                          >
                            {inst.enabled ? "Active" : "Disabled"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : marketplaceExts.length === 0 ? (
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
                          <p className="text-xs text-zinc-500">
                            {ext.author_name}
                          </p>
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
                                CATEGORY_COLORS[cat] ??
                                "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
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
            )}
          </div>
        )}

        {/* ── Notifications tab ──────────────────────────────── */}
        {activeTab === "notifications" && <NotificationsTab />}

        {/* ── Recording tab ──────────────────────────────────── */}
        {activeTab === "recording" && <RecordingSettingsPanel />}

        {/* ── Billing tab ────────────────────────────────────── */}
        {activeTab === "billing" && <BillingTab />}

        {/* ── API Keys tab ───────────────────────────────────── */}
        {activeTab === "apikeys" && <ApiKeysTab />}

        {/* ── LPR tab ─────────────────────────────────────────── */}
        {activeTab === "lpr" && <LprTab />}

        {/* ── Edge Agents tab ──────────────────────────────────── */}
        {activeTab === "edge" && <EdgeAgentsTab />}

        {/* ── Config & Secrets tab ─────────────────────────────── */}
        {activeTab === "config" && <ConfigTab />}

        {/* ── SSO / Identity tab ──────────────────────────────── */}
        {activeTab === "sso" && <SsoTab />}

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
