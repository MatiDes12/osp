import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { setupApiMocks } from "./helpers/mocks";

test.describe("Events page", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await page.goto("/(dashboard)/events");
    await loginAs(page);
    await page.reload();
  });

  test("displays filter sidebar and event list", async ({ page }) => {
    // Filter sidebar heading
    await expect(page.getByText("Filters")).toBeVisible({ timeout: 10_000 });

    // Severity filter section
    await expect(page.getByText("Severity")).toBeVisible();

    // Event type filter section
    await expect(page.getByText("Event Type")).toBeVisible();

    // Events heading
    await expect(
      page.getByRole("heading", { name: "Events" }),
    ).toBeVisible();
  });

  test("shows event list with mock data", async ({ page }) => {
    // Wait for events to load
    await expect(page.getByText("person")).toBeVisible({ timeout: 10_000 });

    // Check events from mock data appear
    await expect(page.getByText("vehicle")).toBeVisible();
    await expect(page.getByText("motion")).toBeVisible();
    await expect(page.getByText("camera offline")).toBeVisible();
  });

  test("filter by severity checkbox", async ({ page }) => {
    // Wait for events to load
    await expect(page.getByText("person")).toBeVisible({ timeout: 10_000 });

    // The severity filter section has checkboxes for Critical, Warning, Info, Low
    const severitySection = page.locator("aside").locator("text=Severity").locator("..");

    // Click "Critical" checkbox
    const criticalCheckbox = severitySection.getByRole("checkbox").first();
    await criticalCheckbox.check();

    // After filtering, the events list should update
    // (client-side filtering occurs; critical events should remain visible)
    await expect(page.getByText("camera offline")).toBeVisible();
  });

  test("filter by date preset 'Today'", async ({ page }) => {
    // Wait for page to load
    await expect(page.getByText("Filters")).toBeVisible({ timeout: 10_000 });

    // "Today" button should be active by default (it is the initial filter)
    const todayButton = page.locator("aside").getByText("Today", { exact: true });
    await expect(todayButton).toBeVisible();
  });

  test("acknowledge a single event", async ({ page }) => {
    // Wait for events
    await expect(page.getByText("person")).toBeVisible({ timeout: 10_000 });

    // Find an unacknowledged event's acknowledge button
    const ackButton = page.getByRole("button", { name: "Acknowledge event" }).first();
    await ackButton.click();

    // After acknowledging, the "Ack" badge should appear
    await expect(page.getByText("Ack").first()).toBeVisible({ timeout: 5_000 });
  });

  test("bulk select and acknowledge events", async ({ page }) => {
    // Wait for events to load
    await expect(page.getByText("person")).toBeVisible({ timeout: 10_000 });

    // Select multiple events using their checkboxes
    // The checkboxes are in the main event list area (not the filter sidebar)
    const eventCheckboxes = page
      .locator("main")
      .getByRole("checkbox");

    // Check first two events
    const firstCheckbox = eventCheckboxes.first();
    await firstCheckbox.check();

    // Bulk action bar should appear
    await expect(page.getByText(/selected/)).toBeVisible();

    // Click "Acknowledge All"
    const ackAllButton = page.getByRole("button", { name: "Acknowledge All" });
    await expect(ackAllButton).toBeVisible();
    await ackAllButton.click();

    // Selection should be cleared after bulk acknowledge
    await expect(page.getByText(/selected/)).toBeHidden({ timeout: 5_000 });
  });

  test("results count is displayed", async ({ page }) => {
    await expect(page.getByText(/results/)).toBeVisible({ timeout: 10_000 });
  });
});
