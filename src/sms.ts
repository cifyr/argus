import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);
export const CHAT_DB = path.join(os.homedir(), "Library/Messages/chat.db");

export interface InboundText { rowid: number; from: string; text: string; at: number }

export function chatDbReadable(): boolean { return existsSync(CHAT_DB); }

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const { stdout } = await execFileAsync("sqlite3", ["-readonly", "-json", CHAT_DB, sql], { maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : [];
}

export async function currentMaxRowId(): Promise<number> {
  const rows = await query("SELECT COALESCE(MAX(ROWID),0) AS m FROM message;");
  return Number(rows[0]?.m ?? 0);
}

// New inbound (received) 1:1 texts after the watermark, with a real handle. Group chats excluded.
export async function newInboundSince(rowid: number): Promise<InboundText[]> {
  const sql = `
    SELECT m.ROWID AS rowid, h.id AS sender, m.text AS text
    FROM message m JOIN handle h ON h.ROWID = m.handle_id
    WHERE m.is_from_me = 0 AND m.ROWID > ${Number(rowid)} AND m.text IS NOT NULL AND TRIM(m.text) <> ''
    ORDER BY m.ROWID ASC LIMIT 50;`;
  const rows = await query(sql);
  return rows.map((r) => ({ rowid: Number(r.rowid), from: String(r.sender), text: String(r.text), at: Date.now() }));
}

// Send an iMessage/SMS via the Messages app. Requires Messages signed in (and SMS forwarding for non-iMessage numbers).
export async function sendSms(to: string, body: string): Promise<void> {
  logger.info("sms.send", { to, len: body.length });
  const script = `
    on run {targetNumber, msgText}
      tell application "Messages"
        try
          set svc to 1st account whose service type = iMessage
          send msgText to participant targetNumber of svc
        on error
          set smsSvc to 1st account whose service type = SMS
          send msgText to participant targetNumber of smsSvc
        end try
      end tell
    end run`;
  try {
    await execFileAsync("osascript", ["-e", script, to, body], { timeout: 15000 });
  } catch (err) {
    throw new Error(`Failed to send message to ${to}: ${(err as Error).message}`, { cause: err });
  }
}

export function messageId(from: string, text: string): string {
  return createHash("sha1").update(`${from}\n${text}`).digest("hex").slice(0, 16);
}
