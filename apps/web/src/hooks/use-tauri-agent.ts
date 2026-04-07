"use client";

import { useEffect } from "react";
import { isTauri } from "@/lib/tauri";
import { getToken } from "@/hooks/use-auth";
import { getTenantIdFromAccessToken } from "@/lib/jwt";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// Supabase JWTs expire after 1 hour. Refresh the camera-ingest token every
// 45 minutes so it never hits auth errors mid-session.
const TOKEN_REFRESH_INTERVAL_MS = 45 * 60 * 1000;

let agentStarted = false;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function getTauriInvoke() {
  return (
    window as unknown as {
      __TAURI_INTERNALS__?: {
        invoke: (cmd: string, args?: unknown) => Promise<unknown>;
      };
    }
  ).__TAURI_INTERNALS__?.invoke;
}

/**
 * Starts the bundled camera-ingest sidecar after the user has authenticated.
 * Only runs in the Tauri desktop app. Idempotent — safe to call multiple times.
 * Automatically restarts the sidecar with a fresh token every 45 minutes.
 */
export function useTauriAgent() {
  useEffect(() => {
    if (!isTauri() || agentStarted) return;

    const token = getToken();
    if (!token) return;

    const invoke = getTauriInvoke();
    if (!invoke) return;

    const tenantId = getTenantIdFromAccessToken(token) ?? "";

    agentStarted = true;

    invoke("start_camera_ingest", {
      gatewayUrl: API_URL,
      apiToken: token,
      tenantId,
    }).catch((e) => {
      // Binary not present in dev mode — silent ignore
      console.debug("[OSP] camera-ingest sidecar:", e);
      agentStarted = false;
    });

    // Refresh the token periodically so camera-ingest never uses an expired JWT
    if (!refreshTimer) {
      refreshTimer = setInterval(() => {
        const freshToken = getToken();
        if (!freshToken) return;

        const freshInvoke = getTauriInvoke();
        if (!freshInvoke) return;

        const freshTenantId = getTenantIdFromAccessToken(freshToken) ?? "";

        freshInvoke("restart_camera_ingest", {
          gatewayUrl: API_URL,
          apiToken: freshToken,
          tenantId: freshTenantId,
        }).catch((e) => {
          console.debug("[OSP] camera-ingest token refresh:", e);
        });
      }, TOKEN_REFRESH_INTERVAL_MS);
    }

    return () => {
      // Don't clear the timer on component unmount — the layout is always
      // mounted while authenticated. The timer is module-level so it persists.
    };
  }, []);
}
