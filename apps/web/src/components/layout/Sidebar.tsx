"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/(dashboard)", label: "Dashboard", icon: "grid" },
  { href: "/(dashboard)/cameras", label: "Cameras", icon: "camera" },
  { href: "/(dashboard)/events", label: "Events", icon: "bell" },
  { href: "/(dashboard)/recordings", label: "Recordings", icon: "play" },
  { href: "/(dashboard)/rules", label: "Rules", icon: "zap" },
  { href: "/(dashboard)/settings", label: "Settings", icon: "settings" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)] flex flex-col">
      <div className="p-4 border-b border-[var(--color-border)]">
        <h2 className="font-bold text-lg">OSP</h2>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/(dashboard)" &&
              pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:bg-white/5"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
