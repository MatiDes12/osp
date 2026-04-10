"use client";

/**
 * IndexedDB schema for offline-first local storage.
 * Mirrors the key remote tables so the app can serve data when the gateway
 * is unreachable, and push/pull changes when connectivity is restored.
 */

import Dexie, { type Table } from "dexie";
import type { Camera, OSPEvent, Recording } from "@osp/shared";

// We store the full serialised object so deserialization is a single JSON.parse.
export interface CachedCamera {
  id: string;
  tenantId: string;
  raw: string; // JSON.stringify(Camera)
  cachedAt: number;
}

export interface CachedEvent {
  id: string;
  cameraId: string;
  tenantId: string;
  createdAt: string; // ISO string — used for ordering
  raw: string; // JSON.stringify(OSPEvent)
  synced: boolean; // true = came from remote; false = created locally (future)
  cachedAt: number;
}

export interface CachedRecording {
  id: string;
  cameraId: string;
  tenantId: string;
  startTime: string; // ISO string
  raw: string; // JSON.stringify(Recording)
  cachedAt: number;
}

class OSPLocalDB extends Dexie {
  cameras!: Table<CachedCamera, string>;
  events!: Table<CachedEvent, string>;
  recordings!: Table<CachedRecording, string>;

  constructor() {
    super("osp-local-v1");
    this.version(1).stores({
      cameras: "id, tenantId, cachedAt",
      events: "id, cameraId, tenantId, createdAt, synced, cachedAt",
      recordings: "id, cameraId, tenantId, startTime, cachedAt",
    });
  }
}

export const localDb = new OSPLocalDB();

// ── Camera helpers ─────────────────────────────────────────────────────────────

export async function cacheCameras(cameras: Camera[]): Promise<void> {
  const now = Date.now();
  await localDb.cameras.bulkPut(
    cameras.map((c) => ({
      id: c.id,
      tenantId: c.tenantId ?? "",
      raw: JSON.stringify(c),
      cachedAt: now,
    })),
  );
}

export async function getCachedCameras(): Promise<Camera[]> {
  const rows = await localDb.cameras.toArray();
  return rows.map((r) => JSON.parse(r.raw) as Camera);
}

// ── Event helpers ──────────────────────────────────────────────────────────────

export async function cacheEvents(events: OSPEvent[]): Promise<void> {
  const now = Date.now();
  await localDb.events.bulkPut(
    events.map((e) => ({
      id: e.id,
      cameraId: e.cameraId,
      tenantId: e.tenantId,
      createdAt: e.createdAt,
      raw: JSON.stringify(e),
      synced: true,
      cachedAt: now,
    })),
  );
}

export async function getCachedEvents(limit = 100): Promise<OSPEvent[]> {
  const rows = await localDb.events
    .orderBy("createdAt")
    .reverse()
    .limit(limit)
    .toArray();
  return rows.map((r) => JSON.parse(r.raw) as OSPEvent);
}

// ── Recording helpers ──────────────────────────────────────────────────────────

export async function cacheRecordings(recordings: Recording[]): Promise<void> {
  const now = Date.now();
  await localDb.recordings.bulkPut(
    recordings.map((r) => ({
      id: r.id,
      cameraId: r.cameraId,
      tenantId: r.tenantId,
      startTime: r.startTime,
      raw: JSON.stringify(r),
      cachedAt: now,
    })),
  );
}

export async function getCachedRecordings(limit = 100): Promise<Recording[]> {
  const rows = await localDb.recordings
    .orderBy("startTime")
    .reverse()
    .limit(limit)
    .toArray();
  return rows.map((r) => JSON.parse(r.raw) as Recording);
}
