import type { ApiClient } from "./client.js";
import type { ApiResponse } from "../types/api.js";
import type { User } from "../types/user.js";
import type { RegisterInput, LoginInput } from "../schemas/auth.schema.js";

export interface LoginResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function createAuthApi(client: ApiClient) {
  return {
    register(data: RegisterInput): Promise<ApiResponse<LoginResponse>> {
      return client.post<LoginResponse>("/api/v1/auth/register", data);
    },

    login(data: LoginInput): Promise<ApiResponse<LoginResponse>> {
      return client.post<LoginResponse>("/api/v1/auth/login", data);
    },

    refresh(refreshToken: string): Promise<ApiResponse<RefreshResponse>> {
      return client.post<RefreshResponse>("/api/v1/auth/refresh", {
        refreshToken,
      });
    },

    logout(): Promise<ApiResponse<void>> {
      return client.post<void>("/api/v1/auth/logout");
    },

    forgotPassword(email: string): Promise<ApiResponse<void>> {
      return client.post<void>("/api/v1/auth/forgot-password", { email });
    },
  };
}
