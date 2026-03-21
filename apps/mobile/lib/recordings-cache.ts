import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Recording } from "@osp/shared/types";

const CACHE_KEY = "osp:recordings:cache";
const CACHE_META_KEY = "osp:recordings:cache_meta";
const MAX_CACHED = 20;

interface CacheMeta {
  cachedAt: string;
}

export async function saveRecordingsCache(recordings: readonly Recording[]): Promise<void> {
  try {
    const toStore = recordings.slice(0, MAX_CACHED);
    const meta: CacheMeta = { cachedAt: new Date().toISOString() };
    await Promise.all([
      AsyncStorage.setItem(CACHE_KEY, JSON.stringify(toStore)),
      AsyncStorage.setItem(CACHE_META_KEY, JSON.stringify(meta)),
    ]);
  } catch {
    // Cache write failure is non-critical
  }
}

export async function loadRecordingsCache(): Promise<{
  recordings: readonly Recording[];
  cachedAt: string | null;
}> {
  try {
    const [raw, metaRaw] = await Promise.all([
      AsyncStorage.getItem(CACHE_KEY),
      AsyncStorage.getItem(CACHE_META_KEY),
    ]);
    const recordings: Recording[] = raw ? (JSON.parse(raw) as Recording[]) : [];
    const meta: CacheMeta | null = metaRaw ? (JSON.parse(metaRaw) as CacheMeta) : null;
    return { recordings, cachedAt: meta?.cachedAt ?? null };
  } catch {
    return { recordings: [], cachedAt: null };
  }
}

async function clearRecordingsCache(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(CACHE_KEY),
      AsyncStorage.removeItem(CACHE_META_KEY),
    ]);
  } catch {
    // ignore
  }
}

/** Human-readable "cached X minutes ago" label */
export function formatCacheAge(cachedAt: string): string {
  const diffMs = Date.now() - new Date(cachedAt).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
