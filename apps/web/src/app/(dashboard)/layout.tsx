"use client";

import { useState, useMemo } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { MobileNav } from "@/components/layout/MobileNav";
import { MobileSidebarDrawer } from "@/components/layout/MobileSidebarDrawer";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ToastContainer } from "@/components/ui/Toast";
import { ShortcutsModal } from "@/components/ui/ShortcutsModal";
import { ActionLogPanel } from "@/components/ui/ActionLogPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useSidebarStore } from "@/stores/sidebar";
import { useRouteLogger } from "@/hooks/use-action-logger";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useCameras } from "@/hooks/use-cameras";
import { useTraySync } from "@/hooks/use-tray-sync";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  useRouteLogger();

  // Keep the desktop system tray tooltip in sync with live camera state
  const { cameras } = useCameras();
  useTraySync(cameras);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const shortcuts = useMemo(
    () => ({
      onShowShortcuts: () => setShortcutsOpen((prev) => !prev),
    }),
    [],
  );

  useKeyboardShortcuts(shortcuts);

  return (
    <AuthGuard>
      <div className="flex h-screen overflow-hidden">
        {/* Desktop sidebar (hidden on mobile via internal lg:flex) */}
        <Sidebar />

        {/* Mobile sidebar drawer */}
        <MobileSidebarDrawer
          open={mobileDrawerOpen}
          onClose={() => setMobileDrawerOpen(false)}
        />

        {/* Main content area */}
        <div
          className={`flex flex-1 flex-col transition-[padding] duration-200 ease-in-out pl-0 ${
            collapsed ? "lg:pl-16" : "lg:pl-64"
          }`}
        >
          <TopBar onMenuToggle={() => setMobileDrawerOpen((prev) => !prev)} />

          <ErrorBoundary>
            <main className="flex-1 overflow-y-auto p-4 pb-20 lg:p-6 lg:pb-6">
              {children}
            </main>
          </ErrorBoundary>
        </div>
      </div>

      {/* Mobile bottom navigation */}
      <MobileNav />

      <ToastContainer />
      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      {process.env.NODE_ENV === "development" && <ActionLogPanel />}
    </AuthGuard>
  );
}
