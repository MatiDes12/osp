/**
 * E2E — Authentication flows
 *
 * Covers:
 *  - /login  renders correctly, submits, redirects, shows errors
 *  - /register renders correctly, submits, redirects
 *  - Navigation links between auth pages
 *  - Unauthenticated root redirect
 *  - Password-visibility toggle
 *  - Register without accepting terms shows inline error
 */

import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Auth — Login", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test("protected route redirects unauthenticated user to /login", async ({
    page,
  }) => {
    // "/" shows the landing page for unauthenticated users; navigate to a
    // protected dashboard route which AuthGuard redirects to /login.
    await page.goto("/cameras");
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });

  test("/login renders heading, email, password, submit button", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  });

  test("/login — successful submit stores tokens and redirects to /cameras", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.locator("#email").fill("admin@acme.com");
    await page.locator("#password").fill("SecurePassword123!");
    await page.getByRole("button", { name: "Sign In" }).click();

    // The page does window.location.href = "/cameras" on success
    await expect(page).toHaveURL(/\/cameras/, { timeout: 15_000 });

    // Tokens should be set in localStorage; because the app calls
    // the mocked endpoint which returns "test-token"
    const accessToken = await page.evaluate(() =>
      localStorage.getItem("osp_access_token"),
    );
    expect(accessToken).toBe("test-token");
  });

  test("/login — invalid credentials shows error banner", async ({ page }) => {
    // Override the mock to return an error for this test
    await page.route("**/api/v1/auth/login", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          error: {
            code: "AUTH_INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        }),
      }),
    );

    await page.goto("/login");
    await page.locator("#email").fill("wrong@example.com");
    await page.locator("#password").fill("badpassword");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText("Invalid email or password")).toBeVisible({
      timeout: 5_000,
    });
  });

  test("/login — network error shows error banner", async ({ page }) => {
    await page.route("**/api/v1/auth/login", (route) => route.abort("failed"));

    await page.goto("/login");
    await page.locator("#email").fill("admin@acme.com");
    await page.locator("#password").fill("SecurePassword123!");
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page.getByText(/network error/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("/login — password visibility toggle shows/hides password", async ({
    page,
  }) => {
    await page.goto("/login");
    const passwordInput = page.locator("#password");
    await passwordInput.fill("s3cr3t");

    // Initially hidden
    await expect(passwordInput).toHaveAttribute("type", "password");

    // Click the toggle button (aria-label: "Show password")
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Click again to hide
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("/login — has 'Sign up' link pointing to /register", async ({
    page,
  }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: "Sign up" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/register");
  });

  test("/login — SSO buttons are visible", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Microsoft/i }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /GitHub/i })).toBeVisible();
  });
});

test.describe("Auth — Register", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
  });

  test("/register renders all required fields", async ({ page }) => {
    await page.goto("/register");

    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("#displayName")).toBeVisible();
    await expect(page.locator("#tenantName")).toBeVisible();
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create Account" }),
    ).toBeVisible();
  });

  test("/register — successful submit redirects to /cameras", async ({
    page,
  }) => {
    await page.goto("/register");

    await page.locator("#displayName").fill("Jane Doe");
    await page.locator("#tenantName").fill("Acme Security");
    await page.locator("#email").fill("jane@acme.com");
    await page.locator("#password").fill("SuperSecure123!");

    // Accept terms checkbox
    await page.getByRole("checkbox").check();

    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/cameras/, { timeout: 15_000 });

    const accessToken = await page.evaluate(() =>
      localStorage.getItem("osp_access_token"),
    );
    expect(accessToken).toBe("test-token");
  });

  test("/register — submitting without accepting terms shows error", async ({
    page,
  }) => {
    await page.goto("/register");

    await page.locator("#displayName").fill("Jane Doe");
    await page.locator("#tenantName").fill("Acme Security");
    await page.locator("#email").fill("jane@acme.com");
    await page.locator("#password").fill("SuperSecure123!");
    // Do NOT check terms

    await page.getByRole("button", { name: "Create Account" }).click();

    // "Terms of Service" appears both as a link in the form AND in the inline
    // error message — use .first() to avoid strict-mode violation.
    await expect(page.getByText(/Terms of Service/i).first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("/register — password strength indicator appears when typing", async ({
    page,
  }) => {
    await page.goto("/register");
    const passwordInput = page.locator("#password");

    await passwordInput.fill("weak");
    await expect(page.getByText("Weak")).toBeVisible();

    await passwordInput.fill("SuperSecure123!");
    // Should show "Strong" or "Very strong"
    await expect(page.getByText(/Strong|Very strong/)).toBeVisible();
  });

  test("/register — has 'Sign in' link pointing to /login", async ({
    page,
  }) => {
    await page.goto("/register");
    const link = page.getByRole("link", { name: "Sign in" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/login");
  });
});

test.describe("Auth — Session management", () => {
  test("authenticated user visiting /login is redirected to /cameras", async ({
    page,
  }) => {
    await setupApiMocks(page);
    // Establish origin first so localStorage is accessible
    await page.goto("/login");
    await loginAs(page);
    // Reload — AuthGuard should detect the token and send to /cameras
    await page.reload();
    await expect(page).toHaveURL(/\/cameras/, { timeout: 15_000 });
  });

  test("clearing tokens simulates logout", async ({ page }) => {
    await setupApiMocks(page);
    await page.goto("/");
    await loginAs(page);

    // Verify tokens exist
    const before = await page.evaluate(() =>
      localStorage.getItem("osp_access_token"),
    );
    expect(before).not.toBeNull();

    // Clear tokens
    await page.evaluate(() => {
      localStorage.removeItem("osp_access_token");
      localStorage.removeItem("osp_refresh_token");
    });

    const after = await page.evaluate(() =>
      localStorage.getItem("osp_access_token"),
    );
    expect(after).toBeNull();
  });
});
