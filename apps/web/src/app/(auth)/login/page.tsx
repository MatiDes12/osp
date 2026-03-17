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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

      window.location.href = "/";
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
              { name: "Lobby", glow: "from-blue-500/20" },
              { name: "Garage", glow: "from-green-500/20" },
              { name: "Server Room", glow: "from-blue-500/20" },
              { name: "Entrance", glow: "from-green-500/20" },
            ] as const
          ).map((cam) => (
            <div
              key={cam.name}
              className="relative aspect-video overflow-hidden rounded-lg border border-zinc-800/80 bg-zinc-900/80"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${cam.glow} via-transparent to-transparent opacity-60`}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.04) 2px,rgba(255,255,255,0.04) 4px)",
                }}
              />
              <div className="absolute bottom-2 left-2 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse-live" />
                <span className="text-[10px] font-medium text-zinc-400">
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
                <a
                  href="#"
                  className="cursor-pointer text-xs text-blue-400 transition-colors duration-150 hover:text-blue-300"
                >
                  Forgot password?
                </a>
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

          {/* Google OAuth */}
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-md border border-zinc-800 bg-zinc-950 py-2.5 text-sm font-medium text-zinc-300 transition-colors duration-150 hover:bg-zinc-800"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Google
          </button>

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
