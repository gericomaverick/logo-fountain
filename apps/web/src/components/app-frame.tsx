"use client";

import { type ReactNode, useContext } from "react";

import { FrameContext } from "@/components/frame-context";
import { AppSidebar } from "@/components/header-nav";

/**
 * The app's frame: the sidebar, and the page in an inset panel beside it.
 * A frame inside a frame (an admin page inside the admin layout's) renders
 * only its children, so there is one sidebar.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const framed = useContext(FrameContext);
  if (framed) return <>{children}</>;
  return (
    <FrameContext.Provider value>
      <div className="app-frame">
        <AppSidebar />
        <div className="app-panel">{children}</div>
      </div>
    </FrameContext.Provider>
  );
}
