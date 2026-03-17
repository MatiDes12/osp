import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("displays hero headline", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Monitor Everything.",
    );
  });

  test("displays 6 feature cards", async ({ page }) => {
    // Each feature card has an h3 heading
    const featureSection = page.locator("section").filter({ hasText: "Why OSP?" });
    const featureCards = featureSection.locator("h3");
    await expect(featureCards).toHaveCount(6);

    // Verify specific feature titles
    await expect(featureSection.getByText("Live Monitoring")).toBeVisible();
    await expect(featureSection.getByText("Smart Alerts")).toBeVisible();
    await expect(featureSection.getByText("Cloud Recording")).toBeVisible();
    await expect(featureSection.getByText("AI Detection")).toBeVisible();
    await expect(featureSection.getByText("Multi-Tenant")).toBeVisible();
    await expect(featureSection.getByText("Extension SDK")).toBeVisible();
  });

  test("displays pricing section with 4 plans", async ({ page }) => {
    const pricingSection = page.locator("section").filter({
      hasText: "Simple, transparent pricing",
    });
    await expect(pricingSection).toBeVisible();

    // 4 plan names
    await expect(pricingSection.getByText("Free")).toBeVisible();
    await expect(pricingSection.getByText("Pro")).toBeVisible();
    await expect(pricingSection.getByText("Business")).toBeVisible();
    await expect(pricingSection.getByText("Enterprise")).toBeVisible();

    // Verify prices
    await expect(pricingSection.getByText("$0")).toBeVisible();
    await expect(pricingSection.getByText("$10")).toBeVisible();
    await expect(pricingSection.getByText("$50")).toBeVisible();
    await expect(pricingSection.getByText("Custom")).toBeVisible();
  });

  test("'Get Started Free' CTA navigates to /register", async ({ page }) => {
    const ctaLink = page.getByRole("link", { name: "Get Started Free" });
    await expect(ctaLink).toBeVisible();
    await expect(ctaLink).toHaveAttribute("href", "/(auth)/register");
  });

  test("footer links are visible", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();

    await expect(footer.getByText("Product")).toBeVisible();
    await expect(footer.getByText("Documentation")).toBeVisible();
    await expect(footer.getByText("GitHub")).toBeVisible();
    await expect(footer.getByText("API Reference")).toBeVisible();

    // Brand
    await expect(footer.getByText("OSP")).toBeVisible();
  });

  test("footer shows copyright notice", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer.getByText("Open Surveillance Platform")).toBeVisible();
  });

  test("hero shows OSP badge", async ({ page }) => {
    await expect(page.getByText("Open Surveillance Platform")).toBeVisible();
  });

  test("'See it in action' section shows camera grid preview", async ({ page }) => {
    const previewSection = page.locator("section").filter({
      hasText: "See it in action",
    });
    await expect(previewSection).toBeVisible();
    await expect(previewSection.getByText("Front Entrance")).toBeVisible();
    await expect(previewSection.getByText("Parking Lot B")).toBeVisible();
  });
});
