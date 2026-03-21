"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Shield,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
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

export default function RegisterPage() {
  const [form, setForm] = useState({
    displayName: "",
    tenantName: "",
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(
    () => (form.password.length > 0 ? getPasswordStrength(form.password) : null),
    [form.password],
  );

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setError("You must agree to the Terms of Service to continue.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(
        `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000"}/api/v1/auth/register`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        },
      );

      const json = await res.json();

      if (!json.success) {
        setError(json.error?.message ?? "Registration failed");
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
        {/* Dot grid pattern */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(rgba(63,63,70,0.25) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Radial fade */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_50%,transparent_20%,rgb(9,9,11)_100%)]"
        />

        {/* Node / connection illustration */}
        <div className="relative z-10 flex flex-col items-center gap-6 p-12">
          {/* Central node */}
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-500/30 bg-blue-500/10">
            <Shield className="h-10 w-10 text-blue-400" />
          </div>

          {/* Connection lines */}
          <div className="flex items-center gap-8">
            {(
              [
                { label: "Cameras", color: "border-green-500/30 bg-green-500/10 text-green-400" },
                { label: "Alerts", color: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
                { label: "Storage", color: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400" },
              ] as const
            ).map((node) => (
              <div key={node.label} className="flex flex-col items-center gap-2">
                <div className="h-8 w-px bg-zinc-800" />
                <div
                  className={`rounded-lg border px-4 py-2 text-xs font-medium ${node.color}`}
                >
                  {node.label}
                </div>
              </div>
            ))}
          </div>

          {/* Second tier */}
          <div className="flex items-center gap-6">
            {(
              [
                { label: "SDK", color: "border-purple-500/30 bg-purple-500/10 text-purple-400" },
                { label: "AI", color: "border-pink-500/30 bg-pink-500/10 text-pink-400" },
                { label: "API", color: "border-blue-500/30 bg-blue-500/10 text-blue-400" },
                { label: "RBAC", color: "border-green-500/30 bg-green-500/10 text-green-400" },
              ] as const
            ).map((node) => (
              <div key={node.label} className="flex flex-col items-center gap-2">
                <div className="h-6 w-px bg-zinc-800/60" />
                <div
                  className={`rounded-md border px-3 py-1.5 text-[10px] font-medium ${node.color}`}
                >
                  {node.label}
                </div>
              </div>
            ))}
          </div>

          <p className="mt-8 max-w-xs text-center text-sm leading-relaxed text-zinc-600">
            Open, extensible architecture that grows with your needs
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

          {/* Heading */}
          <h2 className="text-2xl font-bold text-zinc-50">
            Create your account
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Start monitoring in minutes
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

            {/* Display Name */}
            <div>
              <label
                htmlFor="displayName"
                className="mb-1.5 block text-sm font-medium text-zinc-300"
              >
                Display Name
              </label>
              <input
                id="displayName"
                type="text"
                value={form.displayName}
                onChange={(e) => updateField("displayName", e.target.value)}
                required
                placeholder="Jane Doe"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-50 placeholder:text-zinc-600 outline-none transition-shadow duration-150 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Organization */}
            <div>
              <label
                htmlFor="tenantName"
                className="mb-1.5 block text-sm font-medium text-zinc-300"
              >
                Organization Name
              </label>
              <input
                id="tenantName"
                type="text"
                value={form.tenantName}
                onChange={(e) => updateField("tenantName", e.target.value)}
                required
                placeholder="Acme Security"
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-50 placeholder:text-zinc-600 outline-none transition-shadow duration-150 focus:ring-1 focus:ring-blue-500"
              />
            </div>

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
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
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
                  value={form.password}
                  onChange={(e) => updateField("password", e.target.value)}
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

            {/* Terms checkbox */}
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-zinc-700 bg-zinc-950 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-sm text-zinc-400">
                I agree to the{" "}
                <a
                  href="https://github.com/MatiDes12/osp/blob/main/docs/TERMS.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer text-blue-400 transition-colors duration-150 hover:text-blue-300"
                >
                  Terms of Service
                </a>
              </span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-blue-500 py-2.5 font-medium text-white transition-colors duration-150 hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                "Create Account"
              )}
            </button>
          </form>

          {/* Sign in link */}
          <p className="mt-8 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="cursor-pointer text-blue-400 transition-colors duration-150 hover:text-blue-300"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
