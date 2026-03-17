import type { CameraStatus } from "@osp/shared";
import { cn } from "../utils.js";

const STATUS_COLORS: Record<CameraStatus, string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  connecting: "bg-yellow-500 animate-pulse",
  error: "bg-red-500",
  disabled: "bg-gray-500",
};

interface StatusIndicatorProps {
  status: CameraStatus;
  size?: "sm" | "md";
  label?: boolean;
}

export function StatusIndicator({
  status,
  size = "sm",
  label = false,
}: StatusIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "rounded-full",
          size === "sm" ? "h-2 w-2" : "h-3 w-3",
          STATUS_COLORS[status],
        )}
      />
      {label && (
        <span className="text-xs capitalize text-[var(--color-muted)]">
          {status}
        </span>
      )}
    </span>
  );
}
