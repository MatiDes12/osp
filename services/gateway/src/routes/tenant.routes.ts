import { Hono } from "hono";
import type { Env } from "../app.js";
import { requireAuth } from "../middleware/auth.js";
import { ApiError } from "../middleware/error-handler.js";
import { getSupabase } from "../lib/supabase.js";
import { InviteUserSchema } from "@osp/shared";
import { createSuccessResponse } from "@osp/shared";
import { sendEmail } from "../lib/email.js";
import { inviteEmailTemplate } from "../lib/email-templates.js";
import { createLogger } from "../lib/logger.js";
import { z } from "zod";

const logger = createLogger("tenant-routes");

const UpdateTenantSettingsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  settings: z
    .object({
      defaultRetentionDays: z.number().int().min(1).max(365).optional(),
      defaultRecordingMode: z.enum(["motion", "continuous", "off"]).optional(),
      defaultMotionSensitivity: z.number().int().min(1).max(10).optional(),
      timezone: z.string().min(1).optional(),
      notificationPreferences: z
        .object({
          emailDigest: z.enum(["none", "daily", "weekly"]).optional(),
          pushEnabled: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

const UpdateBrandingSchema = z.object({
  primaryColor: z.string().max(20).optional(),
  accentColor: z.string().max(20).optional(),
  fontFamily: z.string().max(100).nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
});

const ChangeRoleSchema = z.object({
  role: z.enum(["admin", "operator", "viewer"]),
});

export const tenantRoutes = new Hono<Env>();

// Get current tenant
tenantRoutes.get("/current", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) {
    throw new ApiError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  return c.json(createSuccessResponse(tenant));
});

// Update tenant settings (owner only)
tenantRoutes.patch("/current", requireAuth("owner"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const input = UpdateTenantSettingsSchema.parse(body);
  const supabase = getSupabase();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates["name"] = input.name;
  if (input.settings !== undefined) {
    // Merge with existing settings
    const { data: current } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single();

    const existingSettings = (current?.settings as Record<string, unknown>) ?? {};
    const newSettings = { ...existingSettings };

    if (input.settings.defaultRetentionDays !== undefined)
      newSettings["default_retention_days"] = input.settings.defaultRetentionDays;
    if (input.settings.defaultRecordingMode !== undefined)
      newSettings["default_recording_mode"] = input.settings.defaultRecordingMode;
    if (input.settings.defaultMotionSensitivity !== undefined)
      newSettings["default_motion_sensitivity"] = input.settings.defaultMotionSensitivity;
    if (input.settings.timezone !== undefined)
      newSettings["timezone"] = input.settings.timezone;
    if (input.settings.notificationPreferences !== undefined) {
      const existingNotif = (existingSettings["notification_preferences"] as Record<string, unknown>) ?? {};
      newSettings["notification_preferences"] = {
        ...existingNotif,
        ...input.settings.notificationPreferences,
      };
    }

    updates["settings"] = newSettings;
  }
  updates["updated_at"] = new Date().toISOString();

  const { data: tenant, error } = await supabase
    .from("tenants")
    .update(updates)
    .eq("id", tenantId)
    .select()
    .single();

  if (error || !tenant) {
    throw new ApiError("INTERNAL_ERROR", "Failed to update tenant", 500);
  }

  return c.json(createSuccessResponse(tenant));
});

// Update branding (owner only)
tenantRoutes.patch("/current/branding", requireAuth("owner"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const input = UpdateBrandingSchema.parse(body);
  const supabase = getSupabase();

  const { data: current } = await supabase
    .from("tenants")
    .select("branding")
    .eq("id", tenantId)
    .single();

  const existingBranding = (current?.branding as Record<string, unknown>) ?? {};
  const branding = { ...existingBranding };

  if (input.primaryColor !== undefined) branding["primary_color"] = input.primaryColor;
  if (input.accentColor !== undefined) branding["accent_color"] = input.accentColor;
  if (input.fontFamily !== undefined) branding["font_family"] = input.fontFamily;
  if (input.faviconUrl !== undefined) branding["favicon_url"] = input.faviconUrl;

  const updates: Record<string, unknown> = {
    branding,
    updated_at: new Date().toISOString(),
  };

  if (input.logoUrl !== undefined) {
    updates["logo_url"] = input.logoUrl;
  }

  const { data: tenant, error } = await supabase
    .from("tenants")
    .update(updates)
    .eq("id", tenantId)
    .select()
    .single();

  if (error || !tenant) {
    throw new ApiError("INTERNAL_ERROR", "Failed to update branding", 500);
  }

  return c.json(createSuccessResponse(tenant));
});

// List tenant users with roles
tenantRoutes.get("/current/users", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data: users, error } = await supabase
    .from("users")
    .select("id, email, display_name, avatar_url, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch users", 500);
  }

  // Fetch roles for all users
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("tenant_id", tenantId);

  if (rolesError) {
    throw new ApiError("INTERNAL_ERROR", "Failed to fetch user roles", 500);
  }

  const roleMap = new Map<string, string>();
  for (const r of roles ?? []) {
    roleMap.set(r.user_id as string, r.role as string);
  }

  const usersWithRoles = (users ?? []).map((u) => ({
    ...u,
    role: roleMap.get(u.id as string) ?? "viewer",
  }));

  return c.json(createSuccessResponse(usersWithRoles));
});

// Invite user
tenantRoutes.post("/current/users/invite", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const body = await c.req.json();
  const input = InviteUserSchema.parse(body);
  const supabase = getSupabase();

  // Check user limit
  const { count: userCount } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  const { data: tenant } = await supabase
    .from("tenants")
    .select("max_users")
    .eq("id", tenantId)
    .single();

  if (tenant && (userCount ?? 0) >= (tenant.max_users as number)) {
    throw new ApiError("USER_LIMIT_REACHED", "User limit reached for your plan", 403);
  }

  // Check if user already exists in this tenant
  const { data: existingUser } = await supabase
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("email", input.email)
    .single();

  if (existingUser) {
    throw new ApiError("USER_ALREADY_EXISTS", "User with this email already belongs to this tenant", 409);
  }

  // Create invitation record
  const { data: invitation, error } = await supabase
    .from("invitations")
    .insert({
      tenant_id: tenantId,
      email: input.email,
      role: input.role,
      camera_ids: input.cameraIds ?? [],
      message: input.message ?? null,
      invited_by: c.get("userId"),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to create invitation", 500);
  }

  // Send invitation email
  try {
    const inviterId = c.get("userId");
    const { data: inviter } = await supabase
      .from("users")
      .select("display_name, email")
      .eq("id", inviterId)
      .single();

    const { data: tenantData } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single();

    const inviterName =
      (inviter?.display_name as string) ??
      (inviter?.email as string) ??
      "A team member";
    const tenantName = (tenantData?.name as string) ?? "your organization";

    const webUrl = process.env["WEB_URL"] ?? "http://localhost:3001";
    const inviteUrl = `${webUrl}/invite/${invitation?.id as string}`;

    const html = inviteEmailTemplate({
      inviterName,
      tenantName,
      inviteUrl,
      role: input.role,
      message: input.message,
    });

    await sendEmail({
      to: [input.email],
      subject: `You've been invited to ${tenantName} on OSP`,
      html,
    });
  } catch (emailErr) {
    // Don't fail the invite if the email fails to send.
    logger.error("Failed to send invitation email", {
      error: emailErr instanceof Error ? emailErr : new Error(String(emailErr)),
      invitationId: String(invitation?.id),
    });
  }

  return c.json(createSuccessResponse(invitation), 201);
});

// Change user role (owner only)
tenantRoutes.patch("/current/users/:userId/role", requireAuth("owner"), async (c) => {
  const tenantId = c.get("tenantId");
  const targetUserId = c.req.param("userId");
  const body = await c.req.json();
  const input = ChangeRoleSchema.parse(body);
  const supabase = getSupabase();

  // Verify target user belongs to this tenant
  const { data: targetUser } = await supabase
    .from("users")
    .select("id")
    .eq("id", targetUserId)
    .eq("tenant_id", tenantId)
    .single();

  if (!targetUser) {
    throw new ApiError("USER_NOT_FOUND", "User not found in this tenant", 404);
  }

  // Prevent changing owner role
  const { data: currentRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .eq("tenant_id", tenantId)
    .single();

  if (currentRole && (currentRole.role as string) === "owner") {
    throw new ApiError("FORBIDDEN", "Cannot change the owner's role", 403);
  }

  const { data: updatedRole, error } = await supabase
    .from("user_roles")
    .update({ role: input.role })
    .eq("user_id", targetUserId)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error || !updatedRole) {
    throw new ApiError("INTERNAL_ERROR", "Failed to update user role", 500);
  }

  // Update auth metadata
  await supabase.auth.admin.updateUserById(targetUserId, {
    user_metadata: { role: input.role },
  });

  return c.json(createSuccessResponse(updatedRole));
});

// Remove user (admin+, cannot remove owner)
tenantRoutes.delete("/current/users/:userId", requireAuth("admin"), async (c) => {
  const tenantId = c.get("tenantId");
  const targetUserId = c.req.param("userId");
  const supabase = getSupabase();

  // Check target user's role
  const { data: targetRole } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUserId)
    .eq("tenant_id", tenantId)
    .single();

  if (!targetRole) {
    throw new ApiError("USER_NOT_FOUND", "User not found in this tenant", 404);
  }

  if ((targetRole.role as string) === "owner") {
    throw new ApiError("FORBIDDEN", "Cannot remove the tenant owner", 403);
  }

  // Remove role
  await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", targetUserId)
    .eq("tenant_id", tenantId);

  // Remove user from tenant
  await supabase
    .from("users")
    .delete()
    .eq("id", targetUserId)
    .eq("tenant_id", tenantId);

  return c.json(createSuccessResponse({ deleted: true }));
});

// Get tenant usage stats
tenantRoutes.get("/current/usage", requireAuth("viewer"), async (c) => {
  const tenantId = c.get("tenantId");
  const supabase = getSupabase();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("plan, max_cameras, max_users")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    throw new ApiError("TENANT_NOT_FOUND", "Tenant not found", 404);
  }

  const [camerasResult, usersResult, recordingsResult] = await Promise.all([
    supabase
      .from("cameras")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId),
    supabase
      .from("recordings")
      .select("id, duration_sec, file_size_bytes")
      .eq("tenant_id", tenantId),
  ]);

  const recordings = recordingsResult.data ?? [];
  const totalDurationSec = recordings.reduce(
    (sum, r) => sum + ((r.duration_sec as number) ?? 0),
    0,
  );
  const totalStorageBytes = recordings.reduce(
    (sum, r) => sum + ((r.file_size_bytes as number) ?? 0),
    0,
  );

  // Installed extensions count
  const { count: extensionCount } = await supabase
    .from("tenant_extensions")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  return c.json(
    createSuccessResponse({
      plan: tenant.plan as string,
      cameras: {
        used: camerasResult.count ?? 0,
        limit: tenant.max_cameras as number,
      },
      users: {
        used: usersResult.count ?? 0,
        limit: tenant.max_users as number,
      },
      storage: {
        usedBytes: totalStorageBytes,
        limitBytes: 0, // determined by plan, fetched from config
      },
      extensions: {
        used: extensionCount ?? 0,
        limit: 0, // determined by plan
      },
      recordings: {
        totalCount: recordings.length,
        totalDurationHours: Math.round((totalDurationSec / 3600) * 100) / 100,
      },
    }),
  );
});
