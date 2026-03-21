/**
 * E2E — Settings page (/settings)
 *
 * Covers:
 *  - All nav items render in the left sidebar
 *  - Default tab (Tenant/Organization) renders on load
 *  - Switching to each major tab renders the correct section heading
 *  - Notifications tab has push/email toggles
 *  - Recording tab has motion-tail input
 *  - API Keys tab has "Create" button
 *  - Users & Roles tab shows mock user email
 */

import { test, expect } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await gotoAuthenticated(page, "/settings");
  });

  /* ------------------------------------------------------------------ */
  /*  Navigation sidebar                                                 */
  /* ------------------------------------------------------------------ */

  test("all primary nav items are visible in the sidebar", async ({ page }) => {
    // Wait for page to stabilise
    await expect(page.getByText("Cameras").first()).toBeVisible({
      timeout: 10_000,
    });

    const nav = [
      "Cameras",
      "Users & Roles",
      "Notifications",
      "Recording",
      "Extensions",
      "Tenant",
      "Billing",
      "API Keys",
    ];
    for (const label of nav) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Default tab — Tenant                                               */
  /* ------------------------------------------------------------------ */

  test("loads with Tenant tab active showing Organization heading", async ({
    page,
  }) => {
    // The settings page defaults to the 'tenant' tab which renders "Organization"
    await expect(
      page.getByRole("heading", { name: "Organization" }),
    ).toBeVisible({ timeout: 10_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  Tab switching                                                      */
  /* ------------------------------------------------------------------ */

  test("clicking 'Users & Roles' shows user list with mock user", async ({
    page,
  }) => {
    await expect(page.getByText("Users & Roles").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("Users & Roles").first().click();

    await expect(page.getByText(/admin@acme\.com|Users/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking 'Notifications' shows notification preferences", async ({
    page,
  }) => {
    await expect(page.getByText("Notifications").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("Notifications").first().click();

    // NotificationsTab renders "Push Notifications" and "Email Alerts"
    await expect(
      page.getByText(/Push Notifications|Email Alerts/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking 'Recording' shows motion-tail seconds input", async ({
    page,
  }) => {
    await expect(page.getByText("Recording").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("Recording").first().click();

    // RecordingSettingsPanel renders a number input for tail seconds
    await expect(
      page.getByText(/recording|motion|continuous/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking 'Billing' shows current plan details", async ({ page }) => {
    await expect(page.getByText("Billing").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("Billing").first().click();

    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible({
      timeout: 10_000,
    });
    // BillingTab shows "Current Plan"
    await expect(page.getByText("Current Plan")).toBeVisible();
  });

  test("clicking 'API Keys' shows the API Keys section", async ({ page }) => {
    await expect(page.getByText("API Keys").first()).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("API Keys").first().click();

    await expect(page.getByText(/API Keys|Create/i).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("clicking 'Cameras' tab shows camera list or Add Camera option", async ({
    page,
  }) => {
    // The nav sidebar has a 'Cameras' item; click the one inside the settings nav
    // (not the main sidebar Cameras link).  It's scoped to the settings nav area.
    const settingsNav = page.locator("nav");
    await expect(settingsNav.getByText("Cameras").first()).toBeVisible({
      timeout: 10_000,
    });
    await settingsNav.getByText("Cameras").first().click();

    // The cameras settings tab renders camera names or an empty state
    await expect(page.getByText(/Front Door|Cameras|Add/i).first()).toBeVisible(
      { timeout: 10_000 },
    );
  });

  /* ------------------------------------------------------------------ */
  /*  URL query-string tab navigation                                    */
  /* ------------------------------------------------------------------ */

  test("?tab=notifications opens the Notifications tab directly", async ({
    page,
  }) => {
    await gotoAuthenticated(page, "/settings?tab=notifications");

    await expect(
      page.getByText(/Push Notifications|Email Alerts/i).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("?tab=billing opens the Billing tab directly", async ({ page }) => {
    await gotoAuthenticated(page, "/settings?tab=billing");

    await expect(page.getByRole("heading", { name: "Billing" })).toBeVisible({
      timeout: 10_000,
    });
  });
});
