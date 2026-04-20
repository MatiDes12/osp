// ---------------------------------------------------------------------------
//  SSO / OAuth routes
//  Supports Google (Workspace), Microsoft Azure AD / Entra ID, GitHub
//
//  Public endpoints (no auth required):
//    GET  /api/v1/auth/sso/providers?domain=acme.com   list providers for a domain
//    GET  /api/v1/auth/sso/initiate?provider=google    get OAuth redirect URL
//    POST /api/v1/auth/sso/session                     exchange access_token → session
//
//  Authenticated endpoints (owner / admin only):
//    GET  /api/v1/auth/sso/config                      list tenant SSO configs
//    PUT  /api/v1/auth/sso/config/:provider            upsert provider config
//    DELETE /api/v1/auth/sso/config/:provider          disable/remove provider
// ---------------------------------------------------------------------------

import { Hono } from "hono";
import type { Env } from "../app.js";
import { getSupabase, getAuthSupabase } from "../lib/supabase.js";
import { ApiError } from "../middleware/error-handler.js";
import { requireAuth } from "../middleware/auth.js";
import { createSuccessResponse } from "@osp/shared";
import { get } from "../lib/config.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("sso");

export const ssoRoutes = new Hono<Env>();

type SsoProvider = "google" | "azure" | "github";

const PROVIDER_LABELS: Record<SsoProvider, string> = {
  google: "Google",
  azure: "Microsoft / Azure AD",
  github: "GitHub",
};

// ---------------------------------------------------------------------------
//  GET /providers?domain=acme.com
//  Returns which SSO providers are configured for the given email domain.
//  Used by the login page to show provider buttons when a work email is typed.
// ---------------------------------------------------------------------------
ssoRoutes.get("/providers", async (c) => {
  const domain = c.req.query("domain");
  const supabase = getSupabase();

  if (!domain) {
    // No domain filter — return all globally available providers
    const providers: SsoProvider[] = ["google", "azure", "github"];
    return c.json(
      createSuccessResponse(
        providers.map((p) => ({ provider: p, label: PROVIDER_LABELS[p] })),
      ),
    );
  }

  // Find tenants whose SSO configs allow this domain
  const { data: configs } = await supabase
    .from("sso_configs")
    .select("provider, allowed_domains")
    .eq("enabled", true);

  if (!configs) return c.json(createSuccessResponse([]));

  const matching = configs.filter(
    (cfg) =>
      (cfg.allowed_domains as string[]).length === 0 ||
      (cfg.allowed_domains as string[]).includes(domain),
  );

  return c.json(
    createSuccessResponse(
      matching.map((cfg) => ({
        provider: cfg.provider as SsoProvider,
        label: PROVIDER_LABELS[cfg.provider as SsoProvider],
      })),
    ),
  );
});

// ---------------------------------------------------------------------------
//  GET /initiate?provider=google&redirectTo=http://localhost:3001/auth/callback
//  Returns the Supabase OAuth URL. The frontend redirects the user there.
// ---------------------------------------------------------------------------
ssoRoutes.get("/initiate", async (c) => {
  const provider = c.req.query("provider") as SsoProvider | undefined;
  const redirectTo =
    c.req.query("redirectTo") ??
    `${get("WEB_URL") ?? "http://localhost:3001"}/auth/callback`;

  if (!provider || !["google", "azure", "github"].includes(provider)) {
    throw new ApiError(
      "AUTH_SSO_INVALID_PROVIDER",
      "Invalid SSO provider",
      400,
    );
  }

  const supabaseUrl = process.env["SUPABASE_URL"];
  if (!supabaseUrl) {
    throw new ApiError("INTERNAL_ERROR", "Supabase not configured", 500);
  }

  // Supabase OAuth URL — user gets redirected here, Supabase handles the flow
  // and sends them back to redirectTo with #access_token=...&refresh_token=...
  const url = `${supabaseUrl}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(redirectTo)}`;

  logger.info("SSO initiate", { provider, redirectTo });

  return c.json(createSuccessResponse({ url, provider }));
});

// ---------------------------------------------------------------------------
//  POST /session  { accessToken, refreshToken }
//  Called by the OAuth callback page after extracting tokens from the URL hash.
//  Looks up or provisions the user in our users table, returns full session.
// ---------------------------------------------------------------------------
ssoRoutes.post("/session", async (c) => {
  const body = await c.req.json();
  const { accessToken, refreshToken } = body as {
    accessToken: string;
    refreshToken: string;
  };

  if (!accessToken) {
    throw new ApiError(
      "AUTH_SSO_MISSING_TOKEN",
      "accessToken is required",
      400,
    );
  }

  const supabase = getSupabase();

  // Verify the access token with Supabase
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    throw new ApiError("AUTH_INVALID_TOKEN", "Invalid or expired token", 401);
  }

  const email = user.email!;
  const oauthProvider = (user.app_metadata?.["provider"] as string) ?? "oauth";
  const displayName =
    (user.user_metadata?.["full_name"] as string) ||
    (user.user_metadata?.["name"] as string) ||
    (user.user_metadata?.["user_name"] as string) ||
    email.split("@")[0]!;

  // Check if user already exists in our users table
  let { data: existingUser } = await supabase
    .from("users")
    .select("id, tenant_id, email")
    .eq("id", user.id)
    .maybeSingle();

  let tenantId: string;
  let role: string;

  if (existingUser) {
    // Returning SSO user — load tenant + role
    tenantId = existingUser.tenant_id;
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    role = roleRow?.role ?? "viewer";

    // Update last login
    await supabase
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);
  } else {
    // First SSO login — check if auto-provisioning is allowed
    const domain = email.split("@")[1] ?? "";

    const { data: ssoConfig } = await supabase
      .from("sso_configs")
      .select("tenant_id, auto_provision, default_role, allowed_domains")
      .eq("provider", oauthProvider)
      .eq("enabled", true)
      .maybeSingle();

    if (ssoConfig) {
      // Domain-restricted config — verify domain
      const allowedDomains = ssoConfig.allowed_domains as string[];
      if (allowedDomains.length > 0 && !allowedDomains.includes(domain)) {
        throw new ApiError(
          "AUTH_SSO_DOMAIN_NOT_ALLOWED",
          `Your email domain @${domain} is not authorized for SSO`,
          403,
        );
      }

      if (!ssoConfig.auto_provision) {
        throw new ApiError(
          "AUTH_SSO_PROVISIONING_DISABLED",
          "Auto-provisioning is disabled. Ask your admin to invite you manually.",
          403,
        );
      }

      tenantId = ssoConfig.tenant_id;
      role = ssoConfig.default_role;
    } else {
      // No SSO config found — create a new personal tenant
      const slug = displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40);

      const { data: tenant, error: tenantErr } = await supabase
        .from("tenants")
        .insert({
          name: `${displayName}'s Team`,
          slug: `${slug}-${Date.now().toString(36)}`,
          plan: "free",
          settings: {
            default_retention_days: 7,
            default_recording_mode: "motion",
            default_motion_sensitivity: 5,
            timezone: "UTC",
            notification_preferences: {
              email_digest: "none",
              push_enabled: true,
            },
          },
          branding: {},
          max_cameras: 4,
          max_users: 2,
          retention_days: 7,
        })
        .select()
        .single();

      if (tenantErr || !tenant) {
        throw new ApiError("INTERNAL_ERROR", "Failed to create tenant", 500);
      }

      tenantId = tenant.id;
      role = "owner";
    }

    // Create the user record
    await supabase.from("users").insert({
      id: user.id,
      tenant_id: tenantId,
      email,
      display_name: displayName,
      auth_provider: oauthProvider,
      preferences: {},
      last_login_at: new Date().toISOString(),
    });

    // Assign role
    await supabase.from("user_roles").insert({
      user_id: user.id,
      tenant_id: tenantId,
      role,
    });

    // Stamp tenant_id + role into Supabase user metadata so our JWT middleware can read it
    await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        display_name: displayName,
        tenant_id: tenantId,
        role,
      },
    });

    logger.info("SSO user provisioned", {
      userId: user.id,
      tenantId,
      provider: oauthProvider,
    });
  }

  // Fetch tenant info
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug, plan")
    .eq("id", tenantId)
    .single();

  // Calculate token expiry from the JWT exp claim
  const tokenPayload = JSON.parse(
    Buffer.from(accessToken.split(".")[1]!, "base64url").toString(),
  ) as { exp: number };
  const expiresAt = new Date(tokenPayload.exp * 1000).toISOString();

  return c.json(
    createSuccessResponse({
      user: {
        id: user.id,
        email,
        displayName,
        role,
        authProvider: oauthProvider,
      },
      tenant: tenant ?? { id: tenantId, name: "", slug: "", plan: "free" },
      accessToken,
      refreshToken,
      expiresAt,
    }),
  );
});

// ---------------------------------------------------------------------------
//  GET /config — list this tenant's SSO provider configs (admin/owner only)
// ---------------------------------------------------------------------------
ssoRoutes.get("/config", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sso_configs")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("provider");

  if (error)
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch SSO configs", 500);

  return c.json(createSuccessResponse(data ?? []));
});

// ---------------------------------------------------------------------------
//  PUT /config/:provider — upsert provider config (admin/owner only)
// ---------------------------------------------------------------------------
ssoRoutes.put("/config/:provider", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const provider = c.req.param("provider") as SsoProvider;
  if (!["google", "azure", "github"].includes(provider)) {
    throw new ApiError("AUTH_SSO_INVALID_PROVIDER", "Invalid provider", 400);
  }

  const body = (await c.req.json()) as {
    enabled?: boolean;
    allowed_domains?: string[];
    auto_provision?: boolean;
    default_role?: string;
  };

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("sso_configs")
    .upsert(
      {
        tenant_id: tenantId,
        provider,
        enabled: body.enabled ?? true,
        allowed_domains: body.allowed_domains ?? [],
        auto_provision: body.auto_provision ?? true,
        default_role: body.default_role ?? "viewer",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,provider" },
    )
    .select()
    .single();

  if (error)
    throw new ApiError("INTERNAL_ERROR", "Failed to save SSO config", 500);

  logger.info("SSO config updated", { tenantId, provider });
  return c.json(createSuccessResponse(data));
});

// ---------------------------------------------------------------------------
//  DELETE /config/:provider — disable / remove provider (admin/owner only)
// ---------------------------------------------------------------------------
ssoRoutes.delete("/config/:provider", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const provider = c.req.param("provider");
  const supabase = getSupabase();

  await supabase
    .from("sso_configs")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider", provider);

  return c.json(createSuccessResponse({ deleted: true }));
});
