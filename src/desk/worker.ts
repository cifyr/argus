import { loadSettings, saveSettings, type DeskSettings } from "./config.js";
import { currentMaxRowId, newInboundSince, type InboundText } from "./messages.js";
import { generateScript } from "./ollama.js";
import { locationForSender } from "./location.js";
import { locationForName, refreshFindMy } from "./findmy.js";
import { pickSynth } from "./tts.js";
import { playIntoBlackhole } from "./audio.js";
import { placeCall, confirmFaceTimeCall } from "./caller.js";
import { logger } from "../logger.js";

export interface Activity {
  at: number;
  sender: string;
  text: string;
  script?: string;
  outcome: "called" | "skipped" | "error";
  detail?: string;
}

export class Worker {
  settings: DeskSettings;
  private watermark = 0;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private callTimes: number[] = [];
  readonly activity: Activity[] = [];

  constructor() { this.settings = loadSettings(); }

  getSettings() { return this.settings; }

  update(patch: Partial<DeskSettings>) {
    this.settings = { ...this.settings, ...patch };
    saveSettings(this.settings);
    if ("enabled" in patch) patch.enabled ? this.enable() : this.disable();
  }

  async enable() {
    if (this.timer) return;
    // Only texts that arrive AFTER turning on should trigger a call.
    this.watermark = await currentMaxRowId().catch(() => 0);
    this.settings.enabled = true;
    saveSettings(this.settings);
    if (this.settings.findMyEnabled) void refreshFindMy(true);
    logger.info("desk.worker.enabled", { watermark: this.watermark, callNumber: this.settings.callNumber });
    this.timer = setInterval(() => void this.tick(), this.settings.pollMs);
  }

  disable() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.settings.enabled = false;
    saveSettings(this.settings);
    logger.info("desk.worker.disabled");
  }

  private allowed(sender: string): boolean {
    const list = this.settings.allowedSenders.filter(Boolean);
    if (list.length === 0) return true;
    const digits = sender.replace(/\D/g, "");
    return list.some((a) => { const d = a.replace(/\D/g, ""); return d && (digits.endsWith(d) || d.endsWith(digits)) || sender.includes(a); });
  }

  private underRateLimit(): boolean {
    const cutoff = Date.now() - 3600_000;
    this.callTimes = this.callTimes.filter((t) => t > cutoff);
    return this.callTimes.length < this.settings.maxPerHour;
  }

  private async resolveLocation(sender: string): Promise<string | null> {
    if (this.settings.findMyEnabled) {
      const digits = sender.replace(/\D/g, "").slice(-10);
      const name = this.settings.senderNames[sender] || this.settings.senderNames[digits]
        || Object.entries(this.settings.senderNames).find(([k]) => k.replace(/\D/g, "").slice(-10) === digits)?.[1];
      if (name) {
        const place = locationForName(name);
        if (place) return `near ${place}`;
        void refreshFindMy(); // warm the cache for next time
      }
    }
    return locationForSender(sender);
  }

  private senderLabel(sender: string): string {
    return sender; // phone/email handle; Find My contact-name resolution is not available (encrypted cache)
  }

  private log(a: Activity) { this.activity.unshift(a); if (this.activity.length > 50) this.activity.pop(); }

  private async tick() {
    if (this.busy || !this.settings.enabled) return;
    this.busy = true;
    try {
      const msgs = await newInboundSince(this.watermark);
      if (msgs.length) this.watermark = Math.max(this.watermark, ...msgs.map((m) => m.rowid));
      for (const msg of msgs) await this.handle(msg);
    } catch (err) {
      logger.error("desk.worker.tick_failed", { err });
    } finally {
      this.busy = false;
    }
  }

  // Exposed so the control panel can run the full pipeline on demand (a real call).
  async handle(msg: InboundText): Promise<Activity> {
    if (!this.allowed(msg.sender)) {
      const a: Activity = { at: Date.now(), sender: msg.sender, text: msg.text, outcome: "skipped", detail: "sender not in allow-list" };
      this.log(a); logger.info("desk.worker.skipped", { sender: msg.sender }); return a;
    }
    if (!this.settings.callNumber) {
      const a: Activity = { at: Date.now(), sender: msg.sender, text: msg.text, outcome: "skipped", detail: "no call number set" };
      this.log(a); return a;
    }
    if (!this.underRateLimit()) {
      const a: Activity = { at: Date.now(), sender: msg.sender, text: msg.text, outcome: "skipped", detail: "hourly rate limit" };
      this.log(a); logger.warn("desk.worker.rate_limited"); return a;
    }
    logger.info("desk.worker.handle", { sender: msg.sender, textLength: msg.text.length });
    try {
      const location = await this.resolveLocation(msg.sender);
      const script = await generateScript(this.settings.ollamaModel, { senderLabel: this.senderLabel(msg.sender), text: msg.text, location });
      const wav = await pickSynth(this.settings.ttsEngine)(script, this.settings.voice);
      this.callTimes.push(Date.now());
      await placeCall(this.settings.callNumber);
      await new Promise((r) => setTimeout(r, 1500));
      await confirmFaceTimeCall();
      await new Promise((r) => setTimeout(r, Math.max(0, this.settings.connectDelayMs - 1500)));
      await playIntoBlackhole(wav, this.settings.repeat);
      const a: Activity = { at: Date.now(), sender: msg.sender, text: msg.text, script, outcome: "called", detail: `called ${this.settings.callNumber}` };
      this.log(a); logger.info("desk.worker.called", { sender: msg.sender }); return a;
    } catch (err) {
      const a: Activity = { at: Date.now(), sender: msg.sender, text: msg.text, outcome: "error", detail: (err as Error).message };
      this.log(a); logger.error("desk.worker.handle_failed", { sender: msg.sender, err }); return a;
    }
  }
}
