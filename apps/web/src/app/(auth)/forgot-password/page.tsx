"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Shield,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Mail,
  CheckCircle2,
} from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(
        `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000"}/api/v1/auth/forgot-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );

      const json = await res.json();

      if (!json.success) {
        setError(
          json.error?.message ?? "Something went wrong. Please try again.",
        );
        return;
      }

      setSubmitted(true);
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
            <Mail className="h-10 w-10 text-blue-400" />
          </div>
          <p className="mt-4 max-w-xs text-center text-sm leading-relaxed text-zinc-600">
            We will send you a secure link to reset your password
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

          {submitted ? (
            /* Success state */
            <div>
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle2 className="h-6 w-6 text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-zinc-50">
                Check your email
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                If an account with{" "}
                <span className="font-medium text-zinc-200">{email}</span>{" "}
                exists, we have sent a password reset link. Please check your
                inbox and spam folder.
              </p>

              <Link
                href="/login"
                className="mt-8 flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-zinc-800 bg-zinc-950 py-2.5 text-sm font-medium text-zinc-300 transition-colors duration-150 hover:bg-zinc-800"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Sign In
              </Link>
            </div>
          ) : (
            /* Form state */
            <div>
              <h2 className="text-2xl font-bold text-zinc-50">
                Forgot password?
              </h2>
              <p className="mt-1 text-sm text-zinc-400">
                Enter your email and we will send you a reset link
              </p>

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

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-500 py-2.5 font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>

              {/* Back to login */}
              <p className="mt-8 text-center text-sm text-zinc-500">
                <Link
                  href="/login"
                  className="inline-flex cursor-pointer items-center gap-1 text-blue-400 transition-colors duration-150 hover:text-blue-300"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
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
