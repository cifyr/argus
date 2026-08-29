import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

export interface SpeechClip { wav: Buffer; durationMs: number }
export interface Synthesizer { (text: string): Promise<SpeechClip> }

// macOS `say` writing 24kHz 16-bit mono WAV. Free, offline, no deps.
export function createSaySynthesizer(voice: string): Synthesizer {
  return async function synthesize(text) {
    const out = path.join(tmpdir(), `relay-tts-${process.pid}-${Date.now()}.wav`);
    const baseArgs = ["-o", out, "--file-format=WAVE", "--data-format=LEI16@24000", text];
    const started = Date.now();
    try {
      try {
        await execFileAsync("say", ["-v", voice, ...baseArgs]);
      } catch (err) {
        logger.warn("tts.voice_failed, retrying with system default voice", { voice, err: (err as Error).message });
        await execFileAsync("say", baseArgs);
      }
      const wav = await readFile(out);
      const clip = { wav, durationMs: wavDurationMs(wav) };
      logger.info("tts.done", { voice, chars: text.length, durationMs: clip.durationMs, bytes: wav.length, ms: Date.now() - started });
      return clip;
    } catch (err) {
      throw new Error(`TTS failed for ${text.length} chars with voice "${voice}"`, { cause: err });
    } finally {
      await unlink(out).catch(() => {});
    }
  };
}

export function wavDurationMs(wav: Buffer): number {
  if (wav.length < 44 || wav.toString("ascii", 0, 4) !== "RIFF") throw new Error("Not a RIFF/WAV buffer");
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitsPerSample = wav.readUInt16LE(34);
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === "data") {
      const bytes = Math.min(size, wav.length - offset - 8);
      return Math.round((bytes / (sampleRate * channels * (bitsPerSample / 8))) * 1000);
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}
