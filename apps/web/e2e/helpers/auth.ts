import type { Page } from "@playwright/test";

/**
 * Simulate an authenticated session by injecting tokens into localStorage.
 * Must be called after `page.goto()` so the page origin is set.
 */
export async function loginAs(page: Page): Promise<void> {
  await page.evaluate(() => {
    const base64Url = (obj: unknown) => {
      const json = JSON.stringify(obj);
      // btoa produces base64; convert to base64url for JWT compatibility
      return btoa(json).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    };

    const header = { alg: "none", typ: "JWT" };
    const payload = {
      sub: "user-1",
      email: "admin@acme.com",
      tenant_id: "t-1",
      role: "owner",
      display_name: "Admin User",
      // 24h from now
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    };

    // Unsigned JWT is fine for client-side expiration checks in tests
    const token = `${base64Url(header)}.${base64Url(payload)}.`;

    localStorage.setItem("osp_access_token", token);
    localStorage.setItem("osp_refresh_token", "test-refresh");
  });
}
