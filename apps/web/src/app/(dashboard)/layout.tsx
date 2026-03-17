"use client";

import { useState, useCallback, useMemo } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ToastContainer } from "@/components/ui/Toast";
import { ShortcutsModal } from "@/components/ui/ShortcutsModal";
import { ActionLogPanel } from "@/components/ui/ActionLogPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useSidebarStore } from "@/stores/sidebar";
import { useRouteLogger } from "@/hooks/use-action-logger";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed = useSidebarStore((s) => s.collapsed);
  useRouteLogger();

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

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
        <Sidebar />

        {/* Main content area – offset by sidebar width */}
        <div
          className={`flex flex-1 flex-col transition-[padding] duration-200 ease-in-out ${
            collapsed ? "pl-16" : "pl-64"
          }`}
        >
          <TopBar />

          <ErrorBoundary>
            <main className="flex-1 overflow-y-auto p-6">{children}</main>
          </ErrorBoundary>
        </div>
      </div>
      <ToastContainer />
      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />
      {process.env.NODE_ENV === "development" && <ActionLogPanel />}
    </AuthGuard>
  );
}
