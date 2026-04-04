"use client";

import { useEffect } from "react";
import { isTauri } from "@/lib/tauri";
import { getToken } from "@/hooks/use-auth";
import { getTenantIdFromAccessToken } from "@/lib/jwt";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

let agentStarted = false;

/**
 * Starts the bundled camera-ingest sidecar after the user has authenticated.
 * Only runs in the Tauri desktop app. Idempotent — safe to call multiple times.
 */
export function useTauriAgent() {
  useEffect(() => {
    if (!isTauri() || agentStarted) return;

    const token = getToken();
    const tenantId = getTenantIdFromAccessToken(token);

    if (!token || !tenantId) return;

    agentStarted = true;

    import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke("start_camera_ingest", {
          gatewayUrl: API_URL,
          apiToken: token,
          tenantId,
        }),
      )
      .catch((e) => {
        // Binary not present in dev mode — silent ignore
        console.debug("[OSP] camera-ingest sidecar:", e);
        agentStarted = false;
      });
  }, []);
}
