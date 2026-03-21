"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("osp_access_token");
    if (token) {
      router.replace("/cameras");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" />
    </div>
  );
}
