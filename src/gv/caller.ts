import type { Page } from "playwright";
import { GV_URL } from "./browser.js";
import { logger } from "../logger.js";

export interface CallOptions { answerTimeoutMs: number; repeat: number; gapMs?: number; maxCallMs?: number; dryRun?: boolean }
export type CallOutcome = "completed" | "no-answer" | "failed" | "dry-run";
export interface CallResult { outcome: CallOutcome; startedAt: number; endedAt: number; detail: string }

// Observed live on voice.google.com/u/0/calls: a persistent "Call panel" with textbox "Enter a name or number";
// typing a number reveals button "Call + 1 5 5 5 …". In-call controls are expected to expose an end-call button.
export const CALL_SELECTORS = {
  numberInput: /enter a name or number/i,
  callButton: /call\s*\+?\s*\d/i,
  endCall: /end call|hang up|end$/i,
  // The in-call duration counter is a standalone "0:05"-style element; list timestamps carry AM/PM and never match.
  answeredTimer: /^\d{1,2}:\d{2}$/,
};

// Call-panel buttons carry no aria-label and sit in a region role queries treat as hidden: match by text, force clicks.
const buttonByText = (page: Page, re: RegExp) => page.locator("button").filter({ hasText: re }).first();

async function endCallIfActive(page: Page): Promise<void> {
  const end = buttonByText(page, CALL_SELECTORS.endCall);
  if (await end.isVisible().catch(() => false)) {
    await end.click({ timeout: 3000, force: true }).catch((err) => logger.warn("call.end_click_failed", { err: (err as Error).message }));
  }
}

async function callIsActive(page: Page): Promise<boolean> {
  return buttonByText(page, CALL_SELECTORS.endCall).isVisible().catch(() => false);
}

async function dumpButtons(page: Page, why: string): Promise<void> {
  const labels = await page.locator("button").evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80)).filter(Boolean));
  logger.warn("call.ui_dump", { why, buttons: labels.slice(0, 60) });
}

export async function placeCall(page: Page, toE164: string, wav: Buffer, opts: CallOptions): Promise<CallResult> {
  const startedAt = Date.now();
  let endButtonKnown = true;
  const gapMs = opts.gapMs ?? 1500;
  const maxCallMs = opts.maxCallMs ?? 4 * 60 * 1000;
  logger.info("call.start", { to: toE164, wavBytes: wav.length, repeat: opts.repeat, dryRun: Boolean(opts.dryRun) });

  try {
    await page.goto(`${GV_URL}/calls`, { waitUntil: "domcontentloaded" });
    const input = page.getByRole("textbox", { name: CALL_SELECTORS.numberInput }).first();
    await input.waitFor({ state: "visible", timeout: 15_000 });
    await input.fill("");
    await input.pressSequentially(toE164.replace(/^\+1(?=\d{10}$)/, ""), { delay: 40 });
    await page.waitForTimeout(1200);
    const callBtn = page.getByRole("button", { name: CALL_SELECTORS.callButton }).first();
    await callBtn.waitFor({ state: "visible", timeout: 10_000 });
    const callLabel = (await callBtn.getAttribute("aria-label"))?.replace(/\s+/g, " ").trim();
    if (opts.dryRun) {
      logger.info("call.dry_run_stop", { to: toE164, callLabel });
      await input.fill("");
      return { outcome: "dry-run", startedAt, endedAt: Date.now(), detail: `would click "${callLabel}"` };
    }
    await callBtn.click({ timeout: 5000, force: true });
    try {
      await buttonByText(page, CALL_SELECTORS.endCall).waitFor({ state: "visible", timeout: 20_000 });
      logger.info("call.dialing", { to: toE164, ms: Date.now() - startedAt });
    } catch {
      // Unknown in-call UI: log what is on screen so the selector can be fixed, and fall back to a fixed ring wait.
      await dumpButtons(page, "no end-call button found after dialing");
      endButtonKnown = false;
    }
  } catch (err) {
    logger.error("call.dial_failed", { to: toE164, err });
    await endCallIfActive(page);
    return { outcome: "failed", startedAt, endedAt: Date.now(), detail: `dial failed: ${(err as Error).message}` };
  }

  // Wait for the in-call timer (answered) or for the call UI to disappear (declined / no answer).
  const answerDeadline = Date.now() + opts.answerTimeoutMs;
  let answered = false;
  const timer = page.locator(`text=${CALL_SELECTORS.answeredTimer.source}`).first();
  while (Date.now() < answerDeadline) {
    if (endButtonKnown && !(await callIsActive(page))) {
      logger.info("call.ended_before_answer", { to: toE164, ms: Date.now() - startedAt });
      return { outcome: "no-answer", startedAt, endedAt: Date.now(), detail: "call ended before answer" };
    }
    if (await timer.isVisible().catch(() => false)) { answered = true; break; }
    if (!endButtonKnown && Date.now() - startedAt > 15_000) { answered = true; logger.warn("call.assuming_answered", { to: toE164 }); break; }
    await page.waitForTimeout(500);
  }
  if (!answered) {
    logger.info("call.no_answer_timeout", { to: toE164 });
    await endCallIfActive(page);
    return { outcome: "no-answer", startedAt, endedAt: Date.now(), detail: "no answer before timeout" };
  }
  logger.info("call.answered", { to: toE164, ms: Date.now() - startedAt });

  await page.waitForTimeout(gapMs);
  const base64 = wav.toString("base64");
  for (let i = 0; i < opts.repeat; i++) {
    if ((endButtonKnown && !(await callIsActive(page))) || Date.now() - startedAt > maxCallMs) break;
    try {
      const seconds = await page.evaluate((b64) => (window as unknown as { __relayPlay(b: string): Promise<number> }).__relayPlay(b64), base64);
      logger.info("call.clip_played", { to: toE164, pass: i + 1, seconds });
    } catch (err) {
      logger.error("call.play_failed", { to: toE164, pass: i + 1, err });
      await endCallIfActive(page);
      return { outcome: "failed", startedAt, endedAt: Date.now(), detail: `audio playback failed: ${(err as Error).message}` };
    }
    await page.waitForTimeout(gapMs);
  }
  await endCallIfActive(page);
  if (!endButtonKnown) await dumpButtons(page, "after playback; verify the call actually ended");
  const endedAt = Date.now();
  logger.info("call.completed", { to: toE164, durationMs: endedAt - startedAt });
  return { outcome: "completed", startedAt, endedAt, detail: "message read" };
}
