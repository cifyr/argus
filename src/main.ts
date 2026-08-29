import { loadConfig } from "./config.js";
import { Db } from "./db.js";
import { launchGvBrowser, isLoggedIn, type GvBrowser } from "./gv/browser.js";
import { GvSession } from "./gv/session.js";
import { pollUnreadMessages } from "./gv/inbox.js";
import { placeCall } from "./gv/caller.js";
import { sendSms } from "./gv/sms.js";
import { createClaudeScriptGenerator, templateScriptGenerator } from "./script.js";
import { createSaySynthesizer } from "./tts.js";
import { nominatimGeocoder } from "./geocode.js";
import { relayMessage } from "./relay.js";
import { createWebApp } from "./web/server.js";
import { logger } from "./logger.js";

const config = loadConfig();
const db = new Db(config.dbPath);

let browser: GvBrowser | undefined;
let gv: GvSession | undefined;
async function connectBrowser(): Promise<GvSession> {
  if (browser) await browser.close().catch(() => {});
  browser = await launchGvBrowser({ profileDir: config.profileDir, headless: config.headless });
  if (!(await isLoggedIn(browser.page))) {
    throw new Error(`Not logged in to Google Voice in ${config.profileDir}. Run \`npm run login\` first.`);
  }
  gv = new GvSession(browser.page);
  return gv;
}
try {
  await connectBrowser();
} catch (err) {
  logger.error("startup.browser_failed", { err });
  process.exit(2);
}
const session = () => gv!;

const deps = {
  config,
  db,
  generateScript: config.anthropicApiKey
    ? createClaudeScriptGenerator({ apiKey: config.anthropicApiKey, model: config.anthropicModel })
    : templateScriptGenerator,
  synthesize: createSaySynthesizer(config.ttsVoice),
  geocode: nominatimGeocoder,
  placeCall: (to: string, wav: Buffer) =>
    session().run("call", (page) => placeCall(page, to, wav, { answerTimeoutMs: config.callAnswerTimeoutMs, repeat: config.callRepeat })),
};

const web = createWebApp({
  db,
  adminToken: config.adminToken,
  gvPhoneNumber: config.gvPhoneNumber,
  sendSms: (to, body) => session().run("sms", (page) => sendSms(page, to, body)),
});
web.listen(config.port, () => {
  logger.info("web.listening", { port: config.port, app: `${config.publicBaseUrl}/`, dashboard: `${config.publicBaseUrl}/dashboard` });
});

// Unread texts that predate this run are recorded but not relayed, so a restart never phones about stale messages.
const preexisting = await session().run("poll", (page) => pollUnreadMessages(page, { includeSpam: config.relaySpam }));
let ignored = 0;
if (!config.relayPreexisting) {
  for (const m of preexisting) if (db.insertMessageIfNew({ id: m.id, sender: m.from, text: m.text, receivedAt: m.receivedAt }, "preexisting")) ignored++;
}
logger.info("relay.ready", {
  target: config.targetPhoneNumber,
  preexistingUnread: preexisting.length,
  recordedAsPreexisting: ignored,
  scriptMode: config.anthropicApiKey ? `claude:${config.anthropicModel}` : "template (ANTHROPIC_API_KEY not set)",
  voice: config.ttsVoice,
  pollIntervalMs: config.pollIntervalMs,
});

let stopping = false;
process.on("SIGINT", () => { stopping = true; logger.info("shutdown.requested"); });
process.on("SIGTERM", () => { stopping = true; logger.info("shutdown.requested"); });

let consecutiveFailures = 0;
while (!stopping) {
  try {
    const messages = await session().run("poll", (page) => pollUnreadMessages(page, { includeSpam: config.relaySpam }));
    consecutiveFailures = 0;
    for (const msg of messages) {
      if (db.hasMessage(msg.id)) continue;
      await relayMessage(deps, msg);
    }
  } catch (err) {
    consecutiveFailures++;
    logger.error("poll.failed", { consecutiveFailures, err });
    if (consecutiveFailures >= 5) {
      logger.warn("watchdog.relaunching_browser", { consecutiveFailures });
      try { await connectBrowser(); consecutiveFailures = 0; } catch (e) { logger.error("watchdog.relaunch_failed", { err: e }); }
    }
  }
  await new Promise((r) => setTimeout(r, config.pollIntervalMs));
}
await browser?.close();
db.close();
logger.info("shutdown.complete");
