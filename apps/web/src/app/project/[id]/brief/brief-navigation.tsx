"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { canPinBriefNavigation } from "./brief-feedback";

/** One DOM action set; the wrapper reserves the measured, safe-area-inclusive height. */
export function BriefNavigation({ children, stage, modal }: { children: ReactNode; stage: string; modal: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; width: number; bottom: number; height: number } | null>(null);

  useEffect(() => {
    const anchor = slot.current;
    const actions = bar.current;
    const panel = anchor?.closest(".app-panel");
    if (!anchor || !actions || !panel) return; // Unknown frame: safe in-flow default.
    let frame = 0;
    function update() {
      if (!anchor || !actions || !panel) return;
      const viewport = window.visualViewport;
      const active = document.activeElement;
      const editing = active instanceof HTMLElement && (active.matches("input, textarea, select") || active.isContentEditable);
      const rect = anchor.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const height = actions.getBoundingClientRect().height;
      const pin = canPinBriefNavigation({ width: window.innerWidth, height: window.innerHeight,
        viewportHeight: viewport?.height ?? window.innerHeight, viewportWidth: viewport?.width ?? window.innerWidth,
        offsetTop: viewport?.offsetTop ?? 0, scale: viewport?.scale ?? 1, editing, modal, barHeight: height });
      setPlacement(pin ? { left: rect.left, width: rect.width, bottom: Math.max(0, window.innerHeight - panelRect.bottom), height } : null);
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }
    const observer = new ResizeObserver(schedule);
    observer.observe(actions); observer.observe(panel); observer.observe(anchor);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule); document.removeEventListener("focusout", schedule);
    };
  }, [modal]);

  const fixed: CSSProperties | undefined = placement ? {
    position: "fixed", left: placement.left, width: placement.width, bottom: placement.bottom,
  } : undefined;
  return (
    <div ref={slot} data-brief-nav-slot style={placement ? { height: placement.height + 16 } : undefined}>
      <div ref={bar} data-brief-navigation data-placement={placement ? "persistent" : "flow"}
        style={fixed}
        className="z-20 border-t border-line bg-panel pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="mb-2 text-sm text-fg-2 lg:hidden">{stage}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">{children}</div>
      </div>
    </div>
  );
}
