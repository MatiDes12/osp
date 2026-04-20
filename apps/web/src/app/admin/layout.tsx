"use client";

import { AuthGuard } from "@/components/auth/AuthGuard";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // AuthGuard ensures the user has a valid (non-expired) token before rendering.
  // Superadmin verification is enforced by the backend on every API request —
  // the page itself shows "Access Denied" when the API returns 401/403.
  return (
    <AuthGuard>
      <div className="min-h-screen bg-zinc-950 text-zinc-50">{children}</div>
    </AuthGuard>
  );
}
