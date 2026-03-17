"use client";

import { useState, useEffect, useCallback } from "react";
import type { Camera, ApiResponse } from "@osp/shared";

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
  cameras: readonly Camera[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addCamera: (data: {
    name: string;
    protocol: "rtsp" | "onvif";
    connectionUri: string;
    location?: { label?: string };
  }) => Promise<Camera>;
  deleteCamera: (id: string) => Promise<void>;
}

export function useCameras(): UseCamerasReturn {
  const [cameras, setCameras] = useState<readonly Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/cameras`, {
        headers: getAuthHeaders(),
      });
      const json: ApiResponse<Camera[]> = await response.json();
      if (json.success && json.data) {
        setCameras(json.data);
      } else {
        setError(json.error?.message ?? "Failed to fetch cameras");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  const addCamera = useCallback(
    async (data: {
      name: string;
      protocol: "rtsp" | "onvif";
      connectionUri: string;
      location?: { label?: string };
    }): Promise<Camera> => {
      const response = await fetch(`${API_URL}/api/v1/cameras`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const json: ApiResponse<Camera> = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to add camera");
      }
      await fetchCameras();
      return json.data;
    },
    [fetchCameras],
  );

  const deleteCamera = useCallback(
    async (id: string): Promise<void> => {
      const response = await fetch(`${API_URL}/api/v1/cameras/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json: ApiResponse<void> = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to delete camera");
      }
      await fetchCameras();
    },
    [fetchCameras],
  );

  return { cameras, loading, error, refetch: fetchCameras, addCamera, deleteCamera };
}
