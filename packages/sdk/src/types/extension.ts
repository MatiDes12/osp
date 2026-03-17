import type { ExtensionManifest } from "./manifest.js";
import type {
  HookContext,
  HookResult,
  MotionEvent,
  PersonEvent,
  VehicleEvent,
  CameraStatusEvent,
  RecordingEvent,
  AlertEvent,
  ScheduledEvent,
} from "./hooks.js";
import type { DashboardWidget } from "./widgets.js";
import type { SettingsSchema } from "./settings.js";

export interface OSPExtension {
  manifest: ExtensionManifest;
  onInstall?(ctx: { tenantId: string }): Promise<void>;
  onUninstall?(ctx: { tenantId: string }): Promise<void>;
  hooks?: {
    onMotionDetected?(event: MotionEvent, ctx: HookContext): Promise<HookResult>;
    onPersonDetected?(event: PersonEvent, ctx: HookContext): Promise<HookResult>;
    onVehicleDetected?(event: VehicleEvent, ctx: HookContext): Promise<HookResult>;
    onCameraOffline?(event: CameraStatusEvent, ctx: HookContext): Promise<HookResult>;
    onCameraOnline?(event: CameraStatusEvent, ctx: HookContext): Promise<HookResult>;
    onRecordingComplete?(event: RecordingEvent, ctx: HookContext): Promise<HookResult>;
    onAlertTriggered?(event: AlertEvent, ctx: HookContext): Promise<HookResult>;
    onScheduledTick?(event: ScheduledEvent, ctx: HookContext): Promise<HookResult>;
  };
  widgets?: DashboardWidget[];
  settings?: SettingsSchema;
}
