import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "../logger.js";

const execFileAsync = promisify(execFile);

// Places a real phone call via Continuity: 'open tel:' hands off to FaceTime, which dials through the paired iPhone.
// Requires: iPhone nearby, same Apple ID, "Calls from iPhone" enabled on the Mac.
export async function placeCall(e164: string): Promise<void> {
  const num = e164.replace(/[^\d+]/g, "");
  if (!/^\+?\d{7,15}$/.test(num)) throw new Error(`Invalid call number: "${e164}"`);
  logger.info("desk.call.dial", { to: num });
  await execFileAsync("open", [`tel:${num}`]);
}

// Best-effort: press the FaceTime call button in case a confirmation panel appears.
export async function confirmFaceTimeCall(): Promise<void> {
  const script = 'tell application "System Events" to tell process "FaceTime" to keystroke return';
  try { await execFileAsync("osascript", ["-e", script]); } catch { /* panel may not be present */ }
}

// End the current call (FaceTime). Best-effort.
export async function endCall(): Promise<void> {
  const script = 'tell application "System Events" to tell process "FaceTime" to keystroke "e" using {command down, shift down}';
  try { await execFileAsync("osascript", ["-e", script]); } catch { /* ignore */ }
}
