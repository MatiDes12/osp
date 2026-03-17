import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Camera management", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    // Establish origin, then inject tokens before hitting protected routes
    await page.goto("/");
    await loginAs(page);
    await page.goto("/cameras");

    // If the dev Action Log panel is open, close it so it can't intercept clicks.
    // (The panel exists only in development and is harmless for prod.)
    const actionLogHeader = page.getByText("Action Log");
    if (await actionLogHeader.isVisible().catch(() => false)) {
      // Use the fixed "LOG" toggle (more reliable than the panel buttons).
      await page.getByRole("button", { name: "LOG" }).click();
      await expect(actionLogHeader).toBeHidden();
    }
  });

  test("displays camera list", async ({ page }) => {
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Cameras" }),
    ).toBeVisible({
      timeout: 10_000,
    });

    // Camera names from mock data
    await expect(
      page.getByRole("main").getByRole("link", { name: /Front Door/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: /Parking Lot/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: /Server Room/ }),
    ).toBeVisible();
  });

  test("'Add Camera' button opens dialog", async ({ page }) => {
    const addButton = page.getByRole("button", { name: "Add Camera" });
    await expect(addButton).toBeVisible({ timeout: 10_000 });
    await addButton.click();

    // Dialog heading
    await expect(
      page.getByRole("heading", { name: "Add Camera" }),
    ).toBeVisible();

    // Form fields
    await expect(page.getByLabel("Camera Name")).toBeVisible();
    await expect(page.getByLabel("Connection URI")).toBeVisible();
  });

  test("fill and submit add camera form", async ({ page }) => {
    // Open dialog
    await page.getByRole("button", { name: "Add Camera" }).click({ timeout: 10_000 });

    // Fill form
    await page.getByLabel("Camera Name").fill("Warehouse West");
    await page.getByLabel("Connection URI").fill("rtsp://192.168.1.50:554/stream");

    // Submit
    await page.getByRole("button", { name: "Add Camera" }).last().click({ force: true });

    // Dialog should close after successful submission
    await expect(
      page.getByRole("heading", { name: "Add Camera" }),
    ).toBeHidden({ timeout: 10_000 });
  });

  test("camera card click navigates to camera detail", async ({ page }) => {
    // Wait for cameras to load
    const frontDoorCard = page
      .getByRole("main")
      .getByRole("link", { name: /Front Door/ })
      .first();
    await expect(frontDoorCard).toBeVisible({ timeout: 10_000 });

    // CameraGrid renders links/cards. Click the first camera
    await frontDoorCard.click();

    // Should navigate to camera detail page
    await expect(page).toHaveURL(/\/cameras\/cam-1/, { timeout: 10_000 });
  });

  test("camera detail page shows LiveViewPlayer and info panel", async ({ page }) => {
    // Navigate directly to camera detail
    await page.goto("/cameras/cam-1");
    await loginAs(page);
    await page.reload();

    // Camera name in header (overlay bar)
    await expect(page.getByRole("heading", { name: "Front Door" })).toBeVisible({
      timeout: 10_000,
    });

    // Status badge
    await expect(page.getByText("online").first()).toBeVisible();

    // Camera Details section
    await expect(page.getByText("Camera Details")).toBeVisible();
    await expect(page.getByText(/^rtsp$/i)).toBeVisible();

    // Zones section
    await expect(page.getByText(/Zones/)).toBeVisible();
  });

  test("search filters cameras by name", async ({ page }) => {
    await expect(
      page.getByRole("main").getByRole("link", { name: /Front Door/ }).first(),
    ).toBeVisible({
      timeout: 10_000,
    });

    const searchInput = page.getByPlaceholder("Search cameras by name...");
    await searchInput.fill("Parking");

    // "Parking Lot" should remain, others should be filtered
    await expect(
      page.getByRole("main").getByRole("link", { name: /Parking Lot/ }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("link", { name: /Front Door/ }).first(),
    ).toBeHidden();
  });
});
