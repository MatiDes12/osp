import type { ApiClient } from "./client.js";
import type { ApiResponse } from "../types/api.js";
import type { AlertRule } from "../types/rule.js";
import type {
  CreateRuleInput,
  UpdateRuleInput,
} from "../schemas/rule.schema.js";

export interface RuleTestResult {
  steps: { label: string; passed: boolean }[];
}

export function createRulesApi(client: ApiClient) {
  return {
    list(): Promise<ApiResponse<AlertRule[]>> {
      return client.get<AlertRule[]>("/api/v1/rules");
    },

    get(id: string): Promise<ApiResponse<AlertRule>> {
      return client.get<AlertRule>(`/api/v1/rules/${id}`);
    },

    create(data: CreateRuleInput): Promise<ApiResponse<AlertRule>> {
      return client.post<AlertRule>("/api/v1/rules", data);
    },

    update(id: string, data: UpdateRuleInput): Promise<ApiResponse<AlertRule>> {
      return client.patch<AlertRule>(`/api/v1/rules/${id}`, data);
    },

    delete(id: string): Promise<ApiResponse<void>> {
      return client.delete<void>(`/api/v1/rules/${id}`);
    },

    test(id: string): Promise<ApiResponse<RuleTestResult>> {
      return client.post<RuleTestResult>(`/api/v1/rules/${id}/test`);
    },
  };
}
