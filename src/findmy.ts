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

const UA = "Guardian911/0.1 (personal emergency tool)";
const CHAINS = /\b(qdoba|subway|starbucks|mcdonald|chipotle|panera|chick-fil-a|dominos?|taco bell|fedex|ups store|walgreens|cvs|dunkin|wendy|burger king|7-eleven)\b/i;
const geoCache = new Map<string, { address: string; zip: string; lat: number; lon: number; mapsUrl: string } | null>();

// Turn a "A; B; C" landmark string into a real street address by geocoding the nearest
// distinctive (non-chain) landmark. Cached per landmark string so polling stays fast.
export async function addressForLandmarks(landmarks: string): Promise<{ address: string; zip: string; lat: number; lon: number; mapsUrl: string } | null> {
  if (!landmarks) return null;
  if (geoCache.has(landmarks)) return geoCache.get(landmarks)!;
  const parts = landmarks.split(";").map((x) => x.trim()).filter(Boolean);
  // Try distinctive landmarks first, then chains, until one geocodes to a real address.
  const ordered = [...parts.filter((p) => !CHAINS.test(p)), ...parts.filter((p) => CHAINS.test(p))];
  for (const target of ordered) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(target)}&countrycodes=us&format=jsonv2&addressdetails=1&limit=1`;
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
      if (!res.ok) continue;
      const arr = (await res.json()) as { lat: string; lon: string; address?: Record<string, string> }[];
      if (!arr.length) continue;
      const a = arr[0]!;
      const ad = a.address ?? {};
      const street = [ad.house_number, ad.road].filter(Boolean).join(" ");
      const address = [
        street || ad.building || target,
        ad.city || ad.town || ad.village || ad.suburb,
        [ad.state, ad.postcode].filter(Boolean).join(" "),
      ].filter(Boolean).join(", ");
      const result = { address, zip: ad.postcode ?? "", lat: Number(a.lat), lon: Number(a.lon), mapsUrl: `https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lon}` };
      geoCache.set(landmarks, result);
      logger.info("findmy.geocoded", { target, address });
      return result;
    } catch (err) {
      logger.warn("findmy.geocode_try_failed", { target, err: (err as Error).message });
    }
  }
  geoCache.set(landmarks, null);
  return null;
}
