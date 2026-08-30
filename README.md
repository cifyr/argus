# Argus — 911 intake & dispatch console

Argus is a **local Mac tool** that helps a responder team (the **argus-team**) relay emergencies for the people they look after (each a **victim**).

> **Terminology:** the **victim** is the person who registers and later texts for help. The **argus-team** is whoever runs this console and receives the victim's messages.

1. **People register by texting** your number. A local AI (Ollama) asks for their medical details over SMS and asks them to share their location in **Find My**.
2. **Later, when they text for help**, an argus-team console shows their message, their medical profile, and their live location — turned into a real street address — plus the **dispatch phone number** for that area, pulled from open data. You call and relay it.

Everything runs on your Mac. No cloud, no accounts, no telephony fees. Argus never calls 911 for you — it arms you with the right information and number so you can.

---

## Table of contents

- [How it works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Setup (step by step)](#setup-step-by-step)
- [Running it](#running-it)
- [Testing it (no second phone needed)](#testing-it-no-second-phone-needed)
- [Using the console](#using-the-console)
- [Configuration](#configuration)
- [Find My setup and permissions](#find-my-setup-and-permissions)
- [How the data is stored](#how-the-data-is-stored)
- [Troubleshooting](#troubleshooting)
- [Safety](#safety)

---

## How it works

There are two phases, both driven by texts to your number.

### Phase 1 — Register (before an emergency)

```
someone texts your number (anything at all)
   └─> registered on first contact; first reply asks for details AND
       requests they share location in Find My
   └─> intake, one question per text (cleaned by a local Ollama model):
         name → conditions → allergies → medications → emergency contact
   └─> saved to a local SQLite database
```

### Phase 2 — Emergency (later)

```
a registered victim texts "help ..."  (or any message the AI reads as an emergency)
   └─> one auto-reply: "Emergency services are being sent to your location. You can
       keep moving to stay safe — we can see your live location."
   └─> a Help request appears in the console with:
         • their message and the full conversation thread
         • their medical profile (conditions, allergies, meds, emergency contact)
         • their Find My location → a geocoded street address + Google Maps link
         • the ZIP pre-filled, and nearby police dispatch numbers auto-loaded
   └─> you pick a dispatch number, call it, and relay what's happening
```

### The pieces (all local)

| Component | What it does |
|---|---|
| **Messages (`chat.db`)** | Argus reads your incoming texts (read-only) and can send replies through the Messages app. |
| **Ollama** | A local LLM runs the intake conversation, extracts clean fields, and decides whether a message is an emergency. |
| **Find My** | Argus reads who's sharing their location and where, by automating the Find My app (its data is encrypted on disk). |
| **OpenStreetMap** | Nominatim geocodes a location to a street address + ZIP; the Overpass API lists nearby police departments with phone numbers. |
| **SQLite** | Local database of people, messages, help requests, and saved dispatch numbers. |
| **Console** | A web UI at `http://localhost:4200` — Help requests, Live feed, People, Dispatch numbers. |

---

## Prerequisites

- **macOS** (this uses macOS `Messages` and the `Find My` app).
- **Node.js 20+** (`node -v`). Install from [nodejs.org](https://nodejs.org) or `brew install node`.
- **[Ollama](https://ollama.com)** for the local AI.
- An **iPhone signed into the same Apple ID**, with **Text Message Forwarding** on if you want SMS (not just iMessage) to reach your Mac.
- **Find My** with at least one person sharing their location with you (for the location feature).

No paid services, API keys, or accounts are required.

---

## Setup (step by step)

### 1. Get the code and install dependencies

```bash
git clone https://github.com/cifyr/argus.git argus
cd argus
npm install
```

### 2. Install Ollama and pull a model

```bash
# install Ollama (or download from ollama.com), then:
ollama pull llama3.2:3b     # small + fast; gemma2:2b also works
```
Make sure Ollama is running (the menu-bar app, or `ollama serve`).

### 3. Let your Mac receive your texts

- On your **iPhone**: Settings → Messages → **Text Message Forwarding** → enable your Mac. (iMessages arrive automatically when signed into the same Apple ID; SMS needs this.)
- On your **Mac**: open **Messages** and confirm texts are showing up.

### 4. Grant Full Disk Access (to read your messages)

Argus reads `~/Library/Messages/chat.db`, which macOS protects.

- **System Settings → Privacy & Security → Full Disk Access** → add and enable your **terminal app** (Terminal, iTerm, etc.). Quit and reopen the terminal afterward.

### 5. Configure (optional)

```bash
cp .env.example .env
```
Defaults are sensible; the common things to set are in [Configuration](#configuration). You can skip this and run with defaults.

### 6. (For location) grant the Find My automation permission

The first time Argus scans Find My, macOS will prompt to let your terminal control **System Events** and **FindMy** — click **Allow**. See [Find My setup and permissions](#find-my-setup-and-permissions).

---

## Running it

```bash
npm run dev
```

Then open **http://localhost:4200**.

To keep the Mac awake so it never misses a text mid-session:
```bash
caffeinate -i npm run dev
```

**Replies are on by default** (`AUTO_REPLY=true`), so anyone who texts you gets the intake questions and emergency acknowledgements. To do a controlled test where only one number gets replies, see below.

---

## Testing it (no second phone needed)

You can drive the entire flow locally with the **simulator**, which injects a text through the same logic and writes to the live database, so it shows up in the console. **The simulator never sends real texts.**

Open two terminals:

```bash
# Terminal 1 — the console
npm run dev

# Terminal 2 — simulate a person registering, then having an emergency
npm run simulate -- +15551234567 "hi"                 # first contact → registration begins
npm run simulate -- +15551234567 "Jordan Rivera"      # answers the name question
npm run simulate -- +15551234567 "asthma"             # conditions
npm run simulate -- +15551234567 "none"               # allergies
npm run simulate -- +15551234567 "albuterol"          # medications
npm run simulate -- +15551234567 "my sister 314-555-2020"  # emergency contact → registered

npm run simulate -- +15551234567 "help I can't breathe"    # emergency → a Help request appears
```

Watch **http://localhost:4200**: the victim appears under **People**, every message shows in the **Live feed**, and the emergency shows under **Help requests** with the profile and (if you've mapped their Find My name) their location.

### Testing with a real phone, safely

Have a friend text your number. To make sure **only they** get replies while you test (everyone else is processed silently):

```bash
AUTO_REPLY=true REPLY_ALLOWLIST="+1XXXXXXXXXX" npm run dev
```

Only texts that arrive **after** you start Argus are handled, so start it first.

---

## Using the console

Open **http://localhost:4200**. The header shows readiness lights (Ollama, model, Messages, Find My).

- **Help requests** — the argus-team's main view. Each card shows the person's name and message, the full conversation thread, a box to **send them your own message**, their medical profile, their **Find My location → address + map link**, the **ZIP pre-filled** with dispatch numbers auto-loaded (click **use** to attach one), a place to save a dispatch number and a location note, and **Mark handled**.
- **Live feed** — every inbound/outbound text as it arrives, newest first.
- **People** — every registered victim, their intake status, and a field to set each victim's **Find My name** so their location resolves.
- **Dispatch numbers** — the saved ZIP → agency/number table. Numbers you "use" from a lookup are saved here; you can also add or delete them by hand.

---

## Configuration

Set these in `.env` (copy from `.env.example`) or inline before `npm run dev`.

| Variable | Default | Description |
|---|---|---|
| `SERVICE_NAME` | `Argus` | Name used in the texts people receive. |
| `OLLAMA_MODEL` | `llama3.2:3b` | Local model for intake + emergency classification. |
| `AUTO_REPLY` | `true` | Send intake/emergency replies over SMS. `false` = log what it would say, send nothing. |
| `REPLY_ALLOWLIST` | (empty) | Comma-separated numbers that may receive auto-replies. Others are still processed and logged but never texted. Empty = reply to everyone (when `AUTO_REPLY=true`). |
| `PORT` | `4200` | Console port. |
| `POLL_MS` | `4000` | How often to check for new texts. |
| `DB_PATH` | `argus.sqlite` | SQLite file path. |
| `OPERATOR_TOKEN` | (empty) | If set, the console requires `?token=...` to open. |

**Sessions:** an emergency auto-reply and a new help request are created only on the **first** emergency text of a session; follow-up texts within **3 hours** are added to the thread without re-replying. After 3 hours of quiet, the next emergency starts a fresh session.

---

## Find My setup and permissions

Apple encrypts the Find My data on disk, so Argus reads it by **automating the Find My app** through macOS Accessibility. It pairs each sharing friend's map pin to the nearest map landmarks, then geocodes the best one to a **street address + map link**. (An exact house number isn't always in the map data; the map link always points to the precise spot.)

To make it work:

1. **Someone must be sharing their location with you** in Find My (Find My → People).
2. **Grant automation permission**: the first Find My scan triggers a macOS prompt to let your terminal control **System Events** and **FindMy** — click **Allow**. You can manage this later in **System Settings → Privacy & Security → Automation** (and **Accessibility**).
3. **Map the victim to their Find My name**: in the console's **People** tab (or right on a help card), set their **Find My name** to match how they appear in Find My (e.g. `Lysander Elgar`). If their registered name already matches a Find My friend, Argus links it automatically.

> Running this repo through Claude Code? The Find My scan is gated behind a scoped permission for `scripts/findmy.applescript`, stored in `.claude/settings.local.json`. Running it yourself with `npm run dev`, you just approve the normal macOS Automation prompt.

If nobody shares location, you can still read it in Find My yourself and type the ZIP into a help card manually.

---

## How the data is stored

Local SQLite at `argus.sqlite` (gitignored):

- `people` — the registry and each person's intake state and Find My name.
- `messages` — every inbound/outbound text, per person.
- `help_requests` — emergencies (open/handled) with the ZIP and dispatch number you used.
- `dispatch` — ZIP → agency/number, saved from open-data lookups or edited by hand.

Delete `argus.sqlite*` to start fresh.

---

## Troubleshooting

- **Console shows Ollama/model red** — Ollama isn't running or the model isn't pulled. `ollama serve` and `ollama pull llama3.2:3b`.
- **Messages red / "Reading Messages database failed"** — grant **Full Disk Access** to your terminal, then reopen it.
- **Find My red or no location** — grant the **Automation** prompt on first scan; make sure someone is sharing with you; set the person's **Find My name** in the People tab; use **rescan Find My** on a card.
- **Replies aren't sending** — `AUTO_REPLY` must be `true`, the number must be allowed by `REPLY_ALLOWLIST` (if set), and macOS may prompt once to let your terminal control **Messages** — click Allow. iMessage sends to any iMessage user; SMS needs Text Message Forwarding.
- **No texts are picked up** — Argus only handles texts that arrive **after** it starts. Restart it, then text.
- **"no such column" on startup** — a stale `DB_PATH` pointing at an incompatible old database. Use the default `argus.sqlite` or delete the old file.

---

## Safety

Argus assists a **human argus-team operator** relaying real emergencies. It does not contact 911 for you. The open-data dispatch numbers come from OpenStreetMap and may be incomplete or out of date — **verify numbers before relying on them, and call 911 when in doubt.**
