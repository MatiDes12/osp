import Link from "next/link";
import {
  Shield,
  Video,
  Bell,
  HardDrive,
  Brain,
  Building2,
  Puzzle,
  Check,
  Monitor,
  Smartphone,
  Download,
  Github,
  ChevronRight,
  Zap,
  Lock,
  Globe,
} from "lucide-react";
import { AuthAwareCTA } from "@/components/auth/AuthAwareCTA";

const features = [
  {
    icon: Video,
    title: "Live Monitoring",
    description:
      "Watch every feed in real time with adaptive bitrate streaming. Supports RTSP, ONVIF, and WebRTC out of the box.",
    color: "text-blue-400",
    glow: "bg-blue-500/10",
    border: "group-hover:border-blue-500/30",
  },
  {
    icon: Bell,
    title: "Smart Alerts",
    description:
      "Rule-based and AI-powered notifications delivered to Slack, email, webhooks, or mobile push in under a second.",
    color: "text-amber-400",
    glow: "bg-amber-500/10",
    border: "group-hover:border-amber-500/30",
  },
  {
    icon: HardDrive,
    title: "Cloud Recording",
    description:
      "Continuous and event-driven recording with configurable retention. Store locally, in S3, or any compatible backend.",
    color: "text-green-400",
    glow: "bg-green-500/10",
    border: "group-hover:border-green-500/30",
  },
  {
    icon: Brain,
    title: "AI Detection",
    description:
      "Person, vehicle, and object detection powered by on-device or cloud inference. Bring your own models via plugin.",
    color: "text-purple-400",
    glow: "bg-purple-500/10",
    border: "group-hover:border-purple-500/30",
  },
  {
    icon: Building2,
    title: "Multi-Tenant",
    description:
      "Isolate organizations, sites, and roles with fine-grained RBAC. Perfect for managed service providers and enterprises.",
    color: "text-cyan-400",
    glow: "bg-cyan-500/10",
    border: "group-hover:border-cyan-500/30",
  },
  {
    icon: Puzzle,
    title: "Extension SDK",
    description:
      "Build custom integrations, analytics dashboards, and automations with our TypeScript SDK and event-driven API.",
    color: "text-indigo-400",
    glow: "bg-indigo-500/10",
    border: "group-hover:border-indigo-500/30",
  },
] as const;

const stats = [
  { value: "500+", label: "Security Teams" },
  { value: "50k+", label: "Cameras Connected" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "<1s", label: "Alert Delivery" },
] as const;

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "For personal projects and experimentation",
    features: ["Up to 4 cameras", "24h recording retention", "Basic alerts", "Community support"],
    cta: "Start Free",
    href: "/register",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$10",
    period: "/mo",
    description: "For homes and small businesses",
    features: [
      "Up to 16 cameras",
      "30-day retention",
      "AI detection",
      "Smart alerts",
      "Email support",
    ],
    cta: "Get Started",
    href: "/register",
    highlighted: true,
  },
  {
    name: "Business",
    price: "$50",
    period: "/mo",
    description: "For multi-site operations",
    features: [
      "Up to 100 cameras",
      "90-day retention",
      "Multi-tenant & RBAC",
      "Extension SDK",
      "Priority support",
    ],
    cta: "Get Started",
    href: "/register",
    highlighted: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large-scale deployments",
    features: [
      "Unlimited cameras",
      "Custom retention",
      "On-prem deployment",
      "SLA & dedicated support",
      "Custom integrations",
    ],
    cta: "Contact Sales",
    href: "#",
    highlighted: false,
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">

      {/* ---------------------------------------------------------------- */}
      {/*  NAV                                                             */}
      {/* ---------------------------------------------------------------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-400" />
            <span className="text-base font-semibold tracking-tight">OSP</span>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-zinc-400 sm:flex">
            <a href="#features" className="transition-colors hover:text-zinc-100">Features</a>
            <a href="#download" className="transition-colors hover:text-zinc-100">Download</a>
            <a href="#pricing" className="transition-colors hover:text-zinc-100">Pricing</a>
            <a
              href="https://github.com/MatiDes12/osp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 transition-colors hover:text-zinc-100"
            >
              <Github className="h-4 w-4" />
              GitHub
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm text-zinc-400 transition-colors hover:text-zinc-100 sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-blue-500 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/*  HERO                                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-14">
        {/* Grid pattern */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(63,63,70,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(63,63,70,0.12) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        {/* Radial fade */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_20%,rgb(9,9,11)_100%)]"
        />
        {/* Blue glow center */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/10 blur-3xl"
        />

        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center">
          {/* Badge */}
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-blue-400">
            <Shield className="h-3.5 w-3.5" />
            Open Surveillance Platform
          </span>

          {/* Headline */}
          <h1 className="text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
            Monitor Everything.
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-300 bg-clip-text text-transparent">
              From Anywhere.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-zinc-400">
            Professional-grade camera management that scales from a single
            doorbell to thousands of enterprise cameras — open, extensible, and
            built for every team.
          </p>

          {/* CTAs */}
          <AuthAwareCTA />

          {/* Quick trust signals */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-5 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-green-500" />
              No credit card required
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              Deploy in minutes
            </span>
            <span className="flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-blue-400" />
              Open source
            </span>
          </div>

          {/* Stats row */}
          <div className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-800 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-zinc-900/60 px-6 py-5 text-center">
                <p className="text-2xl font-bold tabular-nums text-zinc-50">{s.value}</p>
                <p className="mt-1 text-xs text-zinc-500">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  FEATURES                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section id="features" className="border-t border-zinc-800/60 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-400">
              Features
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to run<br className="hidden sm:block" /> a professional surveillance operation
            </h2>
            <p className="mt-4 text-zinc-400">
              From live streams to AI-powered alerts — all in one platform.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className={`group rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 transition-all duration-200 hover:bg-zinc-900/70 ${f.border}`}
              >
                <div className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg ${f.glow}`}>
                  <f.icon className={`h-5 w-5 ${f.color}`} />
                </div>
                <h3 className="mb-2 font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  CAMERA GRID PREVIEW                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="px-6 py-12 pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-400">
              Live View
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              See it in action
            </h2>
            <p className="mt-4 text-zinc-400">
              A unified grid that keeps every camera one glance away
            </p>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-6 rounded-3xl bg-blue-500/5 blur-3xl"
            />
            <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  { name: "Front Entrance", res: "4K", cam: "CAM 01", ts: "14:23:07", img: "https://images.unsplash.com/photo-1524758631624-e2822132c53c?w=800&h=450&fit=crop&auto=format&q=80" },
                  { name: "Parking Lot B", res: "1080p", cam: "CAM 02", ts: "14:23:09", img: "https://images.unsplash.com/photo-1573804633927-bfcbcd909acd?w=800&h=450&fit=crop&auto=format&q=80" },
                  { name: "Server Room", res: "4K", cam: "CAM 03", ts: "14:23:11", img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=450&fit=crop&auto=format&q=80" },
                  { name: "Warehouse East", res: "1080p", cam: "CAM 04", ts: "14:23:13", img: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=800&h=450&fit=crop&auto=format&q=80" },
                ] as const
              ).map((cam) => (
                <div key={cam.name} className="relative aspect-video overflow-hidden rounded-xl border border-zinc-700/50 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cam.img} alt={cam.name} className="absolute inset-0 h-full w-full object-cover" style={{ filter: "grayscale(1) contrast(1.3) brightness(0.55)" }} />
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.18) 3px,rgba(0,0,0,0.18) 4px)", zIndex: 1 }} />
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", zIndex: 1 }} />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent px-3 py-2" style={{ zIndex: 2 }}>
                    <span className="font-mono text-[10px] font-bold tracking-widest text-white/80">{cam.cam}</span>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                      <span className="font-mono text-[10px] font-bold tracking-widest text-red-400">REC</span>
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 py-2" style={{ zIndex: 2 }}>
                    <span className="font-mono text-[10px] tracking-wide text-white/75">{cam.name} · {cam.res}</span>
                    <span className="font-mono text-[10px] text-white/40">2026-03-21  {cam.ts}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  DOWNLOAD                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section id="download" className="border-t border-zinc-800/60 px-6 py-24">
        <div className="mx-auto max-w-4xl">
          <div className="mb-14 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-400">
              Download
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              OSP on every platform
            </h2>
            <p className="mt-4 text-zinc-400">
              Native apps built for where you work — desktop, web, and soon mobile.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {/* Windows */}
            <div className="flex flex-col items-center gap-5 rounded-2xl border border-zinc-700 bg-zinc-900/60 p-8 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500/15">
                <Monitor className="h-7 w-7 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">Windows</p>
                <p className="mt-1 text-xs text-zinc-500">Windows 10 / 11 · 64-bit</p>
              </div>
              <a
                href="https://github.com/MatiDes12/osp/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600"
              >
                <Download className="h-4 w-4" />
                Download for Windows
              </a>
              <p className="text-xs text-zinc-600">Free · .msi installer</p>
            </div>

            {/* iOS — Coming Soon */}
            <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 text-center">
              <div className="absolute right-3 top-3 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Coming Soon
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-800/60">
                <Smartphone className="h-7 w-7 text-zinc-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-400">iOS</p>
                <p className="mt-1 text-xs text-zinc-600">iPhone & iPad · iOS 16+</p>
              </div>
              <div className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-600">
                <Download className="h-4 w-4" />
                App Store
              </div>
              <p className="text-xs text-zinc-700">Notify me when available</p>
            </div>

            {/* Android — Coming Soon */}
            <div className="relative flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/30 p-8 text-center">
              <div className="absolute right-3 top-3 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Coming Soon
              </div>
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-800/60">
                <Smartphone className="h-7 w-7 text-zinc-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-400">Android</p>
                <p className="mt-1 text-xs text-zinc-600">Android 10+ · ARM64</p>
              </div>
              <div className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-600">
                <Download className="h-4 w-4" />
                Google Play
              </div>
              <p className="text-xs text-zinc-700">Notify me when available</p>
            </div>
          </div>

          {/* Web app note */}
          <p className="mt-8 text-center text-sm text-zinc-500">
            Prefer the browser?{" "}
            <Link href="/login" className="text-blue-400 underline-offset-2 hover:underline">
              Open the web app →
            </Link>
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  PRICING                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section id="pricing" className="border-t border-zinc-800/60 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-blue-400">
              Pricing
            </p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-zinc-400">
              Start free, scale when you are ready. No hidden fees.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col rounded-xl border p-6 transition-all duration-200 ${
                  plan.highlighted
                    ? "border-blue-500 ring-1 ring-blue-500/50 bg-zinc-900"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                }`}
              >
                {plan.highlighted && (
                  <span className="mb-4 self-start rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                    Most Popular
                  </span>
                )}
                <h3 className="font-semibold">{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm text-zinc-500">{plan.period}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-zinc-500">{plan.description}</p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm text-zinc-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`mt-8 flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors duration-150 ${
                    plan.highlighted
                      ? "bg-blue-500 text-white hover:bg-blue-600"
                      : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {plan.cta}
                  {plan.highlighted && <ChevronRight className="h-4 w-4" />}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  CTA BANNER                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-blue-500/20 bg-gradient-to-b from-blue-500/10 to-transparent p-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Ready to secure your operations?
          </h2>
          <p className="mt-3 text-zinc-400">
            Join 500+ teams already using OSP. Free plan, no credit card.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-600"
            >
              Get Started Free
              <ChevronRight className="h-4 w-4" />
            </Link>
            <a
              href="https://github.com/MatiDes12/osp"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-6 py-3 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              <Github className="h-4 w-4" />
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  FOOTER                                                          */}
      {/* ---------------------------------------------------------------- */}
      <footer className="border-t border-zinc-800/60 bg-zinc-900/50 px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-between">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-400" />
                <span className="font-semibold">OSP</span>
              </div>
              <p className="mt-2 max-w-xs text-sm text-zinc-500">
                Open-source surveillance infrastructure for every scale.
              </p>
            </div>

            {/* Links */}
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-zinc-400 sm:justify-end">
              <a href="#features" className="transition-colors hover:text-zinc-200">Product</a>
              <a href="#download" className="transition-colors hover:text-zinc-200">Download</a>
              <a href="#pricing" className="transition-colors hover:text-zinc-200">Pricing</a>
              <a href="/docs" className="transition-colors hover:text-zinc-200">Docs</a>
              <a
                href="https://github.com/MatiDes12/osp"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 transition-colors hover:text-zinc-200"
              >
                <Github className="h-3.5 w-3.5" />
                GitHub
              </a>
            </div>
          </div>

          <div className="mt-8 border-t border-zinc-800 pt-6 flex flex-col items-center justify-between gap-2 text-xs text-zinc-600 sm:flex-row">
            <p>&copy; {new Date().getFullYear()} Open Surveillance Platform. All rights reserved.</p>
            <p>Built with care for security teams worldwide.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
