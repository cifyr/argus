import { logger } from "./logger.js";

const BASE = "http://localhost:11434";

async function generate(model: string, prompt: string, opts: { timeoutMs?: number; temperature?: number } = {}): Promise<string> {
  const res = await fetch(`${BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: opts.temperature ?? 0.2 } }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status} - is it running and the model pulled?`);
  return String(((await res.json()) as { response?: string }).response ?? "").trim();
}

export async function ollamaReady(model: string): Promise<{ up: boolean; hasModel: boolean; models: string[] }> {
  try {
    const res = await fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { up: false, hasModel: false, models: [] };
    const models = (((await res.json()) as { models?: { name: string }[] }).models ?? []).map((m) => m.name);
    return { up: true, hasModel: models.some((m) => m === model || m.startsWith(model.split(":")[0]!)), models };
  } catch { return { up: false, hasModel: false, models: [] }; }
}

const HELP_WORDS = /\b(help|emergency|911|hurt|injured|bleeding|can'?t breathe|chest pain|fell|accident|unconscious|overdose|fire|danger|scared|trapped|stroke|seizure|dying|rescue)\b/i;

export function hasHelpKeyword(text: string): boolean { return HELP_WORDS.test(text); }

// LLM emergency classification (used only for already-registered people, so intake answers
// mentioning conditions/medications are never mistaken for emergencies).
export async function classifyEmergency(model: string, text: string): Promise<boolean> {
  if (HELP_WORDS.test(text)) return true;
  try {
    const out = await generate(model,
      `You are triaging text messages to an emergency-help line. Reply with only YES or NO.\nIs the following message someone asking for help or reporting an emergency right now?\n\nMessage: "${text}"\n\nAnswer:`,
      { timeoutMs: 8000 });
    return /^\s*yes/i.test(out);
  } catch (err) {
    logger.warn("ollama.isEmergency_failed, defaulting to keyword result", { err: (err as Error).message });
    return false;
  }
}

// Clean a free-text intake answer into a concise value for the given field. "none"/"skip" -> "".
export async function extractField(model: string, field: string, answer: string): Promise<string> {
  const a = answer.trim();
  if (/^(none|no|n\/a|nope|skip|nothing)\b/i.test(a)) return "";
  try {
    const out = await generate(model,
      `Extract the ${field} from this reply as a short, clean phrase for a medical record. No preamble, no quotes. If nothing relevant, output an empty line.\n\nReply: "${a}"\n\n${field}:`,
      { timeoutMs: 10000 });
    return out.replace(/^["']|["']$/g, "").split("\n")[0]!.trim() || a;
  } catch (err) {
    logger.warn("ollama.extractField_failed, storing raw", { field, err: (err as Error).message });
    return a;
  }
}

