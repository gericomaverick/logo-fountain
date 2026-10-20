"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { canPinBriefNavigation } from "./brief-feedback";

/** One panel-wide action surface; the slot reserves its measured, safe-area-inclusive height. */
export function BriefNavigation({ children, timeline, stage, modal }: { children: ReactNode; timeline: ReactNode; stage: string; modal: boolean }) {
  const slot = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ left: number; width: number; bottom: number; height: number; radiusLeft: string; radiusRight: string; pinned: boolean; inset: number } | null>(null);

  useEffect(() => {
    const anchor = slot.current;
    const actions = bar.current;
    const panel = anchor?.closest(".app-panel");
    if (!anchor || !actions || !panel) return; // Unknown frame: safe in-flow default.
    let frame = 0;
    function update() {
      if (!anchor || !actions || !panel) return;
      const viewport = window.visualViewport;
      const panelRect = panel.getBoundingClientRect();
      const height = actions.getBoundingClientRect().height;
      const pin = canPinBriefNavigation({ width: window.innerWidth, height: window.innerHeight,
        viewportHeight: viewport?.height ?? window.innerHeight, viewportWidth: viewport?.width ?? window.innerWidth,
        offsetTop: viewport?.offsetTop ?? 0, scale: viewport?.scale ?? 1, modal, barHeight: height });
      const panelStyle = getComputedStyle(panel);
      setPlacement({
        pinned: pin, inset: panelRect.left + panel.clientLeft - anchor.getBoundingClientRect().left,
        left: panelRect.left + panel.clientLeft, width: panel.clientWidth,
        bottom: Math.max(0, window.innerHeight - (panelRect.top + panel.clientTop + panel.clientHeight)), height,
        radiusLeft: panelStyle.borderBottomLeftRadius, radiusRight: panelStyle.borderBottomRightRadius,
      });
      // Native focus scrolling may miss the fixed bar or a shrinking visual viewport.
      // Reveal the focused question/feedback when it fits, otherwise its control.
      const active = document.activeElement;
      const question = active instanceof HTMLElement ? active.closest("[data-brief-field]") : null;
      if (!modal && (viewport?.scale ?? 1) === 1 && question && panel.contains(question) && active instanceof HTMLElement) {
        const viewportTop = viewport?.offsetTop ?? 0;
        const bottom = Math.min(viewportTop + (viewport?.height ?? window.innerHeight),
          panelRect.top + panel.clientTop + panel.clientHeight) - (pin ? height : 0) - 16;
        const top = Math.max(viewportTop, panelRect.top + panel.clientTop) + 16;
        const questionRect = question.getBoundingClientRect();
        const target = questionRect.height <= bottom - top ? questionRect : active.getBoundingClientRect();
        if (target.bottom > bottom) panel.scrollBy({ top: target.bottom - bottom, behavior: "instant" });
        else if (target.top < top) panel.scrollBy({ top: target.top - top, behavior: "instant" });
      }
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

  const pinned = placement?.pinned ?? false;
  const surface: CSSProperties | undefined = placement ? pinned ? {
    position: "fixed", left: placement.left, width: placement.width, bottom: placement.bottom,
    borderBottomLeftRadius: placement.radiusLeft, borderBottomRightRadius: placement.radiusRight,
  } : {
    // Flow changes vertical placement, not the familiar panel-wide surface.
    width: placement.width, marginLeft: placement.inset,
  } : undefined;
  return (
    <div ref={slot} data-brief-nav-slot style={pinned && placement ? { height: placement.height + 16 } : undefined}>
      <div ref={bar} data-brief-navigation data-placement={pinned ? "persistent" : "flow"}
        style={surface}
        className={`@container z-20 border-t border-line bg-surface pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] ${placement ? "px-4 md:px-8" : ""}`}>
        <div data-brief-nav-content className={`${placement ? "w-full" : "mx-auto max-w-[920px]"} @min-[900px]:flex @min-[900px]:items-center @min-[900px]:gap-6`}>
          <div className="mb-3 min-w-0 @min-[900px]:mb-0 @min-[900px]:flex-1">{timeline}</div>
          <p className="mb-3 text-sm text-fg-2 sm:hidden">{stage}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 @min-[900px]:shrink-0 @min-[900px]:flex-nowrap">{children}</div>
        </div>
      </div>
    </div>
  );
}
