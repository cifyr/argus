import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";

export interface Person { phone: string; name: string; notes: string; updatedAt: number }

const FILE = path.resolve(process.cwd(), "desk-people.json");

function key(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d;
}

function load(): Record<string, Person> {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(readFileSync(FILE, "utf8")); }
  catch (err) { logger.error("desk.people.read_failed", { err }); return {}; }
}

function save(all: Record<string, Person>): void {
  writeFileSync(FILE, JSON.stringify(all, null, 2));
}

export function getPerson(phone: string): Person | null {
  return load()[key(phone)] ?? null;
}

export function listPeople(): Person[] {
  return Object.values(load()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function upsertPerson(phone: string, patch: Partial<Pick<Person, "name" | "notes">>): Person {
  const all = load();
  const k = key(phone);
  const prev = all[k] ?? { phone, name: "", notes: "", updatedAt: 0 };
  const next: Person = { ...prev, phone: prev.phone || phone, ...patch, updatedAt: Date.now() };
  all[k] = next;
  save(all);
  logger.info("desk.people.upsert", { phone, name: next.name, notesLen: next.notes.length });
  return next;
}

export function deletePerson(phone: string): void {
  const all = load();
  delete all[key(phone)];
  save(all);
}

// Merge an incoming detail text into a person's profile: pull a name if stated, append the detail to notes.
export function rememberDetail(phone: string, detail: string): Person {
  const existing = getPerson(phone);
  const nameMatch = detail.match(/\b(?:my name is|i am|i'm|this is|name:)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/i);
  const name = existing?.name || (nameMatch ? nameMatch[1]!.trim() : "");
  const stamp = new Date().toLocaleString();
  const notes = [existing?.notes?.trim(), `${detail.trim()} (${stamp})`].filter(Boolean).join("\n");
  return upsertPerson(phone, { name, notes });
}
