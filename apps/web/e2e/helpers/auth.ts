import type { Page } from "@playwright/test";

/**
 * Simulate an authenticated session by injecting tokens into localStorage.
 * Must be called after `page.goto()` so the page origin is set.
 */
export async function loginAs(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem("osp_access_token", "test-token");
    localStorage.setItem("osp_refresh_token", "test-refresh");
  });
}
