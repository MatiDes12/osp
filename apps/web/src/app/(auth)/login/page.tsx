"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

type SsoProvider = "google" | "azure" | "github";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState<SsoProvider | null>(null);

  async function handleSso(provider: SsoProvider) {
    setSsoLoading(provider);
    setError(null);
    try {
      const callbackUrl = `${window.location.origin}/auth/callback`;
      const res = await fetch(
        `${API_URL}/api/v1/auth/sso/initiate?provider=${provider}&redirectTo=${encodeURIComponent(callbackUrl)}`,
      );
      const json = await res.json();
      if (!json.success) {
        setError(json.error?.message ?? "SSO failed");
        return;
      }
      window.location.href = json.data.url;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSsoLoading(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(
        `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000"}/api/v1/auth/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        },
      );

      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? "Login failed");
        return;
      }

      localStorage.setItem("osp_access_token", json.data.accessToken);
      localStorage.setItem("osp_refresh_token", json.data.refreshToken);

      window.location.href = "/cameras";
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ------------------------------------------------------------ */}
      {/*  Left illustration panel (hidden on mobile)                   */}
      {/* ------------------------------------------------------------ */}
      <div className="relative hidden w-[60%] items-center justify-center overflow-hidden bg-zinc-950 lg:flex">
        {/* Grid pattern */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(63,63,70,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(63,63,70,0.12) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Radial fade */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_50%,transparent_20%,rgb(9,9,11)_100%)]"
        />

        {/* Camera grid mock */}
        <div className="relative z-10 grid w-full max-w-lg grid-cols-2 gap-3 p-12">
          {(
            [
              {
                name: "Lobby",
                img: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=640&h=360&fit=crop&auto=format&q=75",
              },
              {
                name: "Garage",
                img: "https://images.unsplash.com/photo-1519003300449-424ad0405076?w=640&h=360&fit=crop&auto=format&q=75",
              },
              {
                name: "Server Room",
                img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=640&h=360&fit=crop&auto=format&q=75",
              },
              {
                name: "Entrance",
                img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=640&h=360&fit=crop&auto=format&q=75",
              },
            ] as const
          ).map((cam) => (
            <div
              key={cam.name}
              className="relative aspect-video overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cam.img}
                alt={cam.name}
                className="absolute inset-0 h-full w-full object-cover"
                style={{ filter: "saturate(0.3) contrast(1.2) brightness(0.65)" }}
              />
              {/* Dark overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-zinc-950/20 to-transparent" />
              {/* Scan-line texture */}
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-[0.06]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.05) 2px,rgba(255,255,255,0.05) 4px)",
                }}
              />
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse-live" />
                <span className="text-[10px] font-medium text-zinc-300">
                  {cam.name}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Brand watermark */}
        <div className="absolute bottom-8 left-8 flex items-center gap-2 text-zinc-700">
          <Shield className="h-4 w-4" />
          <span className="text-sm font-medium">OSP</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ */}
      {/*  Right form panel                                             */}
      {/* ------------------------------------------------------------ */}
      <div className="flex w-full flex-col items-center justify-center bg-zinc-900 px-6 py-12 lg:w-[40%] lg:px-12">
        <div className="w-full max-w-sm">
          {/* Logo */}
          <div className="mb-10 flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-400" />
            <span className="text-lg font-semibold text-zinc-50">OSP</span>
          </div>

          {/* Heading */}
          <h2 className="text-2xl font-bold text-zinc-50">Welcome back</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Sign in to your dashboard
          </p>

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-zinc-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-50 placeholder:text-zinc-600 outline-none transition-shadow duration-150 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-zinc-300"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 pr-10 text-sm text-zinc-50 placeholder:text-zinc-600 outline-none transition-shadow duration-150 focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-zinc-500 transition-colors duration-150 hover:text-zinc-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <div className="mt-1.5 flex justify-end">
                <Link
                  href="/forgot-password"
                  className="cursor-pointer text-xs text-blue-400 transition-colors duration-150 hover:text-blue-300"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-500 py-2.5 font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-xs text-zinc-500">or continue with</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>

          {/* SSO buttons */}
          <div className="flex flex-col gap-2.5">
            {/* Google */}
            <button
              type="button"
              onClick={() => handleSso("google")}
              disabled={ssoLoading !== null}
              className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-950 py-2.5 text-sm font-medium text-zinc-300 transition-colors duration-150 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ssoLoading === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
              )}
              Google
            </button>

            {/* Microsoft / Azure AD */}
            <button
              type="button"
              onClick={() => handleSso("azure")}
              disabled={ssoLoading !== null}
              className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-950 py-2.5 text-sm font-medium text-zinc-300 transition-colors duration-150 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ssoLoading === "azure" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 23 23" aria-hidden="true">
                  <path fill="#f3f3f3" d="M0 0h23v23H0z" />
                  <path fill="#f35325" d="M1 1h10v10H1z" />
                  <path fill="#81bc06" d="M12 1h10v10H12z" />
                  <path fill="#05a6f0" d="M1 12h10v10H1z" />
                  <path fill="#ffba08" d="M12 12h10v10H12z" />
                </svg>
              )}
              Microsoft
            </button>

            {/* GitHub */}
            <button
              type="button"
              onClick={() => handleSso("github")}
              disabled={ssoLoading !== null}
              className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-950 py-2.5 text-sm font-medium text-zinc-300 transition-colors duration-150 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ssoLoading === "github" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4 fill-zinc-300" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
                </svg>
              )}
              GitHub
            </button>
          </div>

          {/* Sign up link */}
          <p className="mt-8 text-center text-sm text-zinc-500">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="cursor-pointer text-blue-400 transition-colors duration-150 hover:text-blue-300"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
