/** Captures README screenshots against a running server: BASE_URL=http://localhost:3100 pnpm tsx scripts/screenshots.ts */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const shots: [string, string][] = [
  ["/?zone=iris:341720102", "map-area.png"],
  ["/comparer?a=iris:341720102&b=iris:341720101", "compare.png"],
];

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 1 });
for (const [path, file] of shots) {
  await page.goto(BASE + path);
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `docs/screenshots/${file}` });
  console.log("saved", file);
}
await browser.close();
