import path from "node:path";
import { existsSync } from "node:fs";
import { Db } from "../db.js";
import { nominatimGeocoder } from "../geocode.js";
import { logger } from "../logger.js";

// Looks up a texter's most recent shared location from the companion app's database (relay.sqlite),
// keyed by phone number. Returns a spoken location string, or null if they've never shared / it's stale.
export async function locationForSender(sender: string, maxAgeMs = 24 * 60 * 60 * 1000): Promise<string | null> {
  const dbPath = path.resolve(process.cwd(), process.env.DB_PATH?.trim() || "relay.sqlite");
  if (!existsSync(dbPath)) return null;
  const digits = sender.replace(/\D/g, "");
  const e164 = digits.length === 10 ? `+1${digits}` : digits.startsWith("+") ? sender : `+${digits}`;
  let db: Db | undefined;
  try {
    db = new Db(dbPath);
    const loc = db.latestLocation(e164, maxAgeMs);
    if (!loc) { logger.info("desk.location.none", { sender: e164 }); return null; }
    const address = await nominatimGeocoder(loc.lat, loc.lng);
    const ageMin = Math.round((Date.now() - loc.recorded_at) / 60000);
    const where = address ?? `latitude ${loc.lat.toFixed(4)}, longitude ${loc.lng.toFixed(4)}`;
    logger.info("desk.location.found", { sender: e164, address, ageMin });
    return `${where} (as of about ${ageMin} minutes ago)`;
  } catch (err) {
    logger.error("desk.location.lookup_failed", { sender, err });
    return null;
  } finally {
    db?.close();
  }
}
