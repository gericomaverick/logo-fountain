import "server-only";

import { createHash } from "node:crypto";

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_BUCKETS = 10_000;
type Bucket = { timestamps: number[]; expiresAt: number };
const buckets = new Map<string, Bucket>();

function key(scope: "address" | "email", value: string): string {
  return `${scope}:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex")}`;
}

function consume(keyValue: string, now: number): boolean {
  for (const [storedKey, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(storedKey);
  }
  const timestamps = (buckets.get(keyValue)?.timestamps ?? []).filter((value) => value > now - WINDOW_MS);
  if (timestamps.length >= MAX_ATTEMPTS) return false;
  while (buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value as string | undefined;
    if (!oldest) break;
    buckets.delete(oldest);
  }
  timestamps.push(now);
  buckets.delete(keyValue);
  buckets.set(keyValue, { timestamps, expiresAt: timestamps[0] + WINDOW_MS });
  return true;
}

/**
 * Bounded process-local abuse control. Limits reset on restart and are not shared
 * between app instances; replace with an atomic distributed limiter before scaling.
 */
export function consumeForgotPasswordLimit(input: { address: string; email: string; now?: number }): boolean {
  const now = input.now ?? Date.now();
  const addressKey = key("address", input.address || "unknown");
  const emailKey = key("email", input.email);
  // Evaluate both buckets before consuming either to avoid partial consumption.
  const addressAllowed = (buckets.get(addressKey)?.timestamps ?? []).filter((value) => value > now - WINDOW_MS).length < MAX_ATTEMPTS;
  const emailAllowed = (buckets.get(emailKey)?.timestamps ?? []).filter((value) => value > now - WINDOW_MS).length < MAX_ATTEMPTS;
  if (!addressAllowed || !emailAllowed) return false;
  return consume(addressKey, now) && consume(emailKey, now);
}

export function resetForgotPasswordLimitForTests(): void {
  buckets.clear();
}
