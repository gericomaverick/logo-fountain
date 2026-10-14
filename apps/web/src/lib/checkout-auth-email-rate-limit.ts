import "server-only";

import { createHash } from "node:crypto";

const SESSION_WINDOW_MS = 15 * 60_000;
const SESSION_MAX_SENDS = 3;
const DESTINATION_WINDOW_MS = 60 * 60_000;
const DESTINATION_MAX_SENDS = 5;
const MAX_BUCKETS = 10_000;

type Bucket = { timestamps: number[]; expiresAt: number };
type LimitInput = { sessionId: string; destination: string; now?: number };
type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Process-local fallback because this project does not currently have a shared
 * rate-limit service. It is bounded and expiring, but limits are per application
 * instance and reset on restart. Replace this implementation with a distributed,
 * atomic store before horizontally scaling public checkout email endpoints.
 */
const buckets = new Map<string, Bucket>();

function opaqueKey(scope: "session" | "destination", value: string): string {
  return `${scope}:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex")}`;
}

function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key);
  }

  while (buckets.size >= MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }
}

function activeTimestamps(key: string, now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return (buckets.get(key)?.timestamps ?? []).filter((timestamp) => timestamp > cutoff);
}

function retryAfterSeconds(timestamps: number[], now: number, windowMs: number): number {
  return Math.max(1, Math.ceil((timestamps[0] + windowMs - now) / 1000));
}

export function consumeCheckoutAuthEmailLimit({ sessionId, destination, now = Date.now() }: LimitInput): LimitResult {
  prune(now);

  const constraints = [
    { key: opaqueKey("session", sessionId), windowMs: SESSION_WINDOW_MS, max: SESSION_MAX_SENDS },
    { key: opaqueKey("destination", destination), windowMs: DESTINATION_WINDOW_MS, max: DESTINATION_MAX_SENDS },
  ];

  const active = constraints.map((constraint) => ({
    ...constraint,
    timestamps: activeTimestamps(constraint.key, now, constraint.windowMs),
  }));

  const blocked = active.find((constraint) => constraint.timestamps.length >= constraint.max);
  if (blocked) {
    return { allowed: false, retryAfterSeconds: retryAfterSeconds(blocked.timestamps, now, blocked.windowMs) };
  }

  // Consume synchronously before email I/O, preventing concurrent requests in
  // this process from all passing the check. Failed sends still consume quota.
  for (const constraint of active) {
    const timestamps = [...constraint.timestamps, now];
    buckets.delete(constraint.key);
    while (buckets.size >= MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value as string | undefined;
      if (!oldestKey) break;
      buckets.delete(oldestKey);
    }
    buckets.set(constraint.key, { timestamps, expiresAt: timestamps[0] + constraint.windowMs });
  }

  return { allowed: true };
}

export function resetCheckoutAuthEmailLimitForTests(): void {
  buckets.clear();
}
