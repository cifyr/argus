import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { Db } from "../src/db.js";
import { createWebApp } from "../src/web/server.js";

describe("web api", () => {
  const db = new Db(":memory:");
  const sent: { to: string; body: string }[] = [];
  let base = "";
  let close: () => Promise<void>;

  before(async () => {
    const app = createWebApp({ db, adminToken: "admin-token-1234", sendSms: async (to, body) => { sent.push({ to, body }); } });
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((r) => server.close(() => r()));
  });
  after(async () => { await close(); db.close(); });

  const post = (path: string, body: unknown, token?: string) =>
    fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

  test("serves the app and dashboard", async () => {
    assert.match(await (await fetch(`${base}/`)).text(), /Sign in with your phone/);
    assert.match(await (await fetch(`${base}/dashboard`)).text(), /Relay dashboard/);
  });

  test("phone login: code by SMS, verify, post location, admin sees it", async () => {
    let res = await post("/api/auth/request-code", { phone: "555-123-4567" });
    assert.equal(res.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.to, "+15551234567");
    const code = sent[0]!.body.match(/\b(\d{6})\b/)![1]!;

    res = await post("/api/auth/verify", { phone: "555-123-4567", code: "000000" === code ? "111111" : "000000" });
    assert.equal(res.status, 401);
    res = await post("/api/auth/verify", { phone: "555-123-4567", code });
    assert.equal(res.status, 200);
    const { token } = (await res.json()) as { token: string };

    res = await post("/api/location", { lat: 40.1, lng: -74.2, accuracy: 9 }, token);
    assert.equal(res.status, 200);
    res = await post("/api/location", { lat: 40.1, lng: -74.2 });
    assert.equal(res.status, 401);
    res = await post("/api/location", { lat: "x" }, token);
    assert.equal(res.status, 400);

    const me = await (await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${token}` } })).json() as { phone: string; lastLocation: { lat: number } };
    assert.equal(me.phone, "+15551234567");
    assert.equal(me.lastLocation.lat, 40.1);

    assert.equal((await fetch(`${base}/api/admin/overview`)).status, 401);
    const overview = await (await fetch(`${base}/api/admin/overview`, { headers: { Authorization: "Bearer admin-token-1234" } })).json() as { users: { phone: string }[] };
    assert.equal(overview.users[0]!.phone, "+15551234567");
  });

  test("bad phone and resend throttle", async () => {
    assert.equal((await post("/api/auth/request-code", { phone: "12" })).status, 400);
    await post("/api/auth/request-code", { phone: "555-000-1111" });
    assert.equal((await post("/api/auth/request-code", { phone: "555-000-1111" })).status, 429);
  });

  test("SMS send failure is a 502 with a clear message", async () => {
    const db2 = new Db(":memory:");
    const app = createWebApp({ db: db2, adminToken: "admin-token-1234", sendSms: async () => { throw new Error("GV compose button not found"); } });
    const server = app.listen(0);
    await new Promise<void>((r) => server.once("listening", r));
    const port = (server.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/request-code`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: "555-222-3333" }) });
    assert.equal(res.status, 502);
    await new Promise<void>((r) => server.close(() => r()));
    db2.close();
  });
});
