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
import { useTauriAgent } from "@/hooks/use-tauri-agent";
import { useSyncEngine } from "@/hooks/use-sync-engine";
import { OfflineBanner } from "@/components/OfflineBanner";
import { useEffect } from "react";
import { requestNotificationPermission } from "@/lib/notifications";

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

  // Start bundled go2rtc + camera-ingest sidecars (desktop only, no-op on web)
  useTauriAgent();

  // Background sync: cache remote data to IndexedDB, detect offline state
  const { isOffline } = useSyncEngine();

  // Ask for notification permission once on first load
  useEffect(() => {
    void requestNotificationPermission();
  }, []);

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
          <OfflineBanner visible={isOffline} />

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
      {process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_DISABLE_ACTION_LOG !== "1" && (
          <ActionLogPanel />
        )}
    </AuthGuard>
  );
}
