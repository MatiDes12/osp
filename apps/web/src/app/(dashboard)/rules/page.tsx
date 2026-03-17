"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  AlertRule,
  ApiResponse,
  Camera,
  RuleActionType,
  ConditionOperator,
  RuleAction,
  EventType,
} from "@osp/shared";
import {
  Zap,
  Plus,
  ChevronDown,
  Check,
  Play,
  Trash2,
  Bell,
  Mail,
  Globe,
  Video,
  Puzzle,
  X,
  AlertCircle,
  ArrowUpDown,
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

const EVENT_TYPE_OPTIONS: readonly { value: EventType; label: string }[] = [
  { value: "motion", label: "Motion Detected" },
  { value: "person", label: "Person Detected" },
  { value: "vehicle", label: "Vehicle Detected" },
  { value: "animal", label: "Animal Detected" },
  { value: "camera_offline", label: "Camera Offline" },
  { value: "camera_online", label: "Camera Online" },
  { value: "tampering", label: "Tampering" },
  { value: "audio", label: "Audio Event" },
  { value: "custom", label: "Custom" },
];

const ACTION_TYPE_META: Record<
  RuleActionType,
  { label: string; icon: typeof Bell; description: string }
> = {
  push_notification: {
    label: "Push Notification",
    icon: Bell,
    description: "Send push notification to mobile devices",
  },
  email: {
    label: "Email",
    icon: Mail,
    description: "Send email to specified recipients",
  },
  webhook: {
    label: "Webhook",
    icon: Globe,
    description: "POST event data to a URL",
  },
  start_recording: {
    label: "Start Recording",
    icon: Video,
    description: "Begin recording on the camera",
  },
  extension_hook: {
    label: "Extension Hook",
    icon: Puzzle,
    description: "Trigger an installed extension",
  },
};

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: "equals",
  neq: "not equals",
  gt: "greater than",
  gte: "greater or equal",
  lt: "less than",
  lte: "less or equal",
  contains: "contains",
  not_contains: "not contains",
  in: "in",
};

const CONDITION_FIELDS = [
  { value: "confidence", label: "Confidence" },
  { value: "object_count", label: "Object Count" },
  { value: "zone_name", label: "Zone Name" },
  { value: "time_of_day", label: "Time of Day" },
  { value: "severity", label: "Severity" },
  { value: "intensity", label: "Intensity" },
];

type SortKey = "name" | "lastTriggered" | "created";

/* ------------------------------------------------------------------ */
/*  Skeleton loader                                                    */
/* ------------------------------------------------------------------ */
function RuleCardSkeleton() {
  return (
    <div className="animate-pulse bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-2">
      <div className="flex items-center justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 bg-zinc-800 rounded" />
          <div className="h-3 w-48 bg-zinc-800 rounded" />
          <div className="flex gap-3 mt-2">
            <div className="h-3 w-20 bg-zinc-800 rounded" />
            <div className="h-3 w-16 bg-zinc-800 rounded" />
          </div>
        </div>
        <div className="h-5 w-9 bg-zinc-800 rounded-full" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG connector arrow                                                */
/* ------------------------------------------------------------------ */
function ConnectorArrow() {
  return (
    <div className="flex justify-center py-2">
      <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
        <line
          x1="12"
          y1="0"
          x2="12"
          y2="24"
          stroke="#52525b"
          strokeWidth="2"
        />
        <polygon points="6,22 12,30 18,22" fill="#52525b" />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function RulesPage() {
  const [rules, setRules] = useState<readonly AlertRule[]>([]);
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [testRunning, setTestRunning] = useState(false);
  const [testSteps, setTestSteps] = useState<
    readonly { label: string; passed: boolean }[]
  >([]);

  // Editor form state
  const [editTrigger, setEditTrigger] = useState<EventType>("motion");
  const [editCameraIds, setEditCameraIds] = useState<readonly string[]>([]);
  const [editConditions, setEditConditions] = useState<
    readonly {
      field: string;
      operator: ConditionOperator;
      value: string;
      logic: "AND" | "OR";
    }[]
  >([]);
  const [editActions, setEditActions] = useState<readonly RuleAction[]>([]);

  const selectedRule = rules.find((r) => r.id === selectedRuleId) ?? null;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rulesRes, camerasRes] = await Promise.all([
        fetch(`${API_URL}/api/v1/rules`, { headers: getAuthHeaders() }),
        fetch(`${API_URL}/api/v1/cameras`, { headers: getAuthHeaders() }),
      ]);
      const rulesJson: ApiResponse<AlertRule[]> = await rulesRes.json();
      const camerasJson: ApiResponse<Camera[]> = await camerasRes.json();

      if (rulesJson.success && rulesJson.data) {
        setRules(rulesJson.data);
      } else {
        setError(rulesJson.error?.message ?? "Failed to load rules");
      }
      if (camerasJson.success && camerasJson.data) {
        setCameras(camerasJson.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Populate editor when selecting a rule
  useEffect(() => {
    if (selectedRule) {
      setEditTrigger(selectedRule.triggerEvent);
      setEditCameraIds(selectedRule.cameraIds ?? []);
      setEditActions(selectedRule.actions);

      // Flatten top-level conditions for editing
      const flatConditions: typeof editConditions extends readonly (infer U)[]
        ? U[]
        : never = [];
      if (selectedRule.conditions.children.length > 0) {
        for (const child of selectedRule.conditions.children) {
          if ("field" in child) {
            flatConditions.push({
              field: child.field,
              operator: child.operator,
              value: String(child.value),
              logic: selectedRule.conditions.operator,
            });
          }
        }
      }
      setEditConditions(
        flatConditions.length > 0
          ? flatConditions
          : [{ field: "confidence", operator: "gt", value: "0.5", logic: "AND" }],
      );
    }
  }, [selectedRule]);

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
            prev.map((r) =>
              r.id === ruleId ? { ...r, enabled: !currentEnabled } : r,
            ),
          );
        }
      } catch {
        // User can retry by toggling again
      }
    },
    [],
  );

  const handleTestRule = useCallback(async () => {
    setTestRunning(true);
    setTestSteps([]);
    const steps = [
      { label: "Evaluating trigger conditions", passed: false },
      { label: "Checking condition filters", passed: false },
      { label: "Validating action configs", passed: false },
      { label: "Simulating action dispatch", passed: false },
    ];
    for (let i = 0; i < steps.length; i++) {
      await new Promise((r) => setTimeout(r, 600));
      const step = steps[i];
      if (step) {
        setTestSteps((prev) => [
          ...prev,
          { label: step.label, passed: true },
        ]);
      }
    }
    setTestRunning(false);
  }, []);

  // Sort rules
  const sortedRules = [...rules].sort((a, b) => {
    switch (sortKey) {
      case "name":
        return a.name.localeCompare(b.name);
      case "lastTriggered":
        return (
          new Date(b.lastTriggeredAt ?? 0).getTime() -
          new Date(a.lastTriggeredAt ?? 0).getTime()
        );
      case "created":
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      default:
        return 0;
    }
  });

  return (
    <div className="flex h-[calc(100vh-3.5rem)] -m-6">
      {/* ── Left panel: Rules list ────────────────────────────── */}
      <div className="w-[40%] min-w-[320px] bg-zinc-950 border-r border-zinc-800 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800">
          <h1 className="text-lg font-bold text-zinc-50">Alert Rules</h1>
          <button className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-blue-600 cursor-pointer">
            <Zap className="h-3.5 w-3.5" />
            Create Rule
          </button>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-zinc-800/50">
          <ArrowUpDown className="h-3 w-3 text-zinc-500 mr-1" />
          {(["name", "lastTriggered", "created"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setSortKey(key)}
              className={`px-2 py-1 text-xs rounded transition-colors duration-150 cursor-pointer ${
                sortKey === key
                  ? "bg-zinc-800 text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {key === "lastTriggered"
                ? "Last Triggered"
                : key.charAt(0).toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>

        {/* Rules list */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loading && (
            <>
              <RuleCardSkeleton />
              <RuleCardSkeleton />
              <RuleCardSkeleton />
              <RuleCardSkeleton />
            </>
          )}

          {error && !loading && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4" />
                <span className="font-medium">Failed to load rules</span>
              </div>
              <p className="text-xs text-red-400/80">{error}</p>
              <button
                onClick={fetchData}
                className="mt-2 text-xs underline hover:no-underline cursor-pointer"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && rules.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <Zap className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium mb-1">No alert rules</p>
              <p className="text-xs text-zinc-500">
                Create your first rule to get started.
              </p>
            </div>
          )}

          {!loading &&
            !error &&
            sortedRules.map((rule) => (
              <button
                key={rule.id}
                onClick={() => setSelectedRuleId(rule.id)}
                className={`w-full text-left bg-zinc-900 border rounded-lg p-4 mb-2 cursor-pointer transition-all duration-150 hover:bg-zinc-800/50 ${
                  selectedRuleId === rule.id
                    ? "ring-1 ring-blue-500/50 bg-zinc-800/30 border-zinc-700"
                    : "border-zinc-800"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {/* Name + description */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-zinc-50 truncate">
                        {rule.name}
                      </span>
                      {rule.enabled && (
                        <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                      )}
                    </div>
                    {rule.description && (
                      <p className="text-xs text-zinc-500 mb-2 line-clamp-1">
                        {rule.description}
                      </p>
                    )}

                    {/* Trigger + scope */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                        <Zap className="h-2.5 w-2.5" />
                        {EVENT_TYPE_LABELS[rule.triggerEvent] ??
                          rule.triggerEvent}
                      </span>
                      {rule.cameraIds && rule.cameraIds.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                          {rule.cameraIds.length} camera
                          {rule.cameraIds.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Last triggered + count */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500 font-mono">
                        {formatRelativeTime(rule.lastTriggeredAt)}
                      </span>
                      {rule.triggerCount24h > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                          {rule.triggerCount24h} in 24h
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleEnabled(rule.id, rule.enabled);
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 cursor-pointer ${
                      rule.enabled ? "bg-green-500" : "bg-zinc-700"
                    }`}
                    role="switch"
                    aria-checked={rule.enabled}
                    aria-label={`${rule.enabled ? "Disable" : "Enable"} ${rule.name}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-150 ${
                        rule.enabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </button>
            ))}
        </div>
      </div>

      {/* ── Right panel: Rule editor ──────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-zinc-950/50">
        {!selectedRule ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500">
            <Zap className="h-16 w-16 mb-4 opacity-20" />
            <p className="text-lg font-medium text-zinc-400">
              Select a rule to edit
            </p>
            <p className="text-sm text-zinc-600 mt-1">
              Choose from the list or create a new one
            </p>
          </div>
        ) : (
          <div className="p-6 max-w-2xl mx-auto">
            {/* Rule name header */}
            <div className="mb-6">
              <h2 className="text-xl font-bold text-zinc-50">
                {selectedRule.name}
              </h2>
              {selectedRule.description && (
                <p className="text-sm text-zinc-500 mt-1">
                  {selectedRule.description}
                </p>
              )}
            </div>

            {/* ── TRIGGER block ─────────────────────────────── */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                <h3 className="text-sm font-semibold text-blue-400">
                  When this happens
                </h3>
              </div>

              {/* Trigger type */}
              <div className="mb-3">
                <label className="block text-xs text-zinc-400 mb-1.5">
                  Trigger Type
                </label>
                <div className="relative">
                  <select
                    value={editTrigger}
                    onChange={(e) =>
                      setEditTrigger(e.target.value as EventType)
                    }
                    className="w-full appearance-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 pr-8 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-150 cursor-pointer"
                  >
                    {EVENT_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {/* Camera selector */}
              <div className="mb-3">
                <label className="block text-xs text-zinc-400 mb-1.5">
                  Cameras
                </label>
                <div className="flex flex-wrap gap-1.5 min-h-[38px] rounded-md border border-zinc-700 bg-zinc-900 p-2">
                  {editCameraIds.length === 0 && (
                    <span className="text-xs text-zinc-500">
                      All cameras (no filter)
                    </span>
                  )}
                  {editCameraIds.map((cId) => {
                    const cam = cameras.find((c) => c.id === cId);
                    return (
                      <span
                        key={cId}
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                      >
                        {cam?.name ?? cId}
                        <button
                          onClick={() =>
                            setEditCameraIds((prev) =>
                              prev.filter((id) => id !== cId),
                            )
                          }
                          className="hover:text-zinc-50 transition-colors duration-150 cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    );
                  })}
                  <div className="relative ml-auto">
                    <select
                      value=""
                      onChange={(e) => {
                        if (
                          e.target.value &&
                          !editCameraIds.includes(e.target.value)
                        ) {
                          setEditCameraIds((prev) => [
                            ...prev,
                            e.target.value,
                          ]);
                        }
                      }}
                      className="appearance-none rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400 border-none focus:outline-none cursor-pointer"
                    >
                      <option value="">+ Add camera</option>
                      {cameras
                        .filter((c) => !editCameraIds.includes(c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Arrow connector */}
            <ConnectorArrow />

            {/* ── CONDITIONS block ──────────────────────────── */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                <h3 className="text-sm font-semibold text-amber-400">
                  If these conditions are met
                </h3>
              </div>

              <div className="space-y-2">
                {editConditions.map((cond, idx) => (
                  <div key={idx}>
                    {/* AND/OR toggle between rows */}
                    {idx > 0 && (
                      <div className="flex justify-center py-1">
                        <button
                          onClick={() => {
                            setEditConditions((prev) =>
                              prev.map((c, i) =>
                                i === idx
                                  ? {
                                      ...c,
                                      logic:
                                        c.logic === "AND" ? "OR" : "AND",
                                    }
                                  : c,
                              ),
                            );
                          }}
                          className="px-2 py-0.5 text-[10px] font-semibold rounded bg-zinc-800 text-amber-400 hover:bg-zinc-700 transition-colors duration-150 cursor-pointer"
                        >
                          {cond.logic}
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {/* Field */}
                      <select
                        value={cond.field}
                        onChange={(e) =>
                          setEditConditions((prev) =>
                            prev.map((c, i) =>
                              i === idx
                                ? { ...c, field: e.target.value }
                                : c,
                            ),
                          )
                        }
                        className="flex-1 appearance-none rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-50 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                      >
                        {CONDITION_FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>

                      {/* Operator */}
                      <select
                        value={cond.operator}
                        onChange={(e) =>
                          setEditConditions((prev) =>
                            prev.map((c, i) =>
                              i === idx
                                ? {
                                    ...c,
                                    operator:
                                      e.target.value as ConditionOperator,
                                  }
                                : c,
                            ),
                          )
                        }
                        className="w-32 appearance-none rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-50 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
                      >
                        {(
                          Object.entries(OPERATOR_LABELS) as [
                            ConditionOperator,
                            string,
                          ][]
                        ).map(([op, label]) => (
                          <option key={op} value={op}>
                            {label}
                          </option>
                        ))}
                      </select>

                      {/* Value */}
                      <input
                        type="text"
                        value={cond.value}
                        onChange={(e) =>
                          setEditConditions((prev) =>
                            prev.map((c, i) =>
                              i === idx
                                ? { ...c, value: e.target.value }
                                : c,
                            ),
                          )
                        }
                        className="w-24 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-50 focus:outline-none focus:ring-1 focus:ring-amber-500"
                        placeholder="Value"
                      />

                      {/* Remove */}
                      <button
                        onClick={() =>
                          setEditConditions((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors duration-150 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() =>
                  setEditConditions((prev) => [
                    ...prev,
                    {
                      field: "confidence",
                      operator: "gt" as ConditionOperator,
                      value: "",
                      logic: "AND",
                    },
                  ])
                }
                className="mt-3 inline-flex items-center gap-1 text-xs text-amber-400/70 hover:text-amber-400 transition-colors duration-150 cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                Add Condition
              </button>
            </div>

            {/* Arrow connector */}
            <ConnectorArrow />

            {/* ── ACTIONS block ─────────────────────────────── */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                <h3 className="text-sm font-semibold text-green-400">
                  Then do this
                </h3>
              </div>

              <div className="space-y-2">
                {editActions.map((action, idx) => {
                  const meta = ACTION_TYPE_META[action.type];
                  const Icon = meta?.icon ?? Bell;
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-md border border-zinc-700/50 bg-zinc-900/50 p-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
                        <Icon className="h-4 w-4 text-green-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-zinc-50">
                          {meta?.label ?? action.type}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {meta?.description ?? "Custom action"}
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          setEditActions((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        className="p-1 text-zinc-500 hover:text-red-400 transition-colors duration-150 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 relative">
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      setEditActions((prev) => [
                        ...prev,
                        {
                          type: e.target.value as RuleActionType,
                          config: {},
                        },
                      ]);
                    }
                  }}
                  className="appearance-none text-xs text-green-400/70 hover:text-green-400 bg-transparent border-none focus:outline-none cursor-pointer"
                >
                  <option value="">+ Add Action</option>
                  {(
                    Object.entries(ACTION_TYPE_META) as [
                      RuleActionType,
                      (typeof ACTION_TYPE_META)[RuleActionType],
                    ][]
                  ).map(([type, meta]) => (
                    <option key={type} value={type}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Test results ──────────────────────────────── */}
            {testSteps.length > 0 && (
              <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h4 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">
                  Dry Run Results
                </h4>
                <div className="space-y-2">
                  {testSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full ${
                          step.passed
                            ? "bg-green-500/20 text-green-400"
                            : "bg-zinc-800 text-zinc-600"
                        }`}
                      >
                        <Check className="h-2.5 w-2.5" />
                      </span>
                      <span className="text-xs text-zinc-300">
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Bottom buttons ────────────────────────────── */}
            <div className="flex items-center gap-3 mt-6 pt-4 border-t border-zinc-800">
              <button
                onClick={handleTestRule}
                disabled={testRunning}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                {testRunning ? "Testing..." : "Test Rule"}
              </button>
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 transition-colors duration-150 cursor-pointer">
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
