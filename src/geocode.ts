import { logger } from "./logger.js";

export interface Geocoder { (lat: number, lng: number): Promise<string | null> }

// OpenStreetMap Nominatim: free, needs a descriptive User-Agent, max 1 req/s.
export const nominatimGeocoder: Geocoder = async (lat, lng) => {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "text-to-call-relay/0.1 (personal project)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      logger.warn("geocode.http_error", { status: res.status, lat, lng });
      return null;
    }
    const json = (await res.json()) as { display_name?: string };
    logger.info("geocode.done", { lat, lng, address: json.display_name });
    return json.display_name ?? null;
  } catch (err) {
    logger.warn("geocode.failed", { lat, lng, err: (err as Error).message });
    return null;
  }
};
