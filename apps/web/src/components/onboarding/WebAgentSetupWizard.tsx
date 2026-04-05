"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Server,
  Copy,
  Check,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Camera,
  Wifi,
  ShieldCheck,
  Download,
  Terminal,
  Package,
} from "lucide-react";
import { getTenantIdFromAccessToken } from "@/lib/jwt";
import {
  getLocalNgrokAuthtoken,
  setLocalNgrokAuthtoken,
  NGROK_AUTHTOKEN_MIN_LEN,
} from "@/lib/local-agent-credentials";

export const WEB_SETUP_KEY = "osp_web_agent_setup_complete";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
// NEXT_PUBLIC_GATEWAY_URL lets you override the URL embedded in agent docker
// commands independently of the web app's own API calls. Falls back to
// NEXT_PUBLIC_API_URL (same service in most deployments) then to the default
// production gateway URL so the docker command is always correct.
const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "https://osp-gateway.fly.dev";

/** Official edge bundle from GitHub Releases (`osp-edge-bundle.zip`). Override for forks / private mirrors. */
const EDGE_BUNDLE_ZIP_URL =
  process.env.NEXT_PUBLIC_EDGE_BUNDLE_ZIP_URL ??
  `https://github.com/${process.env.NEXT_PUBLIC_GITHUB_REPO ?? "MatiDes12/osp"}/releases/latest/download/osp-edge-bundle.zip`;

const NGROK_SIGNUP_URL = "https://dashboard.ngrok.com/signup";
const NGROK_AUTHTOKEN_URL =
  "https://dashboard.ngrok.com/get-started/your-authtoken";

type OS = "windows" | "mac" | "linux";
type Step = "welcome" | "docker" | "credentials" | "run" | "waiting" | "done";
type ApiKeySource = "auto" | "manual";
/** compose = Docker Compose zip + .env from this wizard (default, non-technical) */
type SetupMode = "compose" | "download" | "terminal";

interface WebAgentSetupWizardProps {
  readonly onComplete: () => void;
}

function detectOS(): OS {
  if (typeof navigator === "undefined") return "linux";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("win")) return "windows";
  if (ua.includes("mac")) return "mac";
  return "linux";
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("osp_access_token");
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handle}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
        copied
          ? "bg-[#3fb950]/20 text-[#3fb950]"
          : "bg-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
      } ${className}`}
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

// ── Command block ─────────────────────────────────────────────────────────────

function CommandBlock({
  label,
  command,
  description,
}: {
  label?: string;
  command: string;
  description?: string;
}) {
  return (
    <div className="rounded-xl border border-[#30363d] bg-[#0d1117] overflow-hidden">
      {label && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-[#30363d]">
          <span className="text-[10px] font-medium text-[#8b949e] uppercase tracking-wider">
            {label}
          </span>
          <CopyButton text={command} />
        </div>
      )}
      {description && (
        <div className="px-4 py-3 border-b border-[#30363d] bg-[#161b22]">
          <p className="text-[11px] leading-relaxed text-[#c9d1d9]">
            {description}
          </p>
        </div>
      )}
      <pre className="px-4 py-3 text-[11px] leading-5 text-[#e6edf3] font-mono whitespace-pre-wrap break-all overflow-x-auto">
        {command}
      </pre>
      {!label && (
        <div className="flex justify-end px-4 pb-3 -mt-1">
          <CopyButton text={command} />
        </div>
      )}
    </div>
  );
}

// ── OS Tab ─────────────────────────────────────────────────────────────────────

const OS_LABELS: Record<OS, string> = {
  windows: "Windows",
  mac: "macOS",
  linux: "Linux",
};

const DOCKER_LINKS: Record<OS, string> = {
  windows: "https://docs.docker.com/desktop/install/windows-install/",
  mac: "https://docs.docker.com/desktop/install/mac-install/",
  linux: "https://docs.docker.com/engine/install/",
};

/** Single-quoted for Unix docker -e KEY=value */
function sqUnix(val: string): string {
  return `'${val.replace(/'/g, `'\"'\"'`)}'`;
}

/** Double-quoted fragment for Windows CMD docker -e "KEY=value" */
function dqWin(val: string): string {
  return val.replace(/"/g, '\\"');
}

function buildCommands(
  os: OS,
  tenantId: string,
  apiToken: string,
  ngrokToken: string,
) {
  if (os === "windows") {
    const go2rtc = `docker run -d --name osp-go2rtc -p 1984:1984 -p 8554:8554 -p 8555:8555/udp --restart unless-stopped -e GO2RTC_API_ORIGIN=* alexxit/go2rtc`;
    const ngrok = `docker run -d --name osp-ngrok -p 4040:4040 --restart unless-stopped -e "NGROK_AUTHTOKEN=${dqWin(ngrokToken)}" ngrok/ngrok:latest http http://host.docker.internal:1984 --log stdout`;
    const agent = `docker run -d --name osp-agent -p 8084:8084 --restart unless-stopped -e CLOUD_GATEWAY_URL=${GATEWAY_URL} -e TENANT_ID=${tenantId} -e "CLOUD_API_TOKEN=${dqWin(apiToken)}" -e GO2RTC_URL=http://host.docker.internal:1984 -e NGROK_API_URL=http://host.docker.internal:4040 ghcr.io/matides12/osp-edge-agent:latest`;
    return { go2rtc, ngrok, agent };
  }

  const cont = "\\\n  ";
  const go2rtc = `docker run -d --name osp-go2rtc ${os === "linux" ? "--network host " : "-p 1984:1984 -p 8554:8554 -p 8555:8555/udp "}${cont}--restart unless-stopped ${cont}-e GO2RTC_API_ORIGIN=* alexxit/go2rtc`;
  const go2rtcUrl =
    os === "linux"
      ? "http://localhost:1984"
      : "http://host.docker.internal:1984";
  const ngrokTarget =
    os === "linux"
      ? "http://localhost:1984"
      : "http://host.docker.internal:1984";
  const ngrokApi =
    os === "linux"
      ? "http://localhost:4040"
      : "http://host.docker.internal:4040";
  const ngrokNet = os === "linux" ? "--network host " : "-p 4040:4040 ";
  const ngrok = `docker run -d --name osp-ngrok ${ngrokNet}${cont}--restart unless-stopped ${cont}-e NGROK_AUTHTOKEN=${sqUnix(ngrokToken)} ${cont}ngrok/ngrok:latest http ${ngrokTarget} --log stdout`;

  const agentEnv = [
    `-e CLOUD_GATEWAY_URL=${GATEWAY_URL}`,
    `-e TENANT_ID=${tenantId}`,
    `-e CLOUD_API_TOKEN=${sqUnix(apiToken)}`,
    `-e GO2RTC_URL=${go2rtcUrl}`,
    `-e NGROK_API_URL=${ngrokApi}`,
  ].join(` ${cont}`);

  const agent = `docker run -d --name osp-agent ${os === "linux" ? "--network host " : ""}${cont}--restart unless-stopped ${cont}${agentEnv} ${cont}ghcr.io/matides12/osp-edge-agent:latest`;

  return { go2rtc, ngrok, agent };
}

/** One line per command — for downloadable scripts (same behavior as copy-paste). */
function buildSingleLineCommands(
  os: OS,
  tenantId: string,
  apiToken: string,
  ngrokToken: string,
): { go2rtcLine: string; ngrokLine: string; agentLine: string } {
  if (os === "windows") {
    const { go2rtc, ngrok, agent } = buildCommands(
      os,
      tenantId,
      apiToken,
      ngrokToken,
    );
    return { go2rtcLine: go2rtc, ngrokLine: ngrok, agentLine: agent };
  }
  const go2rtc =
    os === "linux"
      ? `docker run -d --name osp-go2rtc --network host --restart unless-stopped -e GO2RTC_API_ORIGIN=* alexxit/go2rtc`
      : `docker run -d --name osp-go2rtc -p 1984:1984 -p 8554:8554 -p 8555:8555/udp --restart unless-stopped -e GO2RTC_API_ORIGIN=* alexxit/go2rtc`;
  const ngrokPrefix =
    os === "linux"
      ? `docker run -d --name osp-ngrok --network host --restart unless-stopped`
      : `docker run -d --name osp-ngrok -p 4040:4040 --restart unless-stopped`;
  const ngrokTarget =
    os === "linux"
      ? "http://localhost:1984"
      : "http://host.docker.internal:1984";
  const ngrok = `${ngrokPrefix} -e NGROK_AUTHTOKEN=${sqUnix(ngrokToken)} ngrok/ngrok:latest http ${ngrokTarget} --log stdout`;
  const agentPrefix =
    os === "linux"
      ? `docker run -d --name osp-agent --network host --restart unless-stopped`
      : `docker run -d --name osp-agent -p 8084:8084 --restart unless-stopped`;
  const go2rtcUrl =
    os === "linux"
      ? "http://localhost:1984"
      : "http://host.docker.internal:1984";
  const ngrokApi =
    os === "linux"
      ? "http://localhost:4040"
      : "http://host.docker.internal:4040";
  const agent = `${agentPrefix} -e CLOUD_GATEWAY_URL=${GATEWAY_URL} -e TENANT_ID=${tenantId} -e CLOUD_API_TOKEN=${sqUnix(apiToken)} -e GO2RTC_URL=${go2rtcUrl} -e NGROK_API_URL=${ngrokApi} ghcr.io/matides12/osp-edge-agent:latest`;
  return { go2rtcLine: go2rtc, ngrokLine: ngrok, agentLine: agent };
}

function buildEnvAgentFileContent(params: {
  gatewayUrl: string;
  tenantId: string;
  apiToken: string;
  ngrokToken: string;
  tz?: string;
}): string {
  const tz = params.tz ?? "UTC";
  return `# OSP — generated from your dashboard (keep secret; do not share)
CLOUD_GATEWAY_URL=${params.gatewayUrl}
TENANT_ID=${params.tenantId}
CLOUD_API_TOKEN=${params.apiToken}
NGROK_AUTHTOKEN=${params.ngrokToken}
TZ=${tz}
`;
}

function composeUpCommand(os: OS): string {
  if (os === "windows" || os === "mac") {
    return "docker compose --env-file .env.agent -f docker-compose.agent.win.yml up -d";
  }
  return "docker compose --env-file .env.agent -f docker-compose.agent.yml up -d";
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Escape for `cmd /c "..."` when the whole docker line is one quoted argument. */
function escapeForCmdC(s: string): string {
  return s.replace(/"/g, '""');
}

function buildWindowsPs1(
  go2rtcLine: string,
  ngrokLine: string,
  agentLine: string,
): string {
  const c1 = escapeForCmdC(go2rtcLine);
  const c2 = escapeForCmdC(ngrokLine);
  const c3 = escapeForCmdC(agentLine);
  return `# OSP — camera proxy + tunnel + agent (official setup from your OSP account)
# How to run: Right-click this file → "Run with PowerShell"
# If Windows asks about scripts: this file only runs Docker with the commands below.

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "OSP — Removing old containers if they exist..." -ForegroundColor Gray
docker rm -f osp-go2rtc osp-ngrok osp-agent 2>&1 | Out-Null

Write-Host ""
Write-Host "OSP — Writing go2rtc config (enables CORS for live streams)..." -ForegroundColor Gray
$OspDir = "$env:LOCALAPPDATA\\OSP"
New-Item -ItemType Directory -Force -Path $OspDir | Out-Null
@"
api:
  listen: ":1984"
  origin: "*"
"@ | Set-Content "$OspDir\\go2rtc.yaml"

Write-Host ""
Write-Host "OSP — Step 1: Starting camera proxy (go2rtc)..." -ForegroundColor Cyan
docker run -d --name osp-go2rtc -p 1984:1984 -p 8554:8554 -p 8555:8555/udp --restart unless-stopped -v "$OspDir/go2rtc.yaml:/config/go2rtc.yaml:ro" alexxit/go2rtc
if ($LASTEXITCODE -ne 0) {
  Write-Host "Step 1 failed. Is Docker Desktop running?" -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "OSP — Step 2: Starting ngrok tunnel (live stream access)..." -ForegroundColor Cyan
cmd /c "${c2}"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Step 2 failed. Check Docker and try again." -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "OSP — Step 3: Starting OSP agent..." -ForegroundColor Cyan
cmd /c "${c3}"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Step 3 failed. Check Docker and try again." -ForegroundColor Red
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host ""
Write-Host "Done. You can close this window and return to OSP in your browser." -ForegroundColor Green
Read-Host "Press Enter to close"
`;
}

function buildWindowsBat(
  go2rtcLine: string,
  ngrokLine: string,
  agentLine: string,
): string {
  return `@echo off
setlocal EnableExtensions
title OSP setup
echo.
echo OSP - Removing old containers if they exist...
docker rm -f osp-go2rtc osp-ngrok osp-agent 2>nul
echo.
echo OSP - Writing go2rtc config (enables CORS for live streams)...
if not exist "%LOCALAPPDATA%\\OSP" mkdir "%LOCALAPPDATA%\\OSP"
(echo api:) > "%LOCALAPPDATA%\\OSP\\go2rtc.yaml"
(echo   listen: ":1984") >> "%LOCALAPPDATA%\\OSP\\go2rtc.yaml"
(echo   origin: "*") >> "%LOCALAPPDATA%\\OSP\\go2rtc.yaml"
echo.
echo OSP - Pulling latest images...
docker pull alexxit/go2rtc:latest
docker pull ngrok/ngrok:latest
docker pull ghcr.io/matides12/osp-edge-agent:latest
echo.
echo OSP - Step 1: Starting camera proxy (go2rtc)...
docker run -d --name osp-go2rtc -p 1984:1984 -p 8554:8554 -p 8555:8555/udp --restart unless-stopped -v "%LOCALAPPDATA%\\OSP\\go2rtc.yaml:/config/go2rtc.yaml:ro" alexxit/go2rtc
if errorlevel 1 (
  echo Step 1 failed. Is Docker Desktop running?
  pause
  exit /b 1
)
echo.
echo OSP - Step 2: Starting ngrok tunnel (live stream access)...
${ngrokLine}
if errorlevel 1 (
  echo Step 2 failed. Check Docker and try again.
  pause
  exit /b 1
)
echo.
echo OSP - Step 3: Starting OSP agent...
${agentLine}
if errorlevel 1 (
  echo Step 3 failed. Check Docker and try again.
  pause
  exit /b 1
)
echo.
echo Done. Return to OSP in your browser.
pause
`;
}

function buildUnixSh(
  go2rtcLine: string,
  ngrokLine: string,
  agentLine: string,
): string {
  return `#!/usr/bin/env bash
set -euo pipefail
echo ""
echo "OSP — Removing old containers if they exist..."
docker rm -f osp-go2rtc osp-ngrok osp-agent 2>/dev/null || true
echo ""
echo "OSP — Writing go2rtc config (enables CORS for live streams)..."
mkdir -p "$HOME/.osp"
cat > "$HOME/.osp/go2rtc.yaml" << 'GOCONF'
api:
  listen: ":1984"
  origin: "*"
GOCONF
echo ""
echo "OSP — Pulling latest images..."
docker pull alexxit/go2rtc:latest
docker pull ngrok/ngrok:latest
docker pull ghcr.io/matides12/osp-edge-agent:latest
echo ""
echo "OSP — Step 1: Starting camera proxy (go2rtc)..."
docker run -d --name osp-go2rtc -p 1984:1984 -p 8554:8554 -p 8555:8555/udp --restart unless-stopped -v "$HOME/.osp/go2rtc.yaml:/config/go2rtc.yaml:ro" alexxit/go2rtc
echo ""
echo "OSP — Step 2: Starting ngrok tunnel (live stream access)..."
${ngrokLine}
echo ""
echo "OSP — Step 3: Starting OSP agent..."
${agentLine}
echo ""
echo "Done. Return to OSP in your browser."
`;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function WebAgentSetupWizard({ onComplete }: WebAgentSetupWizardProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [os, setOs] = useState<OS>(detectOS);
  /** Default: Compose + zip — everything else is “advanced”. */
  const [setupMode, setSetupMode] = useState<SetupMode>("compose");
  const [ngrokToken, setNgrokToken] = useState(() =>
    typeof window === "undefined" ? "" : getLocalNgrokAuthtoken(),
  );
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [manualApiToken, setManualApiToken] = useState("");
  const [apiKeySource, setApiKeySource] = useState<ApiKeySource>("auto");
  const [generatingKey, setGeneratingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [credentialsHint, setCredentialsHint] = useState<string | null>(null);
  const [agentConnected, setAgentConnected] = useState(false);
  const [pollError, setPollError] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Real tenant UUID — never show "your-tenant-id" to users. */
  const [tenantId, setTenantId] = useState<string | null>(() =>
    getTenantIdFromAccessToken(localStorage.getItem("osp_access_token")),
  );
  const [tenantLoadError, setTenantLoadError] = useState(false);

  // Fill tenant from API if JWT doesn't include it (e.g. older sessions)
  useEffect(() => {
    if (tenantId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/tenants/current`, {
          headers: getAuthHeaders(),
        });
        const json = (await res.json()) as {
          success?: boolean;
          data?: { id?: string };
        };
        if (cancelled) return;
        const id = json.data?.id;
        if (json.success && typeof id === "string" && id.length > 0) {
          setTenantId(id);
        } else {
          setTenantLoadError(true);
        }
      } catch {
        if (!cancelled) setTenantLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const generateApiKey = useCallback(async () => {
    if (apiToken) return true;
    setGeneratingKey(true);
    setKeyError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/api-keys`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ name: "OSP Agent (auto-setup)" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      const key = (json.data?.key ?? json.key) as string | undefined;
      if (!key) throw new Error("key missing from response");
      setApiToken(key);
      return true;
    } catch (e) {
      setKeyError(
        `Could not generate API key — ${e instanceof Error ? e.message : "unknown error"}`,
      );
      return false;
    } finally {
      setGeneratingKey(false);
    }
  }, [apiToken]);

  const handleCredentialsContinue = useCallback(async () => {
    setCredentialsHint(null);
    const ng = ngrokToken.trim();
    if (ng.length < NGROK_AUTHTOKEN_MIN_LEN) {
      setCredentialsHint(
        `Ngrok authtoken must be at least ${NGROK_AUTHTOKEN_MIN_LEN} characters.`,
      );
      return;
    }
    if (apiKeySource === "manual") {
      if (!manualApiToken.trim()) {
        setCredentialsHint("Paste your API key from Settings → API Keys.");
        return;
      }
    } else {
      const hasKey = apiToken != null && apiToken.length > 0;
      if (!hasKey) {
        const ok = await generateApiKey();
        if (!ok) return;
      }
    }
    setLocalNgrokAuthtoken(ng);
    setStep("run");
  }, [ngrokToken, apiKeySource, manualApiToken, apiToken, generateApiKey]);

  const effectiveApiToken =
    apiKeySource === "auto" ? (apiToken ?? "").trim() : manualApiToken.trim();
  const ngrokTrimmed = ngrokToken.trim();
  const ngrokValid = ngrokTrimmed.length >= NGROK_AUTHTOKEN_MIN_LEN;
  const apiTokenReady = effectiveApiToken.length > 0;

  // ── Poll for agent connection ─────────────────────────────────────────────────
  const checkForAgent = useCallback(async () => {
    setPollCount((n) => n + 1);
    try {
      const res = await fetch(`${API_URL}/api/v1/edge/agents`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      const agents: { status: string; last_seen_at?: string }[] =
        json.data ?? [];
      const now = Date.now();
      const online = agents.some((a) => {
        if (a.status !== "online") return false;
        if (!a.last_seen_at) return true;
        return now - new Date(a.last_seen_at).getTime() < 3 * 60 * 1000;
      });
      if (online) {
        clearInterval(pollRef.current!);
        setAgentConnected(true);
        localStorage.setItem(WEB_SETUP_KEY, "1");
      }
    } catch {
      // network error — keep polling
    }
  }, []);

  useEffect(() => {
    if (step !== "waiting") return;
    void checkForAgent(); // immediate check
    pollRef.current = setInterval(checkForAgent, 5000);
    const timeout = setTimeout(() => {
      clearInterval(pollRef.current!);
      setPollError(true);
    }, 90_000); // 90s timeout
    return () => {
      clearInterval(pollRef.current!);
      clearTimeout(timeout);
    };
  }, [step, checkForAgent]);

  const secretsReady =
    !!tenantId && ngrokValid && apiTokenReady && !tenantLoadError;
  const cmds = secretsReady
    ? buildCommands(os, tenantId!, effectiveApiToken, ngrokTrimmed)
    : null;
  const singleLine = secretsReady
    ? buildSingleLineCommands(os, tenantId!, effectiveApiToken, ngrokTrimmed)
    : null;
  const runStepLoading = step === "run" && !tenantLoadError && !tenantId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-bg)]/90 backdrop-blur-sm p-4 overflow-y-auto py-8">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden">
        {/* ── Progress dots ── */}
        <div className="flex items-center gap-1.5 px-7 pt-5">
          {(
            ["welcome", "docker", "credentials", "run", "waiting"] as const
          ).map((s, i) => (
            <div
              key={s}
              className={`h-1 rounded-full transition-all duration-300 ${
                step === "done" ||
                ["welcome", "docker", "credentials", "run", "waiting"].indexOf(
                  step,
                ) >= i
                  ? "bg-[var(--color-accent)]"
                  : "bg-[var(--color-border)]"
              } ${s === step ? "w-6" : "w-3"}`}
            />
          ))}
        </div>

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-7 pt-4 pb-5 border-b border-[var(--color-border)]">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-accent)]/10 flex items-center justify-center shrink-0">
            <Server className="w-4 h-4 text-[var(--color-accent)]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--color-fg)] leading-tight">
              {step === "welcome" && "Connect Your Cameras"}
              {step === "docker" && "Install Docker"}
              {step === "credentials" && "Connect this computer"}
              {step === "run" && "Finish setup in this browser"}
              {step === "waiting" && "Waiting for Agent…"}
              {step === "done" && "Agent Connected!"}
            </h2>
            <p className="text-xs text-[var(--color-muted)] mt-0.5">
              {step === "welcome" &&
                "Everything below happens here except installing Docker — no coding required"}
              {step === "docker" &&
                "The only app you install yourself; the rest is guided here"}
              {step === "credentials" &&
                "Ngrok tunnel + API key — we keep them only in your browser until you download"}
              {step === "run" &&
                (setupMode === "compose"
                  ? "Download two files, then run one command — we fill in your keys"
                  : setupMode === "download"
                    ? "Download a script or use advanced terminal commands"
                    : "Copy-paste commands if you prefer the terminal")}
              {step === "waiting" && "Checking every 5 seconds…"}
              {step === "done" && "Your agent is online and ready"}
            </p>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            STEP: welcome
        ══════════════════════════════════════════════════════════════════════ */}
        {step === "welcome" && (
          <div className="px-7 py-6">
            {/* OS selector */}
            <div className="flex gap-2 mb-5">
              {(["windows", "mac", "linux"] as OS[]).map((o) => (
                <button
                  key={o}
                  onClick={() => setOs(o)}
                  className={`flex-1 py-2 rounded-xl border text-xs font-medium transition-colors ${
                    os === o
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                      : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-fg)] hover:border-[var(--color-fg)]"
                  }`}
                >
                  {OS_LABELS[o]}
                </button>
              ))}
            </div>

            <p className="text-sm text-[var(--color-muted)] mb-5">
              To view cameras in OSP, a small program runs on a PC or NAS on the
              same Wi‑Fi as your cameras. You will only install{" "}
              <span className="text-[var(--color-fg)]">Docker</span> yourself;
              we&apos;ll create your keys, tunnel, and copy-paste instructions
              here — no project folder or GitHub required.
            </p>

            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                {
                  icon: <Wifi className="w-4 h-4" />,
                  label: "Local Network",
                  sub: "Cameras never leave your LAN",
                },
                {
                  icon: <Camera className="w-4 h-4" />,
                  label: "Any Camera",
                  sub: "RTSP, ONVIF, Hikvision…",
                },
                {
                  icon: <Server className="w-4 h-4" />,
                  label: "Auto-Start",
                  sub: "Restarts with your machine",
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

            <div className="flex gap-3">
              <button
                onClick={() => setStep("docker")}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Get Started
              </button>
              <button
                onClick={() => {
                  localStorage.setItem(WEB_SETUP_KEY, "skip");
                  onComplete();
                }}
                className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] text-sm hover:text-[var(--color-fg)] transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            STEP: docker
        ══════════════════════════════════════════════════════════════════════ */}
        {step === "docker" && (
          <div className="px-7 py-6">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 mb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--color-fg)] mb-1">
                    Docker Desktop
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    The OSP agent runs inside Docker so it works on any computer
                    without installing extra software.{" "}
                    {os === "linux"
                      ? "Install Docker Engine (not Desktop) on Linux."
                      : ""}
                  </p>
                </div>
                <a
                  href={DOCKER_LINKS[os]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  Download <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {os !== "linux" && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 mb-5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-400/90">
                  On {OS_LABELS[os]}, Docker runs in a lightweight VM. Camera
                  discovery works best via direct RTSP URLs — ONVIF auto-scan
                  may not find cameras.
                </p>
              </div>
            )}

            <p className="text-xs text-[var(--color-muted)] mb-6">
              Once Docker is installed and running, come back here and click
              Continue.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("welcome")}
                className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] text-sm hover:text-[var(--color-fg)] transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setStep("credentials")}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                I have Docker installed — Continue
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            STEP: credentials
        ══════════════════════════════════════════════════════════════════════ */}
        {step === "credentials" && (
          <div className="px-7 py-6 space-y-4">
            {tenantLoadError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-red-400 font-medium">
                    We couldn&apos;t load your organization
                  </p>
                  <p className="text-[11px] text-red-400/80 mt-1">
                    Refresh this page or sign out and sign in again, then reopen
                    this setup.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="osp-wizard-ngrok"
                className="text-xs font-medium text-[var(--color-fg)]"
              >
                Ngrok authtoken
              </label>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5 mb-2 leading-relaxed">
                Required for a secure tunnel to your camera proxy.{" "}
                <a
                  href={NGROK_SIGNUP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-accent)] hover:underline"
                >
                  Get free account
                </a>
                {" · "}
                <a
                  href={NGROK_AUTHTOKEN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--color-accent)] hover:underline"
                >
                  Copy authtoken
                </a>
              </p>
              <input
                id="osp-wizard-ngrok"
                type="password"
                autoComplete="off"
                value={ngrokToken}
                onChange={(e) => setNgrokToken(e.target.value)}
                placeholder="Paste your ngrok authtoken"
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
              />
            </div>

            <div>
              <span className="text-xs font-medium text-[var(--color-fg)]">
                OSP API key
              </span>
              <p className="text-[11px] text-[var(--color-muted)] mt-0.5 mb-2">
                Used so the agent can register with your account. You can create
                one here or paste an existing key from Settings → API Keys.
              </p>
              <div className="flex rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-1 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setApiKeySource("auto");
                    setCredentialsHint(null);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                    apiKeySource === "auto"
                      ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                      : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                  }`}
                >
                  Create key for me
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setApiKeySource("manual");
                    setCredentialsHint(null);
                  }}
                  className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${
                    apiKeySource === "manual"
                      ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                      : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                  }`}
                >
                  I already have a key
                </button>
              </div>

              {apiKeySource === "auto" && (
                <div className="space-y-2">
                  {!apiToken ? (
                    <button
                      type="button"
                      onClick={() => void generateApiKey()}
                      disabled={generatingKey}
                      className="w-full py-2.5 rounded-xl border border-[var(--color-border)] text-sm font-medium text-[var(--color-fg)] hover:bg-[var(--color-bg)] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                    >
                      {generatingKey ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                          Creating key…
                        </>
                      ) : (
                        "Generate API key"
                      )}
                    </button>
                  ) : (
                    <input
                      type="password"
                      readOnly
                      value={apiToken}
                      aria-label="API key (masked)"
                      className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-fg)] cursor-default"
                    />
                  )}
                </div>
              )}

              {apiKeySource === "manual" && (
                <input
                  id="osp-wizard-api-manual"
                  type="password"
                  autoComplete="off"
                  value={manualApiToken}
                  onChange={(e) => setManualApiToken(e.target.value)}
                  placeholder="Paste API key from Settings → API Keys"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/40"
                />
              )}
            </div>

            {keyError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-red-400">{keyError}</p>
                  <button
                    type="button"
                    onClick={() => void generateApiKey()}
                    className="text-xs text-red-400 underline mt-1"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {credentialsHint && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-400">{credentialsHint}</p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep("docker")}
                className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] text-sm hover:text-[var(--color-fg)] transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleCredentialsContinue()}
                disabled={generatingKey || tenantLoadError}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            STEP: run
        ══════════════════════════════════════════════════════════════════════ */}
        {step === "run" && (
          <div className="px-7 py-6">
            <p className="text-xs text-[var(--color-muted)] mb-4 leading-relaxed">
              {setupMode === "compose" && (
                <>
                  <span className="text-[var(--color-fg)]">Recommended:</span>{" "}
                  download the official bundle and a filled{" "}
                  <code className="text-[var(--color-fg)]">.env.agent</code>,
                  then run one Docker Compose command in the extracted folder.
                  Docker must be running first.
                </>
              )}
              {setupMode === "download" && (
                <>
                  Prefer no terminal? Download a small setup file, then
                  double-click it (Windows) or run one command in Terminal
                  (Mac/Linux). Docker must be running first. Or switch to{" "}
                  <span className="text-[var(--color-fg)]">Use terminal</span>{" "}
                  for copy-paste commands instead.
                </>
              )}
              {setupMode === "terminal" && (
                <>
                  Open a terminal (Command Prompt or PowerShell on Windows) and
                  run these three commands in order. Your ngrok and API values
                  are already embedded — copy and paste as-is.
                </>
              )}
            </p>

            <div className="grid grid-cols-3 gap-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-1 mb-4">
              <button
                type="button"
                onClick={() => setSetupMode("compose")}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 rounded-lg py-2 px-1 text-[10px] sm:text-xs font-medium transition-colors text-center leading-tight ${
                  setupMode === "compose"
                    ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                }`}
              >
                <Package className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span>Recommended</span>
              </button>
              <button
                type="button"
                onClick={() => setSetupMode("download")}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 rounded-lg py-2 px-1 text-[10px] sm:text-xs font-medium transition-colors text-center leading-tight ${
                  setupMode === "download"
                    ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                }`}
              >
                <Download className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span>Download</span>
              </button>
              <button
                type="button"
                onClick={() => setSetupMode("terminal")}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1 rounded-lg py-2 px-1 text-[10px] sm:text-xs font-medium transition-colors text-center leading-tight ${
                  setupMode === "terminal"
                    ? "bg-[var(--color-surface)] text-[var(--color-fg)] shadow-sm"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
                }`}
              >
                <Terminal className="w-3.5 h-3.5 shrink-0" aria-hidden />
                <span>Terminal</span>
              </button>
            </div>

            <div className="flex gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 mb-4">
              <ShieldCheck
                className="w-5 h-5 text-[var(--color-accent)] shrink-0 mt-0.5"
                aria-hidden
              />
              <div>
                <p className="text-xs font-medium text-[var(--color-fg)]">
                  You're not being hacked
                </p>
                <p className="text-[11px] text-[var(--color-muted)] mt-1 leading-relaxed">
                  This is official OSP setup while you're signed in. The
                  commands run only on{" "}
                  <span className="text-[var(--color-fg)]">your</span> computer
                  through Docker — the same kind of tool developers use to run
                  apps safely. They don't install remote desktop, spyware, or
                  give strangers access to your PC.
                </p>
              </div>
            </div>

            {runStepLoading && (
              <div className="flex flex-col items-center gap-2 text-[var(--color-muted)] text-xs py-6 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Preparing your account…</span>
              </div>
            )}

            {tenantLoadError && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/5 p-3 mb-4">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-red-400 font-medium">
                    We couldn&apos;t load your organization
                  </p>
                  <p className="text-[11px] text-red-400/80 mt-1">
                    Refresh this page or sign out and sign in again, then reopen
                    this setup.
                  </p>
                </div>
              </div>
            )}

            {!runStepLoading &&
              !tenantLoadError &&
              setupMode === "compose" &&
              tenantId && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 mb-5 space-y-4">
                  <ol className="text-[11px] text-[var(--color-muted)] list-decimal pl-4 space-y-2 leading-relaxed">
                    <li>
                      Download{" "}
                      <a
                        href={EDGE_BUNDLE_ZIP_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-accent)] hover:underline inline-flex items-center gap-0.5"
                      >
                        osp-edge-bundle.zip
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>{" "}
                      and extract it to a folder on this computer.
                    </li>
                    <li>
                      Save{" "}
                      <code className="text-[var(--color-fg)]">.env.agent</code>{" "}
                      in that same folder (next to the compose file). Use the
                      button below — values are filled from this wizard.
                    </li>
                    <li>
                      Open a terminal in that folder and run the compose command
                      below.
                    </li>
                  </ol>
                  <button
                    type="button"
                    disabled={!secretsReady}
                    onClick={() =>
                      downloadTextFile(
                        ".env.agent",
                        buildEnvAgentFileContent({
                          gatewayUrl: GATEWAY_URL,
                          tenantId,
                          apiToken: effectiveApiToken,
                          ngrokToken: ngrokTrimmed,
                        }),
                      )
                    }
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-bg)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    Download .env.agent
                  </button>
                  <CommandBlock
                    label="Docker Compose"
                    description="Run this from the folder that contains docker-compose.agent*.yml and your .env.agent file."
                    command={composeUpCommand(os)}
                  />
                </div>
              )}

            {cmds &&
              singleLine &&
              !tenantLoadError &&
              setupMode === "download" && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-4 mb-5 space-y-3">
                  <p className="text-[11px] text-[var(--color-muted)] leading-relaxed">
                    {os === "windows" ? (
                      <>
                        Save the file to your computer, then double-click it. If
                        Windows SmartScreen or PowerShell asks for permission,
                        choose{" "}
                        <span className="text-[var(--color-fg)]">Run</span> —
                        this only runs the same three Docker commands shown in
                        the terminal option.
                      </>
                    ) : (
                      <>
                        After downloading, open Terminal in the folder where you
                        saved the file, run{" "}
                        <code className="text-[var(--color-fg)]">
                          chmod +x osp-setup.sh &amp;&amp; ./osp-setup.sh
                        </code>
                        .
                      </>
                    )}
                  </p>
                  {os === "windows" ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextFile(
                            "osp-windows-setup.ps1",
                            buildWindowsPs1(
                              singleLine.go2rtcLine,
                              singleLine.ngrokLine,
                              singleLine.agentLine,
                            ),
                          )
                        }
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-bg)] transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        PowerShell (.ps1)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          downloadTextFile(
                            "osp-windows-setup.bat",
                            buildWindowsBat(
                              singleLine.go2rtcLine,
                              singleLine.ngrokLine,
                              singleLine.agentLine,
                            ),
                          )
                        }
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-bg)] transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 shrink-0" />
                        Command Prompt (.bat)
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        downloadTextFile(
                          "osp-setup.sh",
                          buildUnixSh(
                            singleLine.go2rtcLine,
                            singleLine.ngrokLine,
                            singleLine.agentLine,
                          ),
                        )
                      }
                      className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-xs font-semibold text-[var(--color-fg)] hover:bg-[var(--color-bg)] transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      Download setup script (.sh)
                    </button>
                  )}
                </div>
              )}

            {cmds && !tenantLoadError && setupMode === "terminal" && (
              <div className="space-y-4 mb-5">
                <CommandBlock
                  label="Step 1 — Start camera proxy"
                  description={
                    'What this does: starts a small, trusted program (go2rtc) on your computer so your cameras can be reached on your local network and shown in the browser. It\'s a "bridge" for video — not a virus, not remote control of your PC.'
                  }
                  command={cmds.go2rtc}
                />
                <CommandBlock
                  label="Step 2 — Start ngrok tunnel"
                  description={
                    "What this does: creates a free, secure HTTPS tunnel so you can watch live streams from anywhere — no port forwarding or static IP needed. ngrok supports WebSocket for real-time video streaming."
                  }
                  command={cmds.ngrok}
                />
                <CommandBlock
                  label="Step 3 — Start OSP agent"
                  description="What this does: starts the official OSP agent so this machine can talk to your OSP account (the same account you used to sign in here) using your API key. It connects your cameras to your dashboard — it does not steal files, passwords, or give anyone else access to your computer."
                  command={cmds.agent}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("credentials")}
                className="px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] text-sm hover:text-[var(--color-fg)] transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep("waiting")}
                disabled={!cmds || tenantLoadError}
                className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              >
                {setupMode === "compose"
                  ? "I've run Compose — Connect"
                  : "I've run the commands — Connect"}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            STEP: waiting
        ══════════════════════════════════════════════════════════════════════ */}
        {step === "waiting" && (
          <div className="px-7 py-6">
            {!agentConnected && !pollError && (
              <>
                {/* Animated terminal */}
                <div className="rounded-xl border border-[#30363d] bg-[#0d1117] p-4 mb-5 font-mono text-[11px]">
                  <p className="text-[#79c0ff]">
                    {"> $ osp-agent --wait-for-connect"}
                  </p>
                  <p className="text-[#c9d1d9] mt-1">
                    Polling {API_URL}/api/v1/edge/agents …
                  </p>
                  <p className="text-[#8b949e] mt-1">
                    Attempt {pollCount}
                    {Array.from(
                      { length: (pollCount % 3) + 1 },
                      (_, i) => ".",
                    ).join("")}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[var(--color-muted)] text-xs mb-5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  Waiting for your agent to come online — checking every 5
                  seconds
                </div>
              </>
            )}

            {agentConnected && (
              <>
                <div className="flex items-center gap-2 text-[#3fb950] text-sm font-medium mb-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Agent connected and online!
                </div>
                <p className="text-xs text-[var(--color-muted)] mb-6">
                  Your camera engine is running on your local network. Time to
                  add your first camera.
                </p>
                <button
                  onClick={() => {
                    setStep("done");
                    onComplete();
                  }}
                  className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Add Your First Camera
                </button>
              </>
            )}

            {pollError && !agentConnected && (
              <>
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 mb-4">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-amber-400 font-medium">
                      Agent not detected yet
                    </p>
                    <p className="text-[11px] text-amber-400/80 mt-0.5">
                      Make sure Docker finished the setup (Compose, script, or
                      commands) without errors. The agent can take up to 60
                      seconds on first run while it pulls the image.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setPollError(false);
                      setPollCount(0);
                      setAgentConnected(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-fg)] text-sm font-medium hover:bg-[var(--color-bg)] transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Try again
                  </button>
                  <button
                    onClick={() => {
                      localStorage.setItem(WEB_SETUP_KEY, "skip");
                      onComplete();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                  >
                    Continue anyway
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
