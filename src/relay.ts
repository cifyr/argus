import type { Config } from "./config.js";
import type { Db } from "./db.js";
import type { Geocoder } from "./geocode.js";
import type { LocationInfo, ScriptGenerator } from "./script.js";
import type { Synthesizer } from "./tts.js";
import type { CallResult } from "./gv/caller.js";
import type { InboundSms } from "./gv/inbox.js";
import { logger } from "./logger.js";

export interface RelayDeps {
  config: Pick<Config, "targetPhoneNumber" | "locationMaxAgeMs" | "callAnswerTimeoutMs" | "callRepeat">;
  db: Db;
  generateScript: ScriptGenerator;
  synthesize: Synthesizer;
  geocode: Geocoder;
  placeCall(to: string, wav: Buffer): Promise<CallResult>;
}

export async function relayMessage(deps: RelayDeps, msg: InboundSms): Promise<CallResult | null> {
  const { db, config } = deps;
  if (!db.insertMessageIfNew({ id: msg.id, sender: msg.from, text: msg.text, receivedAt: msg.receivedAt })) {
    logger.info("relay.duplicate_skipped", { id: msg.id, from: msg.from });
    return null;
  }
  logger.info("relay.start", { id: msg.id, from: msg.from, textLength: msg.text.length });

  let location: LocationInfo | null = null;
  const loc = db.latestLocation(msg.from, config.locationMaxAgeMs);
  if (loc) {
    const address = await deps.geocode(loc.lat, loc.lng);
    location = { lat: loc.lat, lng: loc.lng, address, ageMinutes: (Date.now() - loc.recorded_at) / 60_000 };
    db.setMessageLocation(msg.id, { lat: loc.lat, lng: loc.lng, address, at: loc.recorded_at });
    logger.info("relay.location", { id: msg.id, from: msg.from, address, ageMinutes: Math.round(location.ageMinutes) });
  } else {
    logger.info("relay.no_location", { id: msg.id, from: msg.from });
  }

  try {
    const script = await deps.generateScript(msg.text, msg.from, location);
    const clip = await deps.synthesize(script);
    db.setMessageStatus(msg.id, "calling", { callStartedAt: Date.now() });
    const result = await deps.placeCall(config.targetPhoneNumber, clip.wav);
    db.setMessageStatus(msg.id, result.outcome, { callStartedAt: result.startedAt, callEndedAt: result.endedAt, error: result.outcome === "failed" ? result.detail : undefined });
    logger.info("relay.done", { id: msg.id, outcome: result.outcome, detail: result.detail });
    return result;
  } catch (err) {
    logger.error("relay.failed", { id: msg.id, from: msg.from, err });
    db.setMessageStatus(msg.id, "failed", { error: (err as Error).message, callEndedAt: Date.now() });
    return { outcome: "failed", startedAt: Date.now(), endedAt: Date.now(), detail: (err as Error).message };
  }
}
