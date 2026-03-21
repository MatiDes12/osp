"use client";

import { useEffect, useState } from "react";
import { Shield, Loader2, AlertCircle } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// ---------------------------------------------------------------------------
//  OAuth callback page
//  Supabase redirects here after a successful OAuth flow with the tokens in
//  the URL hash fragment: /auth/callback#access_token=...&refresh_token=...
//  We exchange those tokens for a full OSP session via our gateway.
// ---------------------------------------------------------------------------
export default function CallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function exchange() {
      const hash = window.location.hash.slice(1); // remove leading '#'
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");

      if (!accessToken) {
        setError("No access token received from OAuth provider.");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/v1/auth/sso/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken, refreshToken }),
        });

        const json = await res.json();

        if (!json.success) {
          setError(json.error?.message ?? "SSO login failed.");
          return;
        }

        localStorage.setItem("osp_access_token", json.data.accessToken);
        localStorage.setItem("osp_refresh_token", json.data.refreshToken);

        window.location.href = "/cameras";
      } catch {
        setError("Network error. Please try again.");
      }
    }

    exchange();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-900">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Shield className="h-6 w-6 text-blue-400" />
          <span className="text-lg font-semibold text-zinc-50">OSP</span>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
            <a
              href="/login"
              className="text-sm text-blue-400 transition-colors hover:text-blue-300"
            >
              Back to login
            </a>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            <p className="text-sm text-zinc-400">Completing sign-in…</p>
          </div>
        )}
      </div>
    </div>
  );
}
