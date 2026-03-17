function resolveMarkTimestamp(input: number | string | undefined, perf: Performance): number | undefined {
  if (typeof input === "number") {
    return input;
  }

  if (typeof input === "string" && input.length > 0) {
    const entries = perf.getEntriesByName(input, "mark");
    if (entries.length > 0) {
      return entries[entries.length - 1].startTime;
    }
  }

  return undefined;
}

function shouldSkipMeasure(
  perf: Performance,
  start?: number | string,
  end?: number | string,
): { skip: boolean; start?: number; end?: number } {
  const resolvedStart = resolveMarkTimestamp(start, perf);
  const resolvedEnd = resolveMarkTimestamp(end, perf);

  if (typeof start !== "undefined" && typeof resolvedStart === "undefined") {
    return { skip: true };
  }

  if (typeof end !== "undefined" && typeof resolvedEnd === "undefined") {
    return { skip: true };
  }

  if (typeof resolvedStart === "number" && typeof resolvedEnd === "number" && resolvedEnd < resolvedStart) {
    return { skip: true, start: resolvedStart, end: resolvedEnd };
  }

  return { skip: false, start: resolvedStart, end: resolvedEnd };
}

const PATCH_STATE = Symbol.for("safe-performance-measure:patch-state");

interface PatchedPerformance extends Performance {
  [PATCH_STATE]?: {
    originalMeasure: Performance["measure"];
  };
}

let installed = false;

function logSkip(name: string, reason: string) {
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[perf] skipped measure "${name}": ${reason}`);
  }
}

function isNegativeTimestampError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("negative time stamp");
}

export function installSafePerformanceMeasure(): void {
  if (installed) return;
  const perf: PatchedPerformance | undefined = typeof performance !== "undefined" ? (performance as PatchedPerformance) : undefined;
  if (!perf) return;
  if (perf[PATCH_STATE]) {
    installed = true;
    return;
  }
  const originalMeasure = perf.measure.bind(perf);
  perf[PATCH_STATE] = { originalMeasure };
  installed = true;

  perf.measure = function safeMeasure(
    ...args: Parameters<Performance["measure"]>
  ): ReturnType<Performance["measure"]> {
    const [name, startOrOptions, endMark] = args;
    const isOptionsObject = typeof startOrOptions === "object" && startOrOptions !== null;

    if (isOptionsObject) {
      const { start, end } = startOrOptions as PerformanceMeasureOptions;
      const check = shouldSkipMeasure(perf, start, end);
      if (check.skip) {
        const details = typeof check.start === "number" && typeof check.end === "number"
          ? `start=${check.start.toFixed(2)}, end=${check.end.toFixed(2)}`
          : "missing marks";
        logSkip(name, details);
        return undefined as unknown as ReturnType<Performance["measure"]>;
      }
    } else if (typeof startOrOptions === "string" || typeof endMark === "string") {
      const check = shouldSkipMeasure(perf, startOrOptions, endMark);
      if (check.skip) {
        logSkip(name, "missing marks");
        return undefined as unknown as ReturnType<Performance["measure"]>;
      }
    }

    try {
      return originalMeasure(...args);
    } catch (error) {
      if (isNegativeTimestampError(error)) {
        logSkip(name, "runtime negative timestamp");
        return undefined as unknown as ReturnType<Performance["measure"]>;
      }
      throw error;
    }
  } as Performance["measure"];
}

export function __resetSafePerformanceMeasureForTesting() {
  installed = false;
  if (typeof performance === "undefined") return;
  const perf = performance as PatchedPerformance;
  const state = perf[PATCH_STATE];
  if (state?.originalMeasure) {
    perf.measure = state.originalMeasure;
    delete perf[PATCH_STATE];
  }
}
