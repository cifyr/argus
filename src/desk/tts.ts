import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);

const TTS_DIR = path.resolve(process.cwd(), "vendor/tts");
const VENV_PY = path.join(TTS_DIR, ".venv/bin/python");
const SYNTH = path.join(TTS_DIR, "synth.py");
const MODEL = path.join(TTS_DIR, "kokoro-v1.0.onnx");

export function kokoroReady(): boolean {
  return existsSync(VENV_PY) && existsSync(SYNTH) && existsSync(MODEL);
}

export interface Synth { (text: string, voice: string): Promise<string> }  // returns wav path

// Human-sounding local neural TTS (Kokoro via onnxruntime in the vendored venv).
export const kokoroSynth: Synth = async (text, voice) => {
  const out = path.join(tmpdir(), `desk-tts-${process.pid}-${Date.now()}.wav`);
  const started = Date.now();
  logger.info("desk.tts.kokoro", { chars: text.length, voice });
  try {
    await execFileAsync(VENV_PY, [SYNTH, out, voice, text], { cwd: TTS_DIR, timeout: 60_000 });
  } catch (err) {
    throw new Error(`Kokoro TTS failed: ${(err as Error).message}`, { cause: err });
  }
  logger.info("desk.tts.kokoro.done", { ms: Date.now() - started, out });
  return out;
};

// Fallback: robotic but always available.
export const saySynth: Synth = async (text, voice) => {
  const out = path.join(tmpdir(), `desk-tts-${process.pid}-${Date.now()}.wav`);
  const args = voice && voice !== "af_heart" ? ["-v", voice] : [];
  await execFileAsync("say", [...args, "-o", out, "--file-format=WAVE", "--data-format=LEI16@24000", text]);
  logger.info("desk.tts.say.done", { out });
  return out;
};

export function pickSynth(engine: "kokoro" | "say"): Synth {
  if (engine === "kokoro" && kokoroReady()) return kokoroSynth;
  if (engine === "kokoro") logger.warn("desk.tts.kokoro_missing, falling back to say");
  return saySynth;
}
