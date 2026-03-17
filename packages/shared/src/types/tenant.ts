export type TenantPlan = "free" | "pro" | "business" | "enterprise";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  settings: TenantSettings;
  branding: TenantBranding;
  logoUrl: string | null;
  customDomain: string | null;
  maxCameras: number;
  maxUsers: number;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  defaultRetentionDays: number;
  defaultRecordingMode: "motion" | "continuous" | "off";
  defaultMotionSensitivity: number;
  timezone: string;
  notificationPreferences: {
    emailDigest: "none" | "daily" | "weekly";
    pushEnabled: boolean;
  };
}

export interface TenantBranding {
  primaryColor: string;
  accentColor: string;
  fontFamily: string | null;
  faviconUrl: string | null;
}

export interface TenantUsage {
  plan: TenantPlan;
  cameras: { used: number; limit: number };
  users: { used: number; limit: number };
  storage: { usedBytes: number; limitBytes: number };
  extensions: { used: number; limit: number };
  recordings: { totalCount: number; totalDurationHours: number };
  apiCallsToday: number;
}

export const PLAN_LIMITS: Record<
  TenantPlan,
  {
    maxCameras: number;
    maxUsers: number;
    retentionDays: number;
    maxConcurrentStreams: number;
    maxExtensions: number;
    apiRequestsPerMin: number;
  }
> = {
  free: {
    maxCameras: 4,
    maxUsers: 2,
    retentionDays: 7,
    maxConcurrentStreams: 2,
    maxExtensions: 2,
    apiRequestsPerMin: 60,
  },
  pro: {
    maxCameras: 16,
    maxUsers: 5,
    retentionDays: 30,
    maxConcurrentStreams: 4,
    maxExtensions: 10,
    apiRequestsPerMin: 300,
  },
  business: {
    maxCameras: 100,
    maxUsers: 25,
    retentionDays: 90,
    maxConcurrentStreams: 8,
    maxExtensions: 100,
    apiRequestsPerMin: 1000,
  },
  enterprise: {
    maxCameras: 10000,
    maxUsers: 1000,
    retentionDays: 365,
    maxConcurrentStreams: 16,
    maxExtensions: 1000,
    apiRequestsPerMin: 5000,
  },
};
