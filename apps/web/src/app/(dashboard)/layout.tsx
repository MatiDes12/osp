"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { useSidebarStore } from "@/stores/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed = useSidebarStore((s) => s.collapsed);

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

          <main className="flex-1 overflow-y-auto p-6">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
