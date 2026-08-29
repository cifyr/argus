import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve(process.cwd(), "scripts/findmy.applescript");
const TTL_MS = 60 * 1000;

let cache = new Map<string, string>();
let lastScan = 0;
let scanning: Promise<void> | null = null;

export function findMyReady(): boolean { return existsSync(SCRIPT); }
export function findMyLastScan(): number { return lastScan; }
export function findMyFriends(): { name: string; place: string }[] {
  return [...cache].map(([name, place]) => ({ name, place }));
}

async function scan(): Promise<void> {
  if (!existsSync(SCRIPT)) return;
  const started = Date.now();
  try {
    const { stdout } = await execFileAsync("osascript", [SCRIPT], { timeout: 90000, maxBuffer: 4 * 1024 * 1024 });
    const map = new Map<string, string>();
    for (const line of stdout.split("\n")) {
      const [name, place] = line.split("\t");
      if (name?.trim() && place?.trim() && !map.has(name.trim())) map.set(name.trim(), place.trim());
    }
    if (map.size) { cache = map; lastScan = Date.now(); }
    logger.info("findmy.scan.done", { ms: Date.now() - started, friends: map.size });
  } catch (err) {
    logger.error("findmy.scan.failed", { err });
  }
}

export async function refreshFindMy(force = false): Promise<void> {
  if (scanning) return scanning;
  if (!force && cache.size && Date.now() - lastScan < TTL_MS) return;
  scanning = scan().finally(() => { scanning = null; });
  return scanning;
}

// Return the exact Find My friend name matching a (registered) person name, or null.
export function matchFriendName(name: string): string | null {
  if (!name) return null;
  const lc = name.toLowerCase().trim();
  for (const n of cache.keys()) {
    const nl = n.toLowerCase();
    if (nl === lc || nl.startsWith(lc) || lc.startsWith(nl)) return n;
  }
  return null;
}

export function locationForName(name: string): string | null {
  if (!name) return null;
  const exact = cache.get(name);
  if (exact) return exact;
  const lc = name.toLowerCase();
  for (const [n, place] of cache) if (n.toLowerCase() === lc || n.toLowerCase().startsWith(lc)) return place;
  return null;
}
