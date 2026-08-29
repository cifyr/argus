import { test } from "node:test";
import assert from "node:assert/strict";
import { Db } from "../src/db.js";
import { relayMessage, type RelayDeps } from "../src/relay.js";
import type { CallResult } from "../src/gv/caller.js";

function deps(db: Db, overrides: Partial<RelayDeps> = {}) {
  const calls: { to: string; wav: Buffer }[] = [];
  const d: RelayDeps & { calls: typeof calls } = {
    calls,
    config: { targetPhoneNumber: "+15550000001", locationMaxAgeMs: 60_000, callAnswerTimeoutMs: 1000, callRepeat: 1 },
    db,
    generateScript: async (text, from, loc) => `SCRIPT ${from}: ${text}${loc ? ` @ ${loc.address ?? "coords"}` : ""}`,
    synthesize: async (script) => ({ wav: Buffer.from(script), durationMs: 1000 }),
    geocode: async () => "12 Main St",
    placeCall: async (to, wav) => { calls.push({ to, wav }); return { outcome: "completed", startedAt: 1, endedAt: 2, detail: "ok" } as CallResult; },
    ...overrides,
  };
  return d;
}

const msg = { id: "m1", from: "+15551234567", text: "help me", receivedAt: Date.now(), threadLabel: "" };

test("relays a message with the sender's last location into the call", async () => {
  const db = new Db(":memory:");
  db.recordLocation("+15551234567", 40.1, -74.2, 5);
  const d = deps(db);
  const result = await relayMessage(d, msg);
  assert.equal(result?.outcome, "completed");
  assert.equal(d.calls.length, 1);
  assert.equal(d.calls[0]!.to, "+15550000001");
  assert.equal(d.calls[0]!.wav.toString(), "SCRIPT +15551234567: help me @ 12 Main St");
  const [row] = db.listMessages();
  assert.equal(row!.status, "completed");
  assert.equal(row!.address, "12 Main St");
});

test("no location for unknown senders", async () => {
  const db = new Db(":memory:");
  const d = deps(db);
  await relayMessage(d, msg);
  assert.equal(d.calls[0]!.wav.toString(), "SCRIPT +15551234567: help me");
  assert.equal(db.listMessages()[0]!.lat, null);
});

test("duplicate messages are not relayed twice", async () => {
  const db = new Db(":memory:");
  const d = deps(db);
  await relayMessage(d, msg);
  assert.equal(await relayMessage(d, msg), null);
  assert.equal(d.calls.length, 1);
});

test("call failures are recorded, not thrown", async () => {
  const db = new Db(":memory:");
  const d = deps(db, { placeCall: async () => { throw new Error("dial pad not found"); } });
  const result = await relayMessage(d, msg);
  assert.equal(result?.outcome, "failed");
  const [row] = db.listMessages();
  assert.equal(row!.status, "failed");
  assert.match(row!.error!, /dial pad not found/);
});
