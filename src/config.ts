import "dotenv/config";
import path from "node:path";

export interface Config {
  port: number;
  serviceName: string;
  ollamaModel: string;
  dbPath: string;
  pollMs: number;
  autoReply: boolean;        // send intake questions/acks over SMS automatically
  operatorToken: string;
  replyAllowlist: string[];
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT) || 4200,
    serviceName: env.SERVICE_NAME?.trim() || "Argus",
    ollamaModel: env.OLLAMA_MODEL?.trim() || "llama3.2:3b",
    dbPath: path.resolve(env.DB_PATH?.trim() || "argus.sqlite"),
    pollMs: Number(env.POLL_MS) || 4000,
    autoReply: env.AUTO_REPLY !== "false",
    operatorToken: env.OPERATOR_TOKEN?.trim() || "",
    replyAllowlist: (env.REPLY_ALLOWLIST || "").split(",").map((x) => x.replace(/\D/g, "").slice(-10)).filter(Boolean),
  };
}
