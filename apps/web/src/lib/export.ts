import type { OSPEvent, Recording } from "@osp/shared";

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function exportEventsCSV(events: readonly OSPEvent[]): void {
  const headers = ["Timestamp", "Camera", "Type", "Severity", "Zone", "Acknowledged"];
  const rows = events.map((e) => [
    escapeCSV(e.detectedAt),
    escapeCSV(e.cameraName),
    escapeCSV(e.type),
    escapeCSV(e.severity),
    escapeCSV(e.zoneName ?? ""),
    e.acknowledged ? "Yes" : "No",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  triggerDownload(csv, `events-${formatDate()}.csv`, "text/csv;charset=utf-8;");
}

export function exportEventsJSON(events: readonly OSPEvent[]): void {
  const json = JSON.stringify(events, null, 2);
  triggerDownload(json, `events-${formatDate()}.json`, "application/json");
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function exportRecordingsCSV(recordings: readonly Recording[]): void {
  const headers = ["Camera", "Start", "End", "Duration", "Trigger", "Size"];
  const rows = recordings.map((r) => [
    escapeCSV(r.cameraName),
    escapeCSV(r.startTime),
    escapeCSV(r.endTime),
    escapeCSV(formatDuration(r.durationSec)),
    escapeCSV(r.trigger),
    escapeCSV(formatBytes(r.sizeBytes)),
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  triggerDownload(csv, `recordings-${formatDate()}.csv`, "text/csv;charset=utf-8;");
}
