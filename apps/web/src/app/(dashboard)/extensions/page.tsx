"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ExtensionsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings?tab=extensions");
  }, [router]);
  return null;
}
