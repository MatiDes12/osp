"use client";

import { WifiOff } from "lucide-react";

interface Props {
  visible: boolean;
}

/**
 * Thin banner shown at the top of the dashboard when the gateway is
 * unreachable. Data from the local IndexedDB cache is served automatically —
 * this banner just makes the degraded state visible to the user.
 */
export function OfflineBanner({ visible }: Props) {
  if (!visible) return null;

  return (
    <div className="flex items-center gap-2 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-amber-400 text-sm">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>
        You&apos;re offline — showing cached data. Changes will sync
        automatically when the connection is restored.
      </span>
    </div>
  );
}
