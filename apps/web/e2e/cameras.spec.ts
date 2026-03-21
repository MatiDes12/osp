/**
 * E2E — Camera management (/cameras)
 *
 * Covers:
 *  - Camera list renders with mock data
 *  - "Add Camera" button opens the dialog
 *  - AddCameraDialog multi-step flow: pick protocol → fill form → submit
 *  - Search filter narrows the camera list
 *  - Camera card click navigates to camera detail
 *  - Camera detail page shows player and info panel
 */

import { test, expect } from "@playwright/test";
import { loginAs, gotoAuthenticated } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Camera management", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await gotoAuthenticated(page, "/cameras");

    // In development, an Action Log panel may float over interactive elements.
    // Dismiss it if present.
    const actionLogHeader = page.getByText("Action Log");
    if (await actionLogHeader.isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "LOG" }).click();
      await expect(actionLogHeader).toBeHidden();
    }
  });

  /* ------------------------------------------------------------------ */
  /*  Camera list                                                        */
  /* ------------------------------------------------------------------ */

  test("displays page heading and camera list", async ({ page }) => {
    await expect(
      page.getByRole("main").getByRole("heading", { name: "Cameras" }),
    ).toBeVisible({ timeout: 10_000 });

    // Camera names from mock data
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /Front Door/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /Parking Lot/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /Server Room/ })
        .first(),
    ).toBeVisible();
  });

  test("displays 'Add Camera' button", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Add Camera" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("search input filters cameras by name", async ({ page }) => {
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /Front Door/ })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    const searchInput = page.getByPlaceholder("Search cameras by name...");
    await searchInput.fill("Parking");

    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /Parking Lot/ })
        .first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /Front Door/ })
        .first(),
    ).toBeHidden();
  });

  test("clearing search restores full camera list", async ({ page }) => {
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /Front Door/ })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    const searchInput = page.getByPlaceholder("Search cameras by name...");
    await searchInput.fill("Parking");
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /Front Door/ })
        .first(),
    ).toBeHidden();

    await searchInput.clear();
    await expect(
      page
        .getByRole("main")
        .getByRole("link", { name: /Front Door/ })
        .first(),
    ).toBeVisible();
  });

  test("camera card click navigates to camera detail", async ({ page }) => {
    const frontDoorCard = page
      .getByRole("main")
      .getByRole("link", { name: /Front Door/ })
      .first();
    await expect(frontDoorCard).toBeVisible({ timeout: 10_000 });
    await frontDoorCard.click();

    await expect(page).toHaveURL(/\/cameras\/cam-1/, { timeout: 10_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  Add Camera dialog — multi-step flow                                */
  /* ------------------------------------------------------------------ */

  test("'Add Camera' button opens dialog with protocol picker", async ({
    page,
  }) => {
    const addButton = page.getByRole("button", { name: "Add Camera" });
    await expect(addButton).toBeVisible({ timeout: 10_000 });
    await addButton.click();

    // Dialog heading
    await expect(
      page.getByRole("heading", { name: "Add Camera" }),
    ).toBeVisible();

    // Manual tab should be active and show the protocol picker
    await expect(page.getByText("RTSP")).toBeVisible();
    await expect(page.getByText("ONVIF")).toBeVisible();
  });

  test("selecting RTSP protocol advances to form step", async ({ page }) => {
    await page
      .getByRole("button", { name: "Add Camera" })
      .click({ timeout: 10_000 });

    // Click the RTSP protocol card — it renders as a button containing the text "RTSP"
    await page.getByRole("button", { name: /RTSP/i }).first().click();

    // The form step should show a Camera Name input and IP Address field
    await expect(page.getByLabel(/Camera Name/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByLabel(/IP Address/i)).toBeVisible();
  });

  test("filling RTSP form and submitting closes the dialog", async ({
    page,
  }) => {
    await page
      .getByRole("button", { name: "Add Camera" })
      .click({ timeout: 10_000 });

    // Step 1 — pick RTSP
    await page.getByRole("button", { name: /RTSP/i }).first().click();

    // Step 2 — fill in fields
    await page.getByLabel(/Camera Name/i).fill("Warehouse West");
    await page.getByLabel(/IP Address/i).fill("192.168.1.50");

    // Submit
    await page
      .getByRole("button", { name: /Add Camera|Save/i })
      .last()
      .click({ force: true });

    // Dialog should close after successful submission
    await expect(page.getByRole("heading", { name: "Add Camera" })).toBeHidden({
      timeout: 10_000,
    });
  });

  test("closing the dialog with Escape key works", async ({ page }) => {
    await page
      .getByRole("button", { name: "Add Camera" })
      .click({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Add Camera" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Add Camera" })).toBeHidden({
      timeout: 5_000,
    });
  });

  test("closing the dialog via the close button works", async ({ page }) => {
    await page
      .getByRole("button", { name: "Add Camera" })
      .click({ timeout: 10_000 });
    await expect(
      page.getByRole("heading", { name: "Add Camera" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { name: "Add Camera" })).toBeHidden({
      timeout: 5_000,
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Camera detail page                                                 */
  /* ------------------------------------------------------------------ */

  test("camera detail page shows camera name, status and info panel", async ({
    page,
  }) => {
    await page.goto("/cameras/cam-1");
    // Re-inject auth tokens after the navigation resets state
    await loginAs(page);
    await page.reload();

    // Camera name should appear somewhere on the page (heading or overlay bar)
    await expect(page.getByText("Front Door").first()).toBeVisible({
      timeout: 10_000,
    });

    // Status badge
    await expect(page.getByText("online").first()).toBeVisible();

    // Info / details section
    await expect(page.getByText(/Camera Details|rtsp/i).first()).toBeVisible();
  });
});
