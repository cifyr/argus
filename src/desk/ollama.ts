import { logger } from "../logger.js";

export interface ScriptInput { senderLabel: string; text: string; location?: string | null }

const SYSTEM = `You write exactly what an automated voice will say when it phones someone on behalf of a person who just sent a text message asking for help.

Rules for the spoken output:
- Open with: "This is an automated message because" then who needs help and that they need help.
- Then relay their message faithfully in natural spoken English (expand texting shorthand, keep every fact).
- If a location is provided, end by stating where they are.
- Output ONLY the words to be spoken. No quotes, no markdown, no options, no preamble, no sign-off.`;

export async function generateScript(model: string, input: ScriptInput, opts: { timeoutMs?: number } = {}): Promise<string> {
  const parts = [
    `Person who needs help: ${input.senderLabel}`,
    `Their text message: ${input.text}`,
    input.location ? `Their location: ${input.location}` : `Their location: unknown`,
    ``,
    `Spoken message:`,
  ];
  const prompt = `${SYSTEM}\n\n${parts.join("\n")}`;
  const started = Date.now();
  logger.info("desk.ollama.generate", { model, textLength: input.text.length, hasLocation: Boolean(input.location) });
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.4 } }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}. Is 'ollama serve' running and is the model pulled?`);
  const json = (await res.json()) as { response?: string };
  const script = cleanup(json.response ?? "");
  logger.info("desk.ollama.done", { ms: Date.now() - started, scriptLength: script.length });
  if (!script) throw new Error("Ollama produced an empty script");
  return script;
}

export function cleanup(raw: string): string {
  let t = raw.trim();
  const orIdx = t.search(/\n\s*\*?\*?\s*(OR|Alternatively)\b/i);
  if (orIdx > 0) t = t.slice(0, orIdx);
  t = t.split(/\n{2,}/)[0] ?? t;
  t = t.replace(/^\s*(here'?s|sure|okay|spoken (message|version))[:,]?\s*/i, "");
  t = t.replace(/[*_`#>]/g, "").replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();
  return t;
}

export async function ollamaReady(model: string): Promise<{ up: boolean; hasModel: boolean; models: string[] }> {
  try {
    const res = await fetch("http://localhost:11434/api/tags", { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { up: false, hasModel: false, models: [] };
    const json = (await res.json()) as { models?: { name: string }[] };
    const models = (json.models ?? []).map((m) => m.name);
    return { up: true, hasModel: models.some((m) => m === model || m.startsWith(model.split(":")[0]!)), models };
  } catch {
    return { up: false, hasModel: false, models: [] };
  }
}
