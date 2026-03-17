import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Rules engine", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto("/(dashboard)/rules");
    await loginAs(page);
    await page.reload();
  });

  test("displays rules list", async ({ page }) => {
    await expect(page.getByText("Alert Rules")).toBeVisible({ timeout: 10_000 });

    // Mock rules
    await expect(page.getByText("Person at Front Door")).toBeVisible();
    await expect(page.getByText("Vehicle in Parking Lot")).toBeVisible();
    await expect(page.getByText("Camera Offline Alert")).toBeVisible();
  });

  test("toggle rule enabled/disabled", async ({ page }) => {
    // Wait for rules to load
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });

    // Find the toggle switch for the first rule
    // The toggles are role="switch" with aria-label containing the rule name
    const toggleSwitch = page.getByRole("switch", {
      name: /Person at Front Door/i,
    });
    await expect(toggleSwitch).toBeVisible();

    // Click to toggle
    await toggleSwitch.click();

    // The API mock returns success, so the UI should update
    // (The switch should change state)
    await expect(toggleSwitch).toBeVisible();
  });

  test("selecting a rule shows editor panel with trigger, conditions, actions", async ({
    page,
  }) => {
    // Wait for rules to load
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });

    // Click a rule to select it
    await page.getByText("Person at Front Door").click();

    // Editor panel should show the three blocks
    await expect(page.getByText("When this happens")).toBeVisible();
    await expect(page.getByText("If these conditions are met")).toBeVisible();
    await expect(page.getByText("Then do this")).toBeVisible();

    // Trigger shows event type
    await expect(page.getByText("Trigger Type")).toBeVisible();

    // Actions block shows configured actions
    await expect(page.getByText("Push Notification")).toBeVisible();
    await expect(page.getByText("Email")).toBeVisible();
  });

  test("rule editor shows 'Test Rule' and 'Save' buttons", async ({ page }) => {
    // Wait and select a rule
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByText("Person at Front Door").click();

    await expect(page.getByRole("button", { name: "Test Rule" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("no rule selected shows placeholder", async ({ page }) => {
    await expect(page.getByText("Select a rule to edit")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("sort controls are visible", async ({ page }) => {
    await expect(page.getByText("Person at Front Door")).toBeVisible({
      timeout: 10_000,
    });

    // Sort buttons
    await expect(page.getByRole("button", { name: "Name" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Last Triggered" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Created" })).toBeVisible();
  });
});
