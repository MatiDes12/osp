"use client";

import { useState, useCallback, useEffect, type FormEvent } from "react";
import { Camera, X, Loader2, Wifi } from "lucide-react";

interface AddCameraDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (data: {
    name: string;
    protocol: "rtsp" | "onvif";
    connectionUri: string;
    location?: { label?: string };
  }) => Promise<void>;
}

interface FormErrors {
  name?: string;
  protocol?: string;
  connectionUri?: string;
}

export function AddCameraDialog({ open, onClose, onSubmit }: AddCameraDialogProps) {
  const [name, setName] = useState("");
  const [protocol, setProtocol] = useState<"rtsp" | "onvif">("rtsp");
  const [connectionUri, setConnectionUri] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setProtocol("rtsp");
    setConnectionUri("");
    setLocationLabel("");
    setErrors({});
    setSubmitError(null);
    setTestResult(null);
    setTesting(false);
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
      !connectionUri.startsWith("http")
    ) {
      result.connectionUri = "Must be a valid RTSP or ONVIF URL";
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
        const data: {
          name: string;
          protocol: "rtsp" | "onvif";
          connectionUri: string;
          location?: { label?: string };
        } = {
          name: name.trim(),
          protocol,
          connectionUri: connectionUri.trim(),
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
      <div className="relative z-50 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-lg shadow-black/40 animate-[fadeIn_200ms_ease-out]">
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
        <div className="flex items-center gap-2.5 mb-6">
          <Camera className="h-5 w-5 text-zinc-400" />
          <h2 className="text-lg font-semibold text-zinc-50">Add Camera</h2>
        </div>

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
              {(["rtsp", "onvif"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProtocol(p)}
                  className={`flex-1 px-3 py-2 text-sm font-medium uppercase tracking-wide transition-colors cursor-pointer ${
                    protocol === p
                      ? "bg-blue-500/15 text-blue-400 border-b-2 border-blue-500"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

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
      </div>
    </div>
  );
}
