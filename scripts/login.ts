// Opens the automation Chrome profile so you can sign in to Google Voice once. Waits until you're in, then exits.
import { loadConfig } from "../src/config.js";
import { launchGvBrowser, GV_URL } from "../src/gv/browser.js";
import { logger } from "../src/logger.js";

const config = loadConfig();
const browser = await launchGvBrowser({ profileDir: config.profileDir, headless: false });
// Signed-out visits to voice.google.com bounce to a marketing page, so start on the sign-in form instead.
await browser.page.goto(`https://accounts.google.com/ServiceLogin?continue=${encodeURIComponent(`${GV_URL}/messages`)}`, { waitUntil: "domcontentloaded" });
logger.info("login.waiting", { hint: "Sign in to the Google account that owns your Google Voice number in the window that opened." });
const deadline = Date.now() + 30 * 60 * 1000;
while (Date.now() < deadline) {
  await browser.page.waitForTimeout(2000);
  if (browser.page.url().startsWith("https://voice.google.com/")) {
    await browser.page.waitForTimeout(3000);
    logger.info("login.success", { url: browser.page.url(), profileDir: config.profileDir });
    await browser.close();
    process.exit(0);
  }
}
logger.error("login.timeout", { url: browser.page.url() });
await browser.close();
process.exit(1);
