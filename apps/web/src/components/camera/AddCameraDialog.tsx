"use client";

import { useState, useCallback, type FormEvent } from "react";

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
  const [submitError, setSubmitError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setProtocol("rtsp");
    setConnectionUri("");
    setLocationLabel("");
    setErrors({});
    setSubmitError(null);
  }, []);

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
        } = { name: name.trim(), protocol, connectionUri: connectionUri.trim() };
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
    [name, protocol, connectionUri, locationLabel, validate, onSubmit, onClose, resetForm],
  );

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [resetForm, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") handleClose();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-xl">
        <h2 className="text-lg font-semibold mb-4">Add Camera</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="camera-name" className="block text-sm font-medium mb-1">
              Name
            </label>
            <input
              id="camera-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Front Door Camera"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-[var(--color-error)]">{errors.name}</p>
            )}
          </div>

          {/* Protocol */}
          <div>
            <label htmlFor="camera-protocol" className="block text-sm font-medium mb-1">
              Protocol
            </label>
            <select
              id="camera-protocol"
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as "rtsp" | "onvif")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            >
              <option value="rtsp">RTSP</option>
              <option value="onvif">ONVIF</option>
            </select>
          </div>

          {/* Connection URI */}
          <div>
            <label htmlFor="camera-uri" className="block text-sm font-medium mb-1">
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
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            {errors.connectionUri && (
              <p className="mt-1 text-xs text-[var(--color-error)]">{errors.connectionUri}</p>
            )}
          </div>

          {/* Location Label (optional) */}
          <div>
            <label htmlFor="camera-location" className="block text-sm font-medium mb-1">
              Location <span className="text-[var(--color-muted)]">(optional)</span>
            </label>
            <input
              id="camera-location"
              type="text"
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              placeholder="Building A, Floor 2"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
          </div>

          {/* Submit error */}
          {submitError && (
            <p className="text-sm text-[var(--color-error)] bg-[var(--color-error)]/10 px-3 py-2 rounded-md">
              {submitError}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-md border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50"
            >
              {submitting ? "Adding..." : "Add Camera"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
