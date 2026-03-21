import * as net from "node:net";
import * as os from "node:os";
import { createLogger } from "../lib/logger.js";
import type { DiscoveredCamera } from "@osp/shared";

const logger = createLogger("discovery-service");

import { get } from "../lib/config.js";

const getGo2RtcUrl = () => get("GO2RTC_URL") ?? "http://localhost:1984";

const RTSP_PORTS = [554, 8554, 8080];
/** Additional ports used by wired IP cameras */
const WIRED_CAMERA_PORTS = [37777, 34567, 8000];
/** Maximum USB device indices to probe */
const MAX_USB_DEVICE_INDEX = 5;
const TCP_CONNECT_TIMEOUT_MS = 1_000;
/** Maximum concurrent TCP probes to avoid overwhelming the network */
const MAX_CONCURRENT_PROBES = 50;

/** Well-known RTSP paths by manufacturer heuristic */
const COMMON_RTSP_PATHS = [
  "/stream",
  "/h264Preview_01_main",
  "/Streaming/Channels/101",
  "/cam/realmonitor?channel=1&subtype=0",
  "/live/ch00_0",
  "/1",
];

interface ProbeResult {
  ip: string;
  port: number;
}

/**
 * Detect the local subnet base (e.g. "192.168.4") from the machine's
 * network interfaces. Returns the first private IPv4 /24 subnet found.
 */
function detectSubnetBase(): string | null {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const entries = interfaces[name];
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      // Only consider private ranges
      if (
        entry.address.startsWith("192.168.") ||
        entry.address.startsWith("10.") ||
        entry.address.startsWith("172.")
      ) {
        const parts = entry.address.split(".");
        return `${parts[0]}.${parts[1]}.${parts[2]}`;
      }
    }
  }
  return null;
}

/**
 * Try to open a TCP connection to host:port within the timeout.
 * Resolves true if the port is open, false otherwise.
 */
function probePort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, TCP_CONNECT_TIMEOUT_MS);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

/**
 * Run probes in batches to limit concurrency.
 */
async function runProbesWithConcurrency(
  tasks: Array<{ ip: string; port: number }>,
  concurrency: number,
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const task = tasks[index++]!;
      const open = await probePort(task.ip, task.port);
      if (open) {
        results.push({ ip: task.ip, port: task.port });
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

/**
 * Guess manufacturer from a simple RTSP OPTIONS probe (best-effort).
 * Returns the server header value, if any.
 */
async function probeRtspServer(
  ip: string,
  port: number,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let response = "";

    const timer = setTimeout(() => {
      socket.destroy();
      resolve(undefined);
    }, 2_000);

    socket.once("connect", () => {
      // Send a minimal RTSP OPTIONS request
      socket.write(
        `OPTIONS rtsp://${ip}:${port}/ RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: OSP-Discovery/1.0\r\n\r\n`,
      );
    });

    socket.on("data", (data) => {
      response += data.toString();
      // We only need the headers
      if (response.includes("\r\n\r\n")) {
        clearTimeout(timer);
        socket.destroy();
        const serverMatch = response.match(/Server:\s*(.+)/i);
        resolve(serverMatch?.[1]?.trim());
      }
    });

    socket.once("error", () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(undefined);
    });

    socket.connect(port, ip);
  });
}

/**
 * Infer manufacturer from the RTSP Server header.
 */
function guessManufacturer(
  serverHeader: string | undefined,
): string | undefined {
  if (!serverHeader) return undefined;
  const lower = serverHeader.toLowerCase();
  if (lower.includes("hikvision") || lower.includes("hikvis"))
    return "Hikvision";
  if (lower.includes("dahua") || lower.includes("dh-")) return "Dahua";
  if (lower.includes("reolink")) return "Reolink";
  if (lower.includes("amcrest")) return "Amcrest";
  if (lower.includes("axis")) return "Axis";
  if (lower.includes("ubnt") || lower.includes("unifi")) return "Ubiquiti";
  if (lower.includes("tapo") || lower.includes("tp-link")) return "TP-Link";
  if (lower.includes("wyze")) return "Wyze";
  if (lower.includes("go2rtc")) return "go2rtc";
  return serverHeader.slice(0, 40);
}

export class DiscoveryService {
  /**
   * Discover USB cameras accessible via go2rtc's ffmpeg device input.
   *
   * Probes device indices 0 through MAX_USB_DEVICE_INDEX by registering
   * temporary streams in go2rtc and checking if they acquire producers.
   */
  async discoverUSBCameras(): Promise<DiscoveredCamera[]> {
    logger.info("Starting USB camera discovery", {
      maxIndex: MAX_USB_DEVICE_INDEX,
    });
    const cameras: DiscoveredCamera[] = [];

    for (let i = 0; i < MAX_USB_DEVICE_INDEX; i++) {
      const testName = `__usb_probe_${i}`;
      const source = `ffmpeg:device?video=${i}#video=h264`;

      try {
        // Register a temporary probe stream in go2rtc
        await fetch(
          `${getGo2RtcUrl()}/api/streams?name=${testName}&src=${encodeURIComponent(source)}`,
          { method: "PUT", signal: AbortSignal.timeout(3000) },
        );

        // Give go2rtc a moment to attempt device connection
        await new Promise((r) => setTimeout(r, 1500));

        // Check whether the stream acquired any producers (device exists)
        const statusRes = await fetch(
          `${getGo2RtcUrl()}/api/streams?src=${testName}`,
          { signal: AbortSignal.timeout(2000) },
        );

        if (statusRes.ok) {
          const data = (await statusRes.json()) as Record<string, unknown>;
          const producers = data?.producers;
          const hasProducers = Array.isArray(producers) && producers.length > 0;

          if (hasProducers) {
            cameras.push({
              ip: "localhost",
              port: 0,
              manufacturer: "USB Camera",
              model: `Device ${i}`,
              name: `USB Camera ${i}`,
              rtspUrl: source,
              alreadyAdded: false,
              possiblePaths: [source],
              type: "usb",
            });
            logger.info("USB camera found", { index: i, source });
          }
        }

        // Clean up the temporary probe stream
        await fetch(`${getGo2RtcUrl()}/api/streams?src=${testName}`, {
          method: "DELETE",
        }).catch(() => {});
      } catch {
        // Device index does not exist or go2rtc cannot access it
      }
    }

    logger.info("USB camera discovery complete", { found: cameras.length });
    return cameras;
  }

  /**
   * Run all discovery methods in parallel: USB cameras and network scan.
   */
  async discoverAll(subnetBase?: string): Promise<{
    usb: DiscoveredCamera[];
    network: DiscoveredCamera[];
    scanDurationMs: number;
  }> {
    const start = Date.now();

    const [usbResult, networkResult] = await Promise.allSettled([
      this.discoverUSBCameras(),
      this.scanNetwork(subnetBase),
    ]);

    const usb = usbResult.status === "fulfilled" ? usbResult.value : [];
    const network =
      networkResult.status === "fulfilled" ? networkResult.value.cameras : [];

    return {
      usb,
      network,
      scanDurationMs: Date.now() - start,
    };
  }

  /**
   * Scan the local network for RTSP-capable cameras.
   *
   * @param subnetBase - e.g. "192.168.4". Auto-detected if omitted.
   * @returns Array of discovered cameras with RTSP URLs.
   */
  async scanNetwork(subnetBase?: string): Promise<{
    cameras: DiscoveredCamera[];
    scanDurationMs: number;
    subnetScanned: string;
  }> {
    const subnet = subnetBase ?? detectSubnetBase();
    if (!subnet) {
      logger.warn("Could not detect local subnet, no results");
      return { cameras: [], scanDurationMs: 0, subnetScanned: "unknown" };
    }

    const allPorts = [...RTSP_PORTS, ...WIRED_CAMERA_PORTS];
    logger.info("Starting network scan", { subnet, ports: allPorts });
    const startTime = Date.now();

    // Build probe task list: every IP x every port (RTSP + wired camera ports)
    const tasks: Array<{ ip: string; port: number }> = [];
    for (let i = 1; i <= 254; i++) {
      const ip = `${subnet}.${i}`;
      for (const port of allPorts) {
        tasks.push({ ip, port });
      }
    }

    // Run probes with bounded concurrency
    const openPorts = await runProbesWithConcurrency(
      tasks,
      MAX_CONCURRENT_PROBES,
    );

    logger.info("Port scan complete", { found: openPorts.length, subnet });

    // Deduplicate by IP — group all open ports per host
    const hostMap = new Map<string, number[]>();
    for (const result of openPorts) {
      const existing = hostMap.get(result.ip) ?? [];
      hostMap.set(result.ip, [...existing, result.port]);
    }

    // For each host, probe RTSP to guess manufacturer and build camera entries
    const cameras: DiscoveredCamera[] = [];
    const serverProbes = Array.from(hostMap.entries()).map(
      async ([ip, ports]) => {
        const primaryPort = ports.includes(554) ? 554 : ports[0]!;
        const serverHeader = await probeRtspServer(ip, primaryPort);
        const manufacturer = guessManufacturer(serverHeader);

        const rtspUrl = `rtsp://${ip}:${primaryPort}${COMMON_RTSP_PATHS[0]}`;

        cameras.push({
          ip,
          port: primaryPort,
          manufacturer,
          rtspUrl,
          alreadyAdded: false,
          possiblePaths: COMMON_RTSP_PATHS.map(
            (path) => `rtsp://${ip}:${primaryPort}${path}`,
          ),
          type: "network",
        });
      },
    );

    await Promise.allSettled(serverProbes);

    // Sort by IP for stable ordering
    cameras.sort((a, b) => {
      const partsA = a.ip.split(".").map(Number);
      const partsB = b.ip.split(".").map(Number);
      for (let i = 0; i < 4; i++) {
        if ((partsA[i] ?? 0) !== (partsB[i] ?? 0)) {
          return (partsA[i] ?? 0) - (partsB[i] ?? 0);
        }
      }
      return 0;
    });

    const scanDurationMs = Date.now() - startTime;
    logger.info("Network discovery complete", {
      camerasFound: cameras.length,
      scanDurationMs,
      subnet,
    });

    return { cameras, scanDurationMs, subnetScanned: subnet };
  }
}
