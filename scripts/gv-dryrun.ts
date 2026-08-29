// Exercises inbox parsing, compose, and dialer against the live UI, stopping before any send or call.
// Usage: npm run gv:dryrun -- [+15551234567]
import { loadConfig } from "../src/config.js";
import { launchGvBrowser, isLoggedIn } from "../src/gv/browser.js";
import { pollUnreadMessages, listThreadLabels, parseThreadLabel } from "../src/gv/inbox.js";
import { sendSms } from "../src/gv/sms.js";
import { placeCall } from "../src/gv/caller.js";
import { logger } from "../src/logger.js";

const config = loadConfig();
const probeNumber = process.argv[2] ?? "+15005550006";
const browser = await launchGvBrowser({ profileDir: config.profileDir, headless: config.headless });
if (!(await isLoggedIn(browser.page))) { logger.error("not logged in; run `npm run login`"); await browser.close(); process.exit(2); }
const page = browser.page;

const labels = await listThreadLabels(page);
logger.info("dryrun.threads", { count: labels.length, parsed: labels.slice(0, 3).map(parseThreadLabel) });
const inbound = await pollUnreadMessages(page);
logger.info("dryrun.inbound", { count: inbound.length, sample: inbound.slice(0, 2).map((m) => ({ from: m.from, text: m.text.slice(0, 60) })) });

try { await sendSms(page, probeNumber, "dry run (never sent)", { dryRun: true }); logger.info("dryrun.sms", { ok: true }); }
catch (err) { logger.error("dryrun.sms.failed", { err }); }

const call = await placeCall(page, probeNumber, Buffer.alloc(0), { answerTimeoutMs: 1000, repeat: 1, dryRun: true });
logger.info("dryrun.call", { ...call });

const audio = await page.evaluate(() => (window as unknown as { __relayStatus(): unknown }).__relayStatus());
logger.info("dryrun.audio_inject", { audio });
await browser.close();
