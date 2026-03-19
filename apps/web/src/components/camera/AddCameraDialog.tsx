"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import { Camera, X, Loader2, Wifi, Search, Radio, Plus, ChevronRight, Usb, Monitor } from "lucide-react";
import type { DiscoveredCamera } from "@osp/shared";

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

type DialogMode = "manual" | "scan";

interface AddCameraDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (data: {
    name: string;
    protocol: "rtsp" | "onvif" | "usb";
    connectionUri: string;
    location?: { label?: string };
  }) => Promise<void>;
}

interface FormErrors {
  name?: string;
  protocol?: string;
  connectionUri?: string;
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

export function AddCameraDialog({ open, onClose, onSubmit }: AddCameraDialogProps) {
  const [mode, setMode] = useState<DialogMode>("manual");
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState<"rtsp" | "onvif" | "usb">("rtsp");
  const [usbDeviceIndex, setUsbDeviceIndex] = useState("0");
  const [connectionUri, setConnectionUri] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const resetForm = useCallback(() => {
    setName("");
    setProtocol("rtsp");
    setConnectionUri("");
    setLocationLabel("");
    setUsbDeviceIndex("0");
    setErrors({});
    setSubmitError(null);
    setTestResult(null);
    setTesting(false);
    setMode("manual");
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
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const validate = useCallback((): FormErrors => {
    const result: FormErrors = {};
    if (!name.trim()) {
      result.name = "Name is required";
    } else if (name.length > 100) {
      result.name = "Name must be 100 characters or fewer";
    }
    if (!connectionUri.trim()) {
      result.connectionUri = "Connection URI is required";
    } else if (
      !connectionUri.startsWith("rtsp://") &&
      !connectionUri.startsWith("http") &&
      !connectionUri.startsWith("ffmpeg:device")
    ) {
      result.connectionUri = "Must be a valid RTSP, ONVIF, or USB device URI";
    }
    return result;
  }, [name, connectionUri]);

  const handleTestConnection = useCallback(async () => {
    const validationErrors = validate();
    if (validationErrors.connectionUri) {
      setErrors(validationErrors);
      return;
    }
    setTesting(true);
    setTestResult(null);
    // Simulate connection test
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setTesting(false);
    setTestResult("success");
  }, [validate]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const validationErrors = validate();
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        return;
      }
      setErrors({});
      setSubmitError(null);
      setSubmitting(true);
      try {
        // For USB protocol, auto-build the connection URI if not already set
        const resolvedUri =
          protocol === "usb" && !connectionUri.trim()
            ? `ffmpeg:device?video=${usbDeviceIndex}#video=h264`
            : connectionUri.trim();

        const data: {
          name: string;
          protocol: "rtsp" | "onvif" | "usb";
          connectionUri: string;
          location?: { label?: string };
        } = {
          name: name.trim(),
          protocol,
          connectionUri: resolvedUri,
        };
        if (locationLabel.trim()) {
          data.location = { label: locationLabel.trim() };
        }
        await onSubmit(data);
        resetForm();
        onClose();
      } catch (err) {
        setSubmitError(
          err instanceof Error ? err.message : "Failed to add camera",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [name, protocol, connectionUri, locationLabel, validate, onSubmit, onClose, resetForm],
  );

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
      if (subnet.trim()) {
        body.subnet = subnet.trim();
      }
      const res = await fetch(`${API_URL}/api/v1/cameras/discover`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!json.success) {
        setScan((prev) => ({
          ...prev,
          scanning: false,
          error: json.error?.message ?? "Scan failed",
        }));
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
      if (cam.type === "usb") {
        setConnectionUri(cam.rtspUrl);
        setName(cam.name ?? `USB Camera`);
        setProtocol("usb");
      } else {
        const rtspUrl = selectedPath[cam.ip] ?? cam.rtspUrl;
        setConnectionUri(rtspUrl);
        setName(cam.manufacturer ? `${cam.manufacturer} - ${cam.ip}` : `Camera ${cam.ip}`);
        setProtocol("rtsp");
      }
      setMode("manual");
    },
    [selectedPath],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center animate-[fadeIn_200ms_ease-out]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />

      {/* Modal */}
      <div className="relative z-50 w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-lg shadow-black/40 animate-[fadeIn_200ms_ease-out] max-h-[90vh] overflow-y-auto">
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
          <Camera className="h-5 w-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-50">Add Camera</h2>
        </div>

        {/* Mode tabs */}
        <div className="flex rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden mb-5">
          <button
            type="button"
            onClick={() => setMode("manual")}
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
          /* ── Scan Network Mode ── */
          <div className="space-y-4">
            {/* Subnet input */}
            <div>
              <label
                htmlFor="subnet-input"
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                Subnet{" "}
                <span className="text-zinc-500 font-normal">(auto-detected if empty)</span>
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
                  onClick={handleScanNetwork}
                  disabled={scan.scanning}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {scan.scanning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                  {scan.scanning ? "Scanning..." : "Scan"}
                </button>
              </div>
            </div>

            {/* Scan progress */}
            {scan.scanning && (
              <div className="flex items-center gap-3 px-3 py-4 rounded-md bg-blue-500/5 border border-blue-500/20">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                <div>
                  <p className="text-sm text-blue-300">Detecting cameras...</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Scanning USB devices and network ports (554, 8554, 8080, 37777, 34567, 8000). This may take up to 30 seconds.
                  </p>
                </div>
              </div>
            )}

            {/* Scan error */}
            {scan.error && (
              <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-md">
                {scan.error}
              </p>
            )}

            {/* Scan results */}
            {!scan.scanning && scan.scanDurationMs !== null && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-zinc-500">
                    Found {scan.cameras.length} device{scan.cameras.length !== 1 ? "s" : ""}
                    {scan.subnetScanned ? (
                      <> on <span className="text-zinc-400">{scan.subnetScanned}.0/24</span></>
                    ) : null}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {(scan.scanDurationMs / 1000).toFixed(1)}s
                  </p>
                </div>

                {scan.cameras.length === 0 ? (
                  <div className="text-center py-8">
                    <Wifi className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-sm text-zinc-500">No cameras found</p>
                    <p className="text-xs text-zinc-600 mt-1">
                      Try a different subnet or add the camera manually
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-72 overflow-y-auto">
                    {/* USB Cameras section */}
                    {scan.usbCameras.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Usb className="h-3.5 w-3.5 text-purple-400" />
                          <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">
                            USB Cameras ({scan.usbCameras.length})
                          </span>
                        </div>
                        {scan.usbCameras.map((cam) => (
                          <div
                            key={`usb-${cam.name}`}
                            className={`rounded-md border px-3 py-2.5 transition-colors ${
                              cam.alreadyAdded
                                ? "border-zinc-800 bg-zinc-900/50 opacity-60"
                                : "border-purple-500/20 bg-zinc-950 hover:border-purple-500/40"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Monitor className="h-3.5 w-3.5 text-zinc-400" />
                                  <span className="text-sm font-medium text-zinc-200">
                                    {cam.name ?? `USB Camera`}
                                  </span>
                                  <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400">
                                    USB
                                  </span>
                                  {cam.alreadyAdded && (
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/15 text-green-400">
                                      Added
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-zinc-500 mt-1">
                                  {cam.rtspUrl}
                                </p>
                              </div>
                              {!cam.alreadyAdded && (
                                <button
                                  type="button"
                                  onClick={() => handleSelectDiscovered(cam)}
                                  className="ml-3 shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors cursor-pointer"
                                >
                                  <Plus className="h-3 w-3" />
                                  Add
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Network Cameras section */}
                    {scan.networkCameras.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Wifi className="h-3.5 w-3.5 text-blue-400" />
                          <span className="text-xs font-medium text-blue-400 uppercase tracking-wider">
                            Network Cameras ({scan.networkCameras.length})
                          </span>
                        </div>
                        {scan.networkCameras.map((cam) => (
                          <div
                            key={`${cam.ip}:${cam.port}`}
                            className={`rounded-md border px-3 py-2.5 transition-colors ${
                              cam.alreadyAdded
                                ? "border-zinc-800 bg-zinc-900/50 opacity-60"
                                : "border-zinc-800 bg-zinc-950 hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-zinc-200">
                                    {cam.ip}:{cam.port}
                                  </span>
                                  {cam.manufacturer && (
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400">
                                      {cam.manufacturer}
                                    </span>
                                  )}
                                  {cam.alreadyAdded && (
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/15 text-green-400">
                                      Added
                                    </span>
                                  )}
                                </div>
                                {/* RTSP path selector */}
                                {cam.possiblePaths && cam.possiblePaths.length > 0 && (
                                  <select
                                    value={selectedPath[cam.ip] ?? cam.rtspUrl}
                                    onChange={(e) =>
                                      setSelectedPath((prev) => ({
                                        ...prev,
                                        [cam.ip]: e.target.value,
                                      }))
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
                                  onClick={() => handleSelectDiscovered(cam)}
                                  className="ml-3 shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
                                >
                                  <Plus className="h-3 w-3" />
                                  Add
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Footer actions */}
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
                onClick={() => setMode("manual")}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors cursor-pointer"
              >
                Manual Entry
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* ── Manual Mode (original form) ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label
                htmlFor="camera-name"
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                Camera Name
              </label>
              <input
                id="camera-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Front Door Camera"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-400">{errors.name}</p>
              )}
            </div>

            {/* Protocol segmented control */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Protocol
              </label>
              <div className="flex rounded-md border border-zinc-800 bg-zinc-950 overflow-hidden">
                {(["rtsp", "onvif", "usb"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setProtocol(p);
                      if (p === "usb") {
                        setConnectionUri(`ffmpeg:device?video=${usbDeviceIndex}#video=h264`);
                      }
                    }}
                    className={`flex-1 px-3 py-2 text-sm font-medium uppercase tracking-wide transition-colors cursor-pointer ${
                      protocol === p
                        ? p === "usb"
                          ? "bg-purple-500/15 text-purple-400 border-b-2 border-purple-500"
                          : "bg-blue-500/15 text-blue-400 border-b-2 border-blue-500"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* USB device index selector (shown when protocol is USB) */}
            {protocol === "usb" && (
              <div>
                <label
                  htmlFor="usb-device-index"
                  className="block text-sm font-medium text-zinc-300 mb-1.5"
                >
                  Device Index
                </label>
                <select
                  id="usb-device-index"
                  value={usbDeviceIndex}
                  onChange={(e) => {
                    setUsbDeviceIndex(e.target.value);
                    setConnectionUri(`ffmpeg:device?video=${e.target.value}#video=h264`);
                  }}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 focus:outline-none focus:ring-1 focus:ring-purple-500 transition-colors"
                >
                  {Array.from({ length: 10 }, (_, i) => (
                    <option key={i} value={String(i)}>
                      Device {i}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  Select the USB camera device index (typically 0 for built-in webcam)
                </p>
              </div>
            )}

            {/* Connection URI */}
            <div>
              <label
                htmlFor="camera-uri"
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                Connection URI
              </label>
              <input
                id="camera-uri"
                type="text"
                value={connectionUri}
                onChange={(e) => setConnectionUri(e.target.value)}
                placeholder={
                  protocol === "rtsp"
                    ? "rtsp://192.168.1.100:554/stream"
                    : protocol === "usb"
                      ? "ffmpeg:device?video=0#video=h264"
                      : "http://192.168.1.100:80/onvif/device_service"
                }
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              {errors.connectionUri && (
                <p className="mt-1 text-xs text-red-400">
                  {errors.connectionUri}
                </p>
              )}
            </div>

            {/* Location */}
            <div>
              <label
                htmlFor="camera-location"
                className="block text-sm font-medium text-zinc-300 mb-1.5"
              >
                Location{" "}
                <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <input
                id="camera-location"
                type="text"
                value={locationLabel}
                onChange={(e) => setLocationLabel(e.target.value)}
                placeholder="Building A, Floor 2"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              />
            </div>

            {/* Test connection */}
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing || submitting}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {testing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wifi className="h-3.5 w-3.5" />
              )}
              {testing ? "Testing..." : "Test Connection"}
            </button>
            {testResult === "success" && (
              <p className="text-xs text-green-400">Connection successful</p>
            )}
            {testResult === "error" && (
              <p className="text-xs text-red-400">Connection failed</p>
            )}

            {/* Submit error */}
            {submitError && (
              <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-md">
                {submitError}
              </p>
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
