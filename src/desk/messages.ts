import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);
export const CHAT_DB = path.join(os.homedir(), "Library/Messages/chat.db");

export interface InboundText { rowid: number; sender: string; text: string; service: string }

export function chatDbReadable(): boolean {
  return existsSync(CHAT_DB);
}

async function query(sql: string): Promise<any[]> {
  // Read-only so we never lock the live Messages database.
  const { stdout } = await execFileAsync("sqlite3", ["-readonly", "-json", CHAT_DB, sql], { maxBuffer: 8 * 1024 * 1024 });
  return stdout.trim() ? JSON.parse(stdout) : [];
}

export async function currentMaxRowId(): Promise<number> {
  const rows = await query("SELECT COALESCE(MAX(ROWID),0) AS m FROM message;");
  return rows[0]?.m ?? 0;
}

// New inbound (received) messages with a numeric/email handle, after the watermark. Group chats excluded for MVP.
export async function newInboundSince(rowid: number): Promise<InboundText[]> {
  const sql = `
    SELECT m.ROWID AS rowid, h.id AS sender, m.text AS text,
           CASE WHEN m.service='iMessage' THEN 'iMessage' ELSE 'SMS' END AS service
    FROM message m JOIN handle h ON h.ROWID = m.handle_id
    WHERE m.is_from_me = 0 AND m.ROWID > ${Number(rowid)} AND m.text IS NOT NULL AND TRIM(m.text) <> ''
    ORDER BY m.ROWID ASC LIMIT 50;`;
  try {
    return (await query(sql)) as InboundText[];
  } catch (err) {
    logger.error("desk.messages.query_failed", { err });
    throw new Error(`Reading Messages database failed (grant Full Disk Access to your terminal): ${(err as Error).message}`, { cause: err });
  }
}
