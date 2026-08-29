import { loadConfig } from "./config.js";
import { Db } from "./db.js";
import { seedDispatch } from "./dispatch.js";
import { Worker } from "./worker.js";
import { createServer } from "./server.js";
import { refreshFindMy } from "./findmy.js";
import { logger } from "./logger.js";

const config = loadConfig();
const db = new Db(config.dbPath);
seedDispatch(db);

const worker = new Worker(config, db);
await worker.start();
void refreshFindMy(true);
setInterval(() => void refreshFindMy(), 90_000);

const app = createServer(config, db);
app.listen(config.port, () => logger.info("guardian.listening", {
  console: `http://localhost:${config.port}`,
  service: config.serviceName,
  autoReply: config.autoReply,
}));

process.on("SIGINT", () => { worker.stop(); db.close(); process.exit(0); });
process.on("SIGTERM", () => { worker.stop(); db.close(); process.exit(0); });
