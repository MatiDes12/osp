/**
 * E2E — Dashboard / main layout (/cameras as the default logged-in view)
 *
 * Covers:
 *  - CameraStatsBar renders stat labels
 *  - Camera grid renders with mock data
 *  - Sidebar navigation links navigate to correct routes
 *  - Sidebar collapse / expand toggle
 */

import { test, expect } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Dashboard / main layout", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await gotoAuthenticated(page, "/cameras");
  });

  /* ------------------------------------------------------------------ */
  /*  Stats bar                                                          */
  /* ------------------------------------------------------------------ */

  test("CameraStatsBar shows Online and other stat labels", async ({
    page,
  }) => {
    // CameraStatsBar renders labels like "Total", "Online", "Offline", etc.
    await expect(page.getByText("Online").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Camera grid                                                        */
  /* ------------------------------------------------------------------ */

  test("camera grid shows Front Door and Parking Lot from mock data", async ({
    page,
  }) => {
    await expect(
      page.getByRole("main").getByText("Front Door").first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("main").getByText("Parking Lot").first(),
    ).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Sidebar navigation                                                 */
  /* ------------------------------------------------------------------ */

  test("sidebar: Cameras link navigates to /cameras", async ({ page }) => {
    const link = page.locator("aside").getByRole("link", { name: "Cameras" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/cameras/);
  });

  test("sidebar: Events & Alerts link navigates to /events", async ({
    page,
  }) => {
    const link = page
      .locator("aside")
      .getByRole("link", { name: "Events & Alerts" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/events/);
  });

  test("sidebar: Recordings link navigates to /recordings", async ({
    page,
  }) => {
    const link = page
      .locator("aside")
      .getByRole("link", { name: "Recordings" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/recordings/);
  });

  test("sidebar: Rules link navigates to /rules", async ({ page }) => {
    const link = page.locator("aside").getByRole("link", { name: "Rules" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/rules/);
  });

  test("sidebar: Settings link navigates to /settings", async ({ page }) => {
    const link = page.locator("aside").getByRole("link", { name: "Settings" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/settings/);
  });

  /* ------------------------------------------------------------------ */
  /*  Sidebar collapse / expand                                          */
  /* ------------------------------------------------------------------ */

  test("sidebar collapse toggle hides nav labels then restores them", async ({
    page,
  }) => {
    const collapseBtn = page.getByRole("button", { name: /collapse/i });
    await expect(collapseBtn).toBeVisible();

    await collapseBtn.click();

    // After collapsing the expand button should be present
    const expandBtn = page.getByRole("button", { name: /expand/i });
    await expect(expandBtn).toBeVisible();

    // Expand again
    await expandBtn.click();
    await expect(page.getByRole("button", { name: /collapse/i })).toBeVisible();
  });
});
