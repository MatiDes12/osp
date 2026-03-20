"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import {
  Camera,
  X,
  Loader2,
  Wifi,
  Search,
  Radio,
  Plus,
  ChevronRight,
  Usb,
  Monitor,
  ArrowLeft,
  Copy,
  CheckCircle2,
} from "lucide-react";
import type { DiscoveredCamera } from "@osp/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// ---------------------------------------------------------------------------
// Protocol definitions
// ---------------------------------------------------------------------------

type AllProtocol =
  | "rtsp" | "onvif" | "isapi" | "dvrip"
  | "rtmp" | "hls" | "mjpeg" | "webrtc"
  | "ring" | "wyze" | "arlo" | "tuya" | "gopro"
  | "usb" | "ffmpeg" | "exec";

type FieldType = "text" | "password" | "number" | "select" | "textarea";

interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  defaultValue?: string;
}

interface ProtocolDef {
  id: AllProtocol;
  label: string;
  desc: string;
  icon: string;
  category: "ip" | "streaming" | "smarthome" | "local";
  cloud?: boolean; // needs go2rtc.yaml config
  fields: FieldDef[];
  buildUri: (vals: Record<string, string>) => string;
  yamlExample?: string;
  warning?: string; // shown as amber info box above fields
}

const PROTOCOLS: ProtocolDef[] = [
  // ── IP Cameras ──────────────────────────────────────────────────────────
  {
    id: "rtsp",
    label: "RTSP",
    desc: "Standard IP cameras",
    icon: "📷",
    category: "ip",
    fields: [
      { key: "host", label: "IP Address / Hostname", placeholder: "192.168.1.100", required: true },
      { key: "port", label: "Port", placeholder: "554", defaultValue: "554" },
      { key: "path", label: "Stream Path", placeholder: "/stream", defaultValue: "/stream" },
      { key: "username", label: "Username", placeholder: "admin" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
    ],
    buildUri: (v) => {
      const auth = v.username
        ? `${encodeURIComponent(v.username)}:${encodeURIComponent(v.password ?? "")}@`
        : "";
      const port = v.port || "554";
      const path = v.path || "/stream";
      return `rtsp://${auth}${v.host}:${port}${path}`;
    },
  },
  {
    id: "onvif",
    label: "ONVIF",
    desc: "ONVIF-compliant cameras",
    icon: "🔗",
    category: "ip",
    fields: [
      { key: "host", label: "IP Address / Hostname", placeholder: "192.168.1.100", required: true },
      { key: "port", label: "Port", placeholder: "80", defaultValue: "80" },
      { key: "username", label: "Username", placeholder: "admin" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
    ],
    buildUri: (v) => {
      const auth = v.username
        ? `${encodeURIComponent(v.username)}:${encodeURIComponent(v.password ?? "")}@`
        : "";
      const port = v.port || "80";
      return `onvif://${auth}${v.host}:${port}/`;
    },
  },
  {
    id: "isapi",
    label: "Hikvision",
    desc: "Hikvision ISAPI cameras",
    icon: "🎥",
    category: "ip",
    fields: [
      { key: "host", label: "IP Address / Hostname", placeholder: "192.168.1.100", required: true },
      { key: "port", label: "Port", placeholder: "80", defaultValue: "80" },
      { key: "username", label: "Username", placeholder: "admin" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
      {
        key: "channel",
        label: "Channel",
        placeholder: "101",
        defaultValue: "101",
        hint: "101 = channel 1 main stream, 102 = sub-stream",
      },
    ],
    buildUri: (v) => {
      const auth = v.username
        ? `${encodeURIComponent(v.username)}:${encodeURIComponent(v.password ?? "")}@`
        : "";
      const port = v.port || "80";
      const channel = v.channel || "101";
      return `isapi://${auth}${v.host}:${port}/streaming/channels/${channel}`;
    },
  },
  {
    id: "dvrip",
    label: "Dahua",
    desc: "Dahua DVR/NVR cameras",
    icon: "📸",
    category: "ip",
    fields: [
      { key: "host", label: "IP Address / Hostname", placeholder: "192.168.1.100", required: true },
      { key: "port", label: "Port", placeholder: "37777", defaultValue: "37777" },
      { key: "username", label: "Username", placeholder: "admin" },
      { key: "password", label: "Password", type: "password", placeholder: "••••••••" },
      { key: "channel", label: "Channel", placeholder: "1", defaultValue: "1" },
      {
        key: "subtype",
        label: "Stream Type",
        type: "select",
        defaultValue: "0",
        options: [
          { value: "0", label: "Main Stream" },
          { value: "1", label: "Sub Stream" },
        ],
      },
    ],
    buildUri: (v) => {
      const auth = v.username
        ? `${encodeURIComponent(v.username)}:${encodeURIComponent(v.password ?? "")}@`
        : "";
      const port = v.port || "37777";
      const channel = v.channel || "1";
      const subtype = v.subtype || "0";
      return `dvrip://${auth}${v.host}:${port}?channel=${channel}&subtype=${subtype}`;
    },
  },

  // ── Streaming ────────────────────────────────────────────────────────────
  {
    id: "rtmp",
    label: "RTMP",
    desc: "OBS, encoders, live streams",
    icon: "▶️",
    category: "streaming",
    fields: [
      {
        key: "url",
        label: "RTMP URL",
        placeholder: "rtmp://server/app/streamkey",
        required: true,
        hint: "Full RTMP URL including stream key",
      },
    ],
    buildUri: (v) => v.url || "",
  },
  {
    id: "hls",
    label: "HLS",
    desc: "HTTP Live Streaming (m3u8)",
    icon: "📺",
    category: "streaming",
    fields: [
      {
        key: "url",
        label: "HLS URL",
        placeholder: "http://server/stream.m3u8",
        required: true,
        hint: "HTTP/HTTPS URL to the .m3u8 playlist",
      },
    ],
    buildUri: (v) => v.url || "",
  },
  {
    id: "mjpeg",
    label: "MJPEG",
    desc: "HTTP Motion JPEG stream",
    icon: "🎬",
    category: "streaming",
    fields: [
      {
        key: "url",
        label: "MJPEG URL",
        placeholder: "http://192.168.1.100/video.mjpeg",
        required: true,
        hint: "HTTP URL to the MJPEG endpoint",
      },
    ],
    buildUri: (v) => v.url || "",
  },
  {
    id: "webrtc",
    label: "WebRTC",
    desc: "WebRTC / WHEP endpoint",
    icon: "🌐",
    category: "streaming",
    fields: [
      {
        key: "url",
        label: "WHEP URL",
        placeholder: "http://server/whep/stream",
        required: true,
        hint: "WebRTC WHEP endpoint URL",
      },
    ],
    buildUri: (v) => v.url || "",
  },

  // ── Smart Home & Branded ─────────────────────────────────────────────────
  {
    id: "ring",
    label: "Ring",
    desc: "Ring doorbells & cameras",
    icon: "🔔",
    category: "smarthome",
    cloud: true,
    fields: [
      {
        key: "streamName",
        label: "Stream Name",
        placeholder: "ring_front_door",
        required: true,
        hint: "The stream name you configured in go2rtc.yaml",
      },
    ],
    buildUri: (v) => v.streamName || "",
    yamlExample: `streams:
  ring_front_door:
    - ring:USERNAME:PASSWORD@12345678
    # USERNAME = Ring email, PASSWORD = Ring password
    # 12345678 = device ID (from Ring app → device info)`,
  },
  {
    id: "wyze",
    label: "Wyze",
    desc: "Wyze cameras",
    icon: "🐦",
    category: "smarthome",
    cloud: true,
    fields: [
      {
        key: "streamName",
        label: "Stream Name",
        placeholder: "wyze_cam_1",
        required: true,
        hint: "The stream name you configured in go2rtc.yaml",
      },
    ],
    buildUri: (v) => v.streamName || "",
    yamlExample: `streams:
  wyze_cam_1:
    - wyze:ACCESS_TOKEN:REFRESH_TOKEN@DEVICE_MAC
    # Get tokens from Wyze developer portal
    # DEVICE_MAC = found in Wyze app device settings`,
  },
  {
    id: "arlo",
    label: "Arlo",
    desc: "Arlo wireless cameras",
    icon: "📡",
    category: "smarthome",
    cloud: true,
    fields: [
      {
        key: "streamName",
        label: "Stream Name",
        placeholder: "arlo_backyard",
        required: true,
        hint: "The stream name you configured in go2rtc.yaml",
      },
    ],
    buildUri: (v) => v.streamName || "",
    yamlExample: `streams:
  arlo_backyard:
    - arlo:USERNAME:PASSWORD@DEVICE_ID
    # USERNAME = Arlo account email
    # PASSWORD = Arlo account password
    # DEVICE_ID = found in Arlo app`,
  },
  {
    id: "tuya",
    label: "TUYA",
    desc: "Tuya / Smart Life cameras",
    icon: "💡",
    category: "smarthome",
    cloud: true,
    fields: [
      {
        key: "streamName",
        label: "Stream Name",
        placeholder: "tuya_cam_1",
        required: true,
        hint: "The stream name you configured in go2rtc.yaml",
      },
    ],
    buildUri: (v) => v.streamName || "",
    yamlExample: `streams:
  tuya_cam_1:
    - tuya:DEVICE_ID:LOCAL_KEY@IP_ADDRESS
    # DEVICE_ID & LOCAL_KEY from Tuya IoT platform
    # IP_ADDRESS = your camera's local IP`,
  },
  {
    id: "gopro",
    label: "GoPro",
    desc: "GoPro action cameras",
    icon: "🏃",
    category: "smarthome",
    cloud: true,
    fields: [
      {
        key: "streamName",
        label: "Stream Name",
        placeholder: "gopro_hero",
        required: true,
        hint: "The stream name you configured in go2rtc.yaml",
      },
    ],
    buildUri: (v) => v.streamName || "",
    yamlExample: `streams:
  gopro_hero:
    - gopro://10.5.5.9  # Connect to GoPro's WiFi network first
    # The GoPro broadcasts at 10.5.5.9 when in WiFi mode`,
  },

  // ── Local & Advanced ─────────────────────────────────────────────────────
  {
    id: "ffmpeg",
    label: "FFmpeg",
    desc: "Custom FFmpeg source",
    icon: "⚡",
    category: "local",
    fields: [
      {
        key: "source",
        label: "FFmpeg Source",
        placeholder: "rtsp://...",
        required: true,
        hint: "Source URL or device path that FFmpeg can open",
      },
      {
        key: "params",
        label: "Video Codec / Params",
        placeholder: "h264",
        defaultValue: "h264",
        hint: "e.g. h264, h265, copy — appended as #video=...",
      },
    ],
    buildUri: (v) => {
      const params = v.params ? `#video=${v.params}` : "#video=h264";
      return `ffmpeg:${v.source || ""}${params}`;
    },
  },
  {
    id: "exec",
    label: "Exec",
    desc: "Shell command video source",
    icon: "💻",
    category: "local",
    fields: [
      {
        key: "command",
        label: "Shell Command",
        type: "textarea",
        placeholder: "ffmpeg -re -i /dev/video0 -f rtsp rtsp://localhost:8554/camera",
        required: true,
        hint: "Command whose stdout produces a video stream",
      },
    ],
    buildUri: (v) => `exec:${v.command || ""}`,
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  ip: "IP Cameras",
  streaming: "Streaming",
  smarthome: "Smart Home & Branded",
  local: "Advanced",
};

const CATEGORY_ORDER = ["ip", "streaming", "smarthome", "local"] as const;

// ---------------------------------------------------------------------------
// Component types
// ---------------------------------------------------------------------------

type DialogMode = "manual" | "scan";
type ManualStep = "pick" | "form";

interface AddCameraDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (data: {
    name: string;
    protocol: AllProtocol;
    connectionUri: string;
    location?: { label?: string };
    usbDeviceIndex?: number;
  }) => Promise<void>;
}

interface FormErrors {
  name?: string;
  connectionUri?: string;
  [key: string]: string | undefined;
}

interface ScanState {
  scanning: boolean;
  cameras: DiscoveredCamera[];
  usbCameras: DiscoveredCamera[];
  networkCameras: DiscoveredCamera[];
  scanDurationMs: number | null;
  subnetScanned: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldInput({
  def,
  value,
  onChange,
  error,
}: {
  def: FieldDef;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const baseClass =
    "w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors";

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
        {def.label}
        {def.required && <span className="text-red-400 ml-1">*</span>}
      </label>
      {def.type === "select" && def.options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={baseClass}>
          {def.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : def.type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          rows={3}
          className={`${baseClass} resize-none`}
        />
      ) : (
        <input
          type={def.type ?? "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.placeholder}
          className={baseClass}
          autoComplete={def.type === "password" ? "current-password" : "off"}
        />
      )}
      {def.hint && !error && <p className="mt-1 text-xs text-zinc-500">{def.hint}</p>}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}

function YamlGuide({ proto }: { proto: ProtocolDef }) {
  const [copied, setCopied] = useState(false);
  const yaml = proto.yamlExample ?? "";

  const handleCopy = () => {
    void navigator.clipboard.writeText(yaml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
      <p className="text-xs font-medium text-amber-400">
        {proto.icon} {proto.label} requires go2rtc.yaml configuration
      </p>
      <p className="text-xs text-zinc-400">
        Add this to your <code className="text-zinc-300 bg-zinc-800 px-1 rounded">go2rtc.yaml</code>{" "}
        file, then restart go2rtc:
      </p>
      <div className="relative">
        <pre className="text-xs text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-md p-3 overflow-x-auto leading-relaxed">
          {yaml}
        </pre>
        <button
          type="button"
          onClick={handleCopy}
          className="absolute top-2 right-2 p-1.5 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Copy YAML"
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <p className="text-xs text-zinc-500">
        Then enter the stream name below (must match the name in your YAML).
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function AddCameraDialog({ open, onClose, onSubmit }: AddCameraDialogProps) {
  const [mode, setMode] = useState<DialogMode>("manual");
  const [manualStep, setManualStep] = useState<ManualStep>("pick");
  const [selectedProto, setSelectedProto] = useState<ProtocolDef | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testDetails, setTestDetails] = useState<{
    codec?: string;
    resolution?: string;
    snapshotUrl?: string;
    error?: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // null = follow auto-built URI; string = user has manually overridden it
  const [uriOverride, setUriOverride] = useState<string | null>(null);

  // Scan state
  const [subnet, setSubnet] = useState("");
  const [scan, setScan] = useState<ScanState>({
    scanning: false,
    cameras: [],
    usbCameras: [],
    networkCameras: [],
    scanDurationMs: null,
    subnetScanned: null,
    error: null,
  });
  const [selectedPath, setSelectedPath] = useState<Record<string, string>>({});

  // Computed URI from fields; user can override it
  const builtUri = selectedProto ? selectedProto.buildUri(fieldValues) : "";
  const effectiveUri = uriOverride ?? builtUri;

  const resetForm = useCallback(() => {
    setMode("manual");
    setManualStep("pick");
    setSelectedProto(null);
    setFieldValues({});
    setName("");
    setLocationLabel("");
    setErrors({});
    setUriOverride(null);
    setSubmitError(null);
    setTestResult(null);
    setTestDetails(null);
    setTesting(false);
    setSubnet("");
    setScan({
      scanning: false,
      cameras: [],
      usbCameras: [],
      networkCameras: [],
      scanDurationMs: null,
      subnetScanned: null,
      error: null,
    });
    setSelectedPath({});
  }, []);

  useEffect(() => {
    if (!open) resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleSelectProtocol = useCallback((proto: ProtocolDef) => {
    setSelectedProto(proto);
    // Seed default values
    const defaults: Record<string, string> = {};
    for (const f of proto.fields) {
      defaults[f.key] = f.defaultValue ?? "";
    }
    setFieldValues(defaults);
    setErrors({});
    setUriOverride(null);
    setTestResult(null);
    setTestDetails(null);
    setManualStep("form");
  }, []);

  const setField = useCallback((key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setUriOverride(null); // re-follow auto-built URI when fields change
    setTestResult(null);
  }, []);

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!name.trim()) errs.name = "Camera name is required";
    if (!effectiveUri.trim()) errs.connectionUri = "Connection URI is required";
    if (selectedProto) {
      for (const f of selectedProto.fields) {
        if (f.required && !fieldValues[f.key]?.trim()) {
          errs[f.key] = `${f.label} is required`;
        }
      }
    }
    return errs;
  }, [name, effectiveUri, selectedProto, fieldValues]);

  const handleTest = useCallback(async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setTesting(true);
    setTestResult(null);
    setTestDetails(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/streams/test`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ connectionUri: effectiveUri, protocol: selectedProto?.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setTestResult("error");
        setTestDetails({ error: json.error?.message ?? "Connection failed" });
      } else {
        setTestResult("success");
        setTestDetails({
          codec: json.data?.codec,
          resolution: json.data?.resolution,
          snapshotUrl: json.data?.snapshotUrl,
        });
      }
    } catch (err) {
      setTestResult("error");
      setTestDetails({ error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setTesting(false);
    }
  }, [validate, effectiveUri, selectedProto]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const errs = validate();
      if (Object.keys(errs).length > 0) {
        setErrors(errs);
        return;
      }
      setErrors({});
      setSubmitError(null);
      setSubmitting(true);
      try {
        const data: Parameters<typeof onSubmit>[0] = {
          name: name.trim(),
          protocol: selectedProto!.id,
          connectionUri: effectiveUri,
        };
        if (locationLabel.trim()) {
          data.location = { label: locationLabel.trim() };
        }
        await onSubmit(data);
        resetForm();
        onClose();
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Failed to add camera");
      } finally {
        setSubmitting(false);
      }
    },
    [validate, name, selectedProto, effectiveUri, locationLabel, fieldValues, onSubmit, onClose, resetForm],
  );

  // Scan handlers
  const handleScanNetwork = useCallback(async () => {
    setScan((prev) => ({
      ...prev,
      scanning: true,
      error: null,
      cameras: [],
      usbCameras: [],
      networkCameras: [],
      scanDurationMs: null,
    }));
    try {
      const body: Record<string, string> = { mode: "all" };
      if (subnet.trim()) body.subnet = subnet.trim();
      const res = await fetch(`${API_URL}/api/v1/cameras/discover`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.success) {
        setScan((prev) => ({ ...prev, scanning: false, error: json.error?.message ?? "Scan failed" }));
        return;
      }
      const data = json.data as {
        cameras: DiscoveredCamera[];
        usb: DiscoveredCamera[];
        network: DiscoveredCamera[];
        scanDurationMs: number;
        subnetScanned?: string;
      };
      setScan({
        scanning: false,
        cameras: data.cameras,
        usbCameras: data.usb ?? [],
        networkCameras: data.network ?? [],
        scanDurationMs: data.scanDurationMs,
        subnetScanned: data.subnetScanned ?? null,
        error: null,
      });
    } catch (err) {
      setScan((prev) => ({
        ...prev,
        scanning: false,
        error: err instanceof Error ? err.message : "Network error",
      }));
    }
  }, [subnet]);

  const handleSelectDiscovered = useCallback(
    (cam: DiscoveredCamera) => {
      const proto = PROTOCOLS.find((p) => p.id === "rtsp")!;
      setSelectedProto(proto);
      setFieldValues({ host: cam.ip, port: String(cam.port || 554), path: "/stream", username: "", password: "" });
      setName(cam.manufacturer ? `${cam.manufacturer} - ${cam.ip}` : `Camera ${cam.ip}`);
      // If discovery gave us a full RTSP URL, override the built URI
      const discovered = selectedPath[cam.ip] ?? cam.rtspUrl;
      if (discovered) setUriOverride(discovered);
      setManualStep("form");
      setMode("manual");
    },
    [selectedPath],
  );

  if (!open) return null;

  const isWide = manualStep === "pick" && mode === "manual";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center animate-[fadeIn_200ms_ease-out]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />

      {/* Modal */}
      <div
        className={`relative z-50 w-full rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-lg shadow-black/40 animate-[fadeIn_200ms_ease-out] max-h-[90vh] overflow-y-auto transition-all duration-200 ${
          isWide ? "max-w-2xl" : "max-w-lg"
        }`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2.5 mb-4">
          {manualStep === "form" && mode === "manual" ? (
            <button
              type="button"
              onClick={() => { setManualStep("pick"); setTestResult(null); }}
              className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer mr-1"
              aria-label="Back to protocol selection"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Camera className="h-5 w-5 text-zinc-400" />
          )}
          <h2 className="text-lg font-semibold text-zinc-50">
            {manualStep === "form" && selectedProto
              ? `Add Camera — ${selectedProto.icon} ${selectedProto.label}`
              : "Add Camera"}
          </h2>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden mb-5">
          <button
            type="button"
            onClick={() => { setMode("manual"); setManualStep("pick"); }}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
              mode === "manual"
                ? "bg-blue-500/15 text-blue-400 border-b-2 border-blue-500"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Camera className="h-3.5 w-3.5" />
            Manual
          </button>
          <button
            type="button"
            onClick={() => setMode("scan")}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
              mode === "scan"
                ? "bg-blue-500/15 text-blue-400 border-b-2 border-blue-500"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            Detect Cameras
          </button>
        </div>

        {mode === "scan" ? (
          /* ── Scan Mode ── */
          <ScanPanel
            subnet={subnet}
            setSubnet={setSubnet}
            scan={scan}
            selectedPath={selectedPath}
            setSelectedPath={setSelectedPath}
            onScan={handleScanNetwork}
            onSelect={handleSelectDiscovered}
            onClose={onClose}
            onManual={() => { setMode("manual"); setManualStep("pick"); }}
          />
        ) : manualStep === "pick" ? (
          /* ── Protocol Picker ── */
          <ProtocolPicker onSelect={handleSelectProtocol} />
        ) : (
          /* ── Protocol Form ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Cloud camera YAML guide */}
            {selectedProto?.cloud && selectedProto.yamlExample && (
              <YamlGuide proto={selectedProto} />
            )}

            {/* Protocol warning (e.g. USB Docker limitation) */}
            {selectedProto?.warning && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-300 leading-relaxed">{selectedProto.warning}</p>
              </div>
            )}

            {/* Camera Name */}
            <div>
              <label htmlFor="cam-name" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Camera Name <span className="text-red-400">*</span>
              </label>
              <input
                id="cam-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setErrors((p) => { const n = { ...p }; delete n.name; return n; }); }}
                placeholder="Front Door Camera"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              {errors.name && <p className="mt-1 text-xs text-red-400">{errors.name}</p>}
            </div>

            {/* Protocol-specific fields */}
            {selectedProto?.fields.map((f) => (
              <FieldInput
                key={f.key}
                def={f}
                value={fieldValues[f.key] ?? ""}
                onChange={(v) => setField(f.key, v)}
                error={errors[f.key]}
              />
            ))}

            {/* Connection URI (editable — auto-built from fields above) */}
            {!selectedProto?.cloud && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="cam-uri" className="text-sm font-medium text-zinc-300">
                    Connection URI
                  </label>
                  {uriOverride !== null && (
                    <button
                      type="button"
                      onClick={() => setUriOverride(null)}
                      className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                    >
                      Reset to auto
                    </button>
                  )}
                </div>
                <input
                  id="cam-uri"
                  type="text"
                  value={effectiveUri}
                  onChange={(e) => {
                    setUriOverride(e.target.value);
                    setErrors((p) => { const n = { ...p }; delete n.connectionUri; return n; });
                    setTestResult(null);
                  }}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
                  spellCheck={false}
                />
                {uriOverride === null && (
                  <p className="mt-1 text-xs text-zinc-500">Auto-built from fields above — edit to override</p>
                )}
                {errors.connectionUri && (
                  <p className="mt-1 text-xs text-red-400">{errors.connectionUri}</p>
                )}
              </div>
            )}

            {/* Location */}
            <div>
              <label htmlFor="cam-location" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Location <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <input
                id="cam-location"
                type="text"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="Building A, Floor 2"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            {/* Test Connection */}
            {!selectedProto?.cloud && (
              <>
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testing || submitting}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                  {testing ? "Testing..." : "Test Connection"}
                </button>

                {testResult === "success" && testDetails && (
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 space-y-2">
                    <p className="text-xs font-medium text-green-400">✓ Connection successful</p>
                    <div className="flex gap-3 text-xs text-zinc-400">
                      {testDetails.codec && (
                        <span>Codec: <span className="text-zinc-200">{testDetails.codec}</span></span>
                      )}
                      {testDetails.resolution && (
                        <span>Resolution: <span className="text-zinc-200">{testDetails.resolution}</span></span>
                      )}
                    </div>
                    {testDetails.snapshotUrl && (
                      <img
                        src={testDetails.snapshotUrl}
                        alt="Live snapshot"
                        className="w-full rounded-md border border-zinc-700 object-cover"
                        style={{ maxHeight: "160px" }}
                      />
                    )}
                  </div>
                )}

                {testResult === "error" && testDetails && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <p className="text-xs font-medium text-red-400">✗ Connection failed</p>
                    {testDetails.error && (
                      <p className="text-xs text-red-300 mt-1">{testDetails.error}</p>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Submit error */}
            {submitError && (
              <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-md">{submitError}</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {submitting ? "Adding..." : "Add Camera"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Protocol Picker
// ---------------------------------------------------------------------------

function ProtocolPicker({ onSelect }: { onSelect: (p: ProtocolDef) => void }) {
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: PROTOCOLS.filter((p) => p.category === cat),
  }));

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-400">Choose the camera type to connect:</p>
      {byCategory.map(({ cat, items }) => (
        <div key={cat}>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            {CATEGORY_LABELS[cat]}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {items.map((proto) => (
              <button
                key={proto.id}
                type="button"
                onClick={() => onSelect(proto)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-zinc-800 bg-zinc-950 hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors text-center cursor-pointer group"
              >
                <span className="text-2xl">{proto.icon}</span>
                <span className="text-sm font-medium text-zinc-200 group-hover:text-blue-300 transition-colors">
                  {proto.label}
                </span>
                <span className="text-[11px] text-zinc-500 leading-tight">{proto.desc}</span>
                {proto.cloud && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 font-medium">
                    needs yaml
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scan Panel
// ---------------------------------------------------------------------------

function ScanPanel({
  subnet,
  setSubnet,
  scan,
  selectedPath,
  setSelectedPath,
  onScan,
  onSelect,
  onClose,
  onManual,
}: {
  subnet: string;
  setSubnet: (v: string) => void;
  scan: ScanState;
  selectedPath: Record<string, string>;
  setSelectedPath: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  onScan: () => void;
  onSelect: (cam: DiscoveredCamera) => void;
  onClose: () => void;
  onManual: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="subnet-input" className="block text-sm font-medium text-zinc-300 mb-1.5">
          Subnet <span className="text-zinc-500 font-normal">(auto-detected if empty)</span>
        </label>
        <div className="flex gap-2">
          <input
            id="subnet-input"
            type="text"
            value={subnet}
            onChange={(e) => setSubnet(e.target.value)}
            placeholder="e.g. 192.168.4"
            className="flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
          />
          <button
            type="button"
            onClick={onScan}
            disabled={scan.scanning}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {scan.scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {scan.scanning ? "Scanning..." : "Scan"}
          </button>
        </div>
      </div>

      {scan.scanning && (
        <div className="flex items-center gap-3 px-3 py-4 rounded-md bg-blue-500/5 border border-blue-500/20">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
          <div>
            <p className="text-sm text-blue-300">Detecting cameras...</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Scanning USB devices and network ports (554, 8554, 8080, 37777, 34567, 8000). May take up to 30s.
            </p>
          </div>
        </div>
      )}

      {scan.error && (
        <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-md">{scan.error}</p>
      )}

      {!scan.scanning && scan.scanDurationMs !== null && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              Found {scan.cameras.length} device{scan.cameras.length !== 1 ? "s" : ""}
              {scan.subnetScanned ? (
                <> on <span className="text-zinc-400">{scan.subnetScanned}.0/24</span></>
              ) : null}
            </p>
            <p className="text-xs text-zinc-600">{(scan.scanDurationMs / 1000).toFixed(1)}s</p>
          </div>

          {scan.cameras.length === 0 ? (
            <div className="text-center py-8">
              <Wifi className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No cameras found</p>
              <p className="text-xs text-zinc-600 mt-1">Try a different subnet or add manually</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-72 overflow-y-auto">
              {scan.usbCameras.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Usb className="h-3.5 w-3.5 text-purple-400" />
                    <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">
                      USB Cameras ({scan.usbCameras.length})
                    </span>
                  </div>
                  {scan.usbCameras.map((cam) => (
                    <DiscoveredCameraRow
                      key={`usb-${cam.name}`}
                      cam={cam}
                      variant="usb"
                      selectedPath={selectedPath}
                      setSelectedPath={setSelectedPath}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
              {scan.networkCameras.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Wifi className="h-3.5 w-3.5 text-blue-400" />
                    <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">
                      Network Cameras ({scan.networkCameras.length})
                    </span>
                  </div>
                  {scan.networkCameras.map((cam) => (
                    <DiscoveredCameraRow
                      key={`${cam.ip}:${cam.port}`}
                      cam={cam}
                      variant="network"
                      selectedPath={selectedPath}
                      setSelectedPath={setSelectedPath}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onManual}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors cursor-pointer"
        >
          Manual Entry
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function DiscoveredCameraRow({
  cam,
  variant,
  selectedPath,
  setSelectedPath,
  onSelect,
}: {
  cam: DiscoveredCamera;
  variant: "usb" | "network";
  selectedPath: Record<string, string>;
  setSelectedPath: (fn: (prev: Record<string, string>) => Record<string, string>) => void;
  onSelect: (cam: DiscoveredCamera) => void;
}) {
  const isUsb = variant === "usb";
  const color = isUsb ? "purple" : "blue";

  return (
    <div
      className={`rounded-md border px-3 py-2.5 transition-colors ${
        cam.alreadyAdded
          ? "border-zinc-800 bg-zinc-900/50 opacity-60"
          : `border-${color}-500/20 bg-zinc-950 hover:border-${color}-500/40`
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isUsb ? (
              <Monitor className="h-3.5 w-3.5 text-zinc-400" />
            ) : null}
            <span className="text-sm font-medium text-zinc-200">
              {isUsb ? (cam.name ?? "USB Camera") : `${cam.ip}:${cam.port}`}
            </span>
            {!isUsb && cam.manufacturer && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
                {cam.manufacturer}
              </span>
            )}
            {isUsb && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400">
                USB
              </span>
            )}
            {cam.alreadyAdded && (
              <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/15 text-green-400">
                Added
              </span>
            )}
          </div>
          {!isUsb && cam.possiblePaths && cam.possiblePaths.length > 0 && (
            <select
              value={selectedPath[cam.ip] ?? cam.rtspUrl}
              onChange={(e) =>
                setSelectedPath((prev) => ({ ...prev, [cam.ip]: e.target.value }))
              }
              className="mt-1.5 w-full text-xs rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-zinc-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {cam.possiblePaths.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          )}
        </div>
        {!cam.alreadyAdded && (
          <button
            type="button"
            onClick={() => onSelect(cam)}
            className={`ml-3 shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-${color}-500/10 text-${color}-400 hover:bg-${color}-500/20 transition-colors cursor-pointer`}
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        )}
      </div>
    </div>
  );
}
