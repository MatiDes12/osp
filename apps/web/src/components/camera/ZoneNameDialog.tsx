"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface ZoneNameDialogProps {
  readonly cameraId: string;
  readonly polygon: readonly Point[];
  readonly onSave: (zone: {
    name: string;
    colorHex: string;
    alertEnabled: boolean;
    sensitivity: number;
    polygonCoordinates: readonly Point[];
  }) => Promise<void>;
  readonly onCancel: () => void;
}

const PRESET_COLORS = [
  { name: "Red", hex: "#EF4444" },
  { name: "Green", hex: "#22C55E" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Amber", hex: "#F59E0B" },
  { name: "Purple", hex: "#A855F7" },
  { name: "Cyan", hex: "#06B6D4" },
] as const;

export function ZoneNameDialog({
  cameraId,
  polygon,
  onSave,
  onCancel,
}: ZoneNameDialogProps) {
  const [name, setName] = useState("");
  const [colorHex, setColorHex] = useState<string>(PRESET_COLORS[0]?.hex ?? "#EF4444");
  const [alertEnabled, setAlertEnabled] = useState(true);
  const [sensitivity, setSensitivity] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Zone name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: trimmedName,
        colorHex,
        alertEnabled,
        sensitivity,
        polygonCoordinates: polygon,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save zone");
      setSaving(false);
    }
  }, [name, colorHex, alertEnabled, sensitivity, polygon, onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !saving) {
        handleSave();
      }
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [handleSave, saving, onCancel],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_150ms_ease-out]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
        role="button"
        tabIndex={-1}
        aria-label="Close dialog"
      />
      <div
        className="relative z-50 w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-lg shadow-black/40"
        onKeyDown={handleKeyDown}
      >
        <h3 className="text-base font-semibold text-zinc-50 mb-4">
          New Zone
        </h3>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400">
            {error}
          </div>
        )}

        {/* Name */}
        <div className="mb-4">
          <label
            htmlFor="zone-name"
            className="block text-xs font-medium text-zinc-400 mb-1.5"
          >
            Name
          </label>
          <input
            ref={nameInputRef}
            id="zone-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Driveway, Front Door"
            maxLength={100}
            className="w-full px-3 py-2 text-sm rounded-md bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50"
          />
        </div>

        {/* Color picker */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">
            Color
          </label>
          <div className="flex gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setColorHex(c.hex)}
                className={`w-8 h-8 rounded-full border-2 transition-all cursor-pointer ${
                  colorHex === c.hex
                    ? "border-white scale-110"
                    : "border-transparent hover:border-zinc-500"
                }`}
                style={{ backgroundColor: c.hex }}
                aria-label={c.name}
                title={c.name}
              />
            ))}
          </div>
        </div>

        {/* Alert enabled toggle */}
        <div className="mb-4 flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-400">
            Alerts enabled
          </label>
          <button
            onClick={() => setAlertEnabled((prev) => !prev)}
            className={`relative w-10 h-5 rounded-full transition-colors duration-150 cursor-pointer ${
              alertEnabled ? "bg-green-500" : "bg-zinc-600"
            }`}
            role="switch"
            aria-checked={alertEnabled}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-150 ${
                alertEnabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </div>

        {/* Sensitivity slider */}
        <div className="mb-5">
          <label
            htmlFor="zone-sensitivity"
            className="block text-xs font-medium text-zinc-400 mb-1.5"
          >
            Sensitivity: {sensitivity}
          </label>
          <input
            id="zone-sensitivity"
            type="range"
            min={1}
            max={10}
            value={sensitivity}
            onChange={(e) => setSensitivity(parseInt(e.target.value, 10))}
            className="w-full h-1.5 rounded-full appearance-none bg-zinc-700 accent-blue-500"
          />
          <div className="flex justify-between text-[10px] text-zinc-500 mt-1">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving..." : "Save Zone"}
          </button>
        </div>
      </div>
    </div>
  );
}
