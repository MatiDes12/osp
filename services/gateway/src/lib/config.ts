/**
 * Central config: key-value store from config_secrets table + process.env fallback.
 * DB values override env. Used for secrets, API keys, and all sensitive config.
 *
 * Bootstrap: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in env to connect.
 */

import { getSupabase } from "./supabase.js";
import { createLogger } from "./logger.js";

const logger = createLogger("config");

let cache: Map<string, string> = new Map();
let loaded = false;

export async function loadConfig(): Promise<void> {
  if (loaded) return;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("config_secrets")
      .select("key, value")
      .eq("scope", "global")
      .is("tenant_id", null);

    if (error) {
      logger.warn("Config load failed, using env only", {
        error: String(error),
      });
      loaded = true;
      return;
    }

    const next = new Map<string, string>();
    for (const row of data ?? []) {
      const k = row.key as string;
      const v = row.value as string;
      if (k && v != null) next.set(k, v);
    }
    cache = next;
    loaded = true;
    logger.info("Config loaded from DB", { keys: String(cache.size) });
  } catch (err) {
    logger.warn("Config load error, using env only", { error: String(err) });
    loaded = true;
  }
}

/**
 * Get config value. Priority: DB > process.env > default.
 */
export function get(key: string, defaultValue?: string): string | undefined {
  const fromDb = cache.get(key);
  if (fromDb !== undefined && fromDb !== "") return fromDb;
  const fromEnv = process.env[key];
  if (fromEnv !== undefined && fromEnv !== "") return fromEnv;
  return defaultValue;
}

/**
 * Get config value, requiring it to be set (from DB or env).
 */
export function requireGet(key: string): string {
  const v = get(key);
  if (!v) throw new Error(`Missing required config: ${key}`);
  return v;
}

/**
 * Get tenant-scoped config (DB override for tenant, then global, then env).
 */
export async function getForTenant(
  tenantId: string,
  key: string,
  defaultValue?: string,
): Promise<string | undefined> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("config_secrets")
      .select("value")
      .eq("key", key)
      .eq("scope", "tenant")
      .eq("tenant_id", tenantId)
      .limit(1)
      .maybeSingle();

    if (data?.value) return data.value as string;
  } catch {
    // Fall through to global
  }
  return get(key, defaultValue);
}

/**
 * Invalidate cache (e.g. after config update). Next get() will use stale cache
 * until loadConfig() is called again.
 */
export function invalidateCache(): void {
  loaded = false;
  cache = new Map();
}
