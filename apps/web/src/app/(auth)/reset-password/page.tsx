"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Lock,
} from "lucide-react";

function getPasswordStrength(pw: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", color: "bg-red-500" };
  if (score <= 2) return { score: 2, label: "Fair", color: "bg-amber-500" };
  if (score <= 3) return { score: 3, label: "Good", color: "bg-yellow-400" };
  if (score === 4) return { score: 4, label: "Strong", color: "bg-green-400" };
  return { score: 5, label: "Very strong", color: "bg-green-500" };
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const strength = useMemo(
    () => (password.length > 0 ? getPasswordStrength(password) : null),
    [password],
  );

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (!token) {
      setError("Missing reset token. Please use the link from your email.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(
        `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000"}/api/v1/auth/reset-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        },
      );

      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? "Failed to reset password. The link may have expired.");
        return;
      }

      setSuccess(true);
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

        {/* Lock illustration */}
        <div className="relative z-10 flex flex-col items-center gap-6 p-12">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-500/10">
            <Lock className="h-10 w-10 text-blue-400" />
          </div>
          <p className="mt-4 max-w-xs text-center text-sm leading-relaxed text-zinc-600">
            Choose a strong, unique password to protect your account
          </p>
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

          {success ? (
            /* Success state */
            <div>
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-6 w-6 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-50">Password reset</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>

              <Link
                href="/login"
                className="mt-8 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-500 py-2.5 font-medium text-white transition-colors duration-150 hover:bg-blue-600"
              >
                Sign In
              </Link>
            </div>
          ) : (
            /* Form state */
            <div>
              <h2 className="text-2xl font-bold text-zinc-50">Reset your password</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Enter your new password below
              </p>

              {!token && (
                <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    No reset token found. Please use the link from your email, or{" "}
                    <Link href="/forgot-password" className="underline">
                      request a new one
                    </Link>
                    .
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                {/* Error banner */}
                {error && (
                  <div className="flex items-start gap-2.5 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* New Password */}
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-medium text-zinc-300"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Min. 8 characters"
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

                  {/* Strength indicator */}
                  {strength && (
                    <div className="mt-2">
                      <div className="flex h-1 w-full gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-full flex-1 rounded-full transition-colors duration-200 ${
                              i < strength.score
                                ? strength.color
                                : "bg-zinc-800"
                            }`}
                          />
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">
                        {strength.label}
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-1.5 block text-sm font-medium text-zinc-300"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="Re-enter your password"
                      className={`w-full rounded-md border bg-zinc-950 px-3 py-2.5 pr-10 text-sm text-zinc-50 placeholder:text-zinc-600 outline-none transition-shadow duration-150 focus:ring-1 focus:ring-blue-500 ${
                        confirmPassword.length > 0 && !passwordsMatch
                          ? "border-red-500/50"
                          : "border-zinc-800"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer text-zinc-500 transition-colors duration-150 hover:text-zinc-300"
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && !passwordsMatch && (
                    <p className="mt-1 text-xs text-red-400">
                      Passwords do not match
                    </p>
                  )}
                  {passwordsMatch && (
                    <p className="mt-1 text-xs text-green-400">
                      Passwords match
                    </p>
                  )}
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading || !token}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-500 py-2.5 font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    "Reset Password"
                  )}
                </button>
              </form>

              {/* Back to login */}
              <p className="mt-8 text-center text-sm text-zinc-500">
                <Link
                  href="/login"
                  className="cursor-pointer text-blue-400 transition-colors duration-150 hover:text-blue-300"
                >
                  Back to Sign In
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-950"><div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-500" /></div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
