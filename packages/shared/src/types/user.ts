export type UserRole = "owner" | "admin" | "operator" | "viewer";

export interface User {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  authProvider: string;
  role: UserRole;
  cameraIds: string[] | null;
  preferences: UserPreferences;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserPreferences {
  theme: "light" | "dark" | "system";
  notificationsEnabled: boolean;
  defaultGridSize: 1 | 4 | 9 | 16;
  timezone: string | null;
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 4,
  admin: 3,
  operator: 2,
  viewer: 1,
};

export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}
