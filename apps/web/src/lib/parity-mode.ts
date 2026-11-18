// Test-only seams for the shared parity suite (tests/parity, inventory O-09). Every override is inert
// unless PARITY_MODE=1, and parity mode is refused in production so a stray variable can't redirect
// live email, storage or payments.

function parityModeEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.PARITY_MODE !== "1") return false;
  if (env.NODE_ENV === "production") throw new Error("PARITY_MODE is not allowed in production");
  return true;
}

/** The named override when parity mode is on, otherwise undefined. */
export function parityOverride(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!parityModeEnabled(env)) return undefined;
  const value = env[name]?.trim();
  return value ? value : undefined;
}

/** Stripe SDK connection options pointing at the stripe-fake service, or {} outside parity mode. */
export function stripeParityOptions(env: NodeJS.ProcessEnv = process.env): { host?: string; port?: number; protocol?: "http" | "https" } {
  const base = parityOverride("STRIPE_API_BASE", env);
  if (!base) return {};
  const url = new URL(base);
  const protocol = url.protocol === "http:" ? "http" : "https";
  return { host: url.hostname, port: Number(url.port || (protocol === "http" ? 80 : 443)), protocol };
}
