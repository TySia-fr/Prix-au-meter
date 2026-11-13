import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** Third-party map tiles and the geocoder are not needed for tests: block them for determinism. */
export async function blockThirdParties(page: Page) {
  await page.route(/openfreemap\.org|geopf\.fr|openstreetmap/, (r) => r.abort());
}

export async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
export const PASSWORD = "correct-horse-battery";
