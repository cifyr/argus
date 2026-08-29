import { test } from "node:test";
import assert from "node:assert/strict";
import { spokenLocation, spokenPhoneNumber, templateScript } from "../src/script.js";

test("US numbers are spoken digit by digit in groups", () => {
  assert.equal(spokenPhoneNumber("+15551234567"), "5 5 5, 1 2 3, 4 5 6 7");
});

test("template script includes intro, spoken number and verbatim text", () => {
  const s = templateScript("  running late, start w/o me  ", "+15551234567");
  assert.match(s, /automated call relaying a text message/);
  assert.match(s, /5 5 5, 1 2 3, 4 5 6 7/);
  assert.match(s, /The message says: running late, start w\/o me$/);
});

test("location is appended with age and address, coordinates when no address", () => {
  const withAddr = templateScript("help", "+15551234567", { lat: 40.1, lng: -74.2, address: "12 Main St, Springfield", ageMinutes: 3.4 });
  assert.match(withAddr, /from 3 minutes ago, is approximately 12 Main St, Springfield\.$/);
  assert.match(spokenLocation({ lat: 40.12346, lng: -74.2, address: null, ageMinutes: 0.2 }), /less than a minute ago.*latitude 40\.1235, longitude -74\.2000/);
});
