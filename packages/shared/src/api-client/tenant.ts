import type { ApiClient } from "./client.js";
import type { ApiResponse } from "../types/api.js";
import type {
  Tenant,
  TenantSettings,
  TenantBranding,
  TenantUsage,
} from "../types/tenant.js";
import type { User } from "../types/user.js";
import type { InviteUserInput } from "../schemas/auth.schema.js";

export function createTenantApi(client: ApiClient) {
  return {
    getCurrent(): Promise<ApiResponse<Tenant>> {
      return client.get<Tenant>("/api/v1/tenant");
    },

    updateSettings(
      data: Partial<TenantSettings>,
    ): Promise<ApiResponse<Tenant>> {
      return client.patch<Tenant>("/api/v1/tenant/settings", data);
    },

    updateBranding(
      data: Partial<TenantBranding>,
    ): Promise<ApiResponse<Tenant>> {
      return client.patch<Tenant>("/api/v1/tenant/branding", data);
    },

    listUsers(): Promise<ApiResponse<User[]>> {
      return client.get<User[]>("/api/v1/tenant/users");
    },

    inviteUser(data: InviteUserInput): Promise<ApiResponse<User>> {
      return client.post<User>("/api/v1/tenant/users/invite", data);
    },

    updateUserRole(
      userId: string,
      role: string,
    ): Promise<ApiResponse<void>> {
      return client.patch<void>(`/api/v1/tenant/users/${userId}/role`, {
        role,
      });
    },

    removeUser(userId: string): Promise<ApiResponse<void>> {
      return client.delete<void>(`/api/v1/tenant/users/${userId}`);
    },

    getUsage(): Promise<ApiResponse<TenantUsage>> {
      return client.get<TenantUsage>("/api/v1/tenant/usage");
    },
  };
}
