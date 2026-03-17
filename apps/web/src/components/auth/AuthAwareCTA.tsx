"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Play } from "lucide-react";
import { isTokenExpired } from "@/lib/jwt";

const ACCESS_TOKEN_KEY = "osp_access_token";

export function AuthAwareCTA() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    setLoggedIn(!!token && !isTokenExpired(token));
    setReady(true);
  }, []);

  if (!ready) {
    // Render the default CTA shape to prevent layout shift, but invisible
    return (
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4 opacity-0">
        <span className="inline-flex items-center gap-2 rounded-md bg-blue-500 px-6 py-3 font-medium text-white">
          Loading...
        </span>
      </div>
    );
  }

  if (loggedIn) {
    return (
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/cameras"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-500 px-6 py-3 font-medium text-white transition-colors duration-150 hover:bg-blue-600"
        >
          Go to Dashboard
          <ChevronRight className="h-4 w-4" />
        </Link>
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-700 bg-transparent px-6 py-3 font-medium text-zinc-50 transition-colors duration-150 hover:bg-zinc-900"
        >
          <Play className="h-4 w-4" />
          Watch Demo
        </button>
      </div>
    );
  }

  return (
    <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
      <Link
        href="/register"
        className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-blue-500 px-6 py-3 font-medium text-white transition-colors duration-150 hover:bg-blue-600"
      >
        Get Started Free
        <ChevronRight className="h-4 w-4" />
      </Link>
      <button
        type="button"
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-zinc-700 bg-transparent px-6 py-3 font-medium text-zinc-50 transition-colors duration-150 hover:bg-zinc-900"
      >
        <Play className="h-4 w-4" />
        Watch Demo
      </button>
    </div>
  );
}
