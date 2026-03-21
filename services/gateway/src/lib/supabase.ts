import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── Dual-write proxy helpers ─────────────────────────────────────────────────
// When SUPABASE_CLOUD_URL differs from SUPABASE_URL (i.e. Docker local-dev mode)
// every write operation (.insert / .update / .delete / .upsert) is mirrored to
// the cloud client in the background.  Reads always go to the primary client only.

const WRITE_METHODS = new Set(["insert", "update", "delete", "upsert"]);

function makeFilterBuilderProxy(primaryFB: unknown, cloudFB: unknown): unknown {
  let cloudFired = false;

  function fireCloud() {
    if (!cloudFired) {
      cloudFired = true;
      Promise.resolve(cloudFB as PromiseLike<unknown>).then(
        (r: unknown) => {
          const result = r as {
            error?: { message?: string; details?: string };
          } | null;
          if (result?.error) {
            console.warn(
              "[dual-write] cloud error:",
              result.error.message,
              result.error.details ?? "",
            );
          }
        },
        (e: unknown) => console.warn("[dual-write] cloud threw:", e),
      );
    }
  }

  return new Proxy(primaryFB as object, {
    get(target, prop) {
      // Intercept Promise protocol — fire cloud before primary resolves
      if (prop === "then" || prop === "catch" || prop === "finally") {
        fireCloud();
        const val = (target as Record<string | symbol, unknown>)[prop];
        return typeof val === "function" ? (val as Function).bind(target) : val;
      }

      const val = (target as Record<string | symbol, unknown>)[prop];
      if (typeof val !== "function") return val;

      return (...args: unknown[]) => {
        const primaryResult = (val as Function).apply(target, args);
        // Mirror every chained call (eq, neq, select, single, …) on the cloud side
        const cloudVal = (cloudFB as Record<string | symbol, unknown>)[prop];
        const cloudResult =
          typeof cloudVal === "function"
            ? (cloudVal as Function).apply(cloudFB, args)
            : undefined;

        // If the result is still Promise-like (another builder), keep proxying
        if (
          primaryResult &&
          typeof (primaryResult as Record<string, unknown>).then === "function"
        ) {
          return makeFilterBuilderProxy(primaryResult, cloudResult);
        }
        return primaryResult;
      };
    },
  });
}

function makeQueryBuilderProxy(primaryQB: unknown, cloudQB: unknown): unknown {
  return new Proxy(primaryQB as object, {
    get(target, prop) {
      const val = (target as Record<string | symbol, unknown>)[prop];

      if (
        typeof prop === "string" &&
        WRITE_METHODS.has(prop) &&
        typeof val === "function"
      ) {
        return (...args: unknown[]) => {
          const primaryResult = (val as Function).apply(target, args);
          const cloudVal = (cloudQB as Record<string | symbol, unknown>)[prop];
          const cloudResult =
            typeof cloudVal === "function"
              ? (cloudVal as Function).apply(cloudQB, args)
              : undefined;
          return makeFilterBuilderProxy(primaryResult, cloudResult);
        };
      }

      return typeof val === "function" ? (val as Function).bind(target) : val;
    },
  });
}

function makeCloudMirrorProxy(
  primary: SupabaseClient,
  cloud: SupabaseClient,
): SupabaseClient {
  return new Proxy(primary, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) =>
          makeQueryBuilderProxy(target.from(table), cloud.from(table));
      }
      const val = Reflect.get(target, prop, receiver) as unknown;
      return typeof val === "function" ? (val as Function).bind(target) : val;
    },
  }) as SupabaseClient;
}

// ─── Admin client ─────────────────────────────────────────────────────────────
// Uses service_role key, bypasses RLS.
// In Docker local-dev mode this is automatically dual-written to the cloud DB.

let adminClient: SupabaseClient | null = null;

function makeClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function getSupabase(): SupabaseClient {
  if (!adminClient) {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];

    if (!url || !key) {
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required",
      );
    }

    const primary = makeClient(url, key);

    // Dual-write: if a separate cloud URL is configured and it differs from
    // the primary URL (local-dev Docker scenario), mirror all writes to cloud.
    const cloudUrl = process.env["SUPABASE_CLOUD_URL"];
    const cloudKey = process.env["SUPABASE_CLOUD_SERVICE_ROLE_KEY"];

    if (cloudUrl && cloudKey && cloudUrl !== url) {
      console.info(
        `[supabase] dual-write enabled — primary: ${url}  cloud: ${cloudUrl}`,
      );
      adminClient = makeCloudMirrorProxy(
        primary,
        makeClient(cloudUrl, cloudKey),
      );
    } else {
      adminClient = primary;
    }
  }

  return adminClient;
}

// ─── Auth client ──────────────────────────────────────────────────────────────
// Uses anon key for user-facing auth operations (signInWithPassword, signUp …).
// Separate from admin to avoid session contamination.

let authClient: SupabaseClient | null = null;

export function getAuthSupabase(): SupabaseClient {
  if (!authClient) {
    const url = process.env["SUPABASE_URL"];
    const anonKey = process.env["SUPABASE_ANON_KEY"];

    if (!url || !anonKey) {
      throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
    }

    authClient = makeClient(url, anonKey);
  }

  return authClient;
}
