// Dumps the accessibility tree of the GV messages and calls pages so selectors can be tuned without guessing.
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { launchGvBrowser, isLoggedIn, GV_URL } from "../src/gv/browser.js";
import { listThreadLabels, parseThreadLabel } from "../src/gv/inbox.js";
import { logger } from "../src/logger.js";

const config = loadConfig();
const outDir = path.resolve(process.cwd(), ".inspect");
await mkdir(outDir, { recursive: true });
const browser = await launchGvBrowser({ profileDir: config.profileDir, headless: config.headless });
if (!(await isLoggedIn(browser.page))) { logger.error("not logged in; run `npm run login`"); await browser.close(); process.exit(2); }

for (const section of ["messages", "calls"]) {
  await browser.page.goto(`${GV_URL}/${section}`, { waitUntil: "domcontentloaded" });
  await browser.page.waitForTimeout(3000);
  const aria = await browser.page.locator("body").ariaSnapshot();
  await writeFile(path.join(outDir, `${section}.aria.yaml`), aria);
  await browser.page.screenshot({ path: path.join(outDir, `${section}.png`), fullPage: false });
  logger.info("inspect.saved", { section, aria: path.join(outDir, `${section}.aria.yaml`) });
}
const labels = await listThreadLabels(browser.page);
logger.info("inspect.threads", { count: labels.length, parsed: labels.slice(0, 3).map(parseThreadLabel) });
await browser.close();
