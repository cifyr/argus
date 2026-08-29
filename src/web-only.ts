// Runs just the app + dashboard without the Google Voice browser. Verification codes are logged instead of texted.
import { loadConfig } from "./config.js";
import { Db } from "./db.js";
import { createWebApp } from "./web/server.js";
import { logger } from "./logger.js";

const config = loadConfig();
const db = new Db(config.dbPath);
const app = createWebApp({
  db,
  adminToken: config.adminToken,
  gvPhoneNumber: config.gvPhoneNumber,
  sendSms: async (to, body) => { logger.warn("web-only: SMS not sent, code is in this log line", { to, body }); },
});
app.listen(config.port, () => logger.info("web-only.listening", { port: config.port, app: `${config.publicBaseUrl}/`, dashboard: `${config.publicBaseUrl}/dashboard` }));
