import type { Page } from "playwright";
import { createHash } from "node:crypto";
import { GV_URL } from "./browser.js";
import { normalizePhone } from "../phone.js";
import { logger } from "../logger.js";

export interface InboundSms { id: string; from: string; text: string; receivedAt: number; threadLabel: string }
export interface ParsedThread { sender: string | null; senderLabel: string; text: string; date: string; unread: boolean; outgoing: boolean; spam: boolean }

// GV renders each thread as a button whose accessible name is a " . "-joined record:
// "<digits spaced> . [Suspected spam .] <latest message> . <date> [. Unread] ."  Outgoing previews start with "You: ".
export function parseThreadLabel(label: string): ParsedThread | null {
  const parts = label.split(/\s\.\s|\s\.$/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const senderLabel = parts[0]!;
  const unread = /^unread$/i.test(parts[parts.length - 1]!);
  if (unread) parts.pop();
  const date = parts.pop()!;
  const spam = /^suspected spam$/i.test(parts[1] ?? "");
  const text = parts.slice(spam ? 2 : 1).join(" . ").trim();
  const outgoing = /^you:\s/i.test(text);
  const digits = senderLabel.replace(/\s/g, "");
  const sender = /^\+?\d{7,15}$/.test(digits) ? normalizePhone(digits) : null;
  return { sender, senderLabel, text: outgoing ? text.replace(/^you:\s*/i, "") : text, date, unread, outgoing, spam };
}

export function messageId(from: string, text: string, date: string): string {
  return createHash("sha1").update(`${from}\n${text}\n${date}`).digest("hex").slice(0, 20);
}

// Thread rows are role="button" divs (not <button> tags) whose full accessible name only appears in the
// accessibility tree, so we read the "Latest messages" list's aria snapshot rather than scraping DOM text.
const ARIA_BUTTON = /^\s*- button "((?:[^"\\]|\\.)*)"/gm;

export async function listThreadLabels(page: Page): Promise<string[]> {
  if (!page.url().startsWith(`${GV_URL}/messages`)) {
    await page.goto(`${GV_URL}/messages`, { waitUntil: "domcontentloaded" });
  }
  const list = page.getByRole("list", { name: /latest messages/i }).first();
  for (let attempt = 0; attempt < 8; attempt++) {
    if (await list.count() > 0 && await list.isVisible().catch(() => false)) {
      const snapshot = await list.ariaSnapshot();
      const labels: string[] = [];
      for (const m of snapshot.matchAll(ARIA_BUTTON)) labels.push(m[1]!.replace(/\\"/g, '"').replace(/\s+/g, " ").trim());
      if (labels.length > 0) return labels;
    }
    await page.waitForTimeout(1000);
  }
  logger.warn("inbox.no_threads_after_wait", { url: page.url() });
  return [];
}

export function threadsToInbound(labels: string[], opts: { includeSpam: boolean }): InboundSms[] {
  const out: InboundSms[] = [];
  for (const label of labels) {
    const t = parseThreadLabel(label);
    if (!t) { logger.warn("inbox.unparsed_label", { label: label.slice(0, 160) }); continue; }
    if (!t.unread || t.outgoing) continue;
    if (t.spam && !opts.includeSpam) { logger.info("inbox.spam_skipped", { sender: t.senderLabel }); continue; }
    if (!t.sender) { logger.info("inbox.no_number_skipped", { sender: t.senderLabel }); continue; }
    if (!t.text) continue;
    out.push({ id: messageId(t.sender, t.text, t.date), from: t.sender, text: t.text, receivedAt: Date.now(), threadLabel: label });
  }
  return out;
}

export async function pollUnreadMessages(page: Page, opts: { includeSpam: boolean } = { includeSpam: false }): Promise<InboundSms[]> {
  const labels = await listThreadLabels(page);
  const inbound = threadsToInbound(labels, opts);
  logger.info("inbox.poll", { threads: labels.length, unreadInbound: inbound.length });
  return inbound;
}
