"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Search,
  Bell,
  Grid2x2,
  Grid3x3,
  Command,
  LogOut,
  Camera,
  AlertTriangle,
  Activity,
  X,
  Sun,
  Moon,
  Monitor,
  Menu,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { getUserFromToken } from "@/hooks/use-auth";
import { useEventStream } from "@/hooks/use-event-stream";
import type { OSPEvent } from "@osp/shared";

/* ------------------------------------------------------------------ */
/*  Constants                                                           */
/* ------------------------------------------------------------------ */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const PATH_LABELS: Record<string, string> = {
  "/cameras": "Cameras",
  "/events": "Events & Alerts",
  "/recordings": "Recordings",
  "/rules": "Rules",
  "/settings": "Settings",
  "/health": "System Health",
  "/locations": "Locations",
};

const MAX_NOTIF_DISPLAY = 5;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function getPageTitle(pathname: string): string {
  // Exact match first
  if (PATH_LABELS[pathname]) return PATH_LABELS[pathname];

  // Prefix match for nested routes (e.g. /cameras/abc-123)
  const matched = Object.keys(PATH_LABELS).find((prefix) =>
    pathname.startsWith(`${prefix}/`),
  );
  return matched ? (PATH_LABELS[matched] ?? "Dashboard") : "Dashboard";
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffSec = Math.floor(diffMs / 1_000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function eventTypeIcon(type: OSPEvent["type"]) {
  switch (type) {
    case "motion":
    case "person":
    case "vehicle":
    case "animal":
      return <Activity className="h-4 w-4 shrink-0 text-amber-400" />;
    case "camera_offline":
    case "camera_online":
      return <Camera className="h-4 w-4 shrink-0 text-blue-400" />;
    case "tampering":
    case "audio":
    default:
      return <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />;
  }
}

/* ------------------------------------------------------------------ */
/*  TopBar                                                             */
/* ------------------------------------------------------------------ */

interface TopBarProps {
  /** Callback to toggle the mobile sidebar drawer */
  readonly onMenuToggle?: () => void;
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // ---- User menu ----
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const { theme, cycleTheme, resolvedTheme } = useTheme();
  const jwtUser = useMemo(() => getUserFromToken(), []);
  const userEmail = jwtUser?.email ?? "unknown";
  const userInitial = userEmail.charAt(0).toUpperCase();

  // ---- Search dialog ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    { id: string; name: string; href: string }[]
  >([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // ---- Notifications ----
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const { events } = useEventStream();
  const recentEvents = useMemo(
    () => events.slice(0, MAX_NOTIF_DISPLAY),
    [events],
  );
  const hasEvents = events.length > 0;

  /* ---------------------------------------------------------------- */
  /*  Derived state                                                    */
  /* ---------------------------------------------------------------- */

  const currentGrid = searchParams.get("grid") ?? "3";
  const pageTitle = getPageTitle(pathname);

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */

  const handleSignOut = () => {
    localStorage.removeItem("osp_access_token");
    localStorage.removeItem("osp_refresh_token");
    window.location.href = "/login";
  };

  const setGrid = useCallback(
    (size: "2" | "3") => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("grid", size);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Camera search                                                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!searchOpen) return;
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }

    const controller = new AbortController();
    const token = localStorage.getItem("osp_access_token");

    const run = async () => {
      try {
        const url = new URL(`${API_URL}/api/v1/cameras`);
        url.searchParams.set("search", trimmed);
        const res = await fetch(url.toString(), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = await res.json() as {
          success: boolean;
          data?: { id: string; name: string }[];
        };
        if (json.success && Array.isArray(json.data)) {
          setSearchResults(
            json.data.map((c) => ({
              id: c.id,
              name: c.name,
              href: `/cameras/${c.id}`,
            })),
          );
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setSearchResults([]);
        }
      }
    };

    const timer = setTimeout(() => { void run(); }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, searchOpen]);

  /* ---------------------------------------------------------------- */
  /*  Keyboard shortcuts                                               */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if (e.key === "Escape") {
        closeSearch();
        setNotifOpen(false);
        setMenuOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeSearch]);

  // Auto-focus search input when dialog opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [searchOpen]);

  /* ---------------------------------------------------------------- */
  /*  Outside-click handlers                                           */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [notifOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        closeSearch();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [searchOpen, closeSearch]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950/80 px-4 lg:gap-4 lg:px-6 backdrop-blur-sm">
        {/* -- Hamburger menu (mobile only) ------------------------------ */}
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="flex h-10 w-10 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors duration-150 cursor-pointer lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

        {/* -- Breadcrumb / Page title ----------------------------------- */}
        <div className="flex min-w-0 items-center gap-2">
          {/* Mobile: show OSP logo centered concept; Desktop: show page title */}
          <h1 className="truncate text-sm font-semibold text-zinc-100">
            <span className="hidden lg:inline">{pageTitle}</span>
            <span className="lg:hidden">OSP</span>
          </h1>
        </div>

        {/* -- Spacer --------------------------------------------------- */}
        <div className="flex-1" />

        {/* -- Search trigger (center) ---------------------------------- */}
        <div className="hidden w-full max-w-md md:block">
          <button
            type="button"
            onClick={openSearch}
            className="flex w-full items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-500 transition-colors duration-150 hover:border-zinc-700 hover:text-zinc-400 cursor-pointer"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Search cameras...</span>
            <kbd className="pointer-events-none hidden items-center gap-0.5 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 sm:inline-flex">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
        </div>

        {/* -- Spacer --------------------------------------------------- */}
        <div className="flex-1" />

        {/* -- Actions (right) ------------------------------------------ */}
        <div className="flex items-center gap-1">
          {/* Grid size toggles (hidden on mobile) */}
          <button
            type="button"
            onClick={() => setGrid("2")}
            className={`hidden lg:inline-flex rounded-md p-2 transition-colors duration-150 cursor-pointer ${
              currentGrid === "2"
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
            }`}
            aria-label="Grid 2x2 view"
          >
            <Grid2x2 className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setGrid("3")}
            className={`hidden lg:inline-flex rounded-md p-2 transition-colors duration-150 cursor-pointer ${
              currentGrid === "3"
                ? "bg-zinc-800 text-zinc-200"
                : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300"
            }`}
            aria-label="Grid 3x3 view"
          >
            <Grid3x3 className="h-5 w-5" />
          </button>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={cycleTheme}
            className="rounded-md p-2 text-zinc-500 transition-colors duration-150 hover:bg-zinc-800/50 hover:text-zinc-300 cursor-pointer"
            aria-label={`Theme: ${theme}`}
            title={`Theme: ${theme} (${resolvedTheme})`}
          >
            {theme === "system" ? (
              <Monitor className="h-5 w-5" />
            ) : resolvedTheme === "dark" ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </button>

          {/* Divider (hidden on mobile) */}
          <div className="mx-1 hidden h-5 w-px bg-zinc-800 lg:block" />

          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => setNotifOpen((prev) => !prev)}
              className="relative rounded-md p-2 text-zinc-500 transition-colors duration-150 hover:bg-zinc-800/50 hover:text-zinc-300 cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {hasEvents && (
                <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
                  <span className="animate-pulse-live absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl z-50">
                <div className="px-3 py-2 border-b border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    Recent Alerts
                  </p>
                </div>

                {recentEvents.length === 0 ? (
                  <div className="px-3 py-4 text-center text-sm text-zinc-500">
                    No recent alerts
                  </div>
                ) : (
                  <ul>
                    {recentEvents.map((event) => (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={() => {
                            router.push(`/cameras/${event.cameraId}`);
                            setNotifOpen(false);
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-zinc-800/50 cursor-pointer"
                        >
                          {eventTypeIcon(event.type)}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-zinc-200">
                              {event.cameraName}
                            </p>
                            <p className="text-xs text-zinc-500 capitalize">
                              {event.type.replace(/_/g, " ")}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-zinc-500">
                            {formatRelativeTime(event.detectedAt)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="border-t border-zinc-800 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      router.push("/events");
                      setNotifOpen(false);
                    }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors duration-150 cursor-pointer"
                  >
                    View All
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="mx-1 h-5 w-px bg-zinc-800" />

          {/* User avatar + dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300 transition-colors duration-150 hover:ring-1 hover:ring-blue-500/50 cursor-pointer"
              aria-label="User menu"
            >
              {userInitial}
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl z-50">
                <div className="px-3 py-2">
                  <p className="text-sm text-zinc-200 truncate">{userEmail}</p>
                </div>
                <div className="mx-2 h-px bg-zinc-800" />
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-500 transition-colors duration-150 hover:text-red-400 hover:bg-zinc-800/50 cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* -- Search Modal -------------------------------------------- */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Dialog */}
          <div
            ref={searchRef}
            className="relative w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
          >
            {/* Input row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800">
              <Search className="h-4 w-4 shrink-0 text-zinc-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cameras..."
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
              />
              <button
                type="button"
                onClick={closeSearch}
                className="rounded p-1 text-zinc-500 hover:text-zinc-300 transition-colors duration-150 cursor-pointer"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results */}
            {searchQuery.trim() && (
              <ul className="max-h-72 overflow-y-auto py-1">
                {searchResults.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-zinc-500">
                    No cameras found
                  </li>
                ) : (
                  searchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        onClick={() => {
                          router.push(result.href);
                          closeSearch();
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-zinc-800/50 cursor-pointer"
                      >
                        <Camera className="h-4 w-4 shrink-0 text-zinc-500" />
                        <span className="text-sm text-zinc-200">
                          {result.name}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}

            {/* Footer hint */}
            <div className="flex items-center gap-3 border-t border-zinc-800 px-4 py-2">
              <span className="text-xs text-zinc-600">
                Press{" "}
                <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5 text-[10px] text-zinc-400">
                  Esc
                </kbd>{" "}
                to close
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
