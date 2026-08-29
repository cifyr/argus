import { test } from "node:test";
import assert from "node:assert/strict";
import { Db } from "../src/db.js";

test("verification flow: code, wrong attempts, success creates user and session", () => {
  const db = new Db(":memory:");
  const v = db.createVerification("+15551234567");
  assert.ok("code" in v && /^\d{6}$/.test(v.code));
  assert.equal(db.verifyCode("+15551234567", "000000"), (v as { code: string }).code === "000000" ? "ok" : "wrong");
  assert.equal(db.verifyCode("+15559999999", "123456"), "none");
  assert.equal(db.verifyCode("+15551234567", (v as { code: string }).code), "ok");
  const token = db.createSession("+15551234567");
  assert.equal(db.sessionPhone(token), "+15551234567");
  assert.equal(db.sessionPhone("bogus"), null);
  db.close();
});

test("resend is throttled", () => {
  const db = new Db(":memory:");
  db.createVerification("+15551234567");
  const again = db.createVerification("+15551234567");
  assert.ok("retryAfterMs" in again && again.retryAfterMs > 0);
  db.close();
});

test("latest location respects max age and per-user summary", () => {
  const db = new Db(":memory:");
  db.recordLocation("+15551234567", 40.1, -74.2, 12);
  db.recordLocation("+15551234567", 40.2, -74.3, 8);
  db.recordLocation("+15550000000", 41, -75, null);
  const latest = db.latestLocation("+15551234567", 60_000);
  assert.equal(latest?.lat, 40.2);
  db.recordLocation("+15559990000", 1, 1, null, Date.now() - 120_000);
  assert.equal(db.latestLocation("+15559990000", 60_000), null);
  assert.equal(db.latestLocation("+15559990000", 180_000)?.lat, 1);
  const all = db.latestLocationsForAllUsers();
  assert.equal(all.length, 3);
  assert.equal(all.find((r) => r.phone === "+15551234567")?.lat, 40.2);
  db.close();
});

test("messages dedupe and track status", () => {
  const db = new Db(":memory:");
  assert.equal(db.insertMessageIfNew({ id: "m1", sender: "+1", text: "hi", receivedAt: 1 }), true);
  assert.equal(db.insertMessageIfNew({ id: "m1", sender: "+1", text: "hi", receivedAt: 1 }), false);
  assert.ok(db.hasMessage("m1"));
  db.setMessageLocation("m1", { lat: 1, lng: 2, address: "Somewhere", at: 5 });
  db.setMessageStatus("m1", "calling", { callStartedAt: 10 });
  db.setMessageStatus("m1", "completed", { callEndedAt: 20 });
  const [m] = db.listMessages();
  assert.equal(m!.status, "completed");
  assert.equal(m!.call_started_at, 10);
  assert.equal(m!.call_ended_at, 20);
  assert.equal(m!.address, "Somewhere");
  db.close();
});
