import type { ApiClient } from "./client.js";
import type { ApiResponse } from "../types/api.js";
import type { Extension, InstalledExtension } from "../types/extension.js";

export interface MarketplaceParams {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export function createExtensionsApi(client: ApiClient) {
  return {
    marketplace(params?: MarketplaceParams): Promise<ApiResponse<Extension[]>> {
      return client.get<Extension[]>(
        "/api/v1/extensions/marketplace",
        params as unknown as Record<
          string,
          string | number | boolean | undefined
        >,
      );
    },

    marketplaceDetail(id: string): Promise<ApiResponse<Extension>> {
      return client.get<Extension>(`/api/v1/extensions/marketplace/${id}`);
    },

    listInstalled(): Promise<ApiResponse<InstalledExtension[]>> {
      return client.get<InstalledExtension[]>("/api/v1/extensions");
    },

    install(
      extensionId: string,
      config?: Record<string, unknown>,
    ): Promise<ApiResponse<InstalledExtension>> {
      return client.post<InstalledExtension>("/api/v1/extensions", {
        extensionId,
        config,
      });
    },

    updateConfig(
      id: string,
      config: Record<string, unknown>,
    ): Promise<ApiResponse<InstalledExtension>> {
      return client.patch<InstalledExtension>(
        `/api/v1/extensions/${id}/config`,
        { config },
      );
    },

    toggle(
      id: string,
      enabled: boolean,
    ): Promise<ApiResponse<InstalledExtension>> {
      return client.patch<InstalledExtension>(
        `/api/v1/extensions/${id}/toggle`,
        { enabled },
      );
    },

    uninstall(id: string): Promise<ApiResponse<void>> {
      return client.delete<void>(`/api/v1/extensions/${id}`);
    },
  };
}
