"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebarStore } from "@/stores/sidebar";
import { getUserFromToken } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Camera,
  MapPin,
  Bell,
  Play,
  Zap,
  Puzzle,
  Settings,
  Activity,
  ChevronLeft,
  ChevronRight,
  Circle,
  LogOut,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Navigation items                                                   */
/* ------------------------------------------------------------------ */
interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/events", label: "Events & Alerts", icon: Bell },
  { href: "/recordings", label: "Recordings", icon: Play },
  { href: "/rules", label: "Rules", icon: Zap },
  { href: "/extensions", label: "Extensions", icon: Puzzle },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/health", label: "System Health", icon: Activity },
] as const;

/* ------------------------------------------------------------------ */
/*  Stub data – cameras quick-status                                   */
/* ------------------------------------------------------------------ */
interface QuickCamera {
  readonly id: string;
  readonly name: string;
  readonly online: boolean;
}

const STUB_CAMERAS: readonly QuickCamera[] = [
  { id: "1", name: "Front Door", online: true },
  { id: "2", name: "Backyard", online: true },
  { id: "3", name: "Garage", online: false },
  { id: "4", name: "Driveway", online: true },
  { id: "5", name: "Office", online: true },
] as const;

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */
export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useSidebarStore((s) => s.collapsed);
  const toggle = useSidebarStore((s) => s.toggle);

  const jwtUser = useMemo(() => getUserFromToken(), []);
  const userEmail = jwtUser?.email ?? "unknown";
  const userInitial = userEmail.charAt(0).toUpperCase();
  const tenantName = (jwtUser?.user_metadata?.tenant_name as string | undefined) ?? jwtUser?.tenant_id ?? "My Org";
  const userRole = jwtUser?.role ?? "free";

  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-10 flex flex-col border-r border-zinc-800 bg-zinc-950 transition-[width] duration-200 ease-in-out ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* ── Logo ──────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center border-b border-zinc-800 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 cursor-pointer"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Camera className="h-5 w-5 text-blue-500" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-zinc-50">
              OSP
            </span>
          )}
        </Link>
      </div>

      {/* ── Navigation ────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer ${
                    active
                      ? "bg-blue-500/10 text-blue-500"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-50"
                  }`}
                >
                  {/* Active left accent */}
                  {active && (
                    <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-blue-500" />
                  )}

                  <Icon className="h-5 w-5 shrink-0" />

                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>

        {/* ── Camera quick-status ─────────────────────────────── */}
        {!collapsed && (
          <div className="mt-6">
            <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Cameras
            </h3>
            <ul className="space-y-0.5">
              {STUB_CAMERAS.map((cam) => (
                <li key={cam.id}>
                  <Link
                    href={`/cameras/${cam.id}`}
                    className="flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors duration-150 hover:bg-zinc-800/50 hover:text-zinc-50 cursor-pointer"
                  >
                    <Circle
                      className={`h-2 w-2 shrink-0 fill-current ${
                        cam.online ? "text-green-500" : "text-zinc-600"
                      }`}
                    />
                    <span className="truncate">{cam.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* ── Bottom section ────────────────────────────────────── */}
      <div className="shrink-0 border-t border-zinc-800 p-3">
        {/* Tenant info */}
        {!collapsed && (
          <div className="mb-3 flex items-center justify-between px-1">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-200">
                {tenantName}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
              {userRole}
            </span>
          </div>
        )}

        {/* User row */}
        {!collapsed && (
          <div className="mb-3 flex items-center gap-2.5 rounded-md px-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-300">
              {userInitial}
            </div>
            <span className="truncate text-sm text-zinc-400">
              {userEmail}
            </span>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-500 transition-colors duration-150 hover:bg-zinc-800/50 hover:text-zinc-300 cursor-pointer"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse</span>
            </>
          )}
        </button>

        {/* Sign out */}
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem("osp_access_token");
            localStorage.removeItem("osp_refresh_token");
            window.location.href = "/login";
          }}
          title={collapsed ? "Sign Out" : undefined}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-500 transition-colors duration-150 hover:text-red-400 cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
