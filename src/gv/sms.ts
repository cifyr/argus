import type { Page } from "playwright";
import { GV_URL } from "./browser.js";
import { logger } from "../logger.js";

// Observed live: "Send new message" opens a Details panel with textbox "Type a name or phone number";
// typing digits reveals button "Send to 5 5 5 …" which commits the recipient; then textbox "Type a message" + button "Send message".
export const SMS_SELECTORS = {
  newMessage: /send new message/i,
  recipientInput: /type a name or phone number/i,
  sendTo: /send to\b/i,
  bodyInput: /type a message/i,
  sendButton: /^send message$/i,
  recipientsCount: /(\d+) recipients? added/i,
};

// Suggestion/compose buttons carry no aria-label and sit in an aria-hidden overlay, so match by text and force the click.
const buttonByText = (page: Page, re: RegExp) => page.locator("button").filter({ hasText: re }).first();
// GV's recipient field wants the national number (no +1); the "+1" reappears on the committed chip.
const toDigits = (e164: string) => e164.replace(/^\+1(?=\d{10}$)/, "");

export async function sendSms(page: Page, toE164: string, body: string, opts: { dryRun?: boolean } = {}): Promise<void> {
  logger.info("sms.send.start", { to: toE164, bodyLength: body.length, dryRun: Boolean(opts.dryRun) });
  await page.goto(`${GV_URL}/messages`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: SMS_SELECTORS.newMessage }).first().click({ timeout: 15_000 });
  const to = page.getByRole("textbox", { name: SMS_SELECTORS.recipientInput }).first();
  await to.waitFor({ state: "visible", timeout: 10_000 });
  await to.click();
  await to.pressSequentially(toDigits(toE164), { delay: 60 });
  await page.waitForTimeout(2000);
  const committed = async () => {
    const t = await page.getByText(SMS_SELECTORS.recipientsCount).first().textContent().catch(() => "");
    return /[1-9]\d* recipients? added/i.test(t ?? "");
  };
  const sendTo = buttonByText(page, SMS_SELECTORS.sendTo);
  if (await sendTo.count() > 0) {
    await sendTo.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
  }
  if (!(await committed())) { await to.press("Enter"); await page.waitForTimeout(1000); }
  if (!(await committed())) {
    const buttons = await page.locator("button").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70)).filter(Boolean).slice(0, 40));
    logger.warn("sms.recipient_not_committed", { to: toE164, buttons });
    throw new Error(`Recipient ${toE164} was not added in the GV compose panel`);
  }
  const input = page.getByRole("textbox", { name: SMS_SELECTORS.bodyInput }).first();
  await input.waitFor({ state: "visible", timeout: 10_000 });
  await input.fill(body);
  const send = page.getByRole("button", { name: SMS_SELECTORS.sendButton }).first();
  await send.waitFor({ state: "visible", timeout: 5000 });
  if (await send.isDisabled()) throw new Error("GV 'Send message' button stayed disabled after typing the message");
  if (opts.dryRun) {
    logger.info("sms.send.dry_run_stop", { to: toE164 });
    await input.fill("");
    await page.goto(`${GV_URL}/messages`, { waitUntil: "domcontentloaded" });
    return;
  }
  await send.click({ timeout: 5000, force: true });
  await page.waitForTimeout(1500);
  logger.info("sms.send.done", { to: toE164 });
}
