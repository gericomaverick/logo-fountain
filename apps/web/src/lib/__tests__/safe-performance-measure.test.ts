import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installSafePerformanceMeasure, __resetSafePerformanceMeasureForTesting } from "../safe-performance-measure";

describe("installSafePerformanceMeasure", () => {
  const originalPerformance = globalThis.performance;
  let measureSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const marks: Record<string, number[]> = {};
    measureSpy = vi.fn();

    globalThis.performance = {
      measure: measureSpy as unknown as Performance["measure"],
      getEntriesByName: vi.fn((name: string) =>
        (marks[name] ?? []).map((startTime) => ({
          name,
          entryType: "mark",
          startTime,
          duration: 0,
          toJSON: () => ({ name, entryType: "mark", startTime, duration: 0 }),
        })),
      ),
      mark: vi.fn((name: string) => {
        marks[name] = marks[name] ?? [];
        marks[name].push(42);
        return undefined as unknown as PerformanceMark;
      }),
      clearMeasures: vi.fn(),
      clearMarks: vi.fn(),
      clearResourceTimings: vi.fn(),
      getEntries: vi.fn(),
      getEntriesByType: vi.fn(),
      now: vi.fn(() => 1000),
      setResourceTimingBufferSize: vi.fn(),
      timeOrigin: 0,
      timing: {} as PerformanceTiming,
      toJSON: vi.fn(),
      eventCounts: {} as EventCounts,
      navigation: {} as PerformanceNavigation,
    } as unknown as Performance;

    __resetSafePerformanceMeasureForTesting();
  });

  afterEach(() => {
    __resetSafePerformanceMeasureForTesting();
    globalThis.performance = originalPerformance;
  });

  it("skips measurements when end precedes start", () => {
    installSafePerformanceMeasure();
    const perf = globalThis.performance;

    perf.measure("DashboardPage", { start: 10, end: 5 });

    expect(measureSpy).not.toHaveBeenCalled();
  });

  it("skips measurements when mark references are missing", () => {
    installSafePerformanceMeasure();
    const perf = globalThis.performance;

    perf.measure("missing-mark", "does-not-exist", "end-mark");

    expect(measureSpy).not.toHaveBeenCalled();
  });

  it("delegates to the native measure when timestamps are valid", () => {
    installSafePerformanceMeasure();
    const perf = globalThis.performance;

    perf.measure("ok", { start: 5, end: 10 });

    expect(measureSpy).toHaveBeenCalledWith("ok", { start: 5, end: 10 });
  });
});
