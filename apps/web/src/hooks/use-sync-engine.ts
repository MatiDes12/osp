"use client";

/**
 * Background sync engine for offline-first support.
 *
 * - Pulls cameras / events / recordings from the gateway every 5 minutes and
 *   stores them in IndexedDB so the app can serve cached data when offline.
 * - Fires an extra sync whenever the browser transitions from offline → online.
 * - Exposes `isOffline` so the UI can show an offline banner.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import type { Camera, OSPEvent, Recording } from "@osp/shared";
import {
  cacheCameras,
  cacheEvents,
  cacheRecordings,
} from "@/lib/local-db";
import { transformCamera, transformEvents, transformRecordings, isSnakeCaseRow } from "@/lib/transforms";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function getAuthHeaders(): Record<string, string> {
  const token =
    typeof localStorage !== "undefined"
      ? localStorage.getItem("osp_access_token")
      : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** Fast connectivity check — hits the gateway /health endpoint with a 5s timeout. */
export async function isGatewayReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`${API_URL}/health`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(tid);
    return res.ok;
  } catch {
    return false;
  }
}

async function pullAndCache(): Promise<boolean> {
  const headers = getAuthHeaders();
  if (!headers["Authorization"]) return false; // not logged in yet

  try {
    const [camRes, evtRes, recRes] = await Promise.allSettled([
      fetch(`${API_URL}/api/v1/cameras?limit=200`, { headers }),
      fetch(`${API_URL}/api/v1/events?limit=200`, { headers }),
      fetch(`${API_URL}/api/v1/recordings?limit=200`, { headers }),
    ]);

    if (camRes.status === "fulfilled" && camRes.value.ok) {
      const json = await camRes.value.json();
      if (json.success && json.data) {
        const raw = json.data as Record<string, unknown>[];
        const cameras: Camera[] = raw.map((r) =>
          isSnakeCaseRow(r) ? transformCamera(r) : (r as unknown as Camera),
        );
        await cacheCameras(cameras);
      }
    }

    if (evtRes.status === "fulfilled" && evtRes.value.ok) {
      const json = await evtRes.value.json();
      if (json.success && json.data) {
        const events: OSPEvent[] = transformEvents(
          json.data as Record<string, unknown>[],
        );
        await cacheEvents(events);
      }
    }

    if (recRes.status === "fulfilled" && recRes.value.ok) {
      const json = await recRes.value.json();
      if (json.success && json.data) {
        const recordings: Recording[] = transformRecordings(
          json.data as Record<string, unknown>[],
        );
        await cacheRecordings(recordings);
      }
    }

    return true;
  } catch {
    return false;
  }
}

export function useSyncEngine(): { isOffline: boolean } {
  const [isOffline, setIsOffline] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async () => {
    const reachable = await isGatewayReachable();
    setIsOffline(!reachable);
    if (reachable) {
      await pullAndCache();
    }
  }, []);

  useEffect(() => {
    // Initial sync after a short delay (let auth settle first)
    const initTimer = setTimeout(() => void runSync(), 3000);

    // Periodic background sync
    intervalRef.current = setInterval(() => void runSync(), SYNC_INTERVAL_MS);

    // Re-sync immediately when browser comes back online
    const handleOnline = () => void runSync();
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      clearTimeout(initTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [runSync]);

  return { isOffline };
}
