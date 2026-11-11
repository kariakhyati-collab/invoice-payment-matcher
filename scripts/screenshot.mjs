// Captures docs/screenshot.png from a running server.
//
//   npm run build && npm run start -- -p 4802 &
//   npm run screenshot            # BASE_URL defaults to http://localhost:4802
//
// Requires a Playwright Chromium: `npx playwright install chromium`.
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4802";
const OUT = process.env.OUT ?? "docs/screenshot.png";
const WIDTH = Number(process.env.WIDTH ?? 1440);
const HEIGHT = Number(process.env.HEIGHT ?? 900);
const COLOR_SCHEME = process.env.COLOR_SCHEME ?? "light";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: Number(process.env.SCALE ?? 1),
    colorScheme: COLOR_SCHEME,
  });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Load sample data" }).click();
  await page.getByRole("heading", { name: "Reconciliation" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: OUT, fullPage: process.env.FULL_PAGE === "1" });
  console.log(`Saved ${OUT}`);
} finally {
  await browser.close();
}
