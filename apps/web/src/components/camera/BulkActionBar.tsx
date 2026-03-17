"use client";

import { useState } from "react";
import { X, MapPin, Video, Trash2 } from "lucide-react";
import type { Location } from "@osp/shared";

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

interface BulkActionBarProps {
  readonly selectedCount: number;
  readonly selectedIds: ReadonlySet<string>;
  readonly locations: readonly Location[];
  readonly onDeselectAll: () => void;
  readonly onActionComplete: () => void;
}

export function BulkActionBar({
  selectedCount,
  selectedIds,
  locations,
  onDeselectAll,
  onActionComplete,
}: BulkActionBarProps) {
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const cameraIds = Array.from(selectedIds);

  const handleAssignLocation = async (locationId: string | null) => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/cameras/bulk/assign-location`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ cameraIds, locationId }),
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to assign location");
      }
      onActionComplete();
    } catch (err) {
      console.error("Bulk assign location failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordStart = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/cameras/bulk/record-start`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ cameraIds }),
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to start recording");
      }
      onActionComplete();
    } catch (err) {
      console.error("Bulk record start failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/v1/cameras/bulk/delete`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ cameraIds }),
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to delete cameras");
      }
      setShowDeleteConfirm(false);
      onDeselectAll();
      onActionComplete();
    } catch (err) {
      console.error("Bulk delete failed:", err);
    } finally {
      setLoading(false);
    }
  };

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl bg-zinc-900 border border-zinc-700 shadow-2xl backdrop-blur-sm">
      <span className="text-sm font-medium text-zinc-200">
        {selectedCount} camera{selectedCount !== 1 ? "s" : ""} selected
      </span>

      <div className="h-5 w-px bg-zinc-700" />

      {/* Assign Location dropdown */}
      <div className="relative group">
        <button
          type="button"
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-zinc-100 transition-colors cursor-pointer disabled:opacity-50"
        >
          <MapPin className="h-3.5 w-3.5" />
          Assign Location
        </button>
        <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block min-w-[180px] rounded-md border border-zinc-700 bg-zinc-900 shadow-lg py-1 max-h-60 overflow-y-auto">
          <button
            type="button"
            onClick={() => handleAssignLocation(null)}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Unassign
          </button>
          {locations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={() => handleAssignLocation(loc.id)}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              {loc.name}
            </button>
          ))}
        </div>
      </div>

      {/* Start Recording */}
      <button
        type="button"
        disabled={loading}
        onClick={handleRecordStart}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors cursor-pointer disabled:opacity-50"
      >
        <Video className="h-3.5 w-3.5" />
        Start Recording All
      </button>

      {/* Delete Selected */}
      {!showDeleteConfirm ? (
        <button
          type="button"
          disabled={loading}
          onClick={() => setShowDeleteConfirm(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-800 text-red-400 border border-zinc-700 hover:bg-red-500/20 hover:border-red-500/30 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Selected
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-400">Confirm delete?</span>
          <button
            type="button"
            disabled={loading}
            onClick={handleDelete}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            {loading ? "Deleting..." : "Yes, Delete"}
          </button>
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(false)}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="h-5 w-px bg-zinc-700" />

      {/* Deselect All */}
      <button
        type="button"
        onClick={onDeselectAll}
        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        aria-label="Deselect all"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
