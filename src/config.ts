import "dotenv/config";

export interface Config {
  port: number;
  serviceName: string;
  ollamaModel: string;
  dbPath: string;
  pollMs: number;
  autoReply: boolean;        // send intake questions/acks over SMS automatically
  operatorToken: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT) || 4200,
    serviceName: env.SERVICE_NAME?.trim() || "Guardian",
    ollamaModel: env.OLLAMA_MODEL?.trim() || "llama3.2:3b",
    dbPath: env.DB_PATH?.trim() || "guardian.sqlite",
    pollMs: Number(env.POLL_MS) || 4000,
    autoReply: env.AUTO_REPLY !== "false",
    operatorToken: env.OPERATOR_TOKEN?.trim() || "",
  };
}
