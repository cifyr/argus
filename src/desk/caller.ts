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

// Best-effort auto-accept of the Continuity "Click to Call" banner (owned by NotificationCenter).
// The banner's buttons are unlabeled, so we press an action button matching call/answer words if present,
// else the top-right action button of the newest banner (the green phone in Apple's layout).
// UNTESTED against a live prompt - tune coordinates/order on the first real call.
const ACCEPT_SCRIPT = `
tell application "System Events"
  if not (exists process "NotificationCenter") then return "no NC"
  tell process "NotificationCenter"
    repeat with w in windows
      try
        set btns to (every button of entire contents of w)
        -- 1) a labeled accept button, if the OS exposes one
        repeat with b in btns
          set nm to ""
          try
            set nm to (description of b) & " " & (name of b)
          end try
          if nm contains "all" and (nm contains "Call" or nm contains "call" or nm contains "Answer" or nm contains "answer" or nm contains "Accept") then
            perform action "AXPress" of b
            return "pressed labeled"
          end if
        end repeat
        -- 2) heuristic: among this banner's buttons, press the top-right one (green phone)
        if (count of btns) >= 2 then
          set bestB to missing value
          set bestScore to -1.0E+9
          repeat with b in btns
            try
              set p to position of b
              set score to (item 1 of p) - (item 2 of p) -- rightmost + topmost
              if score > bestScore then
                set bestScore to score
                set bestB to b
              end if
            end try
          end repeat
          if bestB is not missing value then
            perform action "AXPress" of bestB
            return "pressed heuristic"
          end if
        end if
      end try
    end repeat
  end tell
  return "no banner button"
end tell`;

export async function confirmFaceTimeCall(): Promise<void> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", ACCEPT_SCRIPT], { timeout: 8000 });
    logger.info("desk.call.auto_accept", { result: stdout.trim() });
  } catch (err) {
    logger.warn("desk.call.auto_accept_failed", { err: (err as Error).message });
  }
}

// End the current call (FaceTime). Best-effort.
export async function endCall(): Promise<void> {
  const script = 'tell application "System Events" to tell process "FaceTime" to keystroke "e" using {command down, shift down}';
  try { await execFileAsync("osascript", ["-e", script]); } catch { /* ignore */ }
}
