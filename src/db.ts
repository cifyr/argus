import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomInt } from "node:crypto";
import { logger } from "./logger.js";

export interface LocationRow { phone: string; lat: number; lng: number; accuracy: number | null; recorded_at: number }
export interface MessageRow {
  id: string; sender: string; text: string; received_at: number;
  status: string; error: string | null; call_started_at: number | null; call_ended_at: number | null;
  lat: number | null; lng: number | null; address: string | null; location_at: number | null;
}
export type MessageStatus = "received" | "calling" | "completed" | "no-answer" | "failed" | "dry-run" | "preexisting";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (phone TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS verifications (phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, sent_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, phone TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, accuracy REAL, recorded_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS locations_phone_time ON locations(phone, recorded_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, sender TEXT NOT NULL, text TEXT NOT NULL, received_at INTEGER NOT NULL,
  status TEXT NOT NULL, error TEXT, call_started_at INTEGER, call_ended_at INTEGER,
  lat REAL, lng REAL, address TEXT, location_at INTEGER
);
`;

export class Db {
  private db: DatabaseSync;

  constructor(pathOrMemory: string) {
    this.db = new DatabaseSync(pathOrMemory);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(SCHEMA);
    logger.info("db.open", { path: pathOrMemory });
  }

  close() { this.db.close(); }

  // --- users / auth ---
  upsertUser(phone: string) {
    this.db.prepare("INSERT OR IGNORE INTO users(phone, created_at) VALUES (?, ?)").run(phone, Date.now());
  }

  createVerification(phone: string, ttlMs = 10 * 60 * 1000, minResendMs = 45_000): { code: string } | { retryAfterMs: number } {
    const existing = this.db.prepare("SELECT sent_at FROM verifications WHERE phone = ?").get(phone) as { sent_at: number } | undefined;
    if (existing && Date.now() - existing.sent_at < minResendMs) return { retryAfterMs: minResendMs - (Date.now() - existing.sent_at) };
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.db.prepare("INSERT OR REPLACE INTO verifications(phone, code, expires_at, attempts, sent_at) VALUES (?, ?, ?, 0, ?)")
      .run(phone, code, Date.now() + ttlMs, Date.now());
    return { code };
  }

  verifyCode(phone: string, code: string): "ok" | "expired" | "wrong" | "none" | "locked" {
    const row = this.db.prepare("SELECT code, expires_at, attempts FROM verifications WHERE phone = ?").get(phone) as
      { code: string; expires_at: number; attempts: number } | undefined;
    if (!row) return "none";
    if (row.attempts >= 5) return "locked";
    if (Date.now() > row.expires_at) return "expired";
    if (row.code !== code.trim()) {
      this.db.prepare("UPDATE verifications SET attempts = attempts + 1 WHERE phone = ?").run(phone);
      return "wrong";
    }
    this.db.prepare("DELETE FROM verifications WHERE phone = ?").run(phone);
    this.upsertUser(phone);
    return "ok";
  }

  createSession(phone: string): string {
    const token = randomBytes(24).toString("base64url");
    this.db.prepare("INSERT INTO sessions(token, phone, created_at) VALUES (?, ?, ?)").run(token, phone, Date.now());
    return token;
  }

  sessionPhone(token: string): string | null {
    const row = this.db.prepare("SELECT phone FROM sessions WHERE token = ?").get(token) as { phone: string } | undefined;
    return row?.phone ?? null;
  }

  // --- locations ---
  recordLocation(phone: string, lat: number, lng: number, accuracy: number | null, recordedAt = Date.now()) {
    this.db.prepare("INSERT INTO locations(phone, lat, lng, accuracy, recorded_at) VALUES (?, ?, ?, ?, ?)").run(phone, lat, lng, accuracy, recordedAt);
  }

  latestLocation(phone: string, maxAgeMs: number): LocationRow | null {
    const row = this.db.prepare("SELECT phone, lat, lng, accuracy, recorded_at FROM locations WHERE phone = ? AND recorded_at >= ? ORDER BY recorded_at DESC, id DESC LIMIT 1")
      .get(phone, Date.now() - maxAgeMs) as LocationRow | undefined;
    return row ?? null;
  }

  latestLocationsForAllUsers(): LocationRow[] {
    return this.db.prepare(`
      SELECT l.phone, l.lat, l.lng, l.accuracy, l.recorded_at FROM locations l
      JOIN (SELECT phone, MAX(id) AS id FROM locations GROUP BY phone) m ON m.id = l.id
      ORDER BY l.recorded_at DESC`).all() as unknown as LocationRow[];
  }

  // --- messages ---
  insertMessageIfNew(msg: { id: string; sender: string; text: string; receivedAt: number }, status: MessageStatus = "received"): boolean {
    const r = this.db.prepare("INSERT OR IGNORE INTO messages(id, sender, text, received_at, status) VALUES (?, ?, ?, ?, ?)")
      .run(msg.id, msg.sender, msg.text, msg.receivedAt, status);
    return r.changes > 0;
  }

  hasMessage(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM messages WHERE id = ?").get(id));
  }

  setMessageLocation(id: string, loc: { lat: number; lng: number; address: string | null; at: number }) {
    this.db.prepare("UPDATE messages SET lat = ?, lng = ?, address = ?, location_at = ? WHERE id = ?").run(loc.lat, loc.lng, loc.address, loc.at, id);
  }

  setMessageStatus(id: string, status: MessageStatus, extra: { error?: string; callStartedAt?: number; callEndedAt?: number } = {}) {
    this.db.prepare(`UPDATE messages SET status = ?, error = COALESCE(?, error),
      call_started_at = COALESCE(?, call_started_at), call_ended_at = COALESCE(?, call_ended_at) WHERE id = ?`)
      .run(status, extra.error ?? null, extra.callStartedAt ?? null, extra.callEndedAt ?? null, id);
  }

  listMessages(limit = 100): MessageRow[] {
    return this.db.prepare("SELECT * FROM messages ORDER BY received_at DESC LIMIT ?").all(limit) as unknown as MessageRow[];
  }
}
