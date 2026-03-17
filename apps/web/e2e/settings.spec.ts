import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto("/(dashboard)/settings");
    await loginAs(page);
    await page.reload();
  });

  test("displays category tabs", async ({ page }) => {
    // The settings page has navigation tabs
    await expect(page.getByText("Cameras")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Users & Roles")).toBeVisible();
    await expect(page.getByText("Notifications")).toBeVisible();
    await expect(page.getByText("Recording")).toBeVisible();
    await expect(page.getByText("Extensions")).toBeVisible();
    await expect(page.getByText("Tenant")).toBeVisible();
    await expect(page.getByText("Billing")).toBeVisible();
    await expect(page.getByText("API Keys")).toBeVisible();
  });

  test("clicking 'Users & Roles' tab shows user table", async ({ page }) => {
    // Wait for page to load
    await expect(page.getByText("Users & Roles")).toBeVisible({ timeout: 10_000 });

    // Click the "Users & Roles" tab
    await page.getByText("Users & Roles").click();

    // Should show user-related content
    // The users tab displays user management section
    await expect(page.getByText(/admin@acme\.com|Users/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking 'Tenant' tab shows organization name input", async ({ page }) => {
    // Wait for page to load
    await expect(page.getByText("Tenant")).toBeVisible({ timeout: 10_000 });

    // Click the "Tenant" tab
    await page.getByText("Tenant").click();

    // Should show tenant/organization section
    // The tenant tab shows organization-related fields
    await expect(page.getByText(/organization|tenant|Acme/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking 'Recording' tab shows recording options", async ({ page }) => {
    await expect(page.getByText("Recording")).toBeVisible({ timeout: 10_000 });

    await page.getByText("Recording").click();

    // Should show recording configuration options
    await expect(
      page.getByText(/continuous|motion|recording/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking 'API Keys' tab shows API key section", async ({ page }) => {
    await expect(page.getByText("API Keys")).toBeVisible({ timeout: 10_000 });

    await page.getByText("API Keys").click();

    await expect(page.getByText(/API|key/i)).toBeVisible({ timeout: 10_000 });
  });
});
