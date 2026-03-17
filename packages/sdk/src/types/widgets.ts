export type WidgetPlacement =
  | "dashboard"
  | "camera-detail"
  | "event-detail"
  | "settings";

export interface DashboardWidget {
  id: string;
  name: string;
  description: string;
  component: string;
  placement: WidgetPlacement[];
  size: {
    minWidth: number;
    minHeight: number;
    maxWidth?: number;
    maxHeight?: number;
  };
  refreshInterval?: number;
}

export interface WidgetProps {
  tenantId: string;
  config: Record<string, unknown>;
  size: { width: number; height: number };
}
