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

- **Reads your incoming texts** from Messages (`~/Library/Messages/chat.db`, read-only).
- **Runs intake** automatically for any new number: one question per text, answers cleaned/extracted by a local Ollama model, stored in SQLite.
- **Detects emergencies** — explicit help words any time; the LLM classifier only runs for already-registered people, so medical intake answers are never mistaken for emergencies.
- **Reads Find My location** (see the Find My note) and shows it on the help request.
- **ZIP → dispatch lookup** — an editable table of dispatch numbers you populate for the areas you cover; 911 is the fallback.
- **Operator console** at `http://localhost:4200`: Help requests, People (registry), and Dispatch numbers.

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
- `OPERATOR_TOKEN` (optional) locks the console; open it as `http://localhost:4200/?token=...`.

## Find My location

Apple encrypts the Find My cache, so the app reads location by automating the Find My app via Accessibility — it pairs each sharing friend's map pin to the nearest place label (e.g. "Washington University Field House"). It needs a one-time permission grant for `scripts/findmy.applescript` (a scoped rule in `.claude/settings.local.json` when driven here). In the console's **People** tab, set each person's **Find My name** so their location shows on their help request. If they don't share location, you can still read it in Find My yourself and type the ZIP.

## Data

SQLite (`guardian.sqlite`, gitignored):
- `people` — registry + intake state
- `messages` — inbound/outbound log per person
- `help_requests` — open/handled emergencies with the ZIP + dispatch number you used
- `dispatch` — ZIP → agency/number (editable in the console)

## Note

This assists a human operator relaying real emergencies; it does not contact 911 for you. Populate real, verified dispatch numbers before relying on the ZIP lookup, and call 911 when in doubt.
