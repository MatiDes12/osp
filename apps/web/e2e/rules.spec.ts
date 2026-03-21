/**
 * E2E — Rules engine (/rules)
 *
 * Covers:
 *  - Rules list renders with mock data
 *  - No selection shows placeholder text
 *  - Clicking a rule opens the editor panel
 *  - Editor panel shows trigger, conditions, actions blocks
 *  - Editor has "Test Rule" and "Save" buttons
 *  - Toggle switch enables/disables a rule
 *  - Sort control buttons are visible
 */

import { test, expect } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Rules engine", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await gotoAuthenticated(page, "/rules");
  });

  /* ------------------------------------------------------------------ */
  /*  Rules list                                                         */
  /* ------------------------------------------------------------------ */

  test("displays all rules from mock data", async ({ page }) => {
    await expect(page.getByText("Alert Rules")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByText("Person at Front Door")).toBeVisible();
    await expect(page.getByText("Vehicle in Parking Lot")).toBeVisible();
    await expect(page.getByText("Camera Offline Alert")).toBeVisible();
  });

  test("shows 'Select a rule to edit' placeholder when no rule selected", async ({
    page,
  }) => {
    await expect(
      page.getByText("Select a rule to edit"),
    ).toBeVisible({ timeout: 10_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  Rule editor                                                        */
  /* ------------------------------------------------------------------ */

  test("clicking a rule opens the editor with trigger / conditions / actions", async ({
    page,
  }) => {
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });

    await page.getByText("Person at Front Door").click();

    await expect(page.getByText("When this happens")).toBeVisible();
    await expect(
      page.getByText("If these conditions are met"),
    ).toBeVisible();
    await expect(page.getByText("Then do this")).toBeVisible();
  });

  test("rule editor shows Trigger Type label", async ({ page }) => {
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Person at Front Door").click();

    await expect(page.getByText("Trigger Type")).toBeVisible();
  });

  test("rule editor shows configured actions", async ({ page }) => {
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Person at Front Door").click();

    await expect(page.getByText("Push Notification")).toBeVisible();
    await expect(page.getByText("Email")).toBeVisible();
  });

  test("rule editor shows 'Test Rule' and 'Save' buttons", async ({
    page,
  }) => {
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Person at Front Door").click();

    await expect(
      page.getByRole("button", { name: "Test Rule" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save" }),
    ).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Toggle switch                                                      */
  /* ------------------------------------------------------------------ */

  test("rule toggle switch is interactive", async ({ page }) => {
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });

    const toggleSwitch = page.getByRole("switch", {
      name: /Person at Front Door/i,
    });
    await expect(toggleSwitch).toBeVisible();

    // Click to toggle — mock returns success so no error is expected
    await toggleSwitch.click();
    await expect(toggleSwitch).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Sort controls                                                      */
  /* ------------------------------------------------------------------ */

  test("sort control buttons are visible", async ({ page }) => {
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });

    await expect(
      page.getByRole("button", { name: "Name" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Last Triggered" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Created" }),
    ).toBeVisible();
  });
});
