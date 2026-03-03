export type WebhookErrorClassification = {
  kind: "transient" | "permanent";
  shouldRetry: boolean;
  responseStatus: number;
  logLevel: "warn" | "error";
  reason: string;
};

function errorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string") {
    return (error as { code: string }).code;
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? "unknown error");
}

const TRANSIENT_CODES = new Set([
  "P1001", // prisma: db unreachable
  "P1002", // prisma: db timeout
  "P2024", // prisma: timeout getting connection
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
]);

export function classifyWebhookError(error: unknown): WebhookErrorClassification {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();

  if (code && TRANSIENT_CODES.has(code)) {
    return {
      kind: "transient",
      shouldRetry: true,
      responseStatus: 500,
      logLevel: "error",
      reason: `transient_code:${code}`,
    };
  }

  if (
    message.includes("timeout") ||
    message.includes("rate limit") ||
    message.includes("temporarily unavailable") ||
    message.includes("network")
  ) {
    return {
      kind: "transient",
      shouldRetry: true,
      responseStatus: 500,
      logLevel: "error",
      reason: "transient_message",
    };
  }

  if (
    message.includes("malformed stripe event payload") ||
    message.includes("allowlisted package") ||
    message.includes("missing checkout session id")
  ) {
    return {
      kind: "permanent",
      shouldRetry: false,
      responseStatus: 200,
      logLevel: "warn",
      reason: "permanent_payload",
    };
  }

  return {
    kind: "transient",
    shouldRetry: true,
    responseStatus: 500,
    logLevel: "error",
    reason: "default_transient",
  };
}
