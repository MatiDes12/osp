"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useLocations } from "@/hooks/use-locations";
import { PageError } from "@/components/PageError";
import {
  MapPin,
  Plus,
  Camera,
  Pencil,
  Trash2,
  X,
  Globe,
  Clock,
} from "lucide-react";
import type { Location } from "@osp/shared";

interface LocationFormData {
  readonly name: string;
  readonly address: string;
  readonly city: string;
  readonly country: string;
  readonly timezone: string;
  readonly lat: string;
  readonly lng: string;
}

const EMPTY_FORM: LocationFormData = {
  name: "",
  address: "",
  city: "",
  country: "",
  timezone: "UTC",
  lat: "",
  lng: "",
};

function LocationFormDialog({
  open,
  title,
  initial,
  onClose,
  onSubmit,
  submitting,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly initial: LocationFormData;
  readonly onClose: () => void;
  readonly onSubmit: (data: LocationFormData) => void;
  readonly submitting: boolean;
}) {
  const [form, setForm] = useState<LocationFormData>(initial);

  if (!open) return null;

  const handleChange = (field: keyof LocationFormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_150ms_ease-out]">
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
      <div className="relative z-50 w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-lg shadow-black/40">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-zinc-50">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g. Main Office"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Address
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => handleChange("address", e.target.value)}
              placeholder="123 Main St"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                City
              </label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleChange("city", e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Country
              </label>
              <input
                type="text"
                value={form.country}
                onChange={(e) => handleChange("country", e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">
              Timezone
            </label>
            <input
              type="text"
              value={form.timezone}
              onChange={(e) => handleChange("timezone", e.target.value)}
              placeholder="UTC"
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Latitude
              </label>
              <input
                type="text"
                value={form.lat}
                onChange={(e) => handleChange("lat", e.target.value)}
                placeholder="e.g. 40.7128"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1">
                Longitude
              </label>
              <input
                type="text"
                value={form.lng}
                onChange={(e) => handleChange("lng", e.target.value)}
                placeholder="e.g. -74.0060"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(form)}
            disabled={submitting || !form.name.trim()}
            className="px-4 py-2 text-sm font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LocationsPage() {
  const {
    locations,
    loading,
    error,
    refetch,
    createLocation,
    updateLocation,
    deleteLocation,
  } = useLocations();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = useCallback(
    async (form: LocationFormData) => {
      setSubmitting(true);
      setActionError(null);
      try {
        await createLocation({
          name: form.name,
          address: form.address || undefined,
          city: form.city || undefined,
          country: form.country || undefined,
          timezone: form.timezone || "UTC",
          lat: form.lat ? parseFloat(form.lat) : undefined,
          lng: form.lng ? parseFloat(form.lng) : undefined,
        });
        setShowAddDialog(false);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to create location",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [createLocation],
  );

  const handleUpdate = useCallback(
    async (form: LocationFormData) => {
      if (!editingLocation) return;
      setSubmitting(true);
      setActionError(null);
      try {
        await updateLocation(editingLocation.id, {
          name: form.name,
          address: form.address || null,
          city: form.city || null,
          country: form.country || null,
          timezone: form.timezone || "UTC",
          lat: form.lat ? parseFloat(form.lat) : null,
          lng: form.lng ? parseFloat(form.lng) : null,
        });
        setEditingLocation(null);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to update location",
        );
      } finally {
        setSubmitting(false);
      }
    },
    [editingLocation, updateLocation],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setActionError(null);
      try {
        await deleteLocation(id);
        setDeleteConfirmId(null);
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "Failed to delete location",
        );
      }
    },
    [deleteLocation],
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Locations</h1>
        <button
          onClick={() => setShowAddDialog(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary)]/90 transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Add Location
        </button>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 flex items-center justify-between">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="text-red-400 hover:text-red-300 text-xs underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20 text-[var(--color-muted)]">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-muted)] border-t-[var(--color-primary)]" />
          <span className="ml-3 text-sm">Loading locations...</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && <PageError message={error} onRetry={refetch} />}

      {/* Empty state */}
      {!loading && !error && locations.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-zinc-800 rounded-lg">
          <MapPin className="h-8 w-8 text-zinc-600 mb-3" />
          <p className="text-sm font-medium text-zinc-400 mb-1">
            No locations yet
          </p>
          <p className="text-xs text-zinc-500 mb-4">
            Add your first location to organize cameras by site
          </p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add Location
          </button>
        </div>
      )}

      {/* Location cards */}
      {!loading && !error && locations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="bg-zinc-900 rounded-lg border border-zinc-800 p-4 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                    <MapPin className="h-4 w-4 text-blue-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100">
                      {loc.name}
                    </h3>
                    {loc.address && (
                      <p className="text-xs text-zinc-500 truncate max-w-[200px]">
                        {loc.address}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingLocation(loc)}
                    className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Edit location"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirmId(loc.id)}
                    className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Delete location"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                {(loc.city || loc.country) && (
                  <div className="flex items-center gap-1.5 text-zinc-400">
                    <Globe className="h-3 w-3 shrink-0" />
                    <span>
                      {[loc.city, loc.country].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>{loc.timezone}</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <Camera className="h-3 w-3 shrink-0" />
                  <span>
                    {loc.cameraCount ?? 0} camera
                    {(loc.cameraCount ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
                {loc.lat != null && loc.lng != null && (
                  <div className="flex items-center gap-1.5 text-zinc-500">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="font-mono text-[10px]">
                      {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-4">
                <Link
                  href={`/cameras?locationId=${loc.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                >
                  <Camera className="h-3 w-3" />
                  View Cameras
                </Link>
                <Link
                  href={`/locations/${loc.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  <MapPin className="h-3 w-3" />
                  Floor Plan
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add dialog */}
      <LocationFormDialog
        open={showAddDialog}
        title="Add Location"
        initial={EMPTY_FORM}
        onClose={() => setShowAddDialog(false)}
        onSubmit={handleCreate}
        submitting={submitting}
      />

      {/* Edit dialog */}
      {editingLocation && (
        <LocationFormDialog
          open={true}
          title="Edit Location"
          initial={{
            name: editingLocation.name,
            address: editingLocation.address ?? "",
            city: editingLocation.city ?? "",
            country: editingLocation.country ?? "",
            timezone: editingLocation.timezone,
            lat: editingLocation.lat != null ? String(editingLocation.lat) : "",
            lng: editingLocation.lng != null ? String(editingLocation.lng) : "",
          }}
          onClose={() => setEditingLocation(null)}
          onSubmit={handleUpdate}
          submitting={submitting}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center animate-[fadeIn_150ms_ease-out]">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteConfirmId(null)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setDeleteConfirmId(null);
            }}
            role="button"
            tabIndex={-1}
            aria-label="Close dialog"
          />
          <div className="relative z-50 w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-lg shadow-black/40">
            <h3 className="text-base font-semibold text-zinc-50 mb-2">
              Delete Location
            </h3>
            <p className="text-sm text-zinc-400 mb-1">
              Are you sure you want to delete this location?
            </p>
            <p className="text-xs text-zinc-500 mb-5">
              Cameras at this location will be unassigned but not deleted.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-4 py-2 text-sm rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                className="px-4 py-2 text-sm font-medium rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
