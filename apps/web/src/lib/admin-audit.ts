export function summarizeAuditPayload(payload: unknown): string {
  if (payload == null) return "—";
  if (typeof payload === "string" || typeof payload === "number" || typeof payload === "boolean") return String(payload);
  if (Array.isArray(payload)) return `${payload.length} item${payload.length === 1 ? "" : "s"}`;
  if (typeof payload !== "object") return "—";

  const entries = Object.entries(payload as Record<string, unknown>).slice(0, 3);
  if (entries.length === 0) return "{}";

  return entries
    .map(([key, value]) => {
      if (value == null) return `${key}=null`;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return `${key}=${String(value)}`;
      if (Array.isArray(value)) return `${key}=[${value.length}]`;
      if (typeof value === "object") return `${key}={…}`;
      return `${key}=…`;
    })
    .join(", ");
}
