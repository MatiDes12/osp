import { ApiClient, type ClientConfig } from "./client.js";
import { createCamerasApi } from "./cameras.js";

export type { ClientConfig } from "./client.js";

export function createOSPClient(config: ClientConfig) {
  const client = new ApiClient(config);

  return {
    cameras: createCamerasApi(client),
    // events: createEventsApi(client),      // TODO: Phase 1
    // recordings: createRecordingsApi(client), // TODO: Phase 1
    // rules: createRulesApi(client),         // TODO: Phase 1
    // auth: createAuthApi(client),           // TODO: Phase 1
    // tenant: createTenantApi(client),       // TODO: Phase 1
  };
}
