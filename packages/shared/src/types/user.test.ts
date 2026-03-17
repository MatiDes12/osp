import { describe, it, expect } from "vitest";
import { hasRole, ROLE_HIERARCHY, type UserRole } from "./user.js";

describe("hasRole", () => {
  const allRoles: UserRole[] = ["owner", "admin", "operator", "viewer"];

  describe("owner", () => {
    it("has owner role", () => {
      expect(hasRole("owner", "owner")).toBe(true);
    });

    it("has admin role", () => {
      expect(hasRole("owner", "admin")).toBe(true);
    });

    it("has operator role", () => {
      expect(hasRole("owner", "operator")).toBe(true);
    });

    it("has viewer role", () => {
      expect(hasRole("owner", "viewer")).toBe(true);
    });
  });

  describe("admin", () => {
    it("does NOT have owner role", () => {
      expect(hasRole("admin", "owner")).toBe(false);
    });

    it("has admin role", () => {
      expect(hasRole("admin", "admin")).toBe(true);
    });

    it("has operator role", () => {
      expect(hasRole("admin", "operator")).toBe(true);
    });

    it("has viewer role", () => {
      expect(hasRole("admin", "viewer")).toBe(true);
    });
  });

  describe("operator", () => {
    it("does NOT have owner role", () => {
      expect(hasRole("operator", "owner")).toBe(false);
    });

    it("does NOT have admin role", () => {
      expect(hasRole("operator", "admin")).toBe(false);
    });

    it("has operator role", () => {
      expect(hasRole("operator", "operator")).toBe(true);
    });

    it("has viewer role", () => {
      expect(hasRole("operator", "viewer")).toBe(true);
    });
  });

  describe("viewer", () => {
    it("does NOT have owner role", () => {
      expect(hasRole("viewer", "owner")).toBe(false);
    });

    it("does NOT have admin role", () => {
      expect(hasRole("viewer", "admin")).toBe(false);
    });

    it("does NOT have operator role", () => {
      expect(hasRole("viewer", "operator")).toBe(false);
    });

    it("has viewer role", () => {
      expect(hasRole("viewer", "viewer")).toBe(true);
    });
  });

  describe("all role combinations exhaustive", () => {
    const expectedMatrix: Record<UserRole, Record<UserRole, boolean>> = {
      owner: { owner: true, admin: true, operator: true, viewer: true },
      admin: { owner: false, admin: true, operator: true, viewer: true },
      operator: { owner: false, admin: false, operator: true, viewer: true },
      viewer: { owner: false, admin: false, operator: false, viewer: true },
    };

    for (const userRole of allRoles) {
      for (const requiredRole of allRoles) {
        it(`${userRole} ${expectedMatrix[userRole][requiredRole] ? "has" : "lacks"} ${requiredRole}`, () => {
          expect(hasRole(userRole, requiredRole)).toBe(
            expectedMatrix[userRole][requiredRole],
          );
        });
      }
    }
  });

  describe("ROLE_HIERARCHY", () => {
    it("owner has the highest rank", () => {
      expect(ROLE_HIERARCHY.owner).toBeGreaterThan(ROLE_HIERARCHY.admin);
    });

    it("admin outranks operator", () => {
      expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.operator);
    });

    it("operator outranks viewer", () => {
      expect(ROLE_HIERARCHY.operator).toBeGreaterThan(ROLE_HIERARCHY.viewer);
    });

    it("viewer has the lowest rank", () => {
      const ranks = Object.values(ROLE_HIERARCHY);
      expect(ROLE_HIERARCHY.viewer).toBe(Math.min(...ranks));
    });
  });
});
