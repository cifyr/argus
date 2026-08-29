import { test } from "node:test";
import assert from "node:assert/strict";
import { findPhoneNumber, normalizePhone } from "../src/phone.js";

test("normalizes US formats", () => {
  assert.equal(normalizePhone("(555) 123-4567"), "+15551234567");
  assert.equal(normalizePhone("1 555 123 4567"), "+15551234567");
  assert.equal(normalizePhone("+1 555-123-4567"), "+15551234567");
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
  assert.equal(normalizePhone("12345"), null);
});

test("finds a number inside a GV thread label", () => {
  assert.equal(findPhoneNumber("Text conversation with +1 555-123-4567, 1 unread message"), "+15551234567");
  assert.equal(findPhoneNumber("Text conversation with Mom"), null);
});
