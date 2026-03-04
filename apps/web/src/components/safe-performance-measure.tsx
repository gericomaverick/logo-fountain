"use client";

import { useEffect } from "react";

import { installSafePerformanceMeasure } from "@/lib/safe-performance-measure";

export function SafePerformanceMeasure() {
  useEffect(() => {
    installSafePerformanceMeasure();
  }, []);

  return null;
}
