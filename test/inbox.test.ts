import { test } from "node:test";
import assert from "node:assert/strict";
import { messageId, parseThreadLabel, threadsToInbound } from "../src/gv/inbox.js";

const unread = "4 3 2 5 3 5 3 3 4 6 . [#][TikTok] 710275 is your verification code fJpzQvK2eu1 . Saturday, July 18 2026, 9:52 PM . Unread .";
const spam = "9 6 9 1 6 . Suspected spam . Msg&Data rates may apply. . Thursday, May 7 2026, 12:59 PM . Unread .";
const outgoing = "7 1 3 2 0 6 5 2 0 0 . You: Hi . Monday, October 20 2025, 11:29 PM .";
const read = "8 1 3 8 6 9 3 0 1 7 . Hello. Okay if I send a quote? . Monday, March 9 2026, 10:57 AM .";
const contact = "Mom . see you at 7 . Monday, March 9 2026, 10:57 AM . Unread .";

test("parses a real unread inbound thread label", () => {
  const t = parseThreadLabel(unread)!;
  assert.equal(t.sender, "+14325353346");
  assert.equal(t.text, "[#][TikTok] 710275 is your verification code fJpzQvK2eu1");
  assert.equal(t.date, "Saturday, July 18 2026, 9:52 PM");
  assert.equal(t.unread, true);
  assert.equal(t.outgoing, false);
  assert.equal(t.spam, false);
});

test("spam flag, short codes, and text containing ' . ' are handled", () => {
  const t = parseThreadLabel(spam)!;
  assert.equal(t.spam, true);
  assert.equal(t.sender, null);
  assert.equal(t.text, "Msg&Data rates may apply.");
});

test("outgoing previews and read threads are not inbound", () => {
  assert.equal(parseThreadLabel(outgoing)!.outgoing, true);
  assert.equal(parseThreadLabel(read)!.unread, false);
  assert.equal(parseThreadLabel(contact)!.sender, null);
});

test("threadsToInbound keeps only unread inbound numbered threads, spam optional", () => {
  const msgs = threadsToInbound([unread, spam, outgoing, read, contact], { includeSpam: false });
  assert.equal(msgs.length, 1);
  assert.equal(msgs[0]!.from, "+14325353346");
  assert.equal(threadsToInbound([spam], { includeSpam: true }).length, 0, "spam from a short code still has no dialable number");
});

test("message ids are stable across polls and change with content", () => {
  assert.equal(messageId("+1", "hi", "Mon 1 PM"), messageId("+1", "hi", "Mon 1 PM"));
  assert.notEqual(messageId("+1", "hi", "Mon 1 PM"), messageId("+1", "hi", "Mon 2 PM"));
});
