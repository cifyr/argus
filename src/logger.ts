type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  const line = `${new Date().toISOString()} [${level}] ${msg}`;
  const fn = level === "info" ? console.log : console.error;
  data === undefined ? fn(line) : fn(line, data);
}

export const logger = {
  info: (msg: string, data?: Record<string, unknown>) => emit("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => emit("warn", msg, data),
  error: (msg: string, data?: Record<string, unknown>) => emit("error", msg, data),
};
