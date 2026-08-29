import { Worker } from "./worker.js";
import { createDeskApp } from "./server.js";
import { logger } from "../logger.js";

const PORT = Number(process.env.DESK_PORT) || 4100;
const worker = new Worker();
if (worker.getSettings().enabled) await worker.enable();  // resume if it was left on

const app = createDeskApp(worker);
app.listen(PORT, () => logger.info("desk.listening", { url: `http://localhost:${PORT}` }));

process.on("SIGINT", () => { worker.disable(); process.exit(0); });
process.on("SIGTERM", () => { worker.disable(); process.exit(0); });
