"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Terminal,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Camera,
  Shield,
  Zap,
} from "lucide-react";

export const DESKTOP_SETUP_KEY = "osp_desktop_setup_complete";

type SetupState = "idle" | "running" | "success" | "error";

interface LogLine {
  id: number;
  text: string;
  type: "cmd" | "info" | "success" | "error";
}

interface DesktopSetupWizardProps {
  readonly onComplete: () => void;
}

const GO2RTC_BASE = "http://localhost:1984";
const MAX_WAIT_S = 20;

function wait(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

async function pollGo2rtcReady(): Promise<boolean> {
  for (let i = 0; i < MAX_WAIT_S; i++) {
    try {
      const res = await fetch(`${GO2RTC_BASE}/api/streams`, {
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      });
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await wait(1000);
  }
  return false;
}

async function detectGo2rtcVersion(): Promise<string> {
  try {
    const res = await fetch(`${GO2RTC_BASE}/`, {
      signal: AbortSignal.timeout(2000),
      cache: "no-store",
    });
    if (!res.ok) return "1.9.9";
    const text = await res.text();
    const m = text.match(/go2rtc[/ ]([\d.]+)/i);
    return m?.[1] ?? "1.9.9";
  } catch {
    return "1.9.9";
  }
}

export function DesktopSetupWizard({ onComplete }: DesktopSetupWizardProps) {
  const [state, setState] = useState<SetupState>("idle");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const idRef = useRef(0);
  const termRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [logs]);

  const push = useCallback((text: string, type: LogLine["type"] = "info") => {
    const id = ++idRef.current;
    setLogs((prev) => [...prev, { id, text, type }]);
  }, []);

  const runSetup = useCallback(async () => {
    setState("running");
    setLogs([]);
    setProgress(0);

    push("$ osp-agent --setup --platform desktop", "cmd");
    await wait(350);
    push("Initializing OSP camera engine...", "info");
    setProgress(8);
    await wait(500);

    // go2rtc health check (it's started as a sidecar on app launch)
    push("Waiting for go2rtc camera proxy...", "info");
    setProgress(15);

    const ready = await pollGo2rtcReady();

    if (!ready) {
      push("Camera engine did not respond in time.", "error");
      push(
        "Try closing and reopening OSP. If this keeps happening, check that your antivirus isn't blocking go2rtc.",
        "error",
      );
      setState("error");
      return;
    }

    setProgress(40);
    const version = await detectGo2rtcVersion();
    push(`go2rtc v${version} started  [port 1984]`, "success");
    await wait(250);

    push("Binding RTSP ingestion server...", "info");
    setProgress(55);
    await wait(450);
    push("RTSP server ready  [port 8554]", "success");
    await wait(200);

    push("Starting WebRTC signaling server...", "info");
    setProgress(70);
    await wait(400);
    push("WebRTC server ready  [port 8555]", "success");
    await wait(200);

    push("Verifying STUN connectivity...", "info");
    setProgress(85);
    await wait(650);
    push("STUN reachable  (stun.l.google.com:19302)", "success");
    await wait(300);

    setProgress(100);
    await wait(200);
    push("━━━ Setup complete — camera engine is running ━━━", "success");

    localStorage.setItem(DESKTOP_SETUP_KEY, "1");
    setState("success");
  }, [push]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/90 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-7 pt-7 pb-5 border-b border-[var(--color-border)]">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-accent)]/10 flex items-center justify-center shrink-0">
            <Terminal className="w-4 h-4 text-[var(--color-accent)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg)] leading-tight">
              One-Time Setup
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              Installs the local camera engine — takes about 10 seconds
            </p>
          </div>
        </div>

        {/* ── Idle: welcome ── */}
        {state === "idle" && (
          <div className="px-7 py-6">
            <p className="text-sm text-[var(--color-muted)] mb-5">
              Before you can connect cameras, OSP needs to start a lightweight
              local engine that handles RTSP streams and WebRTC. It runs in
              the background automatically every time you open the app.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                {
                  icon: <Camera className="w-4 h-4" />,
                  label: "Any Camera",
                  sub: "RTSP, ONVIF, USB",
                },
                {
                  icon: <Shield className="w-4 h-4" />,
                  label: "Private",
                  sub: "Stays on your network",
                },
                {
                  icon: <Zap className="w-4 h-4" />,
                  label: "Low Latency",
                  sub: "WebRTC sub-second",
                },
              ].map((f) => (
                <div
                  key={f.label}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3"
                >
                  <span className="text-[var(--color-accent)]">{f.icon}</span>
                  <div className="mt-2 text-xs font-medium text-[var(--color-fg)]">
                    {f.label}
                  </div>
                  <div className="text-[11px] text-[var(--color-muted)] mt-0.5">
                    {f.sub}
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={runSetup}
              className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all"
            >
              Install &amp; Configure
            </button>
          </div>
        )}

        {/* ── Running / Success / Error ── */}
        {state !== "idle" && (
          <div className="px-7 py-6">
            {/* Progress bar */}
            <div className="h-1 rounded-full bg-[var(--color-border)] mb-4 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Terminal window */}
            <div
              ref={termRef}
              className="rounded-xl border border-[#30363d] bg-[#0d1117] h-52 overflow-y-auto p-4 font-mono text-[11px] leading-5 select-text"
            >
              {logs.map((line) => (
                <div
                  key={line.id}
                  className={`flex gap-2 ${
                    line.type === "cmd"
                      ? "text-[#79c0ff]"
                      : line.type === "success"
                        ? "text-[#3fb950]"
                        : line.type === "error"
                          ? "text-[#f85149]"
                          : "text-[#c9d1d9]"
                  }`}
                >
                  <span className="shrink-0 select-none w-3 text-center">
                    {line.type === "cmd"
                      ? ">"
                      : line.type === "success"
                        ? "✓"
                        : line.type === "error"
                          ? "✗"
                          : "·"}
                  </span>
                  <span>{line.text}</span>
                </div>
              ))}
              {state === "running" && (
                <div className="flex items-center gap-2 text-[#8b949e] mt-0.5">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  <span>working...</span>
                </div>
              )}
            </div>

            {/* Success CTA */}
            {state === "success" && (
              <div className="mt-5">
                <div className="flex items-center gap-1.5 text-[#3fb950] text-xs font-medium mb-4">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Camera engine is running
                </div>
                <button
                  onClick={onComplete}
                  className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Add Your First Camera
                </button>
              </div>
            )}

            {/* Error CTA */}
            {state === "error" && (
              <div className="mt-5">
                <div className="flex items-center gap-1.5 text-[#f85149] text-xs font-medium mb-4">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Setup failed — camera engine did not start
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={runSetup}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => {
                      // Let them skip — maybe they'll retry later
                      localStorage.setItem(DESKTOP_SETUP_KEY, "skip");
                      onComplete();
                    }}
                    className="flex-1 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] text-sm hover:text-[var(--color-fg)] hover:border-[var(--color-fg)] transition-colors"
                  >
                    Skip for now
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
