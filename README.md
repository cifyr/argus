# Guardian — 911 intake & dispatch console

A local tool for relaying help. People **register by text** (an Ollama-guided medical intake) and share their location in **Find My**. Later, when they **text for help**, an operator console shows their message, their medical profile, their Find My location, and a **ZIP → dispatch-number** lookup so you can call the right agency and relay what's happening.

Everything runs on your Mac. No cloud, no telephony fees. You place the call and speak — the console just arms you with the right information and number.

## Flow

**Register (before an emergency)**
```
new number texts you
      -> Ollama-guided intake over SMS: name, conditions, allergies, meds, emergency contact
      -> saved to a local database
      -> asked to share location in Find My
```

**Emergency (later)**
```
registered person texts "help ..."
      -> console shows their message + medical profile + Find My location
      -> you read their location in Find My, type the ZIP
      -> console returns the dispatch number for that ZIP
      -> you call and relay their message and medical notes
```

## What it does

- **Reads your incoming texts** from Messages (`~/Library/Messages/chat.db`, read-only) and processes them live (polls every few seconds).
- **Join by texting anything.** A new number is registered on first contact; the first reply both **asks for their details** and **requests they share location in Find My** (with instructions). Intake then collects name, conditions, allergies, medications, and emergency contact — one question per text, cleaned by a local Ollama model.
- **Detects emergencies** — explicit help words any time; the LLM classifier only runs for already-registered people, so medical intake answers are never mistaken for emergencies. The auto-reply tells them help is being sent to their location and that they can keep moving (since Find My tracks them live).
- **Find My location → real address.** Resolves a texter's location automatically (matching their name to a Find My friend), turns the nearest landmarks into a **geocoded street address + Google Maps link**, and keeps it live (refreshed while you watch).
- **ZIP → dispatch numbers, automatic.** The ZIP from the Find My address pre-fills the dispatch search and the nearby police numbers **load automatically** from **OpenStreetMap** (Nominatim + Overpass), nearest first. "Use" attaches one; 911 is the fallback.
- **Operator console** at `http://localhost:4200`: **Help requests**, **Live feed** (every text in/out as it arrives), **People** (registry, with Find My name mapping), and **Dispatch numbers**.

## Requirements

- **macOS** with **Messages** signed in and receiving your texts (Text Message Forwarding on the iPhone for SMS).
- **Full Disk Access** for your terminal so it can read `chat.db`.
- **[Ollama](https://ollama.com)** running with a small model: `ollama pull llama3.2:3b`.
- **Find My** (optional but recommended) — see below.

## Setup & run

```bash
npm install
cp .env.example .env     # optional; sensible defaults otherwise
npm run dev              # starts the worker + console at http://localhost:4200
```

- `AUTO_REPLY=true` (default) sends intake questions/acks over SMS via Messages. Set `false` to log replies without sending while you test.
- `REPLY_ALLOWLIST` (optional) — comma-separated numbers that may receive auto-replies; everyone else is still processed and logged but never texted. Blank = reply to everyone (when `AUTO_REPLY=true`). Handy for a controlled test: `AUTO_REPLY=true REPLY_ALLOWLIST="+15551234567" npm run dev`.
- `OPERATOR_TOKEN` (optional) locks the console; open it as `http://localhost:4200/?token=...`.

## Find My location

Apple encrypts the Find My cache, so the app reads location by automating the Find My app via Accessibility — it pairs each sharing friend's map pin to the nearest few map landmarks (e.g. "Graham Memorial Chapel; Department of Music; Knight Center"). For an exact street address, read the person's card in Find My directly - the app draws it and does not expose it to automation. It needs a one-time permission grant for `scripts/findmy.applescript` (a scoped rule in `.claude/settings.local.json` when driven here). In the console's **People** tab, set each person's **Find My name** so their location shows on their help request. If they don't share location, you can still read it in Find My yourself and type the ZIP.

## Data

SQLite (`guardian.sqlite`, gitignored):
- `people` — registry + intake state
- `messages` — inbound/outbound log per person
- `help_requests` — open/handled emergencies with the ZIP + dispatch number you used
- `dispatch` — ZIP → agency/number (saved from open-data lookups or edited by hand)

## Note

This assists a human operator relaying real emergencies; it does not contact 911 for you. Populate real, verified dispatch numbers before relying on the ZIP lookup, and call 911 when in doubt.
