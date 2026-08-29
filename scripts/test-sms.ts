// Sends a real text from your Google Voice number. Usage: npm run test:sms -- +15551234567 "hello"
import { loadConfig } from "../src/config.js";
import { launchGvBrowser, isLoggedIn } from "../src/gv/browser.js";
import { sendSms } from "../src/gv/sms.js";
import { normalizePhone } from "../src/phone.js";
import { logger } from "../src/logger.js";

const [rawTo, ...rest] = process.argv.slice(2);
const to = rawTo ? normalizePhone(rawTo) : null;
if (!to || rest.length === 0) throw new Error('Usage: npm run test:sms -- +15551234567 "message"');
const config = loadConfig();
const browser = await launchGvBrowser({ profileDir: config.profileDir, headless: config.headless });
if (!(await isLoggedIn(browser.page))) { logger.error("not logged in; run `npm run login`"); await browser.close(); process.exit(2); }
await sendSms(browser.page, to, rest.join(" "));
await browser.close();
