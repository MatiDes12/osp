"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, Bell, Play, Zap, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface MobileNavTab {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

const MOBILE_TABS: readonly MobileNavTab[] = [
  { href: "/cameras", label: "Cameras", icon: Camera },
  { href: "/events", label: "Events", icon: Bell },
  { href: "/recordings", label: "Recordings", icon: Play },
  { href: "/rules", label: "Rules", icon: Zap },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex h-16 items-stretch">
        {MOBILE_TABS.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-150 ${
                active ? "text-blue-400" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {active && (
                <span className="absolute inset-x-3 top-0 h-[2px] rounded-b-full bg-blue-500" />
              )}
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.75} />
              <span
                className={`text-[10px] font-medium leading-none ${active ? "text-blue-400" : "text-zinc-500"}`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
