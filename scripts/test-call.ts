// Places a real call to TARGET_PHONE_NUMBER reading the given text. Usage: npm run test:call -- "hello from the relay"
import { loadConfig } from "../src/config.js";
import { launchGvBrowser, isLoggedIn } from "../src/gv/browser.js";
import { placeCall } from "../src/gv/caller.js";
import { createSaySynthesizer } from "../src/tts.js";
import { templateScript } from "../src/script.js";
import { logger } from "../src/logger.js";

const text = process.argv.slice(2).join(" ").trim() || "This is a test of the relay system.";
const config = loadConfig();
const clip = await createSaySynthesizer(config.ttsVoice)(templateScript(text, "+15005550006"));
const browser = await launchGvBrowser({ profileDir: config.profileDir, headless: config.headless });
if (!(await isLoggedIn(browser.page))) { logger.error("not logged in; run `npm run login`"); await browser.close(); process.exit(2); }
const result = await placeCall(browser.page, config.targetPhoneNumber, clip.wav, { answerTimeoutMs: config.callAnswerTimeoutMs, repeat: config.callRepeat });
logger.info("test-call.result", { ...result });
await browser.close();
process.exit(result.outcome === "failed" ? 1 : 0);
