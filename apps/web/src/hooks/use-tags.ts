"use client";

import { useState, useEffect, useCallback } from "react";

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

export interface CameraTag {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly color: string;
  readonly createdAt: string;
}

function transformTag(raw: Record<string, unknown>): CameraTag {
  return {
    id: raw.id as string,
    tenantId: (raw.tenant_id ?? raw.tenantId) as string,
    name: raw.name as string,
    color: (raw.color as string) ?? "#3B82F6",
    createdAt: (raw.created_at ?? raw.createdAt) as string,
  };
}

interface UseTagsReturn {
  readonly tags: readonly CameraTag[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly refetch: () => Promise<void>;
  readonly createTag: (name: string, color?: string) => Promise<CameraTag>;
  readonly deleteTag: (id: string) => Promise<void>;
  readonly assignTags: (cameraId: string, tagIds: string[]) => Promise<void>;
  readonly removeTag: (cameraId: string, tagId: string) => Promise<void>;
}

export function useTags(): UseTagsReturn {
  const [tags, setTags] = useState<readonly CameraTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/v1/tags`, {
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (json.success && json.data) {
        const raw = json.data as Record<string, unknown>[];
        setTags(raw.map(transformTag));
      } else {
        setError(json.error?.message ?? "Failed to fetch tags");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const createTag = useCallback(
    async (name: string, color?: string): Promise<CameraTag> => {
      const response = await fetch(`${API_URL}/api/v1/tags`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name, color }),
      });
      const json = await response.json();
      if (!json.success || !json.data) {
        throw new Error(json.error?.message ?? "Failed to create tag");
      }
      const tag = transformTag(json.data as Record<string, unknown>);
      await fetchTags();
      return tag;
    },
    [fetchTags],
  );

  const deleteTag = useCallback(
    async (id: string): Promise<void> => {
      const response = await fetch(`${API_URL}/api/v1/tags/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to delete tag");
      }
      await fetchTags();
    },
    [fetchTags],
  );

  const assignTags = useCallback(
    async (cameraId: string, tagIds: string[]): Promise<void> => {
      const response = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/tags`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ tagIds }),
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to assign tags");
      }
    },
    [],
  );

  const removeTag = useCallback(
    async (cameraId: string, tagId: string): Promise<void> => {
      const response = await fetch(`${API_URL}/api/v1/cameras/${cameraId}/tags/${tagId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message ?? "Failed to remove tag");
      }
    },
    [],
  );

  return {
    tags,
    loading,
    error,
    refetch: fetchTags,
    createTag,
    deleteTag,
    assignTags,
    removeTag,
  };
}
