export type CameraProtocol = "rtsp" | "onvif" | "webrtc" | "usb" | "ip";

export type CameraStatus =
  | "online"
  | "offline"
  | "connecting"
  | "error"
  | "disabled";

export interface Camera {
  id: string;
  tenantId: string;
  name: string;
  protocol: CameraProtocol;
  connectionUri: string;
  status: CameraStatus;
  location: CameraLocation;
  capabilities: CameraCapabilities;
  config: CameraConfig;
  ptzCapable: boolean;
  audioCapable: boolean;
  firmwareVersion: string | null;
  manufacturer: string | null;
  model: string | null;
  zonesCount: number;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CameraLocation {
  label?: string;
  lat?: number;
  lng?: number;
  floor?: string;
}

export interface CameraCapabilities {
  ptz: boolean;
  audio: boolean;
  twoWayAudio: boolean;
  infrared: boolean;
  resolution: string;
}

export interface CameraConfig {
  recordingMode: "motion" | "continuous" | "off";
  motionSensitivity: number;
  audioEnabled: boolean;
}

export interface CameraZone {
  id: string;
  cameraId: string;
  tenantId: string;
  name: string;
  polygonCoordinates: { x: number; y: number }[];
  alertEnabled: boolean;
  sensitivity: number;
  colorHex: string;
  visibleToRoles: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiscoveredCamera {
  ip: string;
  port: number;
  manufacturer?: string;
  model?: string;
  name?: string;
  rtspUrl: string;
  onvifUrl?: string;
  alreadyAdded: boolean;
  /** Common RTSP paths found on this host */
  possiblePaths?: string[];
}

export interface StreamInfo {
  whepUrl: string;
  token: string;
  fallbackHlsUrl: string;
  iceServers: {
    urls: string[];
    username?: string;
    credential?: string;
  }[];
}
