import type { Page } from "playwright";
import { logger } from "../logger.js";

// Google Voice runs in a single tab, so every operation (poll, send, call) is serialized through this queue.
export class GvSession {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly page: Page) {}

  run<T>(label: string, fn: (page: Page) => Promise<T>): Promise<T> {
    const started = Date.now();
    const next = this.tail.then(
      async () => {
        logger.info("gv.op.start", { label, queuedMs: Date.now() - started });
        try {
          return await fn(this.page);
        } finally {
          logger.info("gv.op.end", { label, ms: Date.now() - started });
        }
      },
    );
    this.tail = next.catch(() => undefined);
    return next;
  }
}
