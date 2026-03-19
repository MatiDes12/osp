"use client";

import { useState, useEffect, useCallback } from "react";
import type { Location, FloorPlanObject } from "@osp/shared";

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

/** Transform snake_case DB row to camelCase Location */
function transformLocation(raw: Record<string, unknown>): Location {
  return {
    id: raw.id as string,
    tenantId: (raw.tenant_id ?? raw.tenantId) as string,
    name: raw.name as string,
    address: (raw.address as string) ?? null,
    city: (raw.city as string) ?? null,
    country: (raw.country as string) ?? null,
    lat: (raw.lat as number) ?? null,
    lng: (raw.lng as number) ?? null,
    timezone: (raw.timezone as string) ?? "UTC",
    floorPlan: (raw.floor_plan ?? raw.floorPlan ?? []) as FloorPlanObject[],
    cameraCount: (raw.camera_count ?? raw.cameraCount) as number | undefined,
    createdAt: (raw.created_at ?? raw.createdAt) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt) as string,
  };
}

interface UseLocationsReturn {
  readonly locations: readonly Location[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
  readonly createLocation: (data: {
    name: string;
    address?: string;
    city?: string;
    country?: string;
    lat?: number;
    lng?: number;
    timezone?: string;
  }) => Promise<Location>;
  readonly updateLocation: (
    id: string,
    data: {
      name?: string;
      address?: string | null;
      city?: string | null;
      country?: string | null;
      lat?: number | null;
      lng?: number | null;
      timezone?: string;
    },
  ) => Promise<Location>;
  readonly deleteLocation: (id: string) => Promise<void>;
}

export function useLocations(): UseLocationsReturn {
  const [locations, setLocations] = useState<readonly Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/locations`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        const raw = json.data as Record<string, unknown>[];
        setLocations(raw.map(transformLocation));
      } else {
        setError(json.error?.message ?? "Failed to fetch locations");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const createLocation = useCallback(
    async (data: {
      name: string;
      address?: string;
      city?: string;
      country?: string;
      lat?: number;
      lng?: number;
      timezone?: string;
    }): Promise<Location> => {
      const response = await fetch(`${API_URL}/api/v1/locations`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const json = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to create location");
      }
      const location = transformLocation(json.data as Record<string, unknown>);
      await fetchLocations();
      return location;
    },
    [fetchLocations],
  );

  const updateLocation = useCallback(
    async (
      id: string,
      data: {
        name?: string;
        address?: string | null;
        city?: string | null;
        country?: string | null;
        lat?: number | null;
        lng?: number | null;
        timezone?: string;
      },
    ): Promise<Location> => {
      const response = await fetch(`${API_URL}/api/v1/locations/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const json = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to update location");
      }
      const location = transformLocation(json.data as Record<string, unknown>);
      await fetchLocations();
      return location;
    },
    [fetchLocations],
  );

  const deleteLocation = useCallback(
    async (id: string): Promise<void> => {
      const previousLocations = locations;
      setLocations((prev) => prev.filter((l) => l.id !== id));
      try {
        const response = await fetch(`${API_URL}/api/v1/locations/${id}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        const json = await response.json();
        if (!json.success) {
          setLocations(previousLocations);
          throw new Error(json.error?.message ?? "Failed to delete location");
        }
      } catch (err) {
        setLocations(previousLocations);
        throw err;
      }
    },
    [locations],
  );

  return {
    locations,
    loading,
    error,
    refetch: fetchLocations,
    createLocation,
    updateLocation,
    deleteLocation,
  };
}
