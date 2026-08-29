import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { existsSync } from "node:fs";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);
const SCRIPT = path.resolve(process.cwd(), "scripts/findmy.applescript");
const TTL_MS = 3 * 60 * 1000;

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
  logger.info("desk.findmy.scan.start");
  try {
    const { stdout } = await execFileAsync("osascript", [SCRIPT], { timeout: 90_000, maxBuffer: 4 * 1024 * 1024 });
    const map = new Map<string, string>();
    for (const line of stdout.split("\n")) {
      const [name, place] = line.split("\t");
      if (name?.trim() && place?.trim() && !map.has(name.trim())) map.set(name.trim(), place.trim());
    }
    if (map.size) { cache = map; lastScan = Date.now(); }
    logger.info("desk.findmy.scan.done", { ms: Date.now() - started, friends: map.size });
  } catch (err) {
    logger.error("desk.findmy.scan.failed", { err });
  }
}

// Refreshes the cache in the background (a scan takes ~30-40s); returns immediately if fresh.
export async function refreshFindMy(force = false): Promise<void> {
  if (scanning) return scanning;
  if (!force && cache.size && Date.now() - lastScan < TTL_MS) return;
  scanning = scan().finally(() => { scanning = null; });
  return scanning;
}

export function locationForName(name: string): string | null {
  const exact = cache.get(name);
  if (exact) return exact;
  const lc = name.toLowerCase();
  for (const [n, place] of cache) if (n.toLowerCase() === lc || n.toLowerCase().startsWith(lc)) return place;
  return null;
}
