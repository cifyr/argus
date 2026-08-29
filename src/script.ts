import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";

export interface LocationInfo { lat: number; lng: number; address: string | null; ageMinutes: number }

// Read digits individually with pauses so TTS doesn't say "five billion..."
export function spokenPhoneNumber(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length === 10) {
    return `${national.slice(0, 3).split("").join(" ")}, ${national.slice(3, 6).split("").join(" ")}, ${national.slice(6).split("").join(" ")}`;
  }
  return national.split("").join(" ");
}

export function spokenLocation(loc: LocationInfo): string {
  const age = loc.ageMinutes < 1 ? "less than a minute ago" : loc.ageMinutes === 1 ? "one minute ago" : `${Math.round(loc.ageMinutes)} minutes ago`;
  const where = loc.address ?? `latitude ${loc.lat.toFixed(4)}, longitude ${loc.lng.toFixed(4)}`;
  return `Their last known location, from ${age}, is approximately ${where}.`;
}

export function templateScript(text: string, from: string, location?: LocationInfo | null): string {
  return (
    `Hello. This is an automated call relaying a text message from the number ${spokenPhoneNumber(from)}. ` +
    `The message says: ${text.trim()}` +
    (location ? ` ${spokenLocation(location)}` : "")
  );
}

const SYSTEM_PROMPT = `You turn an incoming SMS into a short script that a text-to-speech voice will read aloud over a phone call to the recipient.

The call is a relay: the sender texted a number and could not call directly, so an automated voice is calling on their behalf.

Write the exact words the voice should say, and nothing else. Requirements:
- Open by saying this is an automated call relaying a text message from the sender's number (read the number as spoken digits, exactly as provided).
- Then convey the message faithfully in natural spoken English. Expand abbreviations and texting shorthand, fix obvious typos, and drop emoji. Do not add, invent, soften, or omit any information.
- If the message contains phone numbers, addresses, codes, or times, read them clearly (digits spaced out, dates and times in words).
- Keep the message content as close to the sender's own words as possible. Quote it if it is short.
- If a last-known location is provided, end by stating it in one sentence, including how old it is.
- Plain prose only: no markdown, no stage directions, no headers, no SSML.`;

export interface ScriptGenerator {
  (text: string, from: string, location?: LocationInfo | null): Promise<string>;
}

export function createClaudeScriptGenerator(opts: { apiKey: string; model: string; timeoutMs?: number }): ScriptGenerator {
  const client = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeoutMs ?? 15_000, maxRetries: 1 });

  return async function generateScript(text, from, location) {
    const fallback = templateScript(text, from, location);
    const started = Date.now();
    logger.info("script.generate.start", { model: opts.model, from, textLength: text.length, hasLocation: Boolean(location) });
    try {
      const response = await client.beta.messages.create({
        model: opts.model,
        max_tokens: 1024,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content:
              `Sender number, as it should be spoken: ${spokenPhoneNumber(from)}\n\nSMS text:\n"""\n${text}\n"""` +
              (location ? `\n\nLast known location of the sender: ${spokenLocation(location)}` : ""),
          },
        ],
      });
      if (response.stop_reason === "refusal") {
        logger.warn("script.generate.refused, using template", { from, stopDetails: response.stop_details });
        return fallback;
      }
      const script = response.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!script) {
        logger.warn("script.generate.empty, using template", { from, stopReason: response.stop_reason });
        return fallback;
      }
      logger.info("script.generate.done", {
        ms: Date.now() - started,
        servedBy: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        scriptLength: script.length,
      });
      return script;
    } catch (err) {
      const kind =
        err instanceof Anthropic.AuthenticationError ? "auth" :
        err instanceof Anthropic.RateLimitError ? "rate_limit" :
        err instanceof Anthropic.APIConnectionTimeoutError ? "timeout" :
        err instanceof Anthropic.APIError ? `api_${err.status}` : "unknown";
      logger.error("script.generate.failed, using template", { kind, ms: Date.now() - started, err });
      return fallback;
    }
  };
}

export const templateScriptGenerator: ScriptGenerator = async (text, from, location) => templateScript(text, from, location);
