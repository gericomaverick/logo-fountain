// Which app the suite is driving. This is the ONLY place that knows about targets,
// alongside the per-target page objects in pages/next and pages/laravel.

export type Target = "next" | "laravel";

const DEFAULT_BASE_URL: Record<Target, string> = {
  next: "http://127.0.0.1:4310",
  laravel: "http://127.0.0.1:8000",
};

export function resolveTarget(env: NodeJS.ProcessEnv = process.env): Target {
  const value = env.PARITY_TARGET;
  if (value === "next" || value === "laravel") return value;
  throw new Error(`PARITY_TARGET must be "next" or "laravel" (got ${value === undefined ? "nothing" : JSON.stringify(value)})`);
}

export function resolveBaseUrl(target: Target, env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.PARITY_BASE_URL?.trim() || DEFAULT_BASE_URL[target];
  const url = new URL(raw);
  return url.origin;
}
