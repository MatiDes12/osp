"use client";

import {
  Monitor,
  Apple,
  Terminal,
  Download,
  CheckCircle2,
  Zap,
  Shield,
  Wifi,
} from "lucide-react";
import { isTauri } from "@/lib/tauri";

const REPO = "MatiDes12/osp";
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

interface Platform {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ReactNode;
  assets: { label: string; ext: string; filter: string }[];
  note?: string;
}

const PLATFORMS: Platform[] = [
  {
    id: "windows",
    name: "Windows",
    subtitle: "Windows 10 / 11 (64-bit)",
    icon: <Monitor className="w-8 h-8" />,
    assets: [
      { label: "Installer (.exe)", ext: "exe", filter: "x64-setup.exe" },
      { label: "MSI package", ext: "msi", filter: "_en-US.msi" },
    ],
    note: "SmartScreen may warn on first run — click More info → Run anyway.",
  },
  {
    id: "macos",
    name: "macOS",
    subtitle: "macOS 12+ (Apple Silicon & Intel)",
    icon: <Apple className="w-8 h-8" />,
    assets: [
      { label: "Apple Silicon (.dmg)", ext: "dmg", filter: "aarch64.dmg" },
      { label: "Intel (.dmg)", ext: "dmg", filter: "x64.dmg" },
    ],
    note: "Unsigned build: System Settings → Privacy & Security → Open Anyway.",
  },
  {
    id: "linux",
    name: "Linux",
    subtitle: "Ubuntu 20.04+ / Debian / Fedora",
    icon: <Terminal className="w-8 h-8" />,
    assets: [
      { label: "AppImage (portable)", ext: "AppImage", filter: ".AppImage" },
      { label: "Debian package (.deb)", ext: "deb", filter: ".deb" },
    ],
  },
];

const FEATURES = [
  {
    icon: <Wifi className="w-5 h-5 text-blue-400" />,
    title: "Sub-100ms live view",
    desc: "Direct WebRTC to your local go2rtc — no cloud hop, no tunnel latency.",
  },
  {
    icon: <Zap className="w-5 h-5 text-amber-400" />,
    title: "Bundled go2rtc + motion detection",
    desc: "go2rtc and the camera-ingest agent start automatically. No Docker, no setup.",
  },
  {
    icon: <Shield className="w-5 h-5 text-green-400" />,
    title: "Local recording",
    desc: "Record directly from the live stream to your Downloads folder. Recordings stay on your machine.",
  },
  {
    icon: <CheckCircle2 className="w-5 h-5 text-purple-400" />,
    title: "System tray + auto-start",
    desc: "Runs quietly in the background. Optional start-on-login. Native OS notifications for motion events.",
  },
];

export default function DownloadPage() {
  const alreadyOnDesktop = isTauri();

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-10">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-2">
          <Download className="w-3.5 h-3.5" />
          Desktop App
        </div>
        <h1 className="text-3xl font-bold text-[var(--color-fg)]">
          OSP Desktop
        </h1>
        <p className="text-[var(--color-muted)] max-w-xl mx-auto text-sm leading-relaxed">
          The native desktop app gives you sub-100ms live view, local recording,
          and motion detection — all without Docker or any manual setup.
        </p>
        {alreadyOnDesktop && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            You&apos;re already running the desktop app
          </div>
        )}
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="flex gap-3 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
          >
            <div className="mt-0.5 shrink-0">{f.icon}</div>
            <div>
              <p className="text-sm font-medium text-[var(--color-fg)]">
                {f.title}
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5 leading-relaxed">
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Download cards */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider">
          Download
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLATFORMS.map((p) => (
            <div
              key={p.id}
              className="flex flex-col gap-4 p-5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]"
            >
              <div className="flex items-center gap-3">
                <div className="text-[var(--color-muted)]">{p.icon}</div>
                <div>
                  <p className="font-semibold text-[var(--color-fg)]">
                    {p.name}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {p.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-1">
                {p.assets.map((a) => (
                  <a
                    key={a.filter}
                    href={RELEASES_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors text-sm text-[var(--color-fg)] group"
                  >
                    <span>{a.label}</span>
                    <Download className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
                  </a>
                ))}
              </div>

              {p.note && (
                <p className="text-[10px] text-[var(--color-muted)] leading-relaxed border-t border-[var(--color-border)] pt-3">
                  {p.note}
                </p>
              )}
            </div>
          ))}
        </div>

        <p className="text-xs text-[var(--color-muted)] text-center">
          All releases are on{" "}
          <a
            href={`https://github.com/${REPO}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-primary)] hover:underline"
          >
            GitHub Releases
          </a>
          . Built automatically by GitHub Actions on every version tag.
        </p>
      </div>

      {/* What's bundled */}
      <div className="rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">
          What&apos;s bundled in the installer
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          {[
            {
              name: "go2rtc v1.9.9",
              desc: "RTSP / ONVIF / WebRTC proxy — starts automatically",
            },
            {
              name: "Camera-ingest agent",
              desc: "Motion detection, camera polling — starts after login",
            },
            {
              name: "OSP Dashboard",
              desc: "Full dashboard loaded from the cloud — always up to date",
            },
          ].map((item) => (
            <div key={item.name} className="flex gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-[var(--color-fg)] text-xs">
                  {item.name}
                </p>
                <p className="text-[var(--color-muted)] text-xs">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
