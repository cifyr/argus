import express, { type Request, type Response } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "./worker.js";
import { ollamaReady } from "./ollama.js";
import { kokoroReady, pickSynth } from "./tts.js";
import { blackholePresent, playAudible } from "./audio.js";
import { chatDbReadable } from "./messages.js";
import { generateScript } from "./ollama.js";
import { logger } from "../logger.js";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");

export function createDeskApp(worker: Worker) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "desk.html")));

  app.get("/api/status", async (_req, res) => {
    const s = worker.getSettings();
    const ollama = await ollamaReady(s.ollamaModel);
    res.json({
      settings: s,
      readiness: {
        ollama: ollama.up,
        model: ollama.hasModel,
        models: ollama.models,
        kokoro: kokoroReady(),
        blackhole: await blackholePresent(),
        messages: chatDbReadable(),
      },
      activity: worker.activity,
    });
  });

  app.post("/api/toggle", (req, res) => {
    const enabled = Boolean(req.body?.enabled);
    worker.update({ enabled });
    res.json({ ok: true, enabled });
  });

  app.post("/api/settings", (req, res) => {
    const b = req.body ?? {};
    const patch: Record<string, unknown> = {};
    for (const k of ["callNumber", "callName", "voice", "ollamaModel", "ttsEngine"] as const) if (typeof b[k] === "string") patch[k] = b[k];
    for (const k of ["pollMs", "connectDelayMs", "maxPerHour", "repeat"] as const) if (typeof b[k] === "number") patch[k] = b[k];
    if (Array.isArray(b.allowedSenders)) patch.allowedSenders = b.allowedSenders.filter((x: unknown) => typeof x === "string");
    worker.update(patch);
    res.json({ ok: true, settings: worker.getSettings() });
  });

  // Hear the voice without calling anyone: generate + synth + play through the speakers.
  app.post("/api/test-voice", async (req, res) => {
    const text = String(req.body?.text ?? "running 20 late, start without me").slice(0, 500);
    try {
      const s = worker.getSettings();
      const script = req.body?.raw ? text : await generateScript(s.ollamaModel, { senderLabel: "a friend", text, location: null });
      const wav = await pickSynth(s.ttsEngine)(script, s.voice);
      await playAudible(wav);
      res.json({ ok: true, script });
    } catch (err) {
      logger.error("desk.test_voice_failed", { err });
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Run the whole pipeline once on a supplied text - THIS PLACES A REAL CALL.
  app.post("/api/test-call", async (req, res) => {
    const text = String(req.body?.text ?? "").trim();
    const sender = String(req.body?.sender ?? "manual test");
    if (!text) { res.status(400).json({ error: "text required" }); return; }
    const a = await worker.handle({ rowid: -1, sender, text, service: "test" });
    res.status(a.outcome === "error" ? 500 : 200).json({ activity: a });
  });

  return app;
}
