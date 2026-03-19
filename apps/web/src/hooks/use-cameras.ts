"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  Camera,
  ApiResponse,
  CreateCameraInput,
  UpdateCameraInput,
} from "@osp/shared";
import { transformCamera, isSnakeCaseRow } from "@/lib/transforms";

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

interface UseCamerasReturn {
  readonly cameras: readonly Camera[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
  readonly addCamera: (data: CreateCameraInput) => Promise<Camera>;
  readonly updateCamera: (
    id: string,
    data: UpdateCameraInput,
  ) => Promise<Camera>;
  readonly deleteCamera: (id: string) => Promise<void>;
}

export function useCameras(): UseCamerasReturn {
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetchedRef = useRef(false);

  const fetchCameras = useCallback(async () => {
    // Only show loading spinner on the initial fetch.
    // Refetches update data in place without unmounting the grid,
    // which prevents snapshot flicker and state loss in CameraCards.
    if (!hasFetchedRef.current) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/cameras`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        const raw = json.data as Record<string, unknown>[];
        setCameras(raw.map((r) => (isSnakeCaseRow(r) ? transformCamera(r) : (r as unknown as Camera))));
      } else {
        setError(json.error?.message ?? "Failed to fetch cameras");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
      hasFetchedRef.current = true;
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  const addCamera = useCallback(
    async (data: CreateCameraInput): Promise<Camera> => {
      const response = await fetch(`${API_URL}/api/v1/cameras`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const json = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to add camera");
      }
      const raw = json.data as Record<string, unknown>;
      const camera = isSnakeCaseRow(raw) ? transformCamera(raw) : (raw as unknown as Camera);
      await fetchCameras();
      return camera;
    },
    [fetchCameras],
  );

  const updateCamera = useCallback(
    async (id: string, data: UpdateCameraInput): Promise<Camera> => {
      const response = await fetch(`${API_URL}/api/v1/cameras/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const json = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to update camera");
      }
      const raw = json.data as Record<string, unknown>;
      const camera = isSnakeCaseRow(raw) ? transformCamera(raw) : (raw as unknown as Camera);
      await fetchCameras();
      return camera;
    },
    [fetchCameras],
  );

  const deleteCamera = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic update: remove from list immediately
      const previousCameras = cameras;
      setCameras((prev) => prev.filter((c) => c.id !== id));

      try {
        const response = await fetch(`${API_URL}/api/v1/cameras/${id}`, {
          method: "DELETE",
          headers: getAuthHeaders(),
        });
        const json: ApiResponse<void> = await response.json();
        if (!json.success) {
          // Rollback on failure
          setCameras(previousCameras);
          throw new Error(json.error?.message ?? "Failed to delete camera");
        }
      } catch (err) {
        setCameras(previousCameras);
        throw err;
      }
    },
    [cameras, fetchCameras],
  );

  return {
    cameras,
    loading,
    error,
    refetch: fetchCameras,
    addCamera,
    updateCamera,
    deleteCamera,
  };
}
