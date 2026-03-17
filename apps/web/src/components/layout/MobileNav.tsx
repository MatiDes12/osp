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
    <nav className="fixed bottom-0 inset-x-0 z-30 border-t border-zinc-800 bg-zinc-900 lg:hidden">
      <div className="flex h-16 items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {MOBILE_TABS.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 transition-colors duration-150 ${
                active ? "text-blue-500" : "text-zinc-500"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs leading-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
