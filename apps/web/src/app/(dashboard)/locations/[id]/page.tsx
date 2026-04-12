"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Camera, Save } from "lucide-react";
import { FloorPlanEditor } from "@/components/location/FloorPlanEditor";
import { showToast } from "@/stores/toast";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("osp_access_token")
      : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

interface LocationData {
  readonly id: string;
  readonly name: string;
  readonly address?: string;
  readonly city?: string;
  readonly country?: string;
  readonly floorPlan?: readonly FloorPlanObject[];
}

interface FloorPlanObject {
  readonly id: string;
  readonly type: "room" | "wall" | "door" | "camera" | "label";
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rotation?: number;
  readonly label?: string;
  readonly color?: string;
}

interface CameraSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

export default function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [location, setLocation] = useState<LocationData | null>(null);
  const [cameras, setCameras] = useState<readonly CameraSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parse the cameras list response into CameraSummary[]
  const parseCameras = useCallback(
    (raw: Record<string, unknown>[]) =>
      raw.map((c) => ({
        id: (c.id ?? "") as string,
        name: (c.name ?? "") as string,
        status: (c.status ?? "offline") as string,
      })),
    [],
  );

  // Fetch location + ALL cameras from the tenant (not just this location)
  // so the user can link any camera to the floor plan
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [locRes, camRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/locations/${id}`, {
            headers: getAuthHeaders(),
          }),
          fetch(`${API_URL}/api/v1/cameras`, {
            headers: getAuthHeaders(),
          }),
        ]);

        const locJson = await locRes.json();
        if (locJson.success && locJson.data) {
          const d = locJson.data;
          setLocation({
            id: (d.id ?? d.id) as string,
            name: (d.name ?? "") as string,
            address: (d.address ?? undefined) as string | undefined,
            city: (d.city ?? undefined) as string | undefined,
            country: (d.country ?? undefined) as string | undefined,
            floorPlan: (d.floor_plan ?? d.floorPlan ?? []) as FloorPlanObject[],
          });
        } else {
          setError(locJson.error?.message ?? "Location not found");
        }

        const camJson = await camRes.json();
        if (camJson.success && camJson.data) {
          setCameras(parseCameras(camJson.data as Record<string, unknown>[]));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, parseCameras]);

  // Poll camera status every 10 s so linked cameras on the floor plan
  // reflect the real online/offline state instead of whatever was cached
  // at page load.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/cameras`, {
          headers: getAuthHeaders(),
          signal: AbortSignal.timeout(5000),
        });
        const json = await res.json();
        if (json.success && json.data) {
          setCameras(parseCameras(json.data as Record<string, unknown>[]));
        }
      } catch {
        // Non-critical — keep stale list on failure.
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [parseCameras]);

  // Save floor plan to location
  const handleSaveFloorPlan = useCallback(
    async (objects: readonly FloorPlanObject[]) => {
      try {
        const res = await fetch(`${API_URL}/api/v1/locations/${id}`, {
          method: "PATCH",
          headers: getAuthHeaders(),
          body: JSON.stringify({ floor_plan: objects }),
        });
        const json = await res.json();
        if (json.success) {
          showToast("Floor plan saved", "success");
        } else {
          showToast(json.error?.message ?? "Failed to save", "error");
        }
      } catch {
        showToast("Failed to save floor plan", "error");
      }
    },
    [id],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-blue-500" />
      </div>
    );
  }

  if (error || !location) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] text-center">
        <MapPin className="h-8 w-8 text-zinc-600 mb-3" />
        <p className="text-sm text-zinc-400 mb-4">
          {error ?? "Location not found"}
        </p>
        <Link
          href="/locations"
          className="text-sm text-blue-400 hover:text-blue-300 cursor-pointer"
        >
          Back to Locations
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pb-4">
        <Link
          href="/locations"
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-zinc-100">{location.name}</h1>
          {(location.address || location.city) && (
            <p className="text-xs text-zinc-500">
              {[location.address, location.city, location.country]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 ml-auto">
          <Camera className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-400">
            {cameras.length} camera{cameras.length !== 1 ? "s" : ""} at this
            location
          </span>
        </div>
      </div>

      {/* Floor Plan Editor */}
      <div className="flex-1 min-h-0 rounded-lg border border-zinc-800 overflow-hidden">
        <FloorPlanEditor
          locationId={location.id}
          locationName={location.name}
          objects={(location.floorPlan ?? []) as any}
          onSave={handleSaveFloorPlan as any}
          cameras={cameras}
        />
      </div>
    </div>
  );
}
