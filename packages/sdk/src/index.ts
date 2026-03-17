// OSP Extension SDK
// This package is used by extension developers to build OSP extensions.

export type { OSPExtension } from "./types/extension.js";
export type {
  ExtensionManifest,
  Permission,
  ResourceLimits,
} from "./types/manifest.js";
export type {
  HookContext,
  HookResult,
  MotionEvent,
  PersonEvent,
  VehicleEvent,
  CameraStatusEvent,
  RecordingEvent,
  AlertEvent,
  ScheduledEvent,
} from "./types/hooks.js";
export type { DashboardWidget, WidgetProps } from "./types/widgets.js";
export type { SettingsSchema, SettingsField } from "./types/settings.js";
