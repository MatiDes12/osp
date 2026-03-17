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

export interface ResourceLimits {
  maxMemoryMb: number;
  maxCpuMs: number;
  maxApiCallsPerMinute: number;
  maxStorageBytes: number;
  allowedDomains?: string[];
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    email: string;
    url?: string;
  };
  engine: string;
  entrypoint: string;
  icon?: string;
  categories: string[];
  permissions: Permission[];
  resources: ResourceLimits;
}
