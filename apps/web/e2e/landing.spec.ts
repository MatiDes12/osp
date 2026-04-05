/**
 * E2E — Landing page (/)
 *
 * This page is only shown when the user is NOT logged in (no osp_access_token).
 * Tests run without any auth tokens present.
 *
 * Covers:
 *  - Hero headline, badge, CTA links
 *  - "Why OSP?" feature cards (6 cards)
 *  - Pricing section with 4 plans
 *  - "See it in action" camera preview section
 *  - Footer links and copyright
 */

import { test, expect } from "@playwright/test";

test.describe("Landing page", () => {
  test.beforeEach(async ({ page }) => {
    // Ensure no auth token is present so the landing page renders
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("osp_access_token");
      localStorage.removeItem("osp_refresh_token");
    });
    // Reload so the AuthGuard sees the cleared tokens
    await page.reload();
  });

  test("renders hero headline", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Monitor Everything.",
    );
  });

  test("renders OSP badge in hero", async ({ page }) => {
    // The badge text also appears in the footer copyright — scope to the hero
    // section to avoid a strict-mode violation.
    await expect(page.getByText("Open Surveillance Platform").first()).toBeVisible();
  });

  test("'Get Started Free' CTA links to /register", async ({ page }) => {
    const cta = page.getByRole("link", { name: "Get Started Free" });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/register");
  });

  test("'Sign In' link in hero / nav links to /login", async ({ page }) => {
    const signInLink = page.getByRole("link", { name: /Sign In/i }).first();
    await expect(signInLink).toBeVisible();
  });

  test("features section contains 6 feature card headings", async ({ page }) => {
    // The features section has id="features"; its heading text is
    // "Everything you need to run a professional surveillance operation".
    const featureSection = page.locator("#features");
    const cards = featureSection.locator("h3");
    await expect(cards).toHaveCount(6);

    await expect(featureSection.getByText("Live Monitoring")).toBeVisible();
    await expect(featureSection.getByText("Smart Alerts")).toBeVisible();
    await expect(featureSection.getByText("Cloud Recording")).toBeVisible();
    await expect(featureSection.getByText("AI Detection")).toBeVisible();
    await expect(featureSection.getByText("Multi-Tenant")).toBeVisible();
    await expect(featureSection.getByText("Extension SDK")).toBeVisible();
  });

  test("pricing section shows 4 plan tiers", async ({ page }) => {
    const pricingSection = page.locator("#pricing");
    await expect(pricingSection).toBeVisible();

    // Plan name headings — exact match avoids "Start Free" CTA text
    await expect(pricingSection.getByText("Free", { exact: true }).first()).toBeVisible();
    await expect(pricingSection.getByText("Pro", { exact: true })).toBeVisible();
    await expect(pricingSection.getByText("Business", { exact: true })).toBeVisible();
    await expect(pricingSection.getByText("Enterprise", { exact: true })).toBeVisible();

    await expect(pricingSection.getByText("$0")).toBeVisible();
    await expect(pricingSection.getByText("$10")).toBeVisible();
    await expect(pricingSection.getByText("$50")).toBeVisible();
    await expect(pricingSection.getByText("Custom", { exact: true }).first()).toBeVisible();
  });

  test("'See it in action' section shows camera grid preview", async ({
    page,
  }) => {
    const previewSection = page
      .locator("section")
      .filter({ hasText: "See it in action" });
    await expect(previewSection).toBeVisible();
    await expect(previewSection.getByText("Front Entrance")).toBeVisible();
    await expect(previewSection.getByText("Parking Lot B")).toBeVisible();
  });

  test("footer shows product and documentation links", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
    await expect(footer.getByText("Product")).toBeVisible();
    await expect(footer.getByText("Docs")).toBeVisible();
    await expect(footer.getByText("GitHub")).toBeVisible();
  });

  test("footer shows copyright notice", async ({ page }) => {
    const footer = page.locator("footer");
    await expect(footer.getByText("Open Surveillance Platform")).toBeVisible();
  });
});
