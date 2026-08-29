import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { currentMaxRowId, newInboundSince, sendSms, type InboundText } from "./sms.js";
import { hasHelpKeyword, classifyEmergency } from "./ollama.js";
import { advanceIntake, firstQuestion } from "./intake.js";
import { logger } from "./logger.js";

export class Worker {
  private watermark = 0;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private started = false;

  constructor(private config: Config, private db: Db) {}

  async start(): Promise<void> {
    if (this.started) return;
    this.watermark = await currentMaxRowId().catch(() => 0);
    this.started = true;
    logger.info("worker.start", { watermark: this.watermark, autoReply: this.config.autoReply });
    this.timer = setInterval(() => void this.tick(), this.config.pollMs);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const msgs = await newInboundSince(this.watermark);
      if (msgs.length) this.watermark = Math.max(this.watermark, ...msgs.map((m) => m.rowid));
      for (const m of msgs) await this.handle(m);
    } catch (err) {
      logger.error("worker.tick_failed", { err });
    } finally {
      this.busy = false;
    }
  }

  private async reply(to: string, body: string): Promise<void> {
    this.db.addMessage(to, "out", body, "system");
    if (this.config.autoReply) {
      try { await sendSms(to, body); }
      catch (err) { logger.error("worker.reply_failed", { to, err }); }
    }
  }

  async handle(msg: InboundText): Promise<void> {
    const { from, text } = msg;
    this.db.addMessage(from, "in", text, "other");
    const person = this.db.getPerson(from);
    logger.info("worker.inbound", { from, known: Boolean(person), intakeDone: person?.intake_done });

    // Emergency at any time takes priority. Explicit help words always; LLM classification only
    // for registered people, so intake answers (medications, conditions) are never misread.
    const emergency = hasHelpKeyword(text) || (person?.intake_done ? await classifyEmergency(this.config.ollamaModel, text) : false);
    if (emergency) {
      this.db.openHelpRequest(from, text);
      logger.warn("worker.help_request", { from, text: text.slice(0, 80) });
      await this.reply(from, "We got your message and we're getting help to you. Tell us anything else you can, and stay where you are.");
      return;
    }

    // New person -> begin intake.
    if (!person) {
      this.db.createPerson(from);
      const q = firstQuestion(this.config.serviceName);
      this.db.updatePerson(from, { intake_step: 1 });
      await this.reply(from, q);
      return;
    }

    // Mid-intake -> treat as an answer and ask the next question.
    if (!person.intake_done) {
      const res = await advanceIntake(this.db, this.config.ollamaModel, this.config.serviceName, person, text);
      if (res.reply) await this.reply(from, res.reply);
      return;
    }

    // Registered, non-emergency chatter.
    logger.info("worker.non_emergency", { from });
  }
}
