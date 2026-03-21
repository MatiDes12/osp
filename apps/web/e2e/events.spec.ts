/**
 * E2E — Events page (/events)
 *
 * Covers:
 *  - Page renders with filter sidebar and event list
 *  - Mock events are displayed
 *  - Date preset filter buttons work
 *  - Severity filter checkboxes work
 *  - Single-event acknowledgement
 *  - Bulk select and acknowledge
 *  - Results count shown
 *  - Export dropdown is accessible
 */

import { test, expect } from "@playwright/test";
import { gotoAuthenticated } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Events page", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await gotoAuthenticated(page, "/events");
  });

  /* ------------------------------------------------------------------ */
  /*  Page structure                                                     */
  /* ------------------------------------------------------------------ */

  test("renders Filters sidebar and Events heading", async ({ page }) => {
    // Filter sidebar is only visible on desktop (md breakpoint)
    const sidebar = page.locator("aside");
    await expect(sidebar.getByText("Filters")).toBeVisible({ timeout: 10_000 });

    // Sidebar sections
    await expect(sidebar.getByText("Severity")).toBeVisible();
    await expect(sidebar.getByText("Event Type")).toBeVisible();

    // Main content heading
    await expect(
      page.getByRole("heading", { name: "Events" }),
    ).toBeVisible();
  });

  /* ------------------------------------------------------------------ */
  /*  Event list content                                                 */
  /* ------------------------------------------------------------------ */

  test("displays events from mock data", async ({ page }) => {
    // Wait for at least one event type label to appear
    await expect(page.getByText("person").first()).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByText("vehicle").first()).toBeVisible();
    await expect(page.getByText("motion").first()).toBeVisible();
    // camera_offline renders as "camera offline"
    await expect(
      page.getByText(/camera.?offline/i).first(),
    ).toBeVisible();
  });

  test("results count is displayed", async ({ page }) => {
    await expect(page.getByText(/results?/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Date preset filters                                                */
  /* ------------------------------------------------------------------ */

  test("'Today' date preset is active by default in sidebar", async ({
    page,
  }) => {
    await expect(
      page.locator("aside").getByText("Today", { exact: true }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("clicking '7 Days' preset button in sidebar updates filter", async ({
    page,
  }) => {
    await expect(
      page.locator("aside").getByText("Filters"),
    ).toBeVisible({ timeout: 10_000 });

    await page.locator("aside").getByText("7 Days").click();

    // Events list should still render (mock always returns same data)
    await expect(page.getByText("person").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  /* ------------------------------------------------------------------ */
  /*  Severity filter                                                    */
  /* ------------------------------------------------------------------ */

  test("checking 'Critical' severity checkbox keeps critical events visible", async ({
    page,
  }) => {
    await expect(page.getByText("person").first()).toBeVisible({
      timeout: 10_000,
    });

    // The severity checkboxes live inside the aside
    const severitySection = page
      .locator("aside")
      .locator("text=Severity")
      .locator("..");
    await severitySection.getByRole("checkbox").first().check();

    // Camera-offline event (critical severity) must still be visible
    await expect(
      page.getByText(/camera.?offline/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  Acknowledge                                                        */
  /* ------------------------------------------------------------------ */

  test("acknowledging a single event shows the acknowledged badge", async ({
    page,
  }) => {
    await expect(page.getByText("person").first()).toBeVisible({
      timeout: 10_000,
    });

    const ackButton = page
      .getByRole("button", { name: "Acknowledge event" })
      .first();
    await ackButton.click();

    // An "Ack" badge should appear after optimistic update
    await expect(page.getByText("Ack").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("bulk select and acknowledge clears selection", async ({ page }) => {
    await expect(page.getByText("person").first()).toBeVisible({
      timeout: 10_000,
    });

    // Event checkboxes sit inside the main scrollable list (not the sidebar)
    const eventCheckboxes = page
      .locator("main")
      .getByRole("checkbox");
    await eventCheckboxes.first().check();

    // Bulk action bar should appear
    await expect(page.getByText(/selected/i)).toBeVisible();

    const ackAllBtn = page.getByRole("button", { name: "Acknowledge All" });
    await expect(ackAllBtn).toBeVisible();
    await ackAllBtn.click();

    // Selection bar should disappear after bulk acknowledge
    await expect(page.getByText(/selected/i)).toBeHidden({ timeout: 5_000 });
  });

  /* ------------------------------------------------------------------ */
  /*  Export                                                             */
  /* ------------------------------------------------------------------ */

  test("Export button is visible", async ({ page }) => {
    await expect(page.getByText("person").first()).toBeVisible({
      timeout: 10_000,
    });

    // The Export button may render with a Download icon but the accessible
    // name or visible text should contain "Export"
    await expect(
      page.getByRole("button", { name: /export/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
