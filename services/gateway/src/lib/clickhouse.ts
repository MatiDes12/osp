/**
 * Lightweight ClickHouse HTTP client.
 *
 * Uses ClickHouse's HTTP interface — no npm package required.
 * POST /  with query in the body; responses are NDJSON (JSONEachRow format).
 */

import { createLogger } from "./logger.js";
import { get } from "./config.js";

const logger = createLogger("clickhouse");

// ─── Config ──────────────────────────────────────────────────────────────────

function getConfig() {
  return {
    url: get("CLICKHOUSE_URL") ?? "http://localhost:8123",
    user: get("CLICKHOUSE_USER") ?? "default",
    password: get("CLICKHOUSE_PASSWORD") ?? "",
    database: get("CLICKHOUSE_DATABASE") ?? "osp",
  };
}

let _available: boolean | null = null;

export async function isClickHouseAvailable(): Promise<boolean> {
  if (_available !== null) return _available;
  try {
    const { url, user, password } = getConfig();
    const res = await fetch(`${url}/ping`, {
      headers: { "X-ClickHouse-User": user, "X-ClickHouse-Key": password },
      signal: AbortSignal.timeout(3_000),
    });
    _available = res.ok;
  } catch {
    _available = false;
  }
  // Re-check every 60 s
  setTimeout(() => {
    _available = null;
  }, 60_000);
  return _available;
}

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * Run a SELECT query and return rows as typed objects.
 * Returns [] on ClickHouse unavailability (graceful degradation).
 */
export async function chQuery<T = Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  const { url, user, password, database } = getConfig();
  const endpoint = `${url}/?database=${database}&default_format=JSONEachRow`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": user,
        "X-ClickHouse-Key": password,
        "Content-Type": "text/plain",
      },
      body: sql,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error("ClickHouse query error", {
        status: String(res.status),
        body,
      });
      return [];
    }

    const text = await res.text();
    if (!text.trim()) return [];

    return text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as T);
  } catch (err) {
    logger.warn("ClickHouse unavailable, skipping query", {
      error: String(err),
    });
    return [];
  }
}

/**
 * Run an INSERT or DDL statement (returns nothing).
 * Silently swallows errors — analytics writes must never break the main path.
 */
export async function chInsert(sql: string): Promise<void> {
  const { url, user, password, database } = getConfig();
  const endpoint = `${url}/?database=${database}`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": user,
        "X-ClickHouse-Key": password,
        "Content-Type": "text/plain",
      },
      body: sql,
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn("ClickHouse insert failed", {
        status: String(res.status),
        body: body.slice(0, 200),
      });
    }
  } catch (err) {
    logger.warn("ClickHouse insert error (ignored)", { error: String(err) });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Escape a string for use inside a ClickHouse string literal. */
export function chEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Format a JS Date or ISO string as a ClickHouse DateTime64 literal. */
export function chDateTime(value: string | Date): string {
  const iso = value instanceof Date ? value.toISOString() : value;
  // ClickHouse accepts ISO 8601 in single quotes
  return `'${iso.replace("T", " ").replace("Z", "")}'`;
}
