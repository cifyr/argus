import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "../db.js";
import { normalizePhone } from "../phone.js";
import { logger } from "../logger.js";

export interface WebDeps {
  db: Db;
  adminToken: string;
  sendSms(to: string, body: string): Promise<void>;
  serviceName?: string;
  gvPhoneNumber?: string;
}

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

function bearer(req: Request): string | null {
  const h = req.header("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export function createWebApp(deps: WebDeps) {
  const { db } = deps;
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use(express.static(publicDir, { extensions: ["html"] }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/config", (_req, res) => res.json({ serviceName: deps.serviceName ?? "Relay", relayNumber: deps.gvPhoneNumber ?? null }));

  app.post("/api/auth/request-code", async (req, res) => {
    const phone = normalizePhone(String(req.body?.phone ?? ""));
    if (!phone) {
      res.status(400).json({ error: "Enter a valid phone number, e.g. 555-123-4567" });
      return;
    }
    const v = db.createVerification(phone);
    if ("retryAfterMs" in v) {
      res.status(429).json({ error: `Code already sent. Try again in ${Math.ceil(v.retryAfterMs / 1000)}s` });
      return;
    }
    logger.info("auth.code_created", { phone });
    try {
      await deps.sendSms(phone, `${deps.serviceName ?? "Relay"} verification code: ${v.code}. It expires in 10 minutes.`);
      res.json({ ok: true, phone });
    } catch (err) {
      logger.error("auth.code_send_failed", { phone, err });
      res.status(502).json({ error: "Could not send the code by text. Try again in a minute." });
    }
  });

  app.post("/api/auth/verify", (req, res) => {
    const phone = normalizePhone(String(req.body?.phone ?? ""));
    const code = String(req.body?.code ?? "");
    if (!phone || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: "Phone and 6-digit code required" });
      return;
    }
    const result = db.verifyCode(phone, code);
    logger.info("auth.verify", { phone, result });
    if (result !== "ok") {
      const msg = { none: "Request a code first", expired: "Code expired, request a new one", wrong: "Wrong code", locked: "Too many attempts, request a new code" }[result];
      res.status(401).json({ error: msg });
      return;
    }
    res.json({ ok: true, token: db.createSession(phone), phone });
  });

  function requireUser(req: Request, res: Response, next: NextFunction) {
    const token = bearer(req);
    const phone = token ? db.sessionPhone(token) : null;
    if (!phone) {
      res.status(401).json({ error: "Sign in again" });
      return;
    }
    (req as Request & { phone: string }).phone = phone;
    next();
  }

  app.get("/api/me", requireUser, (req, res) => {
    const phone = (req as Request & { phone: string }).phone;
    res.json({ phone, lastLocation: db.latestLocation(phone, Number.MAX_SAFE_INTEGER) });
  });

  app.post("/api/location", requireUser, (req, res) => {
    const phone = (req as Request & { phone: string }).phone;
    const { lat, lng, accuracy } = req.body ?? {};
    if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      res.status(400).json({ error: "lat/lng required" });
      return;
    }
    db.recordLocation(phone, lat, lng, typeof accuracy === "number" ? accuracy : null);
    logger.info("location.recorded", { phone, lat, lng, accuracy });
    res.json({ ok: true, at: Date.now() });
  });

  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (bearer(req) !== deps.adminToken) {
      res.status(401).json({ error: "Bad admin token" });
      return;
    }
    next();
  }

  app.get("/api/admin/overview", requireAdmin, (_req, res) => {
    res.json({ messages: db.listMessages(100), users: db.latestLocationsForAllUsers(), now: Date.now() });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    logger.error("web.unhandled_error", { method: req.method, url: req.originalUrl, err });
    res.status(500).json({ error: "Internal error" });
  });

  return app;
}
