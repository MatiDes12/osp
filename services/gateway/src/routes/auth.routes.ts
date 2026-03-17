import { Hono } from "hono";
import type { Env } from "../app.js";
import { getSupabase } from "../lib/supabase.js";
import { ApiError } from "../middleware/error-handler.js";
import { RegisterSchema, LoginSchema, RefreshTokenSchema } from "@osp/shared";
import { createSuccessResponse } from "@osp/shared";

export const authRoutes = new Hono<Env>();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json();
  const input = RegisterSchema.parse(body);
  const supabase = getSupabase();

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      display_name: input.displayName,
    },
  });

  if (authError) {
    if (authError.message.includes("already")) {
      throw new ApiError("AUTH_EMAIL_TAKEN", "Email already registered", 409);
    }
    throw new ApiError("INTERNAL_ERROR", "Failed to create account", 500);
  }

  const userId = authData.user.id;

  // Create tenant
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      name: input.tenantName,
      slug: input.tenantName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
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

  if (tenantError) {
    throw new ApiError("INTERNAL_ERROR", "Failed to create tenant", 500);
  }

  // Create user record
  await supabase.from("users").insert({
    id: userId,
    tenant_id: tenant.id,
    email: input.email,
    display_name: input.displayName,
    auth_provider: "email",
    preferences: {},
  });

  // Create owner role
  await supabase.from("user_roles").insert({
    user_id: userId,
    tenant_id: tenant.id,
    role: "owner",
  });

  // Update user metadata with tenant context
  await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      display_name: input.displayName,
      tenant_id: tenant.id,
      role: "owner",
    },
  });

  // Sign in to get tokens
  const { data: session, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

  if (signInError || !session.session) {
    throw new ApiError("INTERNAL_ERROR", "Account created but login failed", 500);
  }

  return c.json(
    createSuccessResponse({
      user: {
        id: userId,
        email: input.email,
        displayName: input.displayName,
        role: "owner" as const,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
      },
      accessToken: session.session.access_token,
      refreshToken: session.session.refresh_token,
      expiresAt: new Date(
        Date.now() + (session.session.expires_in ?? 900) * 1000,
      ).toISOString(),
    }),
    201,
  );
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const input = LoginSchema.parse(body);
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error) {
    throw new ApiError(
      "AUTH_CREDENTIALS_INVALID",
      "Invalid email or password",
      401,
    );
  }

  const user = data.user;
  const tenantId = user.user_metadata?.["tenant_id"] as string;
  const role = user.user_metadata?.["role"] as string;

  // Fetch tenant info
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, name, slug, plan")
    .eq("id", tenantId)
    .single();

  return c.json(
    createSuccessResponse({
      user: {
        id: user.id,
        email: user.email!,
        displayName:
          (user.user_metadata?.["display_name"] as string) ?? user.email!,
        role,
      },
      tenant: tenant ?? { id: tenantId, name: "", slug: "", plan: "free" },
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: new Date(
        Date.now() + (data.session.expires_in ?? 900) * 1000,
      ).toISOString(),
    }),
  );
});

authRoutes.post("/refresh", async (c) => {
  const body = await c.req.json();
  const input = RefreshTokenSchema.parse(body);
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: input.refreshToken,
  });

  if (error || !data.session) {
    throw new ApiError("AUTH_REFRESH_INVALID", "Invalid refresh token", 401);
  }

  return c.json(
    createSuccessResponse({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: new Date(
        Date.now() + (data.session.expires_in ?? 900) * 1000,
      ).toISOString(),
    }),
  );
});

authRoutes.post("/logout", async (c) => {
  const supabase = getSupabase();
  await supabase.auth.signOut();
  return c.json(createSuccessResponse({ message: "Logged out" }));
});
