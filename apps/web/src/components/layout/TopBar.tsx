"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
  Search,
  Bell,
  Grid2x2,
  Grid3x3,
  Command,
  LogOut,
} from "lucide-react";
import { getUserFromToken } from "@/hooks/use-auth";

/* ------------------------------------------------------------------ */
/*  TopBar                                                             */
/* ------------------------------------------------------------------ */
export function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const jwtUser = useMemo(() => getUserFromToken(), []);
  const userEmail = jwtUser?.email ?? "unknown";
  const userInitial = userEmail.charAt(0).toUpperCase();

  // Close dropdown on outside click
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

  const handleSignOut = () => {
    localStorage.removeItem("osp_access_token");
    localStorage.removeItem("osp_refresh_token");
    window.location.href = "/login";
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b border-zinc-800 bg-zinc-950/80 px-6 backdrop-blur-sm">
      {/* -- Breadcrumb (left) ---------------------------------------- */}
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-sm font-semibold text-zinc-100">
          Dashboard
        </h1>
      </div>

      {/* -- Spacer --------------------------------------------------- */}
      <div className="flex-1" />

      {/* -- Search (center) ------------------------------------------ */}
      <div className="hidden w-full max-w-md md:block">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-500 transition-colors duration-150 hover:border-zinc-700 hover:text-zinc-400 cursor-pointer"
        >
          <Search className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="pointer-events-none hidden items-center gap-0.5 rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 sm:inline-flex">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>
      </div>

      {/* -- Spacer --------------------------------------------------- */}
      <div className="flex-1" />

      {/* -- Actions (right) ------------------------------------------ */}
      <div className="flex items-center gap-1">
        {/* Grid size toggles */}
        <button
          type="button"
          className="rounded-md p-2 text-zinc-500 transition-colors duration-150 hover:bg-zinc-800/50 hover:text-zinc-300 cursor-pointer"
          aria-label="Grid 2x2 view"
        >
          <Grid2x2 className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="rounded-md p-2 text-zinc-500 transition-colors duration-150 hover:bg-zinc-800/50 hover:text-zinc-300 cursor-pointer"
          aria-label="Grid 3x3 view"
        >
          <Grid3x3 className="h-5 w-5" />
        </button>

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-zinc-800" />

        {/* Notification bell */}
        <button
          type="button"
          className="relative rounded-md p-2 text-zinc-500 transition-colors duration-150 hover:bg-zinc-800/50 hover:text-zinc-300 cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          {/* Unread badge */}
          <span className="absolute right-1.5 top-1.5 flex h-2 w-2">
            <span className="animate-pulse-live absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        </button>

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
  );
}
