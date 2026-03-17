import { ApiClient, type ClientConfig } from "./client.js";
import { createAuthApi } from "./auth.js";
import { createCamerasApi } from "./cameras.js";
import { createEventsApi } from "./events.js";
import { createRecordingsApi } from "./recordings.js";
import { createRulesApi } from "./rules.js";
import { createTenantApi } from "./tenant.js";
import { createExtensionsApi } from "./extensions.js";

export type { ClientConfig } from "./client.js";
export type { LoginResponse, RefreshResponse } from "./auth.js";
export type { ListRecordingsParams } from "./recordings.js";
export type { RuleTestResult } from "./rules.js";
export type { MarketplaceParams } from "./extensions.js";

export function createOSPClient(config: ClientConfig) {
  const client = new ApiClient(config);

  return {
    auth: createAuthApi(client),
    cameras: createCamerasApi(client),
    events: createEventsApi(client),
    recordings: createRecordingsApi(client),
    rules: createRulesApi(client),
    tenant: createTenantApi(client),
    extensions: createExtensionsApi(client),
  };
}
