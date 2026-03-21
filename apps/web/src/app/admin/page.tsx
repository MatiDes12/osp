"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Users,
  Camera,
  Activity,
  Video,
  Search,
  RefreshCw,
  ChevronRight,
  X,
  AlertTriangle,
  CheckCircle,
  Ban,
  Trash2,
  ExternalLink,
  LogOut,
  Circle,
  BarChart2,
  Building2,
  Bell,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("osp_access_token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface GlobalStats {
  tenants: { total: number; active: number; suspended: number };
  cameras: { total: number; online: number; offline: number };
  events: { last24h: number };
  recordings: { total: number };
}

interface TenantRow {
  tenant_id: string;
  tenant_name: string;
  plan: string;
  status: string;
  created_at: string;
  camera_count: number;
  cameras_online: number;
  event_count_7d: number;
  recording_count: number;
  last_active_at: string | null;
}

interface TenantDetail {
  tenant: Record<string, unknown>;
  cameras: Array<{ id: string; name: string; status: string; protocol: string; last_seen_at: string | null }>;
  recentEvents: Array<{ id: string; type: string; severity: string; created_at: string }>;
  recordingCount: number;
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function PlanBadge({ plan }: { plan: string }) {
  const colors: Record<string, string> = {
    free: "bg-zinc-800 text-zinc-400",
    starter: "bg-blue-500/10 text-blue-400",
    pro: "bg-violet-500/10 text-violet-400",
    enterprise: "bg-amber-500/10 text-amber-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${colors[plan] ?? colors.free}`}>
      {plan}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const color = status === "active" ? "text-green-500" : "text-red-500";
  return <Circle className={`h-2 w-2 shrink-0 fill-current ${color}`} />;
}

/* ─── Stat card ─────────────────────────────────────────────────────────── */

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "blue",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  sub?: string;
  color?: "blue" | "green" | "amber" | "violet";
}) {
  const iconColor = {
    blue: "text-blue-500 bg-blue-500/10",
    green: "text-green-500 bg-green-500/10",
    amber: "text-amber-500 bg-amber-500/10",
    violet: "text-violet-500 bg-violet-500/10",
  }[color];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-zinc-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-zinc-50 tabular-nums">{value}</p>
          {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg shrink-0 ${iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

/* ─── Tenant detail drawer ──────────────────────────────────────────────── */

function TenantDrawer({
  tenantId,
  tenantName,
  onClose,
  onSuspend,
  onDelete,
}: {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
  onSuspend: (id: string, action: "suspend" | "unsuspend") => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/admin/tenants/${tenantId}`, {
          headers: getAuthHeaders(),
        });
        const json = await res.json();
        if (json.success) setDetail(json.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  const tenant = detail?.tenant as Record<string, unknown> | undefined;
  const isSuspended = (tenant?.["status"] as string) === "suspended";

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Scrim */}
      <div
        className="flex-1 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="w-full max-w-lg bg-zinc-950 border-l border-zinc-800 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-50 truncate">{tenantName}</p>
              {tenant && (
                <p className="text-xs text-zinc-500 truncate font-mono">{tenantId}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="h-5 w-5 text-zinc-600 animate-spin" />
          </div>
        ) : !detail ? (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
            Failed to load tenant
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Tenant meta */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Plan", value: <PlanBadge plan={tenant?.["plan"] as string ?? "free"} /> },
                { label: "Status", value: <span className={`text-xs font-medium ${isSuspended ? "text-red-400" : "text-green-400"}`}>{isSuspended ? "Suspended" : "Active"}</span> },
                { label: "Cameras", value: <span className="text-sm text-zinc-200">{detail.cameras.length}</span> },
                { label: "Recordings", value: <span className="text-sm text-zinc-200 tabular-nums">{detail.recordingCount}</span> },
                { label: "Created", value: <span className="text-xs text-zinc-400">{new Date(tenant?.["created_at"] as string).toLocaleDateString()}</span> },
                { label: "Events (7d)", value: <span className="text-sm text-zinc-200 tabular-nums">{detail.recentEvents.length}+</span> },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2.5">
                  <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
                  {value}
                </div>
              ))}
            </div>

            {/* Cameras */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                Cameras ({detail.cameras.length})
              </h3>
              {detail.cameras.length === 0 ? (
                <p className="text-sm text-zinc-600">No cameras added</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.cameras.map((cam) => (
                    <div
                      key={cam.id}
                      className="flex items-center gap-3 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2"
                    >
                      <Circle
                        className={`h-2 w-2 shrink-0 fill-current ${cam.status === "online" ? "text-green-500" : "text-zinc-600"}`}
                      />
                      <span className="text-sm text-zinc-200 truncate flex-1">{cam.name}</span>
                      <span className="text-[10px] text-zinc-500 uppercase shrink-0">{cam.protocol}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent events */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">
                Recent Events
              </h3>
              {detail.recentEvents.length === 0 ? (
                <p className="text-sm text-zinc-600">No recent events</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.recentEvents.slice(0, 8).map((evt) => (
                    <div
                      key={evt.id}
                      className="flex items-center gap-3 rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                          evt.severity === "high" ? "bg-red-500" :
                          evt.severity === "medium" ? "bg-amber-500" : "bg-zinc-500"
                        }`}
                      />
                      <span className="text-xs text-zinc-300 flex-1 truncate">{evt.type}</span>
                      <span className="text-[10px] text-zinc-500 shrink-0">{timeAgo(evt.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="shrink-0 px-6 py-4 border-t border-zinc-800 flex items-center gap-3">
          <a
            href={`/cameras?tenant=${tenantId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View as tenant
          </a>

          <div className="flex-1" />

          <button
            onClick={() => {
              if (tenant) {
                onSuspend(tenantId, isSuspended ? "unsuspend" : "suspend");
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors cursor-pointer ${
              isSuspended
                ? "text-green-400 hover:bg-green-500/10 hover:text-green-300"
                : "text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
            }`}
          >
            {isSuspended ? (
              <><CheckCircle className="h-3.5 w-3.5" /> Unsuspend</>
            ) : (
              <><Ban className="h-3.5 w-3.5" /> Suspend</>
            )}
          </button>

          <button
            onClick={() => onDelete(tenantId, tenantName)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-red-500 hover:bg-red-500/10 hover:text-red-400 transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Delete confirm modal ───────────────────────────────────────────────── */

function DeleteModal({
  tenantId,
  tenantName,
  onConfirm,
  onCancel,
}: {
  tenantId: string;
  tenantName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl bg-zinc-900 border border-zinc-700 p-6 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-red-500/10">
            <AlertTriangle className="h-5 w-5 text-red-500" />
          </div>
          <h2 className="text-base font-semibold text-zinc-50">Delete Tenant</h2>
        </div>

        <p className="text-sm text-zinc-400 mb-2">
          This will permanently delete <span className="text-zinc-200 font-medium">{tenantName}</span> and all their data — cameras, events, recordings, and rules. This cannot be undone.
        </p>

        <p className="text-xs text-zinc-500 mb-3">
          Type <span className="font-mono text-zinc-300">{tenantName}</span> to confirm:
        </p>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={tenantName}
          className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500 mb-4"
        />

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg text-sm text-zinc-400 bg-zinc-800 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={input !== tenantName}
            className="flex-1 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete Tenant
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────────────────── */

export default function AdminPage() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [totalTenants, setTotalTenants] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "tenants">("overview");

  const [selectedTenant, setSelectedTenant] = useState<{ id: string; name: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Auth check ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/admin/stats`, {
          headers: getAuthHeaders(),
        });
        if (res.status === 401 || res.status === 403) {
          setAuthorized(false);
        } else {
          const json = await res.json();
          if (json.success) {
            setAuthorized(true);
            setStats(json.data);
          } else {
            setAuthorized(false);
          }
        }
      } catch {
        setAuthorized(false);
      }
    })();
  }, []);

  // ── Fetch tenants ───────────────────────────────────────────────────────
  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        status: statusFilter,
        ...(search ? { search } : {}),
      });
      const res = await fetch(`${API_URL}/api/v1/admin/tenants?${params}`, {
        headers: getAuthHeaders(),
      });
      const json = await res.json();
      if (json.success) {
        setTenants(json.data);
        setTotalTenants(json.meta.total);
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    if (authorized) fetchTenants();
  }, [authorized, fetchTenants]);

  // ── Suspend / unsuspend ─────────────────────────────────────────────────
  const handleSuspend = async (id: string, action: "suspend" | "unsuspend") => {
    setActionLoading(id);
    try {
      await fetch(`${API_URL}/api/v1/admin/tenants/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: action === "suspend" ? "suspended" : "active" }),
      });
      fetchTenants();
      setSelectedTenant(null);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      await fetch(`${API_URL}/api/v1/admin/tenants/${deleteTarget.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setDeleteTarget(null);
      setSelectedTenant(null);
      fetchTenants();
    } finally {
      setActionLoading(null);
    }
  };

  // ── Not authorized ──────────────────────────────────────────────────────
  if (authorized === false) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-red-500/10 flex items-center justify-center">
            <Shield className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-zinc-50 mb-2">Access Denied</h1>
          <p className="text-sm text-zinc-500 mb-6">
            This area is restricted to OSP superadmins. Your account does not have the required privileges.
          </p>
          <button
            onClick={() => router.push("/cameras")}
            className="px-4 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors cursor-pointer"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (authorized === null) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RefreshCw className="h-5 w-5 text-zinc-600 animate-spin" />
      </div>
    );
  }

  const totalPages = Math.ceil(totalTenants / 25);

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-zinc-800 bg-zinc-950 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-50">OSP Admin</h1>
            <p className="text-[10px] text-zinc-500">Superadmin Panel</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/cameras"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Dashboard
          </a>
          <button
            onClick={() => {
              localStorage.removeItem("osp_access_token");
              localStorage.removeItem("osp_refresh_token");
              window.location.href = "/login";
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800 px-6">
        <div className="flex gap-1">
          {(["overview", "tenants"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer capitalize ${
                activeTab === tab
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab === "overview" ? (
                <span className="flex items-center gap-1.5"><BarChart2 className="h-3.5 w-3.5" />Overview</span>
              ) : (
                <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Tenants {totalTenants > 0 && <span className="text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded-full">{totalTenants}</span>}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <main className="p-6 max-w-7xl mx-auto">
        {/* ── Overview tab ─────────────────────────────────────────────── */}
        {activeTab === "overview" && stats && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-zinc-50 mb-4">System Overview</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  icon={Building2}
                  label="Total Tenants"
                  value={stats.tenants.total}
                  sub={`${stats.tenants.active} active · ${stats.tenants.suspended} suspended`}
                  color="blue"
                />
                <StatCard
                  icon={Camera}
                  label="Total Cameras"
                  value={stats.cameras.total}
                  sub={`${stats.cameras.online} online · ${stats.cameras.offline} offline`}
                  color="green"
                />
                <StatCard
                  icon={Bell}
                  label="Events (24h)"
                  value={stats.events.last24h}
                  color="amber"
                />
                <StatCard
                  icon={Video}
                  label="Recordings"
                  value={stats.recordings.total}
                  color="violet"
                />
              </div>
            </div>

            {/* Quick actions */}
            <div>
              <h2 className="text-base font-semibold text-zinc-50 mb-4">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    icon: Building2,
                    label: "Manage Tenants",
                    desc: "View, suspend, or delete tenant accounts",
                    onClick: () => setActiveTab("tenants"),
                  },
                  {
                    icon: Users,
                    label: "Superadmin Users",
                    desc: "Grant/revoke admin access via Supabase SQL editor",
                    href: "https://supabase.com/dashboard",
                  },
                  {
                    icon: Activity,
                    label: "System Health",
                    desc: "Monitor gateway, go2rtc, Redis, and services",
                    href: "/health",
                  },
                ].map(({ icon: Icon, label, desc, onClick, href }) => (
                  <button
                    key={label}
                    onClick={onClick ?? (() => href && window.open(href, "_blank"))}
                    className="flex items-start gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800/50 transition-colors cursor-pointer text-left group"
                  >
                    <div className="p-2 rounded-lg bg-blue-500/10 shrink-0">
                      <Icon className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-200 group-hover:text-zinc-50 transition-colors">{label}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-zinc-600 ml-auto shrink-0 mt-0.5 group-hover:text-zinc-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>

            {/* Grant superadmin instructions */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
              <h3 className="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-red-400" />
                Granting Superadmin Access
              </h3>
              <p className="text-xs text-zinc-500 mb-3">
                Run this SQL in the Supabase SQL editor to grant a user superadmin privileges:
              </p>
              <pre className="text-xs font-mono bg-zinc-950 border border-zinc-700 rounded-lg p-3 text-zinc-300 overflow-x-auto">
{`-- Grant superadmin
SELECT grant_superadmin('<user-uuid>');

-- Revoke superadmin
SELECT revoke_superadmin('<user-uuid>');

-- Find a user's UUID
SELECT id, email FROM auth.users WHERE email = 'admin@yourcompany.com';`}
              </pre>
            </div>
          </div>
        )}

        {/* ── Tenants tab ───────────────────────────────────────────────── */}
        {activeTab === "tenants" && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 min-w-0 w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search tenants…"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {(["all", "active", "suspended"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setPage(1); }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer capitalize ${
                      statusFilter === s
                        ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        : "text-zinc-500 hover:text-zinc-300 border border-zinc-800"
                    }`}
                  >
                    {s}
                  </button>
                ))}

                <button
                  onClick={fetchTenants}
                  disabled={loading}
                  className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-zinc-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900">
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Tenant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide hidden sm:table-cell">Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide hidden md:table-cell">Cameras</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide hidden lg:table-cell">Events (7d)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide hidden lg:table-cell">Last Active</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wide">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {loading && tenants.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i} className="bg-zinc-950">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
                        </td>
                      </tr>
                    ))
                  ) : tenants.length === 0 ? (
                    <tr className="bg-zinc-950">
                      <td colSpan={7} className="px-4 py-10 text-center text-zinc-600 text-sm">
                        No tenants found
                      </td>
                    </tr>
                  ) : (
                    tenants.map((t) => (
                      <tr
                        key={t.tenant_id}
                        className="bg-zinc-950 hover:bg-zinc-900 transition-colors cursor-pointer"
                        onClick={() => setSelectedTenant({ id: t.tenant_id, name: t.tenant_name })}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-7 w-7 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-400 shrink-0">
                              {t.tenant_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-200 truncate">{t.tenant_name}</p>
                              <p className="text-[10px] text-zinc-600 font-mono truncate">{t.tenant_id.split("-")[0]}&hellip;</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <PlanBadge plan={t.plan} />
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-sm text-zinc-300 tabular-nums">{t.camera_count}</span>
                          {t.cameras_online > 0 && (
                            <span className="text-xs text-green-500 ml-1">({t.cameras_online} online)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-sm text-zinc-300 tabular-nums">{t.event_count_7d}</span>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <span className="text-xs text-zinc-500">{timeAgo(t.last_active_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <StatusDot status={t.status} />
                            <span className={`text-xs capitalize ${t.status === "active" ? "text-green-400" : "text-red-400"}`}>
                              {t.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSuspend(t.tenant_id, t.status === "suspended" ? "unsuspend" : "suspend");
                              }}
                              disabled={actionLoading === t.tenant_id}
                              title={t.status === "suspended" ? "Unsuspend" : "Suspend"}
                              className="p-1.5 rounded-md text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget({ id: t.tenant_id, name: t.tenant_name });
                              }}
                              title="Delete"
                              className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{totalTenants} total tenants</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <span className="px-2">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Tenant detail drawer ─────────────────────────────────────────── */}
      {selectedTenant && (
        <TenantDrawer
          tenantId={selectedTenant.id}
          tenantName={selectedTenant.name}
          onClose={() => setSelectedTenant(null)}
          onSuspend={handleSuspend}
          onDelete={(id, name) => setDeleteTarget({ id, name })}
        />
      )}

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      {deleteTarget && (
        <DeleteModal
          tenantId={deleteTarget.id}
          tenantName={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
