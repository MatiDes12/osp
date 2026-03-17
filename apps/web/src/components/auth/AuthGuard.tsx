"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isTokenExpired } from "@/lib/jwt";

const ACCESS_TOKEN_KEY = "osp_access_token";
const REFRESH_TOKEN_KEY = "osp_refresh_token";

interface AuthGuardProps {
  readonly children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);

    if (!token || isTokenExpired(token)) {
      // Clear stale tokens before redirecting
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      router.replace("/login");
      setStatus("unauthenticated");
      return;
    }

    setStatus("authenticated");
  }, [router]);

  if (status === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
          <p className="text-sm text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    // Return null while redirect is in progress
    return null;
  }

  return <>{children}</>;
}
