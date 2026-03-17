export type ExtensionStatus =
  | "draft"
  | "review"
  | "published"
  | "suspended"
  | "deprecated";

export interface Extension {
  id: string;
  name: string;
  version: string;
  author: { name: string; email: string; url?: string; verified: boolean };
  description: string;
  iconUrl: string;
  categories: string[];
  installCount: number;
  avgRating: number;
  permissions: string[];
  screenshots: string[];
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstalledExtension {
  id: string;
  extension: Extension;
  config: Record<string, unknown>;
  enabled: boolean;
  installedVersion: string;
  resourceUsage: {
    cpuMsLastHour: number;
    memoryMbPeak: number;
    apiCallsLastHour: number;
  };
  installedAt: string;
}

export type Permission =
  | "cameras:read"
  | "cameras:write"
  | "events:read"
  | "events:write"
  | "events:abort"
  | "recordings:read"
  | "recordings:write"
  | "notifications:send"
  | "storage:read"
  | "storage:write"
  | "users:read"
  | "http:outbound";
