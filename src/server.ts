import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { sendSms, chatDbReadable } from "./sms.js";
import { ollamaReady } from "./ollama.js";
import { findMyReady, findMyFriends, findMyLastScan, refreshFindMy, locationForName } from "./findmy.js";
import { dispatchNearZip } from "./dispatch.js";
import { logger } from "./logger.js";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");

export function createServer(config: Config, db: Db) {
  const app = express();
  app.use(express.json({ limit: "128kb" }));

  function auth(req: Request, res: Response, next: NextFunction) {
    if (!config.operatorToken) return next();
    const t = req.header("authorization")?.replace("Bearer ", "") || req.query.token;
    if (t !== config.operatorToken) { res.status(401).json({ error: "bad token" }); return; }
    next();
  }

  app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

  app.get("/api/status", auth, async (_req, res) => {
    const ollama = await ollamaReady(config.ollamaModel);
    res.json({
      serviceName: config.serviceName,
      readiness: { ollama: ollama.up, model: ollama.hasModel, messages: chatDbReadable(), findMy: findMyReady() },
      findMy: { friends: findMyFriends(), lastScan: findMyLastScan() },
    });
  });

  app.get("/api/help", auth, (req, res) => {
    const includeHandled = req.query.all === "1";
    const requests = db.listHelpRequests(includeHandled).map((r) => {
      const person = db.getPerson(r.phone);
      const fmLoc = person?.findmy_name ? locationForName(person.findmy_name) : null;
      return { ...r, person, findMyLocation: fmLoc, messages: db.recentMessages(r.phone, 8) };
    });
    res.json({ requests });
  });

  app.post("/api/help/:id", auth, (req, res) => {
    const id = Number(req.params.id);
    const patch: Record<string, unknown> = {};
    for (const k of ["status", "zip", "dispatch_agency", "dispatch_number", "location_note"]) if (k in req.body) patch[k] = req.body[k];
    db.updateHelpRequest(id, patch as never);
    res.json({ ok: true });
  });

  app.get("/api/people", auth, (_req, res) => res.json({ people: db.listPeople() }));
  app.post("/api/people/:phone", auth, (req, res) => {
    const patch: Record<string, unknown> = {};
    for (const k of ["name", "medical", "allergies", "medications", "emergency_contact", "notes", "findmy_name"]) if (k in req.body) patch[k] = req.body[k];
    res.json({ person: db.updatePerson(String(req.params.phone), patch as never) });
  });

  app.get("/api/dispatch", auth, async (req, res) => {
    const zip = String(req.query.zip ?? "").trim();
    if (!zip) { res.json({ all: db.listDispatch() }); return; }
    const saved = db.getDispatch(zip);
    let live: Awaited<ReturnType<typeof dispatchNearZip>> = null;
    if (req.query.live === "1") {
      try { live = await dispatchNearZip(zip); }
      catch (err) { logger.warn("server.dispatch_live_failed", { zip, err: (err as Error).message }); }
    }
    res.json({ match: saved, live, all: db.listDispatch() });
  });
  app.post("/api/dispatch", auth, (req, res) => {
    const { zip, agency, phone, notes } = req.body ?? {};
    if (!zip || !phone) { res.status(400).json({ error: "zip and phone required" }); return; }
    db.upsertDispatch({ zip: String(zip), agency: String(agency ?? ""), phone: String(phone), notes: String(notes ?? "") });
    res.json({ ok: true, all: db.listDispatch() });
  });
  app.post("/api/dispatch/delete", auth, (req, res) => { db.deleteDispatch(String(req.body?.zip ?? "")); res.json({ ok: true }); });

  app.post("/api/send", auth, async (req, res) => {
    const { to, text } = req.body ?? {};
    if (!to || !text) { res.status(400).json({ error: "to and text required" }); return; }
    try { await sendSms(String(to), String(text)); db.addMessage(String(to), "out", String(text), "operator"); res.json({ ok: true }); }
    catch (err) { logger.error("server.send_failed", { err }); res.status(502).json({ error: (err as Error).message }); }
  });

  app.post("/api/findmy/refresh", auth, async (_req, res) => {
    await refreshFindMy(true);
    res.json({ friends: findMyFriends(), lastScan: findMyLastScan() });
  });

  return app;
}
