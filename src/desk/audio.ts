import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);
export const BLACKHOLE = "BlackHole 2ch";

async function switchAudio(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("SwitchAudioSource", args);
  return stdout.trim();
}

export async function listOutputs(): Promise<string[]> {
  try { return (await switchAudio(["-a", "-t", "output"])).split("\n").map((s) => s.trim()).filter(Boolean); }
  catch { return []; }
}

export async function blackholePresent(): Promise<boolean> {
  return (await listOutputs()).some((d) => d === BLACKHOLE);
}

async function currentOutput(): Promise<string | null> {
  try { return await switchAudio(["-c", "-t", "output"]); } catch { return null; }
}

async function setOutput(name: string): Promise<void> {
  await switchAudio(["-s", name, "-t", "output"]);
}

async function afplay(wav: string): Promise<void> {
  await execFileAsync("afplay", [wav], { timeout: 5 * 60 * 1000 });
}

// Speak into BlackHole so a call using BlackHole as its microphone carries the audio.
// Sets output -> BlackHole for the duration, then restores the previous device.
export async function playIntoBlackhole(wav: string, times = 1, gapMs = 900): Promise<void> {
  const prev = await currentOutput();
  logger.info("desk.audio.into_blackhole", { prev, times });
  try {
    await setOutput(BLACKHOLE);
    for (let i = 0; i < times; i++) {
      await afplay(wav);
      if (i < times - 1) await new Promise((r) => setTimeout(r, gapMs));
    }
  } finally {
    if (prev && prev !== BLACKHOLE) await setOutput(prev).catch((err) => logger.error("desk.audio.restore_failed", { prev, err }));
  }
}

// Play audibly through real speakers (for the "test voice" button, so the user can hear it).
export async function playAudible(wav: string): Promise<void> {
  const prev = await currentOutput();
  const speaker = (await listOutputs()).find((d) => d !== BLACKHOLE) ?? prev ?? BLACKHOLE;
  try {
    if (speaker && speaker !== prev) await setOutput(speaker);
    await afplay(wav);
  } finally {
    if (prev && prev !== speaker) await setOutput(prev).catch(() => {});
  }
}
