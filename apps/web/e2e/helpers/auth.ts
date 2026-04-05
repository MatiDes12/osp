import type { Page } from "@playwright/test";

/**
 * Simulate an authenticated session by injecting a valid-looking JWT into
 * localStorage. Must be called after `page.goto()` so the page origin is set.
 *
 * The token encodes the same shape that AuthGuard reads:
 *   { sub, email, tenant_id, role, display_name, exp }
 */
export async function loginAs(page: Page): Promise<void> {
  await page.evaluate(() => {
    const base64url = (obj: unknown) => {
      const json = JSON.stringify(obj);
      // btoa → base64; then convert to base64url
      return btoa(json)
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
    };

    const header = { alg: "none", typ: "JWT" };
    const payload = {
      sub: "user-1",
      email: "admin@acme.com",
      tenant_id: "t-1",
      role: "owner",
      display_name: "Admin User",
      // 24 h from now
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    };

    // Unsigned JWT — fine for client-side expiration checks in tests
    const token = `${base64url(header)}.${base64url(payload)}.`;

    localStorage.setItem("osp_access_token", token);
    localStorage.setItem("osp_refresh_token", "test-refresh");
  });
}

/**
 * Navigate to a page as an authenticated user.
 * Sets up the origin, injects tokens, then navigates to the target path.
 */
export async function gotoAuthenticated(
  page: Page,
  path: string,
): Promise<void> {
  // Establish the origin first so localStorage is available
  await page.goto("/");
  await loginAs(page);
  await page.goto(path);
  // Wait for AuthGuard to finish the auth check and render protected content.
  // The spinner disappears once status transitions from "loading" to "authenticated".
  await page.waitForLoadState("networkidle");
}
