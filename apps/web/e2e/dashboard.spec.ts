import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    // Navigate first to establish the origin, then set auth tokens
    await page.goto("/");
    await loginAs(page);
    await page.reload();
  });

  test("displays 4 stat cards", async ({ page }) => {
    // Wait for stats to load (skeleton disappears)
    await expect(page.getByText("Cameras")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Online")).toBeVisible();
    await expect(page.getByText("Active Alerts")).toBeVisible();
    await expect(page.getByText("Storage Used")).toBeVisible();
  });

  test("shows camera grid area", async ({ page }) => {
    // The CameraGrid component renders camera cards or an empty state
    // With mocked data we should see camera names
    await expect(page.getByText("Front Door")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Parking Lot")).toBeVisible();
  });

  test("shows live event feed sidebar", async ({ page }) => {
    await expect(page.getByText("Live Events")).toBeVisible({ timeout: 10_000 });
  });

  test("sidebar navigation: Cameras link works", async ({ page }) => {
    const camerasLink = page.locator("aside").getByRole("link", { name: "Cameras" });
    await expect(camerasLink).toBeVisible();
    await camerasLink.click();
    await expect(page).toHaveURL(/\/cameras/);
  });

  test("sidebar navigation: Events & Alerts link works", async ({ page }) => {
    const eventsLink = page.locator("aside").getByRole("link", {
      name: "Events & Alerts",
    });
    await expect(eventsLink).toBeVisible();
    await eventsLink.click();
    await expect(page).toHaveURL(/\/events/);
  });

  test("sidebar navigation: Recordings link works", async ({ page }) => {
    const link = page.locator("aside").getByRole("link", { name: "Recordings" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/recordings/);
  });

  test("sidebar navigation: Rules link works", async ({ page }) => {
    const link = page.locator("aside").getByRole("link", { name: "Rules" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/rules/);
  });

  test("sidebar navigation: Settings link works", async ({ page }) => {
    const link = page.locator("aside").getByRole("link", { name: "Settings" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test("sidebar collapse toggle works", async ({ page }) => {
    // Find the collapse button
    const collapseBtn = page.getByRole("button", { name: /collapse/i });
    await expect(collapseBtn).toBeVisible();

    // Click to collapse - sidebar should shrink
    await collapseBtn.click();

    // After collapse, "Collapse" text should be gone, and the expand button appears
    const expandBtn = page.getByRole("button", { name: /expand/i });
    await expect(expandBtn).toBeVisible();

    // Click to expand again
    await expandBtn.click();
    await expect(page.getByRole("button", { name: /collapse/i })).toBeVisible();
  });
});
