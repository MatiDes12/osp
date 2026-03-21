import { z } from "zod";

const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .refine(
    (p) => /[A-Z]/.test(p),
    "Password must contain at least one uppercase letter",
  )
  .refine(
    (p) => /[a-z]/.test(p),
    "Password must contain at least one lowercase letter",
  )
  .refine((p) => /[0-9]/.test(p), "Password must contain at least one number")
  .refine(
    (p) => /[^A-Za-z0-9]/.test(p),
    "Password must contain at least one special character",
  );

export const RegisterSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: strongPassword,
  displayName: z.string().min(1).max(100).trim(),
  tenantName: z.string().min(1).max(100).trim(),
});

export const LoginSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  password: z.string().min(1).max(128),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: strongPassword,
});

export const InviteUserSchema = z.object({
  email: z.string().email().max(255),
  role: z.enum(["admin", "operator", "viewer"]),
  cameraIds: z.array(z.string().uuid()).optional(),
  message: z.string().max(500).optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
