import { DatabaseSync } from "node:sqlite";
import { logger } from "./logger.js";

export interface Person {
  phone: string; name: string; medical: string; allergies: string; medications: string;
  emergency_contact: string; notes: string; findmy_name: string;
  intake_step: number; intake_done: number; created_at: number; updated_at: number;
}
export interface Message { id: number; phone: string; direction: string; text: string; kind: string; at: number }
export interface HelpRequest {
  id: number; phone: string; text: string; at: number; status: string;
  zip: string; dispatch_agency: string; dispatch_number: string; location_note: string;
}
export interface Dispatch { zip: string; agency: string; phone: string; notes: string }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS people (
  phone TEXT PRIMARY KEY, name TEXT DEFAULT '', medical TEXT DEFAULT '', allergies TEXT DEFAULT '',
  medications TEXT DEFAULT '', emergency_contact TEXT DEFAULT '', notes TEXT DEFAULT '', findmy_name TEXT DEFAULT '',
  intake_step INTEGER DEFAULT 0, intake_done INTEGER DEFAULT 0, created_at INTEGER, updated_at INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, direction TEXT, text TEXT, kind TEXT DEFAULT 'other', at INTEGER
);
CREATE INDEX IF NOT EXISTS messages_phone ON messages(phone, at DESC);
CREATE TABLE IF NOT EXISTS help_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, text TEXT, at INTEGER, status TEXT DEFAULT 'open',
  zip TEXT DEFAULT '', dispatch_agency TEXT DEFAULT '', dispatch_number TEXT DEFAULT '', location_note TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS dispatch (zip TEXT PRIMARY KEY, agency TEXT, phone TEXT, notes TEXT DEFAULT '');
`;

export class Db {
  private db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    // node:sqlite's exec() mis-handles a multi-statement script that creates an index on a table
    // defined earlier in the same call, so run each statement on its own.
    for (const stmt of SCHEMA.split(";").map((x) => x.trim()).filter(Boolean)) this.db.exec(stmt);
    logger.info("db.open", { path });
  }
  close() { this.db.close(); }

  getPerson(phone: string): Person | null {
    return (this.db.prepare("SELECT * FROM people WHERE phone = ?").get(phone) as unknown as Person) ?? null;
  }
  listPeople(): Person[] {
    return this.db.prepare("SELECT * FROM people ORDER BY updated_at DESC").all() as unknown as Person[];
  }
  createPerson(phone: string): Person {
    const now = Date.now();
    this.db.prepare("INSERT OR IGNORE INTO people(phone, created_at, updated_at) VALUES (?, ?, ?)").run(phone, now, now);
    return this.getPerson(phone)!;
  }
  updatePerson(phone: string, patch: Partial<Person>): Person {
    const cur = this.getPerson(phone) ?? this.createPerson(phone);
    const fields: (keyof Person)[] = ["name", "medical", "allergies", "medications", "emergency_contact", "notes", "findmy_name", "intake_step", "intake_done"];
    const sets: string[] = []; const vals: unknown[] = [];
    for (const f of fields) if (f in patch) { sets.push(`${f} = ?`); vals.push((patch as Record<string, unknown>)[f]); }
    sets.push("updated_at = ?"); vals.push(Date.now());
    vals.push(phone);
    if (sets.length) this.db.prepare(`UPDATE people SET ${sets.join(", ")} WHERE phone = ?`).run(...vals as never[]);
    void cur;
    return this.getPerson(phone)!;
  }

  addMessage(phone: string, direction: "in" | "out", text: string, kind = "other"): void {
    this.db.prepare("INSERT INTO messages(phone, direction, text, kind, at) VALUES (?, ?, ?, ?, ?)").run(phone, direction, text, kind, Date.now());
  }
  recentMessages(phone: string, limit = 20): Message[] {
    return this.db.prepare("SELECT * FROM messages WHERE phone = ? ORDER BY at DESC LIMIT ?").all(phone, limit) as unknown as Message[];
  }

  openHelpRequest(phone: string, text: string): HelpRequest {
    const r = this.db.prepare("INSERT INTO help_requests(phone, text, at) VALUES (?, ?, ?)").run(phone, text, Date.now());
    return this.db.prepare("SELECT * FROM help_requests WHERE id = ?").get(r.lastInsertRowid as number) as unknown as HelpRequest;
  }
  updateHelpRequest(id: number, patch: Partial<HelpRequest>): void {
    const fields: (keyof HelpRequest)[] = ["status", "zip", "dispatch_agency", "dispatch_number", "location_note"];
    const sets: string[] = []; const vals: unknown[] = [];
    for (const f of fields) if (f in patch) { sets.push(`${f} = ?`); vals.push((patch as Record<string, unknown>)[f]); }
    if (!sets.length) return;
    vals.push(id);
    this.db.prepare(`UPDATE help_requests SET ${sets.join(", ")} WHERE id = ?`).run(...vals as never[]);
  }
  listHelpRequests(includeHandled = false): HelpRequest[] {
    const sql = includeHandled
      ? "SELECT * FROM help_requests ORDER BY at DESC LIMIT 100"
      : "SELECT * FROM help_requests WHERE status = 'open' ORDER BY at DESC LIMIT 100";
    return this.db.prepare(sql).all() as unknown as HelpRequest[];
  }

  getDispatch(zip: string): Dispatch | null {
    return (this.db.prepare("SELECT * FROM dispatch WHERE zip = ?").get(zip) as unknown as Dispatch) ?? null;
  }
  listDispatch(): Dispatch[] {
    return this.db.prepare("SELECT * FROM dispatch ORDER BY zip").all() as unknown as Dispatch[];
  }
  upsertDispatch(d: Dispatch): void {
    this.db.prepare("INSERT INTO dispatch(zip, agency, phone, notes) VALUES (?, ?, ?, ?) ON CONFLICT(zip) DO UPDATE SET agency=excluded.agency, phone=excluded.phone, notes=excluded.notes")
      .run(d.zip, d.agency, d.phone, d.notes ?? "");
  }
  deleteDispatch(zip: string): void { this.db.prepare("DELETE FROM dispatch WHERE zip = ?").run(zip); }
}
