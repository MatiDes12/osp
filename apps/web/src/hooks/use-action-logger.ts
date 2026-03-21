"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useActionLogStore } from "@/stores/action-log";

/**
 * Auto-logs route changes to the action log panel.
 * Place this once in the dashboard layout.
 */
export function useRouteLogger(): void {
  const pathname = usePathname();
  const prevPath = useRef(pathname);

  useEffect(() => {
    if (prevPath.current !== pathname) {
      useActionLogStore.getState().push("navigate", `${prevPath.current} -> ${pathname}`, { detail: pathname });
      prevPath.current = pathname;
    }
  }, [pathname]);
}
