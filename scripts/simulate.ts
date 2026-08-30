// Simulate an inbound text without a real phone, to test intake/emergency + the console.
// It runs the message through the same worker logic and writes to the live database, so the
// simulated person and any help request show up in the console immediately.
// Replies are never actually sent (this always runs in log-only mode).
//
// Usage:
//   npm run simulate -- +15551234567 "hi"                        # first contact -> registration begins
//   npm run simulate -- +15551234567 "Jordan Rivera"             # answer the next intake question
//   npm run simulate -- +15551234567 "help I fell and cant move" # emergency -> creates a help request
import { loadConfig } from "../src/config.js";
import { Db } from "../src/db.js";
import { Worker } from "../src/worker.js";

process.env.AUTO_REPLY = "false"; // never send real texts from the simulator

const phone = process.argv[2];
const text = process.argv.slice(3).join(" ").trim();
if (!phone || !text) {
  console.error('Usage: npm run simulate -- +15551234567 "message text"');
  process.exit(1);
}

const cfg = loadConfig();
const db = new Db(cfg.dbPath);
const worker = new Worker(cfg, db);
await worker.handle({ rowid: 0, from: phone, text, at: Date.now() });

console.log(`\nConversation with ${phone}:`);
for (const m of db.recentMessages(phone, 8).slice().reverse()) {
  console.log(`  ${m.direction === "in" ? "IN " : "OUT"} [${m.kind}] ${m.text}`);
}
const person = db.getPerson(phone);
if (person) console.log(`\nProfile: name=${person.name || "-"} | conditions=${person.medical || "-"} | intake_done=${person.intake_done}`);
db.close();
console.log("\n(Open the console at http://localhost:4200 to see this in the UI.)");
