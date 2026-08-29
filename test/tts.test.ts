import { test } from "node:test";
import assert from "node:assert/strict";
import { createSaySynthesizer, wavDurationMs } from "../src/tts.js";

test("macOS say produces a WAV with a plausible duration", async () => {
  const clip = await createSaySynthesizer("Samantha")("This is a short test of the relay.");
  assert.equal(clip.wav.toString("ascii", 0, 4), "RIFF");
  assert.ok(clip.durationMs > 1000 && clip.durationMs < 6000, `duration ${clip.durationMs}`);
});

test("unknown voice falls back to the default voice instead of failing", async () => {
  const clip = await createSaySynthesizer("NoSuchVoiceXYZ")("fallback");
  assert.ok(clip.durationMs > 100);
});

test("wavDurationMs parses the header", () => {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.write("WAVE", 8); header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(24000, 24); header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(48000, 40);
  assert.equal(wavDurationMs(Buffer.concat([header, Buffer.alloc(48000)])), 1000);
  assert.throws(() => wavDurationMs(Buffer.from("nope")), /Not a RIFF/);
});
