"use client";

import Link from "next/link";
import Image from "next/image";
import { logoutAndVerifySession } from "@/lib/auth/logout";
import { usePathname, useRouter } from "next/navigation";
import { useContext, useEffect, useState } from "react";

import { FrameContext } from "@/components/frame-context";
import { ActivityIcon, InboxIcon, LayersIcon, LogOutIcon, MenuIcon, ReceiptIcon, SettingsIcon, XIcon } from "@/components/icons";
import { ThemeSwitcher } from "@/components/theme-switcher";

export type SessionPayload = {
  authenticated: boolean;
  email?: string;
  isAdmin?: boolean;
};

export function shouldShowClientInvoicesNav(session: SessionPayload): boolean {
  return Boolean(session.authenticated && !session.isAdmin);
}

type NavItem = { href: string; label: string; Icon: typeof InboxIcon; active: (path: string) => boolean };

export function navItemsFor(session: SessionPayload): NavItem[] {
  if (!session.authenticated) return [];
  const settings: NavItem = { href: "/settings", label: "Settings", Icon: SettingsIcon, active: (p) => p === "/settings" };
  if (session.isAdmin) {
    return [
      { href: "/admin", label: "Queue", Icon: InboxIcon, active: (p) => p === "/admin" || p.startsWith("/admin/projects") },
      { href: "/admin/health", label: "Health", Icon: ActivityIcon, active: (p) => p.startsWith("/admin/health") },
      settings,
    ];
  }
  return [
    { href: "/dashboard", label: "Projects", Icon: LayersIcon, active: (p) => p === "/dashboard" || p.startsWith("/project/") },
    ...(shouldShowClientInvoicesNav(session)
      ? [{ href: "/settings/invoices", label: "Invoices", Icon: ReceiptIcon, active: (p: string) => p.startsWith("/settings/invoices") }]
      : []),
    settings,
  ];
}

function initialsOf(email: string | undefined): string {
  const name = (email ?? "").split("@")[0].replace(/[^a-z0-9]+/gi, " ").trim();
  const parts = name.split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** The app's sidebar: brand, navigation for the signed-in role, and the person's own controls. */
export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [session, setSession] = useState<SessionPayload>({ authenticated: false });
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as SessionPayload | null;

        if (!cancelled) {
          setSession(payload ?? { authenticated: false });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // A link followed on a phone closes the drawer behind it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  async function logout() {
    setLoggingOut(true);

    setLogoutError(null);
    try {
      await logoutAndVerifySession();
      setSession({ authenticated: false });
      router.push("/login");
      router.refresh();
    } catch {
      setLogoutError("Sign-out could not be confirmed. Your session may still be active. Please retry.");
    } finally {
      setLoggingOut(false);
    }
  }

  const items = navItemsFor(session);
  const brand = (
    <Link
      href={session.isAdmin ? "/admin" : "/dashboard"}
      className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-base font-semibold tracking-tight text-fg transition-colors hover:bg-nav-active/60"
    >
      <span className="flex shrink-0 dark:invert">
        <Image src="/img/logo.svg" alt="Logo Fountain" width={410} height={386} unoptimized className="h-5 w-auto" />
      </span>
      <span className="truncate">Logo Fountain</span>
      {session.isAdmin ? <span className="ml-auto rounded border border-line px-1.5 text-xs font-medium text-fg-3">Admin</span> : null}
    </Link>
  );

  return (
    <>
      {/* Phones: a slim bar with the brand and a button for the drawer. */}
      <div className="flex items-center gap-2 border-b border-line bg-app px-2 py-1.5 md:hidden">
        <button type="button" className="portal-btn-ghost h-8 w-8 px-0" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}>
          <MenuIcon />
        </button>
        {brand}
      </div>
      {open ? <div className="fixed inset-0 z-40 bg-black/40 md:hidden" aria-hidden onClick={() => setOpen(false)} /> : null}

      <aside
        aria-label="Primary"
        className={`fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-w)] flex-col bg-app px-2 pb-2 pt-2 transition-transform md:static md:z-auto md:translate-x-0 ${
          open ? "translate-x-0 border-r border-line" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">{brand}</div>
          <button type="button" className="portal-btn-ghost h-7 w-7 px-0 md:hidden" aria-label="Close navigation" onClick={() => setOpen(false)}>
            <XIcon size={14} />
          </button>
        </div>

        <nav className="mt-4 flex flex-col gap-px" aria-label="Main">
          {loading
            ? [0, 1, 2].map((n) => <div key={n} className="mx-2 my-1.5 h-4 animate-pulse rounded bg-surface-2" />)
            : items.map(({ href, label, Icon, active }) => {
                const current = active(pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={current ? "page" : undefined}
                    className={`relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
                      current ? "bg-nav-active text-fg before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent" : "text-fg-2 hover:bg-nav-active/60 hover:text-fg"
                    }`}
                  >
                    <Icon size={17} className={current ? "text-accent" : "text-fg-3"} />
                    {label}
                  </Link>
                );
              })}
          {!loading && !session.authenticated ? (
            <Link className="flex h-9 items-center rounded-md px-2.5 text-sm font-medium text-fg-2 hover:bg-surface-2 hover:text-fg" href="/login">
              Sign in
            </Link>
          ) : null}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-2">
          {logoutError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-2 py-1.5 text-sm text-danger">
              {logoutError}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-sm text-fg-3">Theme</span>
            <ThemeSwitcher />
          </div>
          {session.authenticated ? (
            <div className="flex items-center gap-2 rounded-md px-1 py-1">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                {initialsOf(session.email)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-fg-2" title={session.email}>
                {session.email ?? "Signed in"}
              </span>
              <button
                type="button"
                className="portal-btn-ghost h-7 w-7 px-0"
                disabled={loggingOut}
                aria-label={loggingOut ? "Signing out" : "Sign out"}
                title="Sign out"
                onClick={() => {
                  void logout();
                }}
              >
                <LogOutIcon size={14} />
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

/**
 * Pages still render this where the old top bar was. Inside the app frame,
 * which draws the sidebar itself, it renders nothing; on its own it is the
 * sidebar.
 */
export function HeaderNav() {
  const framed = useContext(FrameContext);
  return framed ? null : <AppSidebar />;
}
