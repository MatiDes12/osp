import { describe, it, expect } from "vitest";
import {
  RegisterSchema,
  LoginSchema,
  InviteUserSchema,
} from "./auth.schema.js";

describe("RegisterSchema", () => {
  const validInput = {
    email: "user@example.com",
    password: "secureP@ss1",
    displayName: "John Doe",
    tenantName: "My Company",
  };

  it("accepts valid input", () => {
    const result = RegisterSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects short password (< 8 chars)", () => {
    const result = RegisterSchema.safeParse({
      ...validInput,
      password: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects password exceeding 128 chars", () => {
    const result = RegisterSchema.safeParse({
      ...validInput,
      password: "a".repeat(129),
    });
    expect(result.success).toBe(false);
  });

  it("accepts password of exactly 8 chars", () => {
    const result = RegisterSchema.safeParse({
      ...validInput,
      password: "12345678",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = RegisterSchema.safeParse({
      ...validInput,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects email exceeding 255 chars", () => {
    const result = RegisterSchema.safeParse({
      ...validInput,
      email: "a".repeat(250) + "@b.com",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing displayName", () => {
    const { displayName: _, ...noName } = validInput;
    const result = RegisterSchema.safeParse(noName);
    expect(result.success).toBe(false);
  });

  it("rejects empty displayName", () => {
    const result = RegisterSchema.safeParse({
      ...validInput,
      displayName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing tenantName", () => {
    const { tenantName: _, ...noTenant } = validInput;
    const result = RegisterSchema.safeParse(noTenant);
    expect(result.success).toBe(false);
  });

  it("rejects empty tenantName", () => {
    const result = RegisterSchema.safeParse({
      ...validInput,
      tenantName: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const { email: _, ...noEmail } = validInput;
    const result = RegisterSchema.safeParse(noEmail);
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const { password: _, ...noPw } = validInput;
    const result = RegisterSchema.safeParse(noPw);
    expect(result.success).toBe(false);
  });
});

describe("LoginSchema", () => {
  const validInput = {
    email: "user@example.com",
    password: "mypassword",
  };

  it("accepts valid input", () => {
    const result = LoginSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = LoginSchema.safeParse({ password: "mypassword" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = LoginSchema.safeParse({
      ...validInput,
      email: "bad",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const result = LoginSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = LoginSchema.safeParse({
      ...validInput,
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty object", () => {
    const result = LoginSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("InviteUserSchema", () => {
  const validInvite = {
    email: "newuser@example.com",
    role: "operator" as const,
  };

  it("accepts valid invite", () => {
    const result = InviteUserSchema.safeParse(validInvite);
    expect(result.success).toBe(true);
  });

  it("accepts admin role", () => {
    const result = InviteUserSchema.safeParse({
      ...validInvite,
      role: "admin",
    });
    expect(result.success).toBe(true);
  });

  it("accepts viewer role", () => {
    const result = InviteUserSchema.safeParse({
      ...validInvite,
      role: "viewer",
    });
    expect(result.success).toBe(true);
  });

  it("rejects owner role (not in enum)", () => {
    const result = InviteUserSchema.safeParse({
      ...validInvite,
      role: "owner",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = InviteUserSchema.safeParse({
      ...validInvite,
      role: "superadmin",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = InviteUserSchema.safeParse({ role: "admin" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = InviteUserSchema.safeParse({
      ...validInvite,
      email: "not-valid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing role", () => {
    const result = InviteUserSchema.safeParse({
      email: "user@example.com",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional cameraIds with valid UUIDs", () => {
    const result = InviteUserSchema.safeParse({
      ...validInvite,
      cameraIds: ["550e8400-e29b-41d4-a716-446655440000"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects cameraIds with non-UUID strings", () => {
    const result = InviteUserSchema.safeParse({
      ...validInvite,
      cameraIds: ["not-a-uuid"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional message", () => {
    const result = InviteUserSchema.safeParse({
      ...validInvite,
      message: "Welcome to the team!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects message exceeding 500 chars", () => {
    const result = InviteUserSchema.safeParse({
      ...validInvite,
      message: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});
