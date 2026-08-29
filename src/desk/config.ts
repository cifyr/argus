import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { logger } from "../logger.js";

export interface DeskSettings {
  enabled: boolean;
  callNumber: string;          // who to call, E.164
  callName: string;            // label for the UI
  allowedSenders: string[];    // if non-empty, only these senders trigger (E.164 or contains-match)
  voice: string;               // kokoro voice id
  ollamaModel: string;
  ttsEngine: "kokoro" | "say";
  pollMs: number;
  connectDelayMs: number;      // wait after dialing before speaking
  maxPerHour: number;          // safety rate limit
  repeat: number;              // times to speak the message
  findMyEnabled: boolean;
  senderNames: Record<string, string>;  // phone (last 10 digits ok) -> Find My friend name
}

const FILE = path.resolve(process.cwd(), "desk-config.json");

const DEFAULTS: DeskSettings = {
  enabled: false,
  callNumber: "",
  callName: "",
  allowedSenders: [],
  voice: "af_heart",
  ollamaModel: "gemma2:2b",
  ttsEngine: "kokoro",
  pollMs: 4000,
  connectDelayMs: 7000,
  maxPerHour: 20,
  repeat: 2,
  findMyEnabled: true,
  senderNames: {},
};

export function loadSettings(): DeskSettings {
  if (!existsSync(FILE)) return { ...DEFAULTS };
  try {
    return { ...DEFAULTS, ...JSON.parse(readFileSync(FILE, "utf8")) };
  } catch (err) {
    logger.error("desk.config.read_failed, using defaults", { err });
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: DeskSettings): void {
  writeFileSync(FILE, JSON.stringify(s, null, 2));
  logger.info("desk.config.saved", { enabled: s.enabled, callNumber: mask(s.callNumber), voice: s.voice });
}

export function mask(n: string): string {
  return n && n.length > 4 ? `${"*".repeat(n.length - 4)}${n.slice(-4)}` : n || "(unset)";
}
