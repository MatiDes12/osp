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
  },
  {
    icon: Bell,
    title: "Smart Alerts",
    description:
      "Rule-based and AI-powered notifications delivered to Slack, email, webhooks, or mobile push in under a second.",
    color: "text-amber-400",
    glow: "bg-amber-500/10",
  },
  {
    icon: HardDrive,
    title: "Cloud Recording",
    description:
      "Continuous and event-driven recording with configurable retention. Store locally, in S3, or any compatible backend.",
    color: "text-green-400",
    glow: "bg-green-500/10",
  },
  {
    icon: Brain,
    title: "AI Detection",
    description:
      "Person, vehicle, and object detection powered by on-device or cloud inference. Bring your own models via plugin.",
    color: "text-purple-400",
    glow: "bg-purple-500/10",
  },
  {
    icon: Building2,
    title: "Multi-Tenant",
    description:
      "Isolate organizations, sites, and roles with fine-grained RBAC. Perfect for managed service providers and enterprises.",
    color: "text-cyan-400",
    glow: "bg-cyan-500/10",
  },
  {
    icon: Puzzle,
    title: "Extension SDK",
    description:
      "Build custom integrations, analytics dashboards, and automations with our TypeScript SDK and event-driven API.",
    color: "text-blue-400",
    glow: "bg-blue-500/10",
  },
] as const;

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "For personal projects and experimentation",
    features: ["Up to 4 cameras", "24h recording retention", "Basic alerts", "Community support"],
    cta: "Start Free",
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
    highlighted: false,
  },
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* ---------------------------------------------------------------- */}
      {/*  HERO                                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
        {/* Grid pattern background */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(63,63,70,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(63,63,70,0.15) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
        {/* Radial fade on grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_50%,transparent_30%,rgb(9,9,11)_100%)]"
        />

        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
          {/* Badge */}
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-400">
            <Shield className="h-4 w-4" />
            Open Surveillance Platform
          </span>

          {/* Headline */}
          <h1 className="text-5xl font-bold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
            Monitor Everything.
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              From Anywhere.
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
            Professional-grade camera management that scales from a single
            doorbell to thousands of enterprise cameras. Open, extensible, and
            built for every team.
          </p>

          {/* CTAs */}
          <AuthAwareCTA />

          {/* Social proof */}
          <div className="mt-16 flex flex-col items-center gap-4">
            <p className="text-sm text-zinc-500">
              Trusted by 500+ security teams
            </p>
            <div className="flex items-center gap-8">
              {["Honeywell", "Bosch", "Axis", "Milestone", "Genetec"].map((name) => (
                <span
                  key={name}
                  className="text-sm font-semibold tracking-wide text-zinc-600 transition-colors duration-150 hover:text-zinc-400"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  FEATURES                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section id="features" className="border-t border-zinc-800/60 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Why OSP?
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Everything you need to run a professional surveillance operation
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors duration-200 hover:border-zinc-700"
              >
                <div
                  className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg ${f.glow}`}
                >
                  <f.icon className={`h-6 w-6 ${f.color}`} />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{f.title}</h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  CAMERA GRID PREVIEW                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              See it in action
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              A unified grid that keeps every camera one glance away
            </p>
          </div>

          {/* Glow wrapper */}
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-4 rounded-3xl bg-blue-500/5 blur-2xl"
            />
            <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  {
                    name: "Front Entrance", res: "4K",
                    img: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=450&fit=crop&auto=format&q=75",
                  },
                  {
                    name: "Parking Lot B", res: "1080p",
                    img: "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=800&h=450&fit=crop&auto=format&q=75",
                  },
                  {
                    name: "Server Room", res: "4K",
                    img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=450&fit=crop&auto=format&q=75",
                  },
                  {
                    name: "Warehouse East", res: "1080p",
                    img: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=800&h=450&fit=crop&auto=format&q=75",
                  },
                ] as const
              ).map((cam) => (
                <div
                  key={cam.name}
                  className="relative aspect-video overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
                >
                  {/* Real camera feed image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cam.img}
                    alt={cam.name}
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ filter: "saturate(0.45) contrast(1.15) brightness(0.72)" }}
                  />
                  {/* Dark vignette overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/70 via-transparent to-zinc-950/20" />
                  {/* Scan-line texture */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 opacity-[0.06]"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,0.05) 2px,rgba(255,255,255,0.05) 4px)",
                    }}
                  />

                  {/* Badges */}
                  <div className="absolute left-3 top-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded bg-zinc-950/80 px-2 py-0.5 text-xs font-medium text-zinc-300 backdrop-blur">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse-live" />
                      LIVE
                    </span>
                    <span className="rounded bg-zinc-950/80 px-2 py-0.5 text-xs font-medium text-zinc-400 backdrop-blur">
                      {cam.res}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3">
                    <span className="rounded bg-zinc-950/80 px-2 py-0.5 text-xs font-medium text-zinc-300 backdrop-blur">
                      {cam.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  PRICING                                                         */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-t border-zinc-800/60 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-zinc-400">
              Start free, scale when you are ready
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`flex flex-col rounded-xl border p-6 transition-colors duration-200 ${
                  plan.highlighted
                    ? "border-blue-500 ring-1 ring-blue-500 bg-zinc-900/80"
                    : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                }`}
              >
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm text-zinc-500">{plan.period}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  {plan.description}
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feat) => (
                    <li
                      key={feat}
                      className="flex items-start gap-2 text-sm text-zinc-300"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.name === "Enterprise" ? "#" : "/register"}
                  className={`mt-8 block cursor-pointer rounded-md py-2.5 text-center text-sm font-medium transition-colors duration-150 ${
                    plan.highlighted
                      ? "bg-blue-500 text-white hover:bg-blue-600"
                      : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/*  FOOTER                                                          */}
      {/* ---------------------------------------------------------------- */}
      <footer className="border-t border-zinc-800 bg-zinc-900 px-6 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-between">
          {/* Brand */}
          <div className="text-center sm:text-left">
            <div className="flex items-center justify-center gap-2 sm:justify-start">
              <Shield className="h-5 w-5 text-blue-400" />
              <span className="text-lg font-semibold">OSP</span>
            </div>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
              Open-source surveillance infrastructure for every scale.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-zinc-400">
            <a href="#features" className="cursor-pointer transition-colors duration-150 hover:text-zinc-200">
              Product
            </a>
            <a href="/docs" className="cursor-pointer transition-colors duration-150 hover:text-zinc-200">
              Documentation
            </a>
            <a href="https://github.com/MatiDes12/osp" target="_blank" rel="noopener noreferrer" className="cursor-pointer transition-colors duration-150 hover:text-zinc-200">
              GitHub
            </a>
            <a href="/docs" className="cursor-pointer transition-colors duration-150 hover:text-zinc-200">
              API Reference
            </a>
          </div>
        </div>

        <div className="mx-auto mt-8 max-w-6xl border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
          <p>Built with love for security teams</p>
          <p className="mt-1">
            &copy; {new Date().getFullYear()} Open Surveillance Platform. All
            rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
