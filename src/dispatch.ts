import type { Db } from "./db.js";
import { logger } from "./logger.js";

const UA = "Argus911/0.1 (personal emergency dispatch tool)";

export interface DispatchCandidate { agency: string; phone: string; address: string; distanceKm: number; source: string }

// Turn a US ZIP into a lat/lng via OpenStreetMap Nominatim.
async function geocodeZip(zip: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(zip)}&country=us&format=jsonv2&limit=1`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const arr = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  if (!arr.length) return null;
  return { lat: Number(arr[0]!.lat), lon: Number(arr[0]!.lon), label: arr[0]!.display_name };
}

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

// Query OpenStreetMap (Overpass) for police stations near a point; return those with a phone, nearest first.
export async function dispatchNearZip(zip: string, radiusKm = 8): Promise<{ zipLabel: string; candidates: DispatchCandidate[] } | null> {
  const geo = await geocodeZip(zip);
  if (!geo) { logger.warn("dispatch.zip_not_found", { zip }); return null; }
  const r = Math.round(radiusKm * 1000);
  const q = `[out:json][timeout:25];(node["amenity"="police"](around:${r},${geo.lat},${geo.lon});way["amenity"="police"](around:${r},${geo.lat},${geo.lon}););out center tags;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) { logger.warn("dispatch.overpass_error", { status: res.status }); return { zipLabel: geo.label, candidates: [] }; }
  const data = (await res.json()) as { elements: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
  const candidates: DispatchCandidate[] = [];
  for (const e of data.elements ?? []) {
    const t = e.tags ?? {};
    const phone = (t.phone || t["contact:phone"] || t["emergency:phone"] || "").replace(/\s+/g, "");
    if (!phone) continue;
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    const address = [t["addr:housenumber"], t["addr:street"], t["addr:city"]].filter(Boolean).join(" ");
    candidates.push({
      agency: t.name || "Police",
      phone,
      address,
      distanceKm: lat && lon ? haversineKm(geo.lat, geo.lon, lat, lon) : 999,
      source: "OpenStreetMap",
    });
  }
  candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  logger.info("dispatch.lookup", { zip, found: candidates.length });
  return { zipLabel: geo.label, candidates };
}

// Only a universal fallback is seeded; real numbers come from the open-source ZIP lookup on demand.
export function seedDispatch(db: Db): void {
  if (db.listDispatch().length > 0) return;
  db.upsertDispatch({ zip: "00000", agency: "Emergency (fallback)", phone: "911", notes: "Universal emergency number" });
}
