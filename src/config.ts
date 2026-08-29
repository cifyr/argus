import "dotenv/config";
import path from "node:path";

export interface Config {
  targetPhoneNumber: string;
  gvPhoneNumber: string | undefined;
  publicBaseUrl: string;
  port: number;
  adminToken: string;
  anthropicApiKey: string | undefined;
  anthropicModel: string;
  ttsVoice: string;
  profileDir: string;
  headless: boolean;
  pollIntervalMs: number;
  callAnswerTimeoutMs: number;
  callRepeat: number;
  dbPath: string;
  locationMaxAgeMs: number;
  relaySpam: boolean;
  relayPreexisting: boolean;
}

const E164 = /^\+[1-9]\d{6,14}$/;

export function loadConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): Config {
  const missing = ["TARGET_PHONE_NUMBER", "ADMIN_TOKEN"].filter((k) => !env[k]?.trim());
  if (missing.length) throw new Error(`Missing required env vars: ${missing.join(", ")} (see .env.example)`);
  if (!E164.test(env.TARGET_PHONE_NUMBER!)) {
    throw new Error(`TARGET_PHONE_NUMBER must be E.164 (e.g. +15551234567), got "${env.TARGET_PHONE_NUMBER}"`);
  }
  if (env.ADMIN_TOKEN!.trim().length < 12) throw new Error("ADMIN_TOKEN must be at least 12 characters");
  const port = Number(env.PORT) || 3000;
  const publicBaseUrl = (env.PUBLIC_BASE_URL?.trim() || `http://localhost:${port}`).replace(/\/+$/, "");
  if (!/^https?:\/\//.test(publicBaseUrl)) throw new Error(`PUBLIC_BASE_URL must start with http(s)://, got "${publicBaseUrl}"`);

  return {
    targetPhoneNumber: env.TARGET_PHONE_NUMBER!,
    gvPhoneNumber: env.GV_PHONE_NUMBER?.trim() || undefined,
    publicBaseUrl,
    port,
    adminToken: env.ADMIN_TOKEN!.trim(),
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel: env.ANTHROPIC_MODEL?.trim() || "claude-opus-5",
    ttsVoice: env.TTS_VOICE?.trim() || "Samantha",
    profileDir: path.resolve(cwd, env.CHROME_PROFILE_DIR?.trim() || ".chrome-profile"),
    headless: env.HEADLESS === "true",
    pollIntervalMs: Number(env.POLL_INTERVAL_MS) || 4000,
    callAnswerTimeoutMs: Number(env.CALL_ANSWER_TIMEOUT_MS) || 45_000,
    callRepeat: Number(env.CALL_REPEAT) || 2,
    dbPath: path.resolve(cwd, env.DB_PATH?.trim() || "relay.sqlite"),
    locationMaxAgeMs: Number(env.LOCATION_MAX_AGE_MS) || 24 * 60 * 60 * 1000,
    relaySpam: env.RELAY_SPAM === "true",
    relayPreexisting: env.RELAY_PREEXISTING === "true",
  };
}
